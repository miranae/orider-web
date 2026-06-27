import { test, expect } from '../fixtures/test-fixtures';

test.describe('Auth', () => {
  test('anonymous user sees login button', async ({ seededPage: page }) => {
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Google로 로그인' })).toBeVisible();
  });

  test('anonymous user cannot access settings', async ({ seededPage: page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Settings page requires auth — should show login prompt
    await expect(page.getByText('로그인이 필요합니다')).toBeVisible();
  });

  test('authenticated user sees profile in header', async ({ authenticatedPage: page }) => {
    // Login button should be gone from the nav
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Google로 로그인' })).not.toBeVisible();
  });

  test('authenticated user can access settings', async ({ authenticatedPage: page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Settings page content should load (not the "login required" message)
    await expect(page.getByText('로그인이 필요합니다')).not.toBeVisible();
  });
});
