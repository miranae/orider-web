import { test, expect } from '../fixtures/test-fixtures';

test.describe('Auth', () => {
  test('anonymous user sees login button', async ({ seededPage: page }) => {
    if (test.info().project.name !== 'desktop') await page.getByRole('button', { name: '더보기' }).click();
    const login = page.getByRole('navigation').getByRole('button', { name: '기록을 저장하려면 로그인' });
    await expect(login).toBeVisible();
    await expect(login).toBeEnabled();
  });

  test('anonymous user cannot access settings', async ({ seededPage: page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Settings page requires auth — should show login prompt
    await expect(page.getByText('로그인이 필요합니다')).toBeVisible();
  });

  test('authenticated user sees profile in header', async ({ authenticatedPage: page }) => {
    // Login button should be gone from the nav
    await expect(page.getByRole('button', { name: '기록을 저장하려면 로그인' })).toBeHidden();
    await expect(page.getByRole('button', { name: '프로필', exact: true })).toBeVisible();
  });

  test('authenticated user can access settings', async ({ authenticatedPage: page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Settings page content should load (not the "login required" message)
    await expect(page.getByText('로그인이 필요합니다')).not.toBeVisible();
  });
});
