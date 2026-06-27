import { test, expect } from '../fixtures/test-fixtures';

test.describe('Settings Page', () => {
  test('requires authentication', async ({ seededPage: page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await expect(page.getByText('로그인이 필요합니다')).toBeVisible();
  });

  test('shows profile section when logged in', async ({ authenticatedPage: page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await expect(page.getByText('프로필').first()).toBeVisible();
  });

  test('shows Strava section', async ({ authenticatedPage: page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await expect(page.getByText('Strava').first()).toBeVisible();
  });

  test('does not show login prompt when logged in', async ({ authenticatedPage: page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await expect(page.getByText('로그인이 필요합니다')).not.toBeVisible();
  });
});
