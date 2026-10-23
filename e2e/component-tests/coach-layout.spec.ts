import { test,expect,type Page } from "@playwright/test";

const widths=[320,393,768,1440];
const labels={ ko: { activities: "활동",month: "월간",next: "다음 기록",pages: "활동 기록 페이지",dayPages: "이 날짜의 활동 페이지",back: "← 뒤로",noMatch: "선택한 달과 종목에서 검색 결과가 없습니다." },en: { activities: "Activities",month: "Monthly",next: "Next records",pages: "Activity record pages",dayPages: "Activities on this date",back: "← Back",noMatch: "No matches in the selected month and sport." } };
async function open(page: Page,width: number,lang: "ko"|"en",route: string,query="count=1000") {
  await page.setViewportSize({ width,height: 900 });
  await page.clock.setFixedTime(new Date("2026-10-22T03:00:00Z"));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5192)/,route => route.abort());
  const url=new URL(`/${lang}${route}`,"http://127.0.0.1:5192");
  for(const [key,value] of new URLSearchParams(query)) url.searchParams.set(key,value);
  await page.goto(`${url.pathname}${url.search}${url.hash}`);
  await expect(page.getByText("LOCAL FIXTURE · no account or API")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function noOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const target of [".mobile-log__finder",".mobile-log__activity-head",".mobile-plan-next",".ftp-progression__readout"]) {
    const clips=await page.locator(target).evaluateAll(nodes => nodes.filter(node => {
      const box=node.getBoundingClientRect(); return box.width>0&&(box.left<-1||box.right>innerWidth+1);
    }).length);
    expect(clips,target).toBe(0);
  }
}
for(const width of widths) for(const lang of ["ko","en"] as const) {
  test(`records ${width}px ${lang}: 1000 rows, search, detail and history`,async ({ page },info) => {
    await open(page,width,lang,"/athlete/me/activities?sport=all&date=2026-10-22&view=activities");
    const rows=page.locator(".mobile-log__activity");
    await expect(rows).toHaveCount(20);
    const height=await page.locator("main").evaluate(node => node.scrollHeight);
    expect(height).toBeLessThan(4000);
    await page.getByRole("button",{ name: labels[lang].next,exact: true }).click();
    await expect(page.getByRole("navigation",{ name: labels[lang].pages,exact: true })).toContainText("21–40");
    await rows.first().click();
    await expect(page.getByRole("heading",{ name: /Fixture activity record-/ })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("navigation",{ name: labels[lang].pages,exact: true })).toContainText("21–40");
    await expect(rows).toHaveCount(20);
    await page.getByRole("searchbox").fill("Record 999");
    await expect(rows).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole("searchbox")).toHaveValue("Record 999");
    await expect(rows).toHaveCount(1);
    await page.getByRole("searchbox").fill("no matching fixture");
    await expect(page.getByRole("status").filter({ hasText: labels[lang].noMatch })).toBeVisible();
    await noOverflow(page);
    await page.getByRole("searchbox").fill("");
    await expect(page.getByRole("searchbox")).toHaveValue("");
    await expect(rows).toHaveCount(20);
    await info.attach("bounded-records",{ body: await page.screenshot({ path: info.outputPath("bounded-records.png"),fullPage: true }),contentType: "image/png" });
    await page.getByTestId("fixture-last").scrollIntoViewIfNeeded();
    if(width<1024) expect((await rows.last().boundingBox())!.y+(await rows.last().boundingBox())!.height).toBeLessThanOrEqual((await page.getByTestId("X1-1").boundingBox())!.y+1);
    await page.screenshot({ path: info.outputPath("records-end.png") });
  });
  test(`detail ${width}px ${lang}: bounded day pages, Escape and original focus`,async ({ page },info) => {
    await open(page,width,lang,"/athlete/me/activities?sport=all&date=2026-10-22");
    const trigger=page.getByRole("button",{ name: /^(?=.*22)(?=.*1000)/ });
    await trigger.click();
    const dialog=page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("button").filter({ hasText: /Record [0-9]/ })).toHaveCount(20);
    await dialog.getByRole("button",{ name: labels[lang].next,exact: true }).click();
    await expect(dialog.getByRole("navigation",{ name: labels[lang].dayPages })).toContainText("21–40");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.getByTestId("fixture-location")).not.toContainText("dayPage");
    await trigger.click();
    await page.getByRole("dialog").getByRole("button",{ name: labels[lang].back,exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await noOverflow(page);
    await info.attach("calendar-after-close",{ body: await page.screenshot({ path: info.outputPath("calendar-after-close.png"),}),contentType: "image/png" });
  });
  test(`analysis ${width}px ${lang}: FTP hover and popup do not shift the document`,async ({ page },info) => {
    await open(page,width,lang,"/coach/analysis?sport=bike");
    const readout=page.locator(".ftp-progression__readout");
    await expect(readout).toBeVisible();
    const before=await page.getByRole("button",{ name: "Fixture long detail and keyboard →" }).boundingBox();
    const plot=page.locator(".ftp-progression__plot");
    await plot.hover(); await plot.focus();
    const combo=page.getByRole("combobox").first();
    await combo.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    const popup=(await page.getByRole("listbox").boundingBox())!;
    expect(popup.height).toBeLessThanOrEqual(321);
    await page.keyboard.press("Home"); await page.keyboard.press("Enter");
    const after=await page.getByRole("button",{ name: "Fixture long detail and keyboard →" }).boundingBox();
    expect(Math.abs(after!.y-before!.y)).toBeLessThan(1);
    await noOverflow(page);
    await info.attach("ftp-stable",{ body: await page.screenshot({ path: info.outputPath("ftp-stable.png"),fullPage: true }),contentType: "image/png" });
  });
  test(`focus ${width}px ${lang}: detail portal, keyboard, reload and close`,async ({ page }) => {
    await open(page,width,lang,"/coach/analysis?sport=bike");
    const trigger=page.getByRole("button",{ name: "Fixture long detail and keyboard →" });
    await trigger.click();
    const dialog=page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for(let index=0;index<12;index++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')&&!document.activeElement.matches(':disabled'))).toBe(true);
    }
    await dialog.locator('button[aria-haspopup="dialog"]').first().click();
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    const combo=dialog.getByRole("combobox",{ name: "Fixture option" });
    await combo.click(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).not.toBeVisible();
    await expect(dialog).toBeVisible(); await expect(combo).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
    await trigger.click(); await page.reload();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button",{ name: labels[lang].back,exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await noOverflow(page);
  });
  test(`plan ${width}px ${lang}: date and sport round trip, long title and next pending day`,async ({ page },info) => {
    await open(page,width,lang,"/coach/plan?sport=run&date=2026-10-24");
    await expect(page.locator('[aria-current="date"]')).toHaveCount(1);
    const recordLink=page.locator('a[href*="/athlete/me/activities?"]').first();
    await expect(recordLink).toHaveAttribute("href",/sport=run.*date=2026-10-24/);
    await recordLink.click();
    await expect(page.getByTestId("fixture-location")).toContainText("sport=run&date=2026-10-24");
    await page.locator('a[href*="/coach/plan?"]').first().click();
    await expect(page.locator('[aria-current="date"]')).toHaveCount(1);
    await noOverflow(page);
    await info.attach("plan-long-title",{ body: await page.screenshot({ path: info.outputPath("plan-long-title.png"),fullPage: true }),contentType: "image/png" });
    await page.getByTestId("fixture-last").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("plan-end.png") });
  });
}
for(const width of widths) for(const count of [0,1]) {
  test(`states ${width}px count=${count}: empty, loading, read error and recovery`,async ({ page },info) => {
    await open(page,width,"ko","/athlete/me/activities?sport=all&date=2026-10-22&view=activities",`count=${count}`);
    await expect(page.locator(".mobile-log__activity")).toHaveCount(count);
    await page.getByRole("button",{ name: "Fixture loading",exact: true }).click();
    await expect(page.getByRole("searchbox")).not.toBeVisible();
    await page.getByRole("button",{ name: "Fixture error",exact: true }).click();
    await expect(page.getByText("Fixture read error")).toBeVisible();
    await expect(page.getByText("아직 활동 기록이 없어요")).not.toBeVisible();
    await page.getByRole("button",{ name: "다시 시도",exact: true }).click();
    await expect(page.locator(".mobile-log__activity")).toHaveCount(count);
    await noOverflow(page);
    const last=page.getByTestId("fixture-last"); await last.scrollIntoViewIfNeeded();
    const box=(await last.boundingBox())!;
    if(width<1024) expect(box.y+box.height).toBeLessThanOrEqual((await page.getByTestId("X1-1").boundingBox())!.y+1);
    await info.attach("last-content",{ body: await page.screenshot({ path: info.outputPath("last-content.png"),}),contentType: "image/png" });
  });
}


