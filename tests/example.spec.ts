import { test, expect, type Page } from '@playwright/test';

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
}

test('has title', async ({ page }) => {
  await page.goto('https://rettlife.eu/');
  await handleInitialDialogs(page);

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Rett/);
});

test('what is rett syndrome nav link points to a valid destination', async ({ page, request }) => {
  await page.goto('https://rettlife.eu/');
  await handleInitialDialogs(page);

  const navLink = page.locator('nav a[href="/what-is-rett-syndrome"]').first();
  await expect(navLink).toHaveAttribute('href', '/what-is-rett-syndrome');

  const targetResponse = await request.get('https://rettlife.eu/what-is-rett-syndrome', {
    failOnStatusCode: false,
  });
  expect(targetResponse.ok()).toBeTruthy();

  await page.goto('https://rettlife.eu/what-is-rett-syndrome', {
    waitUntil: 'domcontentloaded',
  });

  await expect(page).toHaveURL(
    /https:\/\/(?:[a-z]{2}\.)?rettlife\.eu\/what-is-rett-syndrome\/?$/
  );
});
