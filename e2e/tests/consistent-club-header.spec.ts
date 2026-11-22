import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
test('club identity stays the same while switching tabs',async({page},info)=>{
  await page.goto('/e2e/fixtures/consistent-club-header.html');
  await mkdir('docs/reviews/2026-11-04-consistent-club-header',{recursive:true});
  // 휴대폰은 탭 셋(모임·소식·활동)이고 멤버·운영·공유는 머리글 ⋯ 메뉴에 있다.
  const mobile=info.project.name==='mobile';
  const tabs=mobile?[['home','소식'],['events','모임'],['activity','활동'],['members','멤버']]:[['home','소식'],['members','멤버'],['events','모임'],['settings','운영']];
  for(const [key,tab] of tabs){
    if(mobile&&key==='members'){
      await page.getByRole('button',{name:'클럽 메뉴',exact:true}).click();
      await expect(page.getByRole('link',{name:'운영',exact:true})).toBeVisible();
      await page.getByRole('link',{name:tab,exact:true}).click();
    }else{
      await page.getByRole('link',{name:tab,exact:true}).click();
      await expect(page.getByRole('link',{name:tab,exact:true})).toHaveAttribute('aria-current','page');
    }
    await expect(page.getByRole('heading',{level:1})).toHaveText('테스트 클럽');
    await expect(page.getByText('함께 달리는 사람들',{exact:true})).toHaveCount(1);
    await expect(page.getByText('멤버 5명',{exact:true})).toBeVisible();
    if(mobile)await expect(page.getByRole('button',{name:'클럽 메뉴',exact:true})).toBeVisible();
    else await expect(page.getByRole('button',{name:'공유',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(key==='home'||key==='members') await page.screenshot({path:`docs/reviews/2026-11-04-consistent-club-header/${info.project.name}-${key}.png`,fullPage:true,animations:'disabled'});
  }
});
