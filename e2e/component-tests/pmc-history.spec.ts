import { test,expect } from "@playwright/test";

for(const scenario of [
  { timezoneId: "Asia/Seoul",now: "2026-09-07T16:00:00Z",expectedDay: "2026-09-07" },
  { timezoneId: "America/Los_Angeles",now: "2026-09-08T02:00:00Z",expectedDay: "2026-09-08" },
]) {
  test(`PMC UTC 날짜 경계: ${scenario.timezoneId}`,async ({ browser }) => {
    const context=await browser.newContext({ timezoneId: scenario.timezoneId });
    try {
      const page=await context.newPage();
      await page.clock.setFixedTime(new Date(scenario.now));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1:5189)/,route => route.abort());
      await page.goto("http://127.0.0.1:5189/e2e/fixtures/pmc-history.html?lang=ko&lifecycle=processed&clock=live");
      const panel=page.locator(".pmc-history");
      await expect(panel.locator(".pmc-history__value-strip strong")).toContainText(`${scenario.expectedDay} – ${scenario.expectedDay}`);
      await expect(panel.locator(".pmc-history__evidence-grid dd").nth(2)).toContainText("서버 계산");
      await expect(panel.locator('[data-pmc-metric="ctl"]').first()).not.toContainText("—");
    } finally { await context.close(); }
  });
}

for(const width of [320,393,768,1440]) for(const lang of ["ko","en"]) {
  test(`PMC lifecycle ${width}px ${lang}: load and pending/failed/processed calculations remain distinct`,async ({ page },info) => {
    await page.setViewportSize({ width,height: 900 });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:5189)/,route => route.abort());
    for(const lifecycle of ["pending","failed","processed"] as const) {
      await page.goto(`/e2e/fixtures/pmc-history.html?lang=${lang}&lifecycle=${lifecycle}`);
      const panel=page.locator(".pmc-history");
      const evidence=panel.locator(".pmc-history__evidence-grid").first();
      await expect(evidence.locator("dd").nth(1)).toContainText(lang==="ko"? "확정":"Finalized");
      const stateLabel=lifecycle==="pending"? (lang==="ko"? "반영 대기":"Awaiting update")
        :lifecycle==="failed"? (lang==="ko"? "계산 실패":"Calculation failed"):(lang==="ko"? "서버 계산":"Server calculation");
      await expect(evidence.locator("dd").nth(2)).toContainText(stateLabel);
      await expect(evidence.locator("dd").first()).toContainText("70");
      if(lifecycle==="processed") await expect(panel.locator('[data-pmc-metric="ctl"]').first()).not.toContainText("—");
      else await expect(panel.locator('[data-pmc-metric="ctl"]').first()).toContainText("—");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      if(lifecycle==="failed") await page.screenshot({ path: info.outputPath("failed-state.png"),fullPage: true });
    }
  });

  test(`PMC ${width}px ${lang}: aligned controls, bounded selection, keyboard and year evidence`,async ({ page },info) => {
    await page.setViewportSize({ width,height: 900 });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:5189)/,route => route.abort());
    await page.goto(`/e2e/fixtures/pmc-history.html?lang=${lang}`);
    await page.evaluate(() => document.fonts.ready);
    const panel=page.locator(".pmc-history");
    const previous=panel.getByRole("button",{ name: lang==="ko"? "이전 구간":"Previous period",exact: true });
    const next=panel.getByRole("button",{ name: lang==="ko"? "다음 구간":"Next period",exact: true });
    const today=panel.getByRole("button",{ name: lang==="ko"? "오늘":"Today",exact: true });
    const boxes=await Promise.all([previous,next,today].map(control => control.boundingBox()));
    expect(Math.max(...boxes.map(box => box!.y))-Math.min(...boxes.map(box => box!.y))).toBeLessThan(1);
    expect(Math.max(...boxes.map(box => box!.height))-Math.min(...boxes.map(box => box!.height))).toBeLessThan(1);
    const selected=panel.getByRole("combobox");
    const selection=(await selected.boundingBox())!;
    if(width>700) expect(Math.abs(selection.y-boxes[0]!.y)).toBeLessThan(1);
    else expect(selection.y+selection.height).toBeLessThanOrEqual(boxes[0]!.y);
    await panel.getByRole("button",{ name: lang==="ko"? "3년":"3 years",exact: true }).click();
    await selected.click();
    await expect(page.getByRole("option")).toHaveCount(36);
    expect((await page.getByRole("listbox").boundingBox())!.height).toBeLessThanOrEqual(321);
    await page.keyboard.press("End"); await page.keyboard.press("Enter");
    const chart=panel.getByRole("slider").first();
    await chart.focus(); await page.keyboard.press("ArrowLeft");
    await expect(chart).toHaveAttribute("aria-valuenow","35");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("trend-controls.png"),fullPage: true });
    await panel.getByRole("button",{ name: lang==="ko"? "연도별 비교":"Compare years",exact: true }).click();
    for(const year of ["2024","2023","2022"]) await panel.getByRole("button",{ name: year,exact: true }).click();
    await expect(panel.locator(".pmc-history__evidence-period")).toHaveCount(5);
    await selected.click(); await expect(page.getByRole("option")).toHaveCount(12);
    await page.keyboard.press("End"); await page.keyboard.press("Enter");
    await expect(panel.locator('[data-pmc-metric="ctl"]').first()).toContainText("—");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("years-missing-evidence.png"),fullPage: true });
  });
}
