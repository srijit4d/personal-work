import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';

declare const require: (moduleName: string) => any;

const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = 'https://rettlife.eu';
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const MIN_TITLE_LENGTH = 3;
const MIN_META_DESCRIPTION_LENGTH = 20;
const META_DESCRIPTION_EXCLUDED_PATHS = new Set(['/search']);

function normalizeRoute(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const normalized = new URL(trimmed);
    normalized.hash = '';

    if (normalized.pathname.length > 1 && normalized.pathname.endsWith('/')) {
      normalized.pathname = normalized.pathname.slice(0, -1);
    }

    return normalized.toString();
  } catch {
    return '';
  }
}

function parseSitemapLocations(xml: string): string[] {
  const locations: string[] = [];
  const locationRegex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let regexMatch = locationRegex.exec(xml);

  while (regexMatch) {
    locations.push(regexMatch[1]);
    regexMatch = locationRegex.exec(xml);
  }

  return locations;
}

async function discoverRoutes(request: APIRequestContext): Promise<string[]> {
  const discoveredRoutes = new Set<string>();

  const sitemapResponse = await request.get(SITEMAP_URL, { failOnStatusCode: false });
  if (sitemapResponse.ok()) {
    const sitemapXml = await sitemapResponse.text();
    const sitemapLocations = parseSitemapLocations(sitemapXml);

    for (const location of sitemapLocations) {
      const normalizedLocation = normalizeRoute(location);
      if (!normalizedLocation) continue;

      const locationUrl = new URL(normalizedLocation);
      const isRettLifeHost = /(^|\.)rettlife\.eu$/i.test(locationUrl.hostname);
      if (!isRettLifeHost) continue;

      discoveredRoutes.add(normalizedLocation);
    }
  }

  if (discoveredRoutes.size === 0) {
    discoveredRoutes.add(BASE_URL);
  }

  const routeList = [...discoveredRoutes].sort((leftRoute, rightRoute) =>
    leftRoute.localeCompare(rightRoute)
  );

  const routeLimitRaw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.SEO_MAX_ROUTES;
  const routeLimit = Number(routeLimitRaw);
  if (Number.isFinite(routeLimit) && routeLimit > 0) {
    return routeList.slice(0, routeLimit);
  }

  return routeList;
}

async function collectSeoIssuesForRoute(
  browser: Browser,
  routeUrl: string
): Promise<string[]> {
  const issues: string[] = [];
  const routePathname = new URL(routeUrl).pathname.toLowerCase();
  const shouldCheckMetaDescription = !META_DESCRIPTION_EXCLUDED_PATHS.has(routePathname);
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    let response: Awaited<ReturnType<typeof page.goto>> | null = null;
    try {
      response = await page.goto(routeUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(`Navigation failed: ${message}`);
      return issues;
    }

    if (!response) {
      issues.push('No HTTP response received while loading route.');
      return issues;
    }

    if (!response.ok()) {
      issues.push(`Non-success HTTP status: ${response.status()} ${response.statusText()}`);
    }

    const hydrationWindowMs = 6_000;
    await page
      .waitForFunction(
        ({ minTitleLength, minMetaLength }) => {
          const title = document.title.trim();
          const metaDescription = (
            document.head.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
          ).trim();

          return title.length >= minTitleLength && metaDescription.length >= minMetaLength;
        },
        {
          minTitleLength: MIN_TITLE_LENGTH,
          minMetaLength: MIN_META_DESCRIPTION_LENGTH,
        },
        {
          timeout: hydrationWindowMs,
        }
      )
      .catch(() => null);

    let seoSnapshot: { title: string; metaDescription: string };
    try {
      seoSnapshot = await page.evaluate(() => {
        const title = document.title.trim();
        const metaDescription = (
          document.head.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
        ).trim();

        return { title, metaDescription };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(`Metadata snapshot failed: ${message}`);
      return issues;
    }

    const pageTitle = seoSnapshot.title;
    if (!pageTitle) {
      issues.push('Missing <title> content.');
    } else if (pageTitle.length < MIN_TITLE_LENGTH) {
      issues.push(`Title appears too short (${pageTitle.length} chars).`);
    }

    const metaDescription = seoSnapshot.metaDescription;

    if (shouldCheckMetaDescription) {
      if (!metaDescription) {
        issues.push('Missing meta description content.');
      } else if (metaDescription.length < MIN_META_DESCRIPTION_LENGTH) {
        issues.push(`Meta description appears too short (${metaDescription.length} chars).`);
      }
    }

    return issues;
  } finally {
    await context.close().catch(() => {});
    await page.close().catch(() => {});
  }
}

function escapeCsvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function toCsv(records: Array<{ route: string; passed: boolean; issues: string[] }>): string {
  const header = ['route', 'passed', 'issue_count', 'issues'];
  const lines = [header.join(',')];

  for (const record of records) {
    lines.push(
      [
        escapeCsvCell(record.route),
        escapeCsvCell(String(record.passed)),
        escapeCsvCell(String(record.issues.length)),
        escapeCsvCell(record.issues.join(' | ')),
      ].join(',')
    );
  }

  return lines.join('\n');
}

function writeArtifactFiles(jsonContent: string, csvContent: string): void {
  const artifactDirectory = path.join('artifacts', 'seo');
  fs.mkdirSync(artifactDirectory, { recursive: true });

  fs.writeFileSync(path.join(artifactDirectory, 'seo-audit.json'), jsonContent, 'utf8');
  fs.writeFileSync(path.join(artifactDirectory, 'seo-audit.csv'), csvContent, 'utf8');
}

test.describe('RettLife route-level SEO audit', () => {
  test('all discovered routes include title and meta description', async ({ browser, request }, testInfo) => {
    test.setTimeout(10 * 60 * 1000);

    const routes = await discoverRoutes(request);
    expect(routes.length, 'No routes discovered from sitemap or fallback.').toBeGreaterThan(0);

    const auditFailures: string[] = [];
    const auditRecords: Array<{ route: string; passed: boolean; issues: string[] }> = [];

    for (const route of routes) {
      const routeIssues = await collectSeoIssuesForRoute(browser, route);
      auditRecords.push({
        route,
        passed: routeIssues.length === 0,
        issues: routeIssues,
      });

      if (routeIssues.length > 0) {
        const failureSummary = routeIssues.map((entry) => `- ${entry}`).join('\n');
        auditFailures.push(`${route}\n${failureSummary}`);
      }
    }

    const jsonReport = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      sitemapUrl: SITEMAP_URL,
      routeCount: routes.length,
      failedRouteCount: auditFailures.length,
      routes: auditRecords,
    };

    const jsonContent = JSON.stringify(jsonReport, null, 2);
    const csvContent = toCsv(auditRecords);

    writeArtifactFiles(jsonContent, csvContent);

    await testInfo.attach('seo-audit.json', {
      body: jsonContent,
      contentType: 'application/json',
    });

    await testInfo.attach('seo-audit.csv', {
      body: csvContent,
      contentType: 'text/csv',
    });

    expect(
      auditFailures,
      `SEO audit failed for ${auditFailures.length} route(s).\n\n${auditFailures.join('\n\n')}`
    ).toEqual([]);
  });
});
