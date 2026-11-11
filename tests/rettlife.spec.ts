import { test, expect, type Page } from '@playwright/test';

const HOME_URL = 'https://rettlife.eu/';

async function gotoHome(page: Page) {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
}

function expectedPathRegex(path: string) {
  const normalized = path.replace(/^\//, '');
  return new RegExp(`https://(?:[a-z]{2}\\.)?rettlife\\.eu/${normalized}/?$`);
}

test.describe('RettLife smoke and regression checks', () => {
  test('homepage title and hero heading are visible', async ({ page }) => {
    await gotoHome(page);

    await expect(page).toHaveTitle(/Rett/i);
    await expect(
      page.getByRole('heading', {
        name: /Empowering Rett families today and into the future/i,
      })
    ).toBeVisible();
  });

  test('top navigation contains expected core links', async ({ page }) => {
    await gotoHome(page);

    const nav = page.getByRole('navigation', { name: /Primary navigation/i });

    await expect(nav.getByRole('link', { name: 'Rett Stories' })).toHaveAttribute(
      'href',
      '/rett-stories'
    );
    await expect(
      nav.getByRole('link', { name: 'What is Rett Syndrome?' })
    ).toHaveAttribute('href', '/what-is-rett-syndrome');
    await expect(
      nav.getByRole('link', { name: 'Navigating Life with Rett' })
    ).toHaveAttribute('href', '/navigating-life-with-rett');
  });

  test('What is Rett Syndrome nav target responds successfully', async ({ page }) => {
    await gotoHome(page);

    const navLink = page.locator('nav a[href="/what-is-rett-syndrome"]').first();
    await expect(navLink).toHaveAttribute('href', '/what-is-rett-syndrome');

    const response = await page.request.get('https://rettlife.eu/what-is-rett-syndrome');
    expect(response.ok()).toBeTruthy();
  });

  test('search panel opens from header and shows input', async ({ page }) => {
    await gotoHome(page);

    await page.getByRole('button', { name: 'Search' }).first().click({ force: true });

    await expect(page.getByRole('textbox', { name: 'Search For' })).toBeVisible();
  });
});
