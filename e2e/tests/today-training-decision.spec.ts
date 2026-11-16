import { test, expect, TEST_EMAIL, TEST_PASSWORD } from "../fixtures/test-fixtures";
import type { Locator, Page, TestInfo } from "@playwright/test";
import {
  coachCapabilitiesE2eEnvelope, executionListE2eEnvelope, proposalRecoveryE2eEnvelope,
  todayTrainingDecisionE2eEnvelope, type ExecutionFixtureState, type ProposalFixtureState,
} from "../fixtures/today-training-decision";

async function signIn(page: Page) {
  await page.goto("/ko/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof (window as Window & { __e2eSignIn?: unknown }).__e2eSignIn === "function");
  await page.evaluate(async ({ email, password }) => {
    await (window as Window & { __e2eSignIn: (email: string, password: string) => Promise<void> }).__e2eSignIn(email, password);
  }, { email: TEST_EMAIL, password: TEST_PASSWORD });
}

async function mockTodayTraining(page: Page, state: {
  execution: ExecutionFixtureState; proposal: ProposalFixtureState; recoverExecutionError?: boolean;
  decisionUnavailable?: boolean;
}) {
  await page.route("**/runtime-config.json*", (route) => route.fulfill({ json: {
    aiApiBase: "https://coach.e2e.test", useEmulators: true, trainingDecisionEnabled: true,
    trainingExecutionEnabled: true, coachProgressPlannerEnabled: true,
  } }));
  await page.route("https://coach.e2e.test/v1/coach/training-decisions/today?discipline=bike", async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /u);
    if (state.decisionUnavailable === true) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ json: todayTrainingDecisionE2eEnvelope({ applied: state.proposal === "applied" }) });
  });
  await page.route("https://coach.e2e.test/v1/coach/capabilities", (route) => route.fulfill({ json: coachCapabilitiesE2eEnvelope() }));
  await page.route("https://coach.e2e.test/v1/coach/change-proposals?*", (route) => route.fulfill({ json: proposalRecoveryE2eEnvelope(state.proposal) }));
  await page.route("**/listSessionExecutions", async (route) => {
    if (state.execution === "error" && state.recoverExecutionError !== true) {
      await route.abort("failed");
      return;
    }
    if (state.execution === "error") await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ json: executionListE2eEnvelope(state.execution === "error" ? "executable" : state.execution) });
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

