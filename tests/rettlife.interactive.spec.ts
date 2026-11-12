import { test, expect, type Page } from '@playwright/test';

const HOME_URL = 'https://rettlife.eu/';

async function gotoHome(page: Page) {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
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

    await page
      .getByRole('navigation', { name: /Primary navigation/i })
      .getByRole('link', { name: 'What is Rett Syndrome?' })
      .first()
      .click({ force: true });

    await expect(page).toHaveURL(/https:\/\/(?:[a-z]{2}\.)?rettlife\.eu\/what-is-rett-syndrome\/?$/);
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
