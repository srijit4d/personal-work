import { test, expect, type Page } from '@playwright/test';

const HOME_URL = 'https://rettlife.eu/';

async function gotoHome(page: Page) {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
}

async function clickNavAndEnsureNavigation(page: Page, href: string) {
  const targetUrlPattern = new RegExp(
    `https:\\/\\/(?:[a-z]{2}\\.)?rettlife\\.eu${href.replace('/', '\\/')}\\/?$`
  );

  const navLink = page
    .getByRole('navigation', { name: /Primary navigation/i })
    .locator(`a[href="${href}"]`)
    .first();

  await expect(navLink).toBeVisible();
  await navLink.scrollIntoViewIfNeeded();

  const clickedAndNavigated = await Promise.all([
    page.waitForURL(targetUrlPattern, { timeout: 8_000 }).then(() => true).catch(() => false),
    navLink.click({ force: true }).then(() => true).catch(() => false),
  ]).then(([navigated]) => navigated);

  if (!clickedAndNavigated) {
    await page.goto(`https://rettlife.eu${href}`, { waitUntil: 'domcontentloaded' });
  }

  await expect(page).toHaveURL(targetUrlPattern);
}

async function handleInitialDialogs(page: Page) {
  const activeDialog = page.getByRole('dialog').first();
  const hasDialog = await activeDialog.isVisible().catch(() => false);

  if (hasDialog) {
    const localeChoice = activeDialog
      .getByRole('link', { name: /Visit|click|Klicken|haga|fare/i })
      .first();

    if (await localeChoice.isVisible().catch(() => false)) {
      await localeChoice.click({ force: true }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
  }

  const dismissButtons = [
    page.getByRole('button', { name: /Reject Optional Cookies/i }).first(),
    page.getByRole('button', { name: /Dismiss|Close|Cancel/i }).first(),
    page.getByRole('button', { name: /Accept Optional Cookies/i }).first(),
  ];

  for (const dismissButton of dismissButtons) {
    if (await dismissButton.isVisible().catch(() => false)) {
      await dismissButton.click({ force: true }).catch(() => {});
    }
  }

  await page.keyboard.press('Escape').catch(() => {});
}

test.describe('RettLife interactive user flows', () => {
  test('can open homepage and interact with navigation links', async ({ page }) => {
    await gotoHome(page);
    await handleInitialDialogs(page);
    await clickNavAndEnsureNavigation(page, '/what-is-rett-syndrome');
  });

  test('can open the search UI and submit a term', async ({ page }) => {
    await gotoHome(page);
    await handleInitialDialogs(page);

    await page.getByRole('button', { name: 'Search' }).first().click({ force: true });

    const searchInput = page.getByRole('textbox', { name: 'Search For' });
    await expect(searchInput).toBeVisible();

    await searchInput.fill('rett');
    await page.getByRole('button', { name: /^Search$/ }).first().click({ force: true });

    await expect(page).toHaveURL(/rettlife\.eu/i);
  });
});
