import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  for (const lang of ["ko", "en"]) {
    test(`PMC ${width}px ${lang}: 월평균·연도 비교·키보드`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      // 외부 연결 없이 로컬 실제 컴포넌트만 검증한다.
      await page.route(/^https?:\/\/(?!127\.0\.0\.1:5189)/, route => route.abort());
      await page.goto(`/e2e/fixtures/pmc-history.html?lang=${lang}`);
      const panel = page.locator(".pmc-history");
      await expect(panel).toBeVisible();
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