async function expectReadableTextScale(card: Locator) {
  const readability = await card.evaluate((element) => {
    const visible = (item: HTMLElement) => item.getClientRects().length > 0 && getComputedStyle(item).visibility !== "hidden";
    const interactive = [...element.querySelectorAll<HTMLElement>("button, a")].filter(visible).map((item) => {
      const style = getComputedStyle(item);
      const rect = item.getBoundingClientRect();
      const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
      return { text: item.textContent?.trim() ?? "", width: rect.width, lines: Math.round(rect.height / lineHeight) };
    });
    const copy = [...element.querySelectorAll<HTMLElement>("h2, h3, h4, p")]
      .filter((item) => visible(item) && !item.classList.contains("sr-only") && (item.textContent?.trim().length ?? 0) >= 4)
      .map((item) => {
        const style = getComputedStyle(item);
        const rect = item.getBoundingClientRect();
        const fontSize = Number.parseFloat(style.fontSize);
        const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
        return { text: item.textContent?.trim() ?? "", inlineCharacters: rect.width / fontSize,
          lines: Math.round(rect.height / lineHeight) };
      });
    return { narrowActions: interactive.filter((item) => item.width < 128 || item.lines > 2),
      overWrappedCopy: copy.filter((item) => item.inlineCharacters < 4 || item.lines > 6) };
  });
  expect(readability.narrowActions).toEqual([]);
  expect(readability.overWrappedCopy).toEqual([]);
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

async function expectProposalKeyboardOrder(page: Page, plan: Locator) {
  const actions = plan.locator(".training-decision-proposal__actions");
  await expect.poll(() => actions.locator(":scope > button").evaluateAll((buttons) => buttons.map((button) => ({
    text: button.textContent?.trim(), disabled: (button as HTMLButtonElement).disabled,
    tabIndex: (button as HTMLButtonElement).tabIndex,
  })))).toEqual([
    { text: "이 변경 적용", disabled: false, tabIndex: 0 },
    { text: "원래 계획 유지", disabled: false, tabIndex: 0 },
  ]);
  const apply = actions.getByRole("button", { name: "이 변경 적용" });
  const keep = actions.getByRole("button", { name: "원래 계획 유지" });
  await apply.focus();
  await expect(apply).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(keep).toBeFocused();
}

test.describe("Current training decision surfaces", () => {
  test("Home remains an activity feed rather than the retired execution card", async ({ page }) => {
    await mockTodayTraining(page, { execution: "executable", proposal: "pending" });
    await signIn(page);
    await expect(page.getByText("한강 라이딩 즐거웠습니다")).toBeVisible();
    await expect(page.locator(".training-decision-card")).toHaveCount(0);
  });

  test("condition shows diagnosis while Plan owns change actions and keyboard order", async ({ page }, testInfo) => {
    await mockTodayTraining(page, { execution: "executable", proposal: "pending" });
    await signIn(page);
    await page.goto("/ko/coach/condition?sport=bike");
    const condition = page.locator(".training-decision-card--fitness").first();
    await waitForStableDecision(page, condition);
    await expect(condition.getByText("부하 상태 high_load", { exact: false })).toBeVisible();
    await expect(condition.getByRole("button", { name: "AI 코치에게 분석 요청" })).toBeVisible();
    await expect(condition.getByText("운동 실행")).toHaveCount(0);
    await expect(condition.getByText("계획 변경 검토")).toHaveCount(0);
    await attachFullPageFromTop(page, testInfo, `training-condition-${testInfo.project.name}.png`);

    await page.goto("/ko/coach/plan?sport=bike");
    const plan = page.locator(".training-decision-card--plan").first();
    await waitForStableDecision(page, plan);
    await expect(plan.locator('[data-proposal-state="pending"]')).toBeVisible();
    await expect(plan.getByRole("button", { name: "이 변경 적용" })).toBeVisible();
    await expect(plan.getByRole("button", { name: "원래 계획 유지" })).toBeVisible();
    await expectProposalKeyboardOrder(page, plan);
    await applyTextScale200(page, plan.getByRole("heading", { name: "변경 권고 · 아직 미적용" }));
    await expectContainedReflow(plan);
    await expectReadableTextScale(plan);
    await attachFullPageFromTop(page, testInfo, `training-plan-text-scale-200-${testInfo.project.name}.png`);
    await resetTextScale(page);
  });

  test("Plan distinguishes pending, applied, declined and stale proposals", async ({ page }, testInfo) => {
    const mutable = { execution: "reserved" as ExecutionFixtureState, proposal: "pending" as ProposalFixtureState };
    await mockTodayTraining(page, mutable);
    await signIn(page);
    for (const state of ["pending", "applied", "declined", "stale"] as const) {
      mutable.proposal = state;
      await page.goto("/ko/coach/plan?sport=bike");
      const card = page.locator(".training-decision-card--plan").first();
      const panel = card.locator(`[data-proposal-state="${state}"]`);
      await waitForStableDecision(page, card);
      const expected = state === "pending" ? "승인 대기" : state === "applied" ? "적용됨" : state === "declined" ? "원래 계획 유지" : "새 검토 필요";
      await expect(panel.getByRole("status")).toHaveText(expected);
      if (state === "applied") await expect(card.getByRole("heading", { name: "변경 적용됨" })).toBeVisible();
      if (state === "declined") await expect(panel.getByText("원래 계획을 유지했습니다.")).toBeVisible();
      await expectContainedReflow(card);
      await waitForVisualStability(card);
      await attachFullPageFromTop(page, testInfo, `training-plan-${state}-${testInfo.project.name}.png`);
    }
  });

  test("condition explains an unavailable decision and exposes retry", async ({ page }) => {
    await mockTodayTraining(page, { execution: "executable", proposal: "pending", decisionUnavailable: true });
    await signIn(page);
    await page.goto("/ko/coach/condition?sport=bike");
    const card = page.locator('[data-training-decision-fallback="unavailable"]').first();
    await expect(card.getByRole("heading", { name: "오늘 계획을 불러오지 못했습니다" })).toBeVisible();
    await expect(card.getByRole("button", { name: "새로 확인" })).toBeVisible();
    await expectContainedReflow(card);
  });
});
