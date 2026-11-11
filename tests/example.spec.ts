import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('https://rettlife.eu/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Rett/);
});

test('read more link', async ({ page }) => {
  await page.goto('https://rettlife.eu/');

  await page
    .locator('nav a[href="/what-is-rett-syndrome"]')
    .first()
    .click({ force: true });

  await expect(page).toHaveURL(
    /https:\/\/(?:[a-z]{2}\.)?rettlife\.eu\/what-is-rett-syndrome\/?$/
  );
});
