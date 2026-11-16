import { test, expect } from '../fixtures/test-fixtures';

test.describe('Responsive Layout', () => {
  test('compact navigation stays readable and tappable across locales and themes', async ({ seededPage: page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', '하단 탐색은 모바일·태블릿에 표시됩니다.');
    const widths = testInfo.project.name === 'mobile' ? [320, 390] : [768];
    for (const width of widths) for (const locale of ['ko', 'en']) for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`/${locale}/`, { waitUntil: 'domcontentloaded' });
      const nav = page.getByRole('navigation', { name: locale === 'ko' ? '메인 내비게이션' : 'Main navigation', exact: true });
      await expect(nav).toBeVisible();
      await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
      await expect(nav.getByRole('link')).toHaveCount(5);
      await page.evaluate(() => document.fonts.ready);
      const geometry = await nav.getByRole('link').evaluateAll(links => links.map(link => {
        const bounds = link.getBoundingClientRect();
        const label = link.querySelector('span')!;
        const text = label.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height, font: parseFloat(getComputedStyle(label).fontSize),
          clipped: label.scrollWidth > label.clientWidth || text.left < bounds.left || text.right > bounds.right || text.bottom > bounds.bottom };
      }));
      for (const item of geometry) {
        expect(item.font).toBeGreaterThanOrEqual(12);
        expect(item.width).toBeGreaterThanOrEqual(44);
        expect(item.height).toBeGreaterThanOrEqual(44);
        expect(item.clipped).toBe(false);
      }
      await testInfo.attach(`bottom-navigation-${width}-${locale}-${theme}`, { body: await nav.screenshot(), contentType: 'image/png' });
    }
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
