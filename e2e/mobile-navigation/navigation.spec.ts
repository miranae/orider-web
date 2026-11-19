import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test('navigation reserves space while typing, rotating and dismissing the keyboard', async ({ page }, info) => {
  await page.goto('/e2e/mobile-navigation/index.html');
  const field = page.getByRole('textbox', { name: '입력 내용' });
  const nav = page.getByRole('navigation', { name: '메인 내비게이션' });
  await field.fill('키보드 입력 유지');
  for (const viewport of [{ width: 430, height: 300 }, { width: 932, height: 180 }, { width: 932, height: 300 }, { width: 932, height: 180 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await field.evaluate(node => node.scrollIntoView({ block: 'nearest' }));
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('키보드 입력 유지');
    await expect(nav).toBeInViewport();
    await expect.poll(() => page.evaluate(() => {
      const main = document.querySelector('main')!.getBoundingClientRect();
      const nav = document.querySelector('nav')!.getBoundingClientRect();
      return main.bottom <= nav.top + 1;
    })).toBe(true);
  }
  await page.setViewportSize({ width: 430, height: 300 });
  await field.evaluate(node => node.scrollIntoView({ block: 'nearest' }));
  await expect.poll(() => field.evaluate(node => { const r = node.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === node; })).toBe(true);
  const dir = 'docs/reviews/2026-11-17-mobile-navigation';
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${info.project.name}-keyboard.png` });
  await page.setViewportSize({ width: 430, height: 932 });
  await nav.getByRole('link', { name: '코치', exact: true }).tap();
  await expect(page.getByTestId('location')).toHaveText('/ko/coach/condition');
});
