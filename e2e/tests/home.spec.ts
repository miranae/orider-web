import { test, expect } from '../fixtures/test-fixtures';

test.describe('Home Page', () => {
  test('shows activity feed with public activities', async ({ seededPage: page }) => {
    // Public activities should be visible
    await expect(page.getByText('한강 라이딩 즐거웠습니다')).toBeVisible();
    await expect(page.getByText('북한산 힐클라임 도전')).toBeVisible();
    await expect(page.getByText('팔당댐 왕복')).toBeVisible();
  });

  test('shows hero banner for anonymous user', async ({ seededPage: page }) => {
    await expect(page.getByText('한국 라이더들의 기록을 안전하게')).toBeVisible();
  });

  test('has search input', async ({ seededPage: page }) => {
    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible();
  });

  test('shows community links in sidebar on desktop', async ({ seededPage: page }) => {
    test.skip(test.info().project.name === 'mobile', 'Sidebar hidden on mobile');
    // Sidebar community card (in the lg:block sidebar, not the lg:hidden mobile section)
    await expect(page.locator('.lg\\:block').getByText('한국 자전거 커뮤니티')).toBeVisible();
  });
});
