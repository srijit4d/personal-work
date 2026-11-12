import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

declare const require: (moduleName: string) => any;

const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = 'https://rettlife.eu';
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const MIN_TITLE_LENGTH = 3;
const MIN_META_DESCRIPTION_LENGTH = 20;

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

function hasRelevantSchemaMarkups(schemaTexts: string[]): boolean {
  for (const schemaText of schemaTexts) {
    try {
      const parsedSchema = JSON.parse(schemaText) as unknown;
      const schemaObjects = Array.isArray(parsedSchema) ? parsedSchema : [parsedSchema];

      for (const schemaObject of schemaObjects) {
        if (!schemaObject || typeof schemaObject !== 'object') {
          continue;
        }

        const candidate = schemaObject as Record<string, unknown>;
        const schemaContext = String(candidate['@context'] ?? '');
        const schemaType = candidate['@type'];

        if (!schemaType) {
          continue;
        }

        const hasSchemaOrgContext = /schema\.org/i.test(schemaContext);
        const hasType =
          (typeof schemaType === 'string' && schemaType.trim().length > 0) ||
          (Array.isArray(schemaType) && schemaType.some((entry) => String(entry).trim().length > 0));

        if (hasSchemaOrgContext && hasType) {
          return true;
        }
      }
    } catch {
      continue;
    }
  }

  return false;
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

async function collectSeoIssuesForRoute(page: Page, routeUrl: string): Promise<string[]> {
  const issues: string[] = [];

  const response = await page.goto(routeUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });

  if (!response) {
    issues.push('No HTTP response received while loading route.');
    return issues;
  }

  if (!response.ok()) {
    issues.push(`Non-success HTTP status: ${response.status()} ${response.statusText()}`);
  }

  const pageTitle = (await page.title()).trim();
  if (!pageTitle) {
    issues.push('Missing <title> content.');
  } else if (pageTitle.length < MIN_TITLE_LENGTH) {
    issues.push(`Title appears too short (${pageTitle.length} chars).`);
  }

  const metaDescription = (
    await page.locator('head meta[name="description"]').first().getAttribute('content')
  )?.trim();

  if (!metaDescription) {
    issues.push('Missing meta description content.');
  } else if (metaDescription.length < MIN_META_DESCRIPTION_LENGTH) {
    issues.push(`Meta description appears too short (${metaDescription.length} chars).`);
  }

  const jsonLdSchemas = (await page
    .locator('script[type="application/ld+json"]')
    .allTextContents())
    .map((schemaText) => schemaText.trim())
    .filter(Boolean);

  if (jsonLdSchemas.length === 0) {
    issues.push('Missing JSON-LD schema script tag.');
  } else if (!hasRelevantSchemaMarkups(jsonLdSchemas)) {
    issues.push('JSON-LD found, but no object with schema.org @context and valid @type was detected.');
  }

  return issues;
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
  test('all discovered routes include title, meta description, and relevant schema', async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(10 * 60 * 1000);

    const routes = await discoverRoutes(request);
    expect(routes.length, 'No routes discovered from sitemap or fallback.').toBeGreaterThan(0);

    const auditFailures: string[] = [];
    const auditRecords: Array<{ route: string; passed: boolean; issues: string[] }> = [];

    for (const route of routes) {
      const routeIssues = await collectSeoIssuesForRoute(page, route);
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
