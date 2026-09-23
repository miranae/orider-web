import { test, expect } from "@playwright/test";

for (const scenario of [
  { timezoneId: "Asia/Seoul", now: "2026-09-07T16:00:00Z", expectedDay: "2026-09-07" },
  { timezoneId: "America/Los_Angeles", now: "2026-09-08T02:00:00Z", expectedDay: "2026-09-08" },
]) {
  test(`PMC UTC 날짜 경계: ${scenario.timezoneId}`, async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: scenario.timezoneId });
    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(scenario.now));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1:5189)/, route => route.abort());
      await page.goto("http://127.0.0.1:5189/e2e/fixtures/pmc-history.html?lang=ko&lifecycle=processed&clock=live");
      const panel = page.locator(".pmc-history");
      await expect(panel.locator(".pmc-history__value-strip strong")).toHaveText(`${scenario.expectedDay} – ${scenario.expectedDay}`);
      await panel.locator("details summary").click();
      const row = panel.locator("tbody tr").first();
      await expect(row).toContainText("서버 계산");
      await expect(row.locator("td").first()).not.toHaveText("—");
    } finally {
      await context.close();
    }
  });
}

for (const width of [1440, 390]) {
  for (const lang of ["ko", "en"]) {
    test(`PMC lifecycle ${width}px ${lang}: 확정 부하와 계산 대기·실패·완료`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1:5189)/, route => route.abort());
      for (const lifecycle of ["pending", "failed", "processed"] as const) {
        await page.goto(`/e2e/fixtures/pmc-history.html?lang=${lang}&lifecycle=${lifecycle}`);
        const panel = page.locator(".pmc-history");
        const row = panel.locator("tbody tr").first();
        await expect(row).toContainText(lang === "ko" ? "확정" : "Finalized");
        const stateLabel = lifecycle === "pending" ? (lang === "ko" ? "반영 대기" : "Awaiting update")
          : lifecycle === "failed" ? (lang === "ko" ? "계산 실패" : "Calculation failed")
            : (lang === "ko" ? "서버 계산" : "Server calculation");
        await expect(row).toContainText(stateLabel);
        await expect(row.locator("td").nth(3)).not.toHaveText("—");
        if (lifecycle === "processed") await expect(row.locator("td").first()).not.toHaveText("—");
        else await expect(row.locator("td").first()).toHaveText("—");
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      expect(errors).toEqual([]);
    });

    test(`PMC ${width}px ${lang}: 월평균·연도 비교·키보드`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      // 외부 연결 없이 로컬 실제 컴포넌트만 검증한다.
      await page.route(/^https?:\/\/(?!127\.0\.0\.1:5189)/, route => route.abort());
      await page.goto(`/e2e/fixtures/pmc-history.html?lang=${lang}`);
      const panel = page.locator(".pmc-history");
      await expect(panel).toBeVisible();
      if (width === 390 && lang === "ko") {
        const range = panel.getByRole("group", { name: "표시 기간" });
        const chart = panel.locator(".pmc-history__trend-stack");
        await expect(range).toBeInViewport();
        await expect(panel.locator(".pmc-history__latest")).toContainText("체력 (CTL)");
        await expect(panel.locator(".pmc-history__latest")).toContainText("피로도 (ATL)");
        const rangeBox = (await range.boundingBox())!;
        expect(rangeBox.y + rangeBox.height).toBeLessThan((await chart.boundingBox())!.y);
        await expect.poll(() => panel.locator(".pmc-history__navigation label").evaluate(label => label.clientWidth / label.parentElement!.clientWidth)).toBeGreaterThan(0.9);
        await testInfo.attach("pmc-mobile-before-chart-ko", { body: await page.screenshot({ path: testInfo.outputPath("mobile-before-chart.png"), animations: "disabled" }), contentType: "image/png" });
      }
      if (width === 1440) await expect(panel.locator('[data-pmc-end-label="ctl"]')).toBeVisible();
      else await expect(panel.locator("[data-pmc-end-label]")).toHaveCount(0);
      await panel.locator("details summary").click();
      await expect(panel.getByRole("columnheader", { name: lang === "ko" ? "운동부하 반영" : "Exercise load coverage", exact: true })).toBeVisible();
      await expect(panel.getByRole("columnheader", { name: lang === "ko" ? "PMC 계산" : "PMC calculation", exact: true })).toBeVisible();
      const latest = panel.locator("tbody tr").first();
      await expect(latest).toContainText(lang === "ko" ? "집계됨" : "Recorded");
      await expect(latest).toContainText(lang === "ko" ? "추정 계산" : "Estimated calculation");
      await panel.getByRole("button", { name: lang === "ko" ? "이전 구간" : "Previous period", exact: true }).click();
      await expect(latest).toContainText(lang === "ko" ? "미확인" : "Unconfirmed");
      await page.evaluate(() => document.fonts.ready);
      await panel.getByRole("button", { name: lang === "ko" ? "3년" : "3 years", exact: true }).click();
      if (width === 390 && lang === "ko") await expect.poll(() => panel.getByRole("button", { name: "최신 구간" }).evaluate(button => button.scrollWidth <= button.clientWidth)).toBe(true);
      await expect(panel.getByRole("combobox").locator("option")).toHaveCount(36);
      const charts = panel.getByRole("slider");
      await charts.first().focus();
      await page.keyboard.press("ArrowLeft");
      await expect(charts.first()).toHaveAttribute("aria-valuenow", "35");
      await expect(charts.last()).toHaveAttribute("aria-valuenow", "35");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await testInfo.attach(`pmc-3year-${width}-${lang}`, { body: await page.screenshot({ path: testInfo.outputPath("3year.png"), fullPage: true, animations: "disabled" }), contentType: "image/png" });
      await panel.getByRole("button", { name: lang === "ko" ? "연도별 비교" : "Compare years", exact: true }).click();
      await expect.poll(() => panel.locator("svg.pmc-history__chart").evaluate(svg => {
        const labels = [...svg.querySelectorAll("text")].filter(node => node.getAttribute("y") === "230");
        const boxes = labels.map(node => node.getBoundingClientRect());
        return boxes.every((box, index) => index === 0 || box.left >= boxes[index - 1].right);
      })).toBe(true);
      for (const year of ["2024", "2023", "2022"]) await panel.getByRole("button", { name: year, exact: true }).click();
      await expect(panel.getByRole("combobox").locator("option")).toHaveCount(12);
      await expect(panel.locator("tbody tr")).toHaveCount(5);
      await panel.getByRole("combobox").selectOption("11");
      await expect(panel.locator("tbody tr").first()).toContainText("—");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await testInfo.attach(`pmc-years-${width}-${lang}`, { body: await page.screenshot({ path: testInfo.outputPath("years.png"), fullPage: true, animations: "disabled" }), contentType: "image/png" });
      expect(errors).toEqual([]);
    });
  }
}
