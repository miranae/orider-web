import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
for(const phase of ['loading','error'])test(`week ${phase} preserves club navigation`,async({page},info)=>{
  await page.goto(`/e2e/fixtures/club-week-resilience.html?phase=${phase}`);
  await expect(page.getByRole('heading',{name:'테스트 클럽',level:1})).toBeVisible();
  await expect(page.getByText('멤버 5명',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'멤버',exact:true})).toBeVisible();
  if(phase==='error')await expect(page.getByRole('button',{name:/다시/})).toBeVisible();
  await mkdir('docs/reviews/2026-11-05-club-followups',{recursive:true});
  await page.screenshot({path:`docs/reviews/2026-11-05-club-followups/${info.project.name}-${phase}.png`,fullPage:true,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
