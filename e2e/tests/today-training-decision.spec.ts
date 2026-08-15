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
}) {
  await page.route("**/runtime-config.json*", (route) => route.fulfill({ json: {
    aiApiBase: "https://coach.e2e.test", useEmulators: true, trainingDecisionEnabled: true,
    trainingExecutionEnabled: true, coachProgressPlannerEnabled: true,
  } }));
  await page.route("https://coach.e2e.test/v1/coach/training-decisions/today?discipline=bike", async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /u);
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

test.describe("Today training decision responsive render", () => {
  test("renders the canonical Home card without horizontal overflow", async ({ page }, testInfo) => {
    await mockTodayTraining(page, { execution: "executable", proposal: "pending" });
    await signIn(page);

    const card = page.locator(".training-decision-card--home");
    await waitForStableDecision(page, card);
    await expect(card).toHaveAttribute("data-decision-id", "today_cccccccccccccccccccccccc");
    await expect(card.getByText("변경 권고 · 아직 미적용")).toBeVisible();
    await expect(card.getByText("현재 실행안 · 원래 계획 기준")).toBeVisible();
    await expect(card.getByText("조정 권고 · 아직 미적용")).toBeVisible();
    await expect(card.locator('[data-session-layout="comparison"]')).toHaveClass(/training-decision-card__sessions--comparison/u);
    await expect(card.getByText("권고 변화 -20분 · -45 TSS")).toBeVisible();
    await expect(card.getByText("최근 부하가 높은 상태예요")).toBeVisible();
    await expect(card.getByRole("link", { name: /계획에서 보기/u })).toBeVisible();
    await expect(card.getByText("운동 실행")).toBeVisible();
    await expect(card.locator('[data-execution-state="executable"]')).toBeVisible();
    await expect(card.getByRole("button", { name: "운동 시작" })).toBeVisible();
    await expect(card.getByRole("button", { name: /AI 코치/u })).toHaveCount(0);

    await card.getByRole("button", { name: "운동 시작" }).focus();
    await page.keyboard.press("Tab");
    await expect(card.getByRole("link", { name: /계획에서 보기/u })).toBeFocused();

    const geometry = await card.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width, viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.width).toBeGreaterThan(250);

    await applyTextScale200(page, card.getByRole("heading", { name: "변경 권고 · 아직 미적용" }));
    await expectContainedReflow(card);
    await expectReadableTextScale(card);
    await expect(card.getByText("현재 실행안 · 원래 계획 기준")).toBeVisible();
    await expect(card.getByText("권고 변화 -20분 · -45 TSS")).toBeVisible();
    await card.getByRole("link", { name: /계획에서 보기/u }).scrollIntoViewIfNeeded();
    await expect(card.getByRole("link", { name: /계획에서 보기/u })).toBeVisible();
    await expect(card.getByRole("link", { name: /계획에서 보기/u })).toBeInViewport();
    await attachFullPageFromTop(page, testInfo, `today-training-home-text-scale-200-${testInfo.project.name}.png`);
    await resetTextScale(page);

    await expect(page.locator(".training-decision-card--home")).toBeVisible();
    await attachFullPageFromTop(page, testInfo, `today-training-decision-${testInfo.project.name}.png`);
    await attachFullPageFromTop(page, testInfo, `today-training-home-${testInfo.project.name}-full.png`);
  });

  test("keeps Fitness diagnostic and Plan change actions on their own surfaces", async ({ page }, testInfo) => {
    await mockTodayTraining(page, { execution: "executable", proposal: "pending" });
    await signIn(page);

    await page.goto("/ko/fitness?sport=bike");
    const fitness = page.locator(".training-decision-card--fitness").first();
    await waitForStableDecision(page, fitness);
    await expect(fitness.getByText("부하 상태 high_load", { exact: false })).toBeVisible();
    await expect(fitness.getByRole("button", { name: "AI 코치에게 분석 요청" })).toBeVisible();
    await expect(fitness.getByText("운동 실행")).toHaveCount(0);
    await expect(fitness.getByText("계획 변경 검토")).toHaveCount(0);
    await attachFullPageFromTop(page, testInfo, `today-training-fitness-${testInfo.project.name}.png`);

    await page.goto("/ko/plan?sport=bike");
    const plan = page.locator(".training-decision-card--plan").first();
    await waitForStableDecision(page, plan);
    await expect(plan.locator('.training-decision-card__sessions [data-session-role="neutral"]')).toBeVisible();
    await expect(plan.locator('.training-decision-card__sessions [data-session-role="recommended"]')).toBeVisible();
    await expect(plan.locator('.training-decision-card__sessions [data-session-role="effective"]')).toBeVisible();
    await expect(plan.locator('[data-proposal-state="pending"]')).toBeVisible();
    await expect(plan.locator('.training-decision-proposal__change[data-current-day="true"]')).toBeVisible();
    await expect(plan.getByRole("button", { name: "이 변경 적용" })).toBeVisible();
    await expect(plan.getByRole("button", { name: "원래 계획 유지" })).toBeVisible();
    await expect(plan.getByText("운동 실행")).toHaveCount(0);
    await expect(plan.getByRole("button", { name: /AI 코치/u })).toHaveCount(0);
    await expectProposalKeyboardOrder(page, plan);

    await applyTextScale200(page, plan.getByRole("heading", { name: "변경 권고 · 아직 미적용" }));
    await expectContainedReflow(plan);
    await expectReadableTextScale(plan);
    await expect(plan.getByText("계획 변경 검토")).toBeVisible();
    await plan.evaluate((element) => element.querySelector<HTMLElement>(".training-decision-proposal__actions button:last-of-type")?.scrollIntoView({ block: "center" }));
    await expect(plan.getByRole("button", { name: "원래 계획 유지" })).toBeVisible();
    await expect(plan.getByRole("button", { name: "원래 계획 유지" })).toBeInViewport();
    await attachFullPageFromTop(page, testInfo, `today-training-plan-text-scale-200-${testInfo.project.name}.png`);
    await resetTextScale(page);

    await attachFullPageFromTop(page, testInfo, `today-training-plan-pending-${testInfo.project.name}.png`);
  });

  test("renders proposal and execution state fixtures", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "tablet", "desktop/mobile fixture matrix");
    const mutable = { execution: "reserved" as ExecutionFixtureState, proposal: "pending" as ProposalFixtureState,
      recoverExecutionError: false };
    await mockTodayTraining(page, mutable);
    await signIn(page);

    for (const state of ["pending", "applied", "declined", "stale"] as const) {
      mutable.proposal = state;
      await page.goto("/ko/plan?sport=bike");
      const panel = page.locator(`.training-decision-card--plan [data-proposal-state="${state}"]`).first();
      await expect(panel).toBeVisible();
      const card = page.locator(".training-decision-card--plan").first();
      await waitForStableDecision(page, card);
      const expected = state === "pending" ? "승인 대기" : state === "applied" ? "적용됨"
        : state === "declined" ? "원래 계획 유지" : "새 검토 필요";
      await expect(panel.locator(":scope > .training-decision-proposal__heading .ds-chip")).toHaveText(expected);
      await expect(panel.getByRole("status")).toHaveText(expected);
      if (state === "applied") {
        await expect(card.getByRole("heading", { name: "변경 적용됨" })).toBeVisible();
        await expect(card.locator(":scope > .training-decision-card__header .ds-chip")).toHaveText("적용됨");
      }
      if (state === "declined") await expect(panel.getByText("원래 계획을 유지했습니다.")).toBeVisible();
      if (state === "stale") {
        await expect(card.getByRole("heading", { name: "변경 권고 · 아직 미적용" })).toBeVisible();
        await expect(panel).toHaveAttribute("data-proposal-state", "stale");
        await waitForVisualStability(card);
        await expect(panel.locator(":scope > .training-decision-proposal__heading .ds-chip")).toHaveText("새 검토 필요");
        await expect(panel.getByRole("status")).toHaveText("새 검토 필요");
      }
      await attachFullPageFromTop(page, testInfo, `today-training-plan-${state}-${testInfo.project.name}.png`);
    }

    mutable.proposal = "applied";
    await page.goto("/ko/");
    const appliedHome = page.locator(".training-decision-card--home");
    await waitForStableDecision(page, appliedHome);
    await expect(appliedHome.getByRole("heading", { name: "변경 적용됨" })).toBeVisible();
    await expect(appliedHome.locator(":scope > .training-decision-card__header .ds-chip")).toHaveText("적용됨");
    await expect(appliedHome.locator('[data-session-role="effective"]')).toContainText("회복");
    await expect(appliedHome.locator('[data-session-role="effective"]')).toContainText("40분");
    await expect(appliedHome.locator('[data-session-role="effective"]')).toContainText("25 TSS");
    await expect(appliedHome.locator('[data-session-role="recommended"]')).toHaveCount(0);
    await expect(appliedHome.getByText(/아직 미적용/u)).toHaveCount(0);
    await expect(appliedHome.getByText("권고 변화 -20분 · -45 TSS")).toBeVisible();
    const singleSessions = appliedHome.locator('[data-session-layout="single"]');
    await expect(singleSessions).toHaveClass(/training-decision-card__sessions--single/u);
    await expect(singleSessions.locator('[data-session-role="effective"]')).toBeVisible();
    await expect(singleSessions.locator(".training-decision-card__delta")).toHaveCSS("text-align", "left");
    const singleGeometry = await singleSessions.evaluate((element) => {
      const layout = element.getBoundingClientRect();
      const session = element.querySelector<HTMLElement>('[data-session-role="effective"]')!.getBoundingClientRect();
      return { layoutWidth: layout.width, sessionWidth: session.width };
    });
    expect(Math.abs(singleGeometry.layoutWidth - singleGeometry.sessionWidth)).toBeLessThanOrEqual(1);
    await attachFullPageFromTop(page, testInfo, `today-training-home-applied-${testInfo.project.name}.png`);

    mutable.proposal = "pending";
    for (const state of ["executable", "reserved", "in-progress", "link", "completed", "error"] as const) {
      mutable.execution = state;
      await page.goto("/ko/");
      const session = page.locator(`.training-decision-card--home [data-execution-state="${state}"]`).first();
      await expect(session).toBeVisible();
      const card = page.locator(".training-decision-card--home");
      await waitForStableDecision(page, card);
      if (state === "in-progress") {
        const manualLink = session.getByRole("button", { name: "활동 직접 연결" });
        await manualLink.focus();
        await page.keyboard.press("Tab");
        await expect(session.getByRole("button", { name: "건너뜀" })).toBeFocused();
        await expectContainedReflow(session);
        await session.getByRole("button", { name: "연기" }).scrollIntoViewIfNeeded();
        await expect(session.getByRole("button", { name: "연기" })).toBeVisible();
      }
      if (state === "error") {
        await attachFullPageFromTop(page, testInfo, `today-training-execution-error-${testInfo.project.name}.png`);
        const retry = card.getByRole("button", { name: "새로 확인" });
        mutable.recoverExecutionError = true;
        await retry.focus();
        await page.keyboard.press("Enter");
        await expect(card.locator('.training-execution-panel[data-execution-state="loading"]')).toBeVisible();
        await expect(card.getByText("기존 실행 상태를 확인하는 중…")).toBeVisible();
        await expect(card.locator('.training-execution-panel[data-execution-state="ready"]')).toBeVisible();
        await expect(card.locator('.training-execution-session[data-execution-state="executable"]')).toBeVisible();
        await expect(card.getByRole("button", { name: "운동 시작" })).toBeVisible();
        await attachFullPageFromTop(page, testInfo, `today-training-execution-error-recovered-${testInfo.project.name}.png`);
        continue;
      }
      await attachFullPageFromTop(page, testInfo, `today-training-execution-${state}-${testInfo.project.name}.png`);
    }
  });
});
