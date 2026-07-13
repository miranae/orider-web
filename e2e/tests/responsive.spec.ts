import { test, expect } from '../fixtures/test-fixtures';

test.describe('Responsive Layout', () => {
  test('mobile shows bottom tab bar', async ({ seededPage: page }) => {
    test.skip(test.info().project.name !== 'mobile', 'Bottom tab bar only on mobile');

    // 시드 로케일과 무관하게 주 탭 내비게이션을 검증한다.
    const tabBar = page.getByRole('tablist', { name: /(주 네비게이션|Main navigation)/ });
    await expect(tabBar).toBeVisible();
    await expect(tabBar.getByRole('tab', { selected: true })).toBeVisible();
  });

  test('mobile hides desktop header nav', async ({ seededPage: page }) => {
    test.skip(test.info().project.name !== 'mobile', 'This assertion targets the 390px compact header');

    // Full desktop navigation starts at 1024px; mobile stays on the compact header.
    const desktopNav = page.locator('.hidden.lg\\:flex');
    if (await desktopNav.count() > 0) {
      await expect(desktopNav.first()).not.toBeVisible();
    }
  });

  test('tablet notification button opens a visible sheet', async ({ authenticatedPage: page }) => {
    test.skip(test.info().project.name !== 'tablet', 'Tablet compact-header regression guard');

    await page.goto('/ko/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: '더보기' })).toBeVisible();
    await page.getByRole('button', { name: '알림' }).click();
    await expect(page.getByRole('dialog', { name: '알림' })).toBeVisible();
  });

  test('desktop hides bottom tab bar', async ({ seededPage: page }) => {
    test.skip(test.info().project.name === 'mobile', 'This test is for desktop');

    // Desktop should NOT show bottom tab bar (md:hidden)
    const bottomTabs = page.locator('.fixed.bottom-0');
    if (await bottomTabs.count() > 0) {
      await expect(bottomTabs.first()).not.toBeVisible();
    }
  });
});
