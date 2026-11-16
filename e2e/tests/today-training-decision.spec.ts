import { test, expect, TEST_EMAIL, TEST_PASSWORD } from "../fixtures/test-fixtures";
import { signInUser } from "../fixtures/auth";
import { seedTrainingGoal } from "../fixtures/seed";
import type { Locator, Page, TestInfo } from "@playwright/test";
import {
  todayTrainingDecisionE2eEnvelope,
} from "../fixtures/today-training-decision";

async function signIn(page: Page) {
  await page.goto("/ko/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof (window as Window & { __e2eSignIn?: unknown }).__e2eSignIn === "function");
  await page.evaluate(async ({ email, password }) => {
    await (window as Window & { __e2eSignIn: (email: string, password: string) => Promise<void> }).__e2eSignIn(email, password);
  }, { email: TEST_EMAIL, password: TEST_PASSWORD });
}

async function mockTodayTraining(page: Page, state: { applied?: boolean; decisionUnavailable?: boolean } = {}) {
  await page.route("**/runtime-config.json*", route => route.fulfill({ json: {
    aiApiBase: "https://coach.e2e.test", useEmulators: true, trainingDecisionEnabled: true,
  } }));
  await page.route("https://coach.e2e.test/v1/coach/training-decisions/today?discipline=bike", async route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /u);
    if (state.decisionUnavailable) await route.abort("failed");
    else await route.fulfill({ json: todayTrainingDecisionE2eEnvelope({ applied: state.applied === true }) });
  });
}

async function waitForStableDecision(page: Page, card: ReturnType<Page["locator"]>) {
  await expect(card).toBeVisible();
  await expect(page.getByText("오늘 계획을 확인하는 중…")).toHaveCount(0);
  await page.waitForFunction(() => document.fonts.status === "loaded");
}

async function expectContainedReflow(card: Locator) {
  const geometry = await card.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const clipped = [...element.querySelectorAll<HTMLElement>("button, a, input, select, [data-session-role]")]
      .filter((item) => !item.classList.contains("sr-only") && item.getClientRects().length > 0)
      .filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
      }).map((item) => item.textContent?.trim() || item.tagName);
    return { ownOverflow: element.scrollWidth - element.clientWidth,
      viewportOverflow: document.documentElement.scrollWidth - window.innerWidth, clipped };
  });
  expect(geometry.ownOverflow).toBeLessThanOrEqual(1);
  expect(geometry.viewportOverflow).toBeLessThanOrEqual(1);
  expect(geometry.clipped).toEqual([]);
}

async function applyTextScale200(page: Page, sample: Locator) {
  const baseline = await sample.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect.poll(() => sample.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
    .toBeCloseTo(baseline * 2, 1);
}

async function resetTextScale(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("font-size");
  });
}

async function waitForVisualStability(target: Locator) {
  await target.evaluate((element) => {
    element.getAnimations({ subtree: true }).forEach((animation) => animation.finish());
  });
  await expect(target).toHaveCSS("opacity", "1");
}

async function attachFullPageFromTop(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll<HTMLElement>("main").forEach((element) => element.scrollTo(0, 0));
  });
  await expect.poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY,
    main: [...document.querySelectorAll<HTMLElement>("main")].map((element) => element.scrollTop) })))
    .toEqual({ x: 0, y: 0, main: [0] });
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test.describe("Current training decision surfaces", () => {
  test("Home remains an activity feed rather than the retired execution card", async ({ page }) => {
    await mockTodayTraining(page, {});
    await signIn(page);
    await expect(page.getByText("한강 라이딩 즐거웠습니다", { exact: true }).first()).toBeVisible();
    await expect(page.locator(".training-decision-card")).toHaveCount(0);
  });

  test("Plan compares the current session and recommendation without retired execution actions", async ({ page }, testInfo) => {
    await mockTodayTraining(page, {});
    const { localId } = await signInUser(TEST_EMAIL, TEST_PASSWORD);
    await seedTrainingGoal(localId);
    await signIn(page);
    await page.goto("/ko/coach/plan?sport=bike");
    const plan = page.locator(".training-decision-card--plan").first();
    await waitForStableDecision(page, plan);
    await expect(plan.getByText("현재 실행안 · 원래 계획 기준")).toBeVisible();
    await expect(plan.getByText("권고 변화 -20분 · -45 TSS")).toBeVisible();
    await expect(plan.locator('[data-session-role="recommended"]')).toContainText("회복");
    await expect(plan.getByRole("button", { name: "운동 시작" })).toHaveCount(0);
    await expect(plan.getByRole("button", { name: "이 변경 적용" })).toHaveCount(0);
    await applyTextScale200(page, plan.getByRole("heading", { name: "변경 권고 · 아직 미적용" }));
    await expectContainedReflow(plan);
    await attachFullPageFromTop(page, testInfo, `training-plan-text-scale-200-${testInfo.project.name}.png`);
    await resetTextScale(page);
  });

  test("Plan distinguishes an unapplied recommendation from an applied read model", async ({ page }, testInfo) => {
    const state = { applied: false };
    await mockTodayTraining(page, state);
    const { localId } = await signInUser(TEST_EMAIL, TEST_PASSWORD);
    await seedTrainingGoal(localId);
    await signIn(page);
    for (const applied of [false, true]) {
      state.applied = applied;
      await page.goto("/ko/coach/plan?sport=bike");
      const card = page.locator(".training-decision-card--plan").first();
      await waitForStableDecision(page, card);
      await expect(card.getByRole("heading", { name: applied ? "변경 적용됨" : "변경 권고 · 아직 미적용" })).toBeVisible();
      const effective = card.locator(applied ? '[data-session-role="effective"]' : '[data-session-role="neutral"]');
      await expect(effective).toContainText(applied ? "회복" : "템포");
      await expect(effective).toContainText(applied ? "40분" : "60분");
      await expectContainedReflow(card);
      await waitForVisualStability(card);
      await attachFullPageFromTop(page, testInfo, `training-plan-applied-${applied}-${testInfo.project.name}.png`);
    }
  });

  test("condition keeps its diagnostic chart without the retired all-in-one card", async ({ page }) => {
    await mockTodayTraining(page, { decisionUnavailable: true });
    await signIn(page);
    await page.goto("/ko/coach/condition?sport=bike");
    await expect(page.getByRole("img", { name: /^컨디션 변화/ })).toBeVisible();
    await expect(page.locator(".training-decision-card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "코치에게 묻기", exact: true })).toBeVisible();
  });
});
