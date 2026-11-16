import { test, expect } from '../fixtures/test-fixtures';

// 색상 값 자체는 토큰이 소유합니다. 브라우저 선호와 실제 배경 명도가 함께 바뀌는지 확인합니다.
test('system color scheme switches the resolved theme and page background', async ({ seededPage: page }) => {
  const brightness: number[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    const rgb = await page.evaluate(() => getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)!.slice(0, 3).map(Number));
    brightness.push(rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722);
  }
  expect(brightness[0]).toBeGreaterThan(200);
  expect(brightness[1]).toBeLessThan(80);
});
