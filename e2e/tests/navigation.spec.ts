import { test, expect } from '../fixtures/test-fixtures';

test.describe('Navigation', () => {
  test('desktop header exposes locale-aware hub links', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'Desktop nav hidden on mobile');

    await page.goto('/ko/', { waitUntil: 'domcontentloaded' });

    const nav = page.locator('nav').first();
    await expect(nav.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/ko/');
    await expect(nav.getByRole('link', { name: '내 운동' })).toHaveAttribute('href', '/ko/fitness');
    await expect(nav.getByRole('link', { name: '탐색' })).toHaveAttribute('href', '/ko/discover');
    await expect(nav.getByRole('link', { name: '커뮤니티' })).toHaveAttribute('href', '/ko/board');
    await expect(nav.getByRole('link', { name: '설정' })).toHaveAttribute('href', '/ko/my');
  });

  test('desktop hub subnavigation preserves the active locale', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'Desktop subnav coverage runs on desktop');

    await page.goto('/en/discover', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('link', { name: 'Discover', exact: true })).toHaveAttribute('href', '/en/discover');
    await page.getByRole('link', { name: 'Segments', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/explore$/);
    await page.getByRole('link', { name: 'Leaderboard', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/leaderboard$/);
    await page.getByRole('link', { name: 'Courses', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/courses$/);
  });

  test('logo navigates to localized home', async ({ page }) => {
    await page.goto('/en/explore', { waitUntil: 'domcontentloaded' });

    await page.getByRole('link', { name: /O-Rider|O·RIDER/i }).first().click();
    await expect(page).toHaveURL(/\/en\/$/);
  });

  test('footer legal links preserve the current locale', async ({ seededPage: page }) => {
    test.skip(test.info().project.name === 'mobile', 'Desktop footer hidden on mobile');

    await page.goto('/ko/leaderboard', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/ko/terms');
    await expect(page.getByRole('link', { name: '개인정보처리방침' })).toHaveAttribute('href', '/ko/privacy');
  });

  test('mobile bottom tabs navigate through localized core hubs', async ({ page }) => {
    test.skip(test.info().project.name === 'desktop', 'Bottom tab bar only on mobile');

    await page.goto('/ko/', { waitUntil: 'domcontentloaded' });

    const tabs = page.getByRole('tablist', { name: '메인 내비게이션' });
    await expect(tabs.getByRole('tab', { name: '홈' })).toHaveAttribute('href', '/ko');
    await tabs.getByRole('tab', { name: '탐색' }).click();
    await expect(page).toHaveURL(/\/ko\/discover$/);
    await tabs.getByRole('tab', { name: '커뮤니티' }).click();
    await expect(page).toHaveURL(/\/ko\/board$/);
  });
});
