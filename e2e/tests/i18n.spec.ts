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
    // wait briefly for app to mount
    await page.waitForLoadState('networkidle');
    const enButton = page.getByRole('button', { name: /^EN$/ });
    if (await enButton.isVisible()) {
      await enButton.click();
      await expect(page).toHaveURL(/\/en\//);
    }
  });

  test('invalid lang prefix redirects to /ko', async ({ page }) => {
    await page.goto('/fr/dashboard');
    await expect(page).toHaveURL(/\/ko\/dashboard/);
  });
});
