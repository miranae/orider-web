import { test, expect } from '../fixtures/test-fixtures';

test.describe('Responsive Layout', () => {
  test('mobile shows bottom tab bar', async ({ seededPage: page }) => {
    test.skip(test.info().project.name === 'desktop', '하단 탐색은 모바일·태블릿에 표시됩니다.');

    // 시드 로케일과 무관하게 주 탭 내비게이션을 검증한다.
    const tabBar = page.getByRole('navigation', { name: '메인 내비게이션', exact: true });
    await expect(tabBar).toBeVisible();
    await expect(tabBar.locator('a[aria-current="page"]')).toBeVisible();
  });

  test('mobile hides desktop header nav', async ({ seededPage: page }) => {
    test.skip(test.info().project.name !== 'mobile', 'This assertion targets the 390px compact header');

    // Full desktop navigation starts at 1024px; mobile stays on the compact header.
    await expect(page.getByTestId('X1-1').first().getByRole('link', { name: '코치', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: '더보기' })).toBeVisible();
  });

  test('tablet notification button opens a visible sheet', async ({ authenticatedPage: page }) => {
    test.skip(test.info().project.name !== 'tablet', 'Tablet compact-header regression guard');

    await page.goto('/ko/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: '더보기' })).toBeVisible();
    await page.getByRole('button', { name: '알림' }).click();
    await expect(page.getByRole('dialog', { name: '알림' })).toBeVisible();
  });

  test('desktop hides bottom tab bar', async ({ seededPage: page }) => {
    test.skip(test.info().project.name !== 'desktop', '전체 헤더는 데스크톱 전용입니다.');

    await expect(page.getByRole('navigation', { name: '메인 내비게이션', exact: true })).toBeHidden();
  });
});
