import { test, expect } from '../fixtures/test-fixtures';

test.describe('Responsive Layout', () => {
  test('mobile shows bottom tab bar', async ({ seededPage: page }) => {
    test.skip(test.info().project.name === 'desktop', 'Bottom tab bar only on mobile');

    // Bottom tab bar should be visible with "피드" tab
    const tabBar = page.locator('nav').filter({ has: page.getByText('피드') }).last();
    await expect(tabBar).toBeVisible();
    await expect(page.getByText('피드').last()).toBeVisible();
  });

  test('mobile hides desktop header nav', async ({ seededPage: page }) => {
    test.skip(test.info().project.name === 'desktop', 'Desktop nav visible on desktop');

    // Desktop nav links should be hidden on mobile (they use .hidden.md:flex)
    const desktopNav = page.locator('.hidden.md\\:flex');
    if (await desktopNav.count() > 0) {
      await expect(desktopNav.first()).not.toBeVisible();
    }
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
