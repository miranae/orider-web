import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
// 예정 탭(기본)은 다가오는 모임만, 지난 이벤트 탭은 취소 모임·종료 대회를 함께 최근 순으로 보인다(#1620).
test('upcoming and past tabs split meetings and races by time',async({page},info)=>{
  await page.goto('/e2e/fixtures/unified-club-events.html');
  await expect(page.getByRole('button',{name:'예정',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('link',{name:'주말 아침 라이딩'})).toBeVisible();
  await expect(page.getByRole('link',{name:'그룹 가상라이딩'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'가을 클럽 대회'})).toHaveCount(0);
  await mkdir('docs/reviews/2026-11-04-unified-club-events',{recursive:true});
  await page.screenshot({path:`docs/reviews/2026-11-04-unified-club-events/${info.project.name}-upcoming.png`,fullPage:true,animations:"disabled"});
  await page.getByRole('button',{name:'지난 이벤트',exact:true}).click();
  await expect(page.getByRole('button',{name:'지난 이벤트',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('link',{name:'그룹 가상라이딩'})).toBeVisible();
  await expect(page.getByRole('link',{name:'가을 클럽 대회'})).toBeVisible();
  await expect(page.getByRole('link',{name:'주말 아침 라이딩'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'가상주행 관전'})).toHaveCount(0);
  const order=await page.getByRole('link').filter({hasText:/가상라이딩|클럽 대회/}).allTextContents();
  expect(order).toEqual(['그룹 가상라이딩','가을 클럽 대회']);
  await page.screenshot({path:`docs/reviews/2026-11-04-unified-club-events/${info.project.name}-past.png`,fullPage:true,animations:"disabled"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