for(const lang of ["ko","en"] as const) {
  test(`short screen and larger text 320px ${lang}`,async ({ page },info) => {
    await open(page,320,lang,"/coach/analysis?sport=bike");
    await page.setViewportSize({ width: 320,height: 480 });
    await page.addStyleTag({ content: ":root { --fs-xs: 1rem; --fs-sm: 1.125rem; --fs-base: 1.25rem; }" });
    await page.getByRole("button",{ name: "Fixture long detail and keyboard →" }).click();
    const dialog=page.getByRole("dialog"); await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox",{ name: "Fixture option" }).click();
    const box=(await page.getByRole("listbox").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(321);
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y+box.height).toBeLessThanOrEqual(481);
    await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
    await dialog.getByRole("button",{ name: "Fixture browser back" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("short-detail-end.png") });
    await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
    await noOverflow(page);
  });
}


for(const lang of ["ko","en"] as const) for(const detail of ["ftp-decision","analysis-model"]) {
  test(`responsive detail ${lang} ${detail}: live resize, close and closed reload`,async ({ page }) => {
    await open(page,393,lang,`/coach/evidence?sport=bike&detail=${detail}&decisionId=fixture&range=90#ftp-decision`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.setViewportSize({ width: 1440,height: 900 });
    await expect(page.getByTestId("responsive-mode")).toHaveText("desktop");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(detail==="ftp-decision"? "Fixture stored FTP evidence":"Fixture stored model evidence")).toBeVisible();
    expect(await page.locator("#root").evaluate(node => (node as HTMLElement).inert)).toBe(false);
    expect(await page.locator("body").evaluate(node => getComputedStyle(node).overflow)).not.toBe("hidden");
    await page.setViewportSize({ width: 393,height: 900 });
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button",{ name: labels[lang].back,exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("fixture-location")).toContainText("decisionId=fixture");
    await page.setViewportSize({ width: 1440,height: 900 });
    await expect(page.getByText(detail==="ftp-decision"? "Fixture stored FTP evidence":"Fixture stored model evidence")).not.toBeVisible();
    await page.setViewportSize({ width: 320,height: 900 }); await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await noOverflow(page);
  });
}
for(const width of widths) {
  test(`delayed direct FTP ${width}px and unsupported sport detail`,async ({ page }) => {
    await open(page,width,"ko","/coach/evidence?sport=bike&decisionId=fixture#ftp-decision","state=delayed");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button",{ name: "Fixture mount evidence" }).click();
    await expect(page.getByText("Fixture stored FTP evidence")).toBeVisible();
    if(width<768) await expect(page.getByRole("dialog")).toBeVisible();
    await page.goto(`/ko/coach/evidence?sport=run&detail=analysis-model&range=90#analysis-model`);
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("link",{ name: /현재 종목 분석/ }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByTestId("fixture-location")).toContainText("sport=run&range=90");
  });
}
test("768px touch uses the mobile detail while a fine pointer uses desktop",async ({ browser }) => {
  const context=await browser.newContext({ viewport: { width: 768,height: 900 },hasTouch: true,isMobile: true });
  try {
    const page=await context.newPage(); await open(page,768,"ko","/coach/evidence?sport=bike&detail=ftp-decision");
    await expect(page.getByTestId("responsive-mode")).toHaveText("mobile"); await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button",{ name: labels.ko.back,exact: true }).tap(); await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally { await context.close(); }
});

for(const width of widths) {
  test(`run30 ${width}px: stage details and legacy boundary`,async ({ page },info) => {
    await open(page,width,"ko","/coach/run30?sport=run");
    const stages=page.locator(".run30-stages");
    if(width<768) {
      const height=await stages.evaluate(node => node.scrollHeight);
      await stages.getByRole("button",{ name: "11단계 · 구간 2개 보기 →",exact: true }).click();
      const dialog=page.getByRole("dialog",{ name: "11단계 · 구간 2개 보기",exact: true });
      await expect(dialog).toBeVisible(); await expect(dialog.getByText("준비 걷기",{ exact: true }).first()).toBeVisible();
      expect(await stages.evaluate(node => node.scrollHeight)).toBe(height);
      await page.reload(); await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
      await stages.getByRole("button",{ name: "지난 단계 10개 보기 →",exact: true }).click();
      await expect(page.getByTestId("run30-past-stage-1")).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(stages.getByText("준비 걷기",{ exact: true }).first()).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await noOverflow(page); await page.screenshot({ path: info.outputPath("run30-stages.png") });
    await open(page,width,"ko","/coach/run30?sport=run","embed=1");
    await expect(page.locator(".run30-stages").getByText("준비 걷기",{ exact: true }).first()).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}


test.describe("touch help", () => {
  test.use({ hasTouch: true });
  for (const width of [320,393,768]) test(`tap help ${width}px stays bounded and restores focus`, async ({page},info) => {
    await open(page,width,"en","/coach/evidence?help=1");
    const trigger=page.getByRole("button",{name:"Explain FTP",exact:true});
    const neighbor=page.getByTestId("help-neighbor");
    const before=await neighbor.boundingBox();
    await trigger.tap();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded","true");
    expect(await neighbor.boundingBox()).toEqual(before);
    const popover=page.getByRole("tooltip").locator("..");
    const box=(await popover.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(width); expect(box.y+box.height).toBeLessThanOrEqual(900);
    await page.screenshot({path:info.outputPath("touch-help.png")});
    await page.getByRole("button",{name:"Close",exact:true}).tap();
    await expect(page.getByRole("tooltip")).toHaveCount(0); await expect(trigger).toBeFocused();
    await trigger.tap(); await trigger.tap(); await expect(page.getByRole("tooltip")).toHaveCount(0);
    await trigger.tap(); await page.getByRole("button",{name:"Explain CTL",exact:true}).tap();
    await expect(page.getByRole("tooltip")).toHaveCount(1);
    await page.getByRole("button",{name:"Outside help"}).tap(); await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.getByRole("button",{name:"Explain long text",exact:true}).tap();
    const longBox=(await page.getByRole("tooltip").locator("..").boundingBox())!;
    expect(longBox.x).toBeGreaterThanOrEqual(0); expect(longBox.x+longBox.width).toBeLessThanOrEqual(width);
    expect(longBox.y).toBeGreaterThanOrEqual(0); expect(longBox.y+longBox.height).toBeLessThanOrEqual(900);
    await page.getByRole("tooltip").locator("..").evaluate(node=>node.scrollTop=node.scrollHeight);
    await expect(page.getByRole("button",{name:"Close",exact:true})).toBeInViewport();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.screenshot({path:info.outputPath("long-help.png")});
    await page.getByRole("button",{name:"Close",exact:true}).tap();
    await trigger.tap(); await page.locator("main").evaluate(node=>node.scrollTop=400); await expect(page.getByRole("tooltip")).toHaveCount(0);
  });
});
test("desktop help mouse and keyboard dismissal",async ({page}) => {
  await open(page,1440,"en","/coach/evidence?help=1");
  const trigger=page.getByRole("button",{name:"Explain FTP",exact:true});
  await trigger.hover(); await trigger.focus();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await trigger.click(); await trigger.press("Tab");
  const close=page.getByRole("button",{name:"Close",exact:true}); await expect(close).toBeFocused();
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused(); await expect(page.getByRole("tooltip")).toHaveCount(0);
  await trigger.press("Space"); await expect(page.getByRole("tooltip")).toBeVisible();
  await trigger.press("Enter"); await expect(page.getByRole("tooltip")).toHaveCount(0);
});


test("5194 live shared help stays closed on hover/focus after reload",async ({page}) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5194)/,route=>route.abort());
  await page.goto("http://127.0.0.1:5194/design-system-controls.html");
  await page.reload();
  const help=page.getByRole("button",{name:"강도계수 IF 설명",exact:true});
  await help.hover(); await help.focus();
  await expect(page.locator(".ds-help-popover")).toHaveCount(0);
  await help.click(); await expect(page.locator(".ds-help-popover")).toBeVisible();
  await help.press("Enter"); await expect(page.locator(".ds-help-popover")).toHaveCount(0);
  await help.press("Space"); await expect(page.locator(".ds-help-popover")).toBeVisible();
  await page.keyboard.press("Escape"); await expect(help).toBeFocused();
  await expect(page.locator(".ds-help-popover")).toHaveCount(0);
});

for (const width of [320,393,768,1440]) test(`load focus ${width}px never reflows explanations`,async ({page},info)=> {
 await open(page,width,"ko","/coach/evidence?help=1&load=1");
 const button=page.getByRole("button",{name:"고강도",exact:true});
 const last=page.getByTestId("load-last");
 await button.scrollIntoViewIfNeeded();
 const initialHeight=await page.locator("main").evaluate(node=>node.scrollHeight);
 await button.hover(); await button.focus();
 await expect(page.getByRole("tooltip")).toHaveCount(0);
 expect(await page.locator("main").evaluate(node=>node.scrollHeight)).toBe(initialHeight);
 const before={last:await last.boundingBox(),height:await page.locator("main").evaluate(node=>node.scrollHeight)};
 await button.hover(); await button.focus(); await expect(page.getByRole("tooltip")).toHaveCount(0);
 await button.click(); await expect(page.getByRole("tooltip")).toBeVisible();
 await expect(page.getByRole("tooltip")).toContainText("20.0 TSS");
 expect(await last.boundingBox()).toEqual(before.last);
 expect(await page.locator("main").evaluate(node=>node.scrollHeight)).toBe(before.height);
 await page.screenshot({path:info.outputPath("load-help.png")});
 await page.keyboard.press("Escape"); await expect(button).toBeFocused();
 expect(await last.boundingBox()).toEqual(before.last);
 await button.click(); await page.getByRole("button",{name:"닫기",exact:true}).click();
 await expect(page.getByRole("tooltip")).toHaveCount(0);
 await expect(page.getByTestId("load-quality")).toContainText("추정 또는 혼합 부하 포함");
 await expect(page.getByTestId("load-quality")).toContainText("부하가 잡힌 날 300일");
});
