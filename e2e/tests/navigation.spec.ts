import { test, expect } from '../fixtures/test-fixtures';

test.describe('Navigation', () => {
  test('desktop header exposes locale-aware hub links', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '전체 헤더는 1024px부터 표시됩니다.');
    await page.goto('/ko/', { waitUntil: 'domcontentloaded' });
    const nav = page.getByTestId('X1-1').first();
    for (const [name, href] of [['홈', '/ko/'], ['코치', '/ko/coach/condition'], ['클럽', '/ko/clubs'], ['탐색', '/ko/explore/courses'], ['게시판', '/ko/community/board']]) {
      await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
    }
  });

  test('desktop hub subnavigation preserves the active locale', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱 허브 보조 탐색');
    await page.goto('/en/explore/courses', { waitUntil: 'domcontentloaded' });
    for (const [name, path] of [['Segments', 'segments'], ['Events', 'events'], ['Courses', 'courses']]) {
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/en/explore/${path}$`));
    }
  });

  test('logo navigates to localized home', async ({ page }) => {
    await page.goto('/en/explore/segments', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: /Orider|O·RIDER/i }).first().click();
    await expect(page).toHaveURL(/\/en\/$/);
  });

  test('footer legal links preserve the current locale', async ({ seededPage: page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '좁은 화면의 정책 링크는 더보기 메뉴에 있습니다.');
    await page.goto('/ko/explore/events', { waitUntil: 'domcontentloaded' });
    const footer = page.getByRole('navigation', { name: '사이트 안내' });
    await footer.getByRole('button', { name: '약관·정책' }).click();
    const policies = page.getByRole('region', { name: '약관·정책' });
    await expect(policies.getByRole('link', { name: '이용약관', exact: true })).toHaveAttribute('href', '/ko/terms');
    await expect(policies.getByRole('link', { name: '개인정보처리방침', exact: true })).toHaveAttribute('href', '/ko/privacy');
  });

  test('compact bottom navigation links activate localized core hubs', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', '하단 탐색은 모바일·태블릿에 표시됩니다.');
    await page.goto('/ko/', { waitUntil: 'domcontentloaded' });
    const nav = page.getByRole('navigation', { name: '메인 내비게이션', exact: true });
    await expect(nav.getByRole('link', { name: '홈', exact: true })).toHaveAttribute('aria-current', 'page');
    for (const [name, path] of [['탐색', '/ko/explore/courses'], ['게시판', '/ko/community/board']]) {
      const link = nav.getByRole('link', { name, exact: true });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(link).toHaveAttribute('aria-current', 'page');
    }
  });
});
