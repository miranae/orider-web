import { test, expect } from "@playwright/test";

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
      await expect(panel.getByRole("columnheader", { name: lang === "ko" ? "운동부하 반영" : "Exercise load coverage", exact: true })).toBeVisible();
      await expect(panel.getByRole("columnheader", { name: lang === "ko" ? "PMC 계산" : "PMC calculation", exact: true })).toBeVisible();
      const latest = panel.locator("tbody tr").first();
      await expect(latest).toContainText(lang === "ko" ? "집계됨" : "Recorded");
      await expect(latest).toContainText(lang === "ko" ? "추정 계산" : "Estimated calculation");
      await panel.getByRole("button", { name: lang === "ko" ? "이전 구간" : "Previous period", exact: true }).click();
      await expect(latest).toContainText(lang === "ko" ? "미확인" : "Unconfirmed");
      await page.evaluate(() => document.fonts.ready);
      await panel.getByRole("button", { name: lang === "ko" ? "3년" : "3 years", exact: true }).click();
      await expect(panel.getByRole("combobox").locator("option")).toHaveCount(36);
      const charts = panel.getByRole("slider");
      await charts.first().focus();
      await page.keyboard.press("ArrowLeft");
      await expect(charts.first()).toHaveAttribute("aria-valuenow", "35");
      await expect(charts.last()).toHaveAttribute("aria-valuenow", "35");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect.poll(() => panel.locator("svg.pmc-history__chart").first().evaluate(svg => {
        const labels = [...svg.querySelectorAll("text")].filter(node => node.getAttribute("y") === "190");
        const boxes = labels.map(node => node.getBoundingClientRect());
        return boxes.every((box, index) => index === 0 || box.left >= boxes[index - 1].right);
      })).toBe(true);
      await testInfo.attach(`pmc-3year-${width}-${lang}`, { body: await page.screenshot({ path: testInfo.outputPath("3year.png"), fullPage: true, animations: "disabled" }), contentType: "image/png" });
      await panel.getByRole("button", { name: lang === "ko" ? "연도별 비교" : "Compare years", exact: true }).click();
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
