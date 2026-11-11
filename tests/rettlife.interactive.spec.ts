import { test, expect, type Page } from '@playwright/test';

const HOME_URL = 'https://rettlife.eu/';

async function gotoHome(page: Page) {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
}

async function closeCountryDialogIfVisible(page: Page) {
  const dialog = page.getByRole('dialog');
  const visible = await dialog.isVisible().catch(() => false);
  if (!visible) return;

  await page.keyboard.press('Escape').catch(() => {});

  if (await dialog.isVisible().catch(() => false)) {
    const closeButton = dialog.getByRole('button', { name: /close|dismiss|cancel/i });
    if (await closeButton.first().isVisible().catch(() => false)) {
      await closeButton.first().click({ force: true }).catch(() => {});
    }
  }
}

test.describe('RettLife interactive user flows', () => {
  test('can open homepage and interact with navigation links', async ({ page }) => {
    await gotoHome(page);
    await closeCountryDialogIfVisible(page);

    await page
      .getByRole('navigation', { name: /Primary navigation/i })
      .getByRole('link', { name: 'What is Rett Syndrome?' })
      .first()
      .click({ force: true });

    await expect(page).toHaveURL(/https:\/\/(?:[a-z]{2}\.)?rettlife\.eu\/what-is-rett-syndrome\/?$/);
  });

  test('can open the search UI and submit a term', async ({ page }) => {
    await gotoHome(page);
    await closeCountryDialogIfVisible(page);

    await page.getByRole('button', { name: 'Search' }).first().click({ force: true });

    const searchInput = page.getByRole('textbox', { name: 'Search For' });
    await expect(searchInput).toBeVisible();

    await searchInput.fill('rett');
    await page.getByRole('button', { name: /^Search$/ }).first().click({ force: true });

    await expect(page).toHaveURL(/rettlife\.eu/i);
  });
});
