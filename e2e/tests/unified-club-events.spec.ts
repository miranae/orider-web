import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test('cancelled meetings share the list and status filters with races',async({page},info)=>{
  await page.goto('/e2e/fixtures/unified-club-events.html');
  await expect(page.getByRole('link',{name:'그룹 가상라이딩'})).toBeVisible();
  await expect(page.getByRole('link',{name:'가을 클럽 대회'})).toBeVisible();
  await mkdir('docs/reviews/2026-11-04-unified-club-events',{recursive:true});
  await page.screenshot({path:`docs/reviews/2026-11-04-unified-club-events/${info.project.name}-all.png`,fullPage:true,animations:"disabled"});
  await page.getByRole('button',{name:'취소',exact:true}).click();
  await expect(page.getByRole('button',{name:'취소',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('link',{name:'그룹 가상라이딩'})).toBeVisible();
  await expect(page.getByRole('link',{name:'가을 클럽 대회'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'가상주행 관전'})).toHaveCount(0);
  await page.screenshot({path:`docs/reviews/2026-11-04-unified-club-events/${info.project.name}-cancelled.png`,fullPage:true,animations:"disabled"});
  await page.getByRole('button',{name:'종료',exact:true}).click();
  await expect(page.getByRole('link',{name:'가을 클럽 대회'})).toBeVisible();
  await expect(page.getByRole('link',{name:'그룹 가상라이딩'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
