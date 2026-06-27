import { test, expect } from '../fixtures/test-fixtures';

test.describe('Dark Mode', () => {
  test('applies dark mode based on prefers-color-scheme', async ({ seededPage: page }) => {
    // Emulate dark color scheme
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Check that body or root has dark background
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });

    // Dark mode should have a dark background (not white)
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });

  test('applies light mode by default', async ({ seededPage: page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });

    // Light mode should have a light/white background
    const isLight = bgColor === 'rgb(255, 255, 255)' ||
      bgColor === 'rgba(0, 0, 0, 0)' ||
      bgColor.includes('249') || bgColor.includes('248');
    expect(isLight).toBe(true);
  });
});
