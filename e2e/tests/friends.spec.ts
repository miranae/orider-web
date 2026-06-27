import { test, expect } from '../fixtures/test-fixtures';

test.describe('Friends Page', () => {
  test('requires authentication', async ({ seededPage: page }) => {
    await page.goto('/friends', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await expect(page.getByText('로그인이 필요합니다')).toBeVisible();
  });

  test('shows friends page when logged in', async ({ authenticatedPage: page }) => {
    await page.goto('/friends', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Page title
    await expect(page.locator('h1').filter({ hasText: '친구' })).toBeVisible();
  });

  test('has friend code section', async ({ authenticatedPage: page }) => {
    await page.goto('/friends', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Friend code input area
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('does not show login prompt when logged in', async ({ authenticatedPage: page }) => {
    await page.goto('/friends', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await expect(page.getByText('로그인이 필요합니다')).not.toBeVisible();
  });
});
