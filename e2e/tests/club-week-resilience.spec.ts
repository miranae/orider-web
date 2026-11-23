import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
for(const phase of ['loading','error'])test(`week ${phase} preserves club navigation`,async({page},info)=>{
  await page.goto(`/e2e/fixtures/club-week-resilience.html?phase=${phase}`);
  await expect(page.getByRole('heading',{name:'테스트 클럽',level:1})).toBeVisible();
  await expect(page.getByText('멤버 5명',{exact:true})).toBeVisible();
  // 휴대폰은 멤버·운영을 머리글 ⋯ 메뉴로 옮겼다.
  if(info.project.name==='mobile')await expect(page.getByRole('button',{name:'클럽 메뉴',exact:true})).toBeVisible();
  else await expect(page.getByRole('link',{name:'멤버',exact:true})).toBeVisible();
  // 휴대폰 활동은 이번 주 요약과 공동 기록이 각자 다시 시도한다(한쪽 실패가 화면 전체를 덮지 않는다).
  if(phase==='error')await expect(page.getByRole('button',{name:/다시/})).toHaveCount(info.project.name==='mobile'?2:1);
  await mkdir('docs/reviews/2026-11-05-club-followups',{recursive:true});
  await page.screenshot({path:`docs/reviews/2026-11-05-club-followups/${info.project.name}-${phase}.png`,fullPage:true,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('week rankings load only requested pages and reset on metric change',async({page},info)=>{
  await page.goto('/e2e/fixtures/club-week-resilience.html?phase=paged');
  await expect(page.getByRole('progressbar')).toHaveCount(20);
  await expect(page.getByText('123.0 km',{exact:true})).toBeVisible();
  await expect(page.getByText('Rider 21',{exact:true})).toHaveCount(0);
  const more=page.getByRole('button',{name:/더 보기|Load more/});
  await more.click();await expect(page.getByRole('progressbar')).toHaveCount(40);
  await more.click();await expect(page.getByRole('progressbar')).toHaveCount(45);
  await expect(more).toHaveCount(0);
  await page.getByRole('button',{name:'활동시간',exact:true}).click();
  await expect(page.getByRole('progressbar')).toHaveCount(20);
  await expect(page.getByText('123.0 km',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/group-week-targeted-${info.project.name}.png`,fullPage:true,animations:'disabled'});
});

test('stale ranking pages clear accumulated rows until explicit retry',async({page})=>{
  await page.goto('/e2e/fixtures/club-week-resilience.html?phase=stale');
  await expect(page.getByRole('progressbar')).toHaveCount(20);
  await page.getByRole('button',{name:'순위 더 보기',exact:true}).click();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByText('123.0 km',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'순위 더 보기',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/다시/}).click();
  await expect(page.getByRole('progressbar')).toHaveCount(20);
});
