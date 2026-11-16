import { test, expect } from '@playwright/test';

test.describe('i18n', () => {
  test('root redirects to /ko or /en based on browser language', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(ko|en)\b/);
  });

  test('html lang attribute matches URL prefix', async ({ page }) => {
    await page.goto('/en/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goto('/ko/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  });

  test('header toggle changes URL prefix', async ({ page }) => {
    await page.goto('/ko/');
    await page.getByRole('button', { name: '더보기' }).click();
    await page.getByRole('navigation', { name: '더보기', exact: true }).getByRole('radio', { name: 'English' }).check();
    await expect(page).toHaveURL(/\/en\//);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('invalid lang prefix redirects to /ko', async ({ page }) => {
    await page.goto('/fr/dashboard');
    await expect(page).toHaveURL(/\/ko\/dashboard/);
  });
});
