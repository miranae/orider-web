import { test, expect, TEST_EMAIL, TEST_PASSWORD } from "../fixtures/test-fixtures";
import { todayTrainingDecisionE2eEnvelope } from "../fixtures/today-training-decision";

test.describe("Today training decision responsive render", () => {
  test("renders the canonical Home card without horizontal overflow", async ({ page }, testInfo) => {
    await page.route("**/runtime-config.json*", (route) => route.fulfill({ json: {
      aiApiBase: "https://coach.e2e.test", useEmulators: true,
      trainingDecisionEnabled: true, trainingExecutionEnabled: false,
    } }));
    await page.route("https://coach.e2e.test/v1/coach/training-decisions/today?discipline=bike", async (route) => {
      expect(route.request().headers().authorization).toMatch(/^Bearer /u);
      await route.fulfill({ json: todayTrainingDecisionE2eEnvelope() });
    });

    await page.goto("/ko/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof (window as Window & { __e2eSignIn?: unknown }).__e2eSignIn === "function");
    await page.evaluate(async ({ email, password }) => {
      await (window as Window & { __e2eSignIn: (email: string, password: string) => Promise<void> }).__e2eSignIn(email, password);
    }, { email: TEST_EMAIL, password: TEST_PASSWORD });

    const card = page.locator(".training-decision-card--home");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-decision-id", "today_cccccccccccccccccccccccc");
    await expect(card.getByText("원래 계획")).toBeVisible();
    await expect(card.getByText("조정 권고")).toBeVisible();
    await expect(card.getByText("최근 부하가 높은 상태예요")).toBeVisible();
    await expect(card.getByRole("link", { name: /계획에서 보기/u })).toBeVisible();
    await expect(card.getByText("운동 실행")).toHaveCount(0);

    const geometry = await card.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width, viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.width).toBeGreaterThan(250);

    await testInfo.attach(`today-training-decision-${testInfo.project.name}.png`, {
      body: await card.screenshot(), contentType: "image/png",
    });
    await testInfo.attach(`today-training-home-${testInfo.project.name}-full.png`, {
      body: await page.screenshot({ fullPage: true }), contentType: "image/png",
    });
  });
});
