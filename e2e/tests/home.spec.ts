import { test, expect } from '../fixtures/test-fixtures';

test.describe('Home Page', () => {
  test('shows activity feed with public activities', async ({ seededPage: page }) => {
    // Public activities should be visible
    await expect(page.getByText('한강 라이딩 즐거웠습니다')).toBeVisible();
    await expect(page.getByText('북한산 힐클라임 도전')).toBeVisible();
    await expect(page.getByText('팔당댐 왕복')).toBeVisible();
  });

  test('shows hero banner for anonymous user', async ({ seededPage: page }) => {
    await expect(page.getByTestId('home-brand-intro').getByRole('heading', { name: 'Ride Your Time.' })).toBeVisible();
  });

  test('has search input', async ({ seededPage: page }) => {
    await page.getByRole('button', { name: '더보기' }).click();
    const searchInput = page.getByRole('search', { name: '전체 기능 검색' }).getByRole('searchbox', { name: '검색어' });
    await expect(searchInput).toBeVisible();
  });

  test('shows community links in sidebar on desktop', async ({ seededPage: page }) => {
    test.skip(test.info().project.name !== 'desktop', 'Sidebar hidden on mobile');
    // Sidebar community card (in the lg:block sidebar, not the lg:hidden mobile section)
    await expect(page.getByRole('heading', { name: '한국 자전거 커뮤니티' })).toBeVisible();
  });
});
