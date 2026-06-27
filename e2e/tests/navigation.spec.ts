import { test, expect } from '../fixtures/test-fixtures';

test.describe('Navigation', () => {
  test('desktop header shows nav links', async ({ seededPage: page }) => {
    test.skip(test.info().project.name === 'mobile', 'Desktop nav hidden on mobile');

    await expect(page.getByRole('link', { name: '대시보드' })).toBeVisible();
    await expect(page.getByRole('link', { name: '리더보드' })).toBeVisible();
  });

  test('clicking logo navigates to home', async ({ seededPage: page }) => {
    await page.goto('/explore', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click logo (first link in header with the logo image)
    await page.locator('header a').first().click();
    await expect(page).toHaveURL('/');
  });

  test('navigate to explore page', async ({ seededPage: page }) => {
    // Use the first matching link for the leaderboard
    await page.getByRole('link', { name: '리더보드' }).first().click();
    await expect(page).toHaveURL('/explore');
  });

  test('footer links are visible', async ({ seededPage: page }) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await expect(page.getByRole('link', { name: '이용약관' })).toBeVisible();
    await expect(page.getByRole('link', { name: '개인정보처리방침' })).toBeVisible();
  });
});
