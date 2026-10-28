import { test, expect } from "@playwright/test";
for (const width of [320, 393, 768]) {
  test(`shared app coach at ${width}px keeps its owner through page navigation`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
    });
    await page.goto("/ko/embed/fitness?sport=bike");
    await expect(page.getByTestId("embedded-fitness")).toBeVisible();
    const owner = await page.getByTestId("fixture-owner").textContent();
    for (const [label, target] of [["컨디션", "condition"], ["오늘", "today"], ["분석", "analysis"], ["계획", "plan"], ["목표", "goals"]]) {
      await page.getByRole("navigation").getByRole("button", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`page=${target}`));
      await expect(page.getByTestId("fixture-owner")).toHaveText(owner!);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (target === "plan") await expect(page.getByTestId("K4-0")).toBeVisible();
      if (target === "goals") await expect(page.getByTestId("K3-1-4")).toBeEnabled();
      if (target === "today") await expect(page.getByTestId("K2-0")).toBeVisible();
      if (target === "analysis") await expect(page.getByTestId("K5-0-1")).toBeVisible();
      if (target === "condition") await expect(page.getByTestId("K1-0-1")).toBeVisible();
      await page.screenshot({ path: info.outputPath(`${target}-${width}.png`), animations: "disabled" });
    }
    await page.goBack();
    await expect(page).toHaveURL(/page=plan/);
    await expect(page.getByTestId("fixture-owner")).toHaveText(owner!);
    expect(errors).toEqual([]);
  });
}
