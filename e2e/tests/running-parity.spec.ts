import { expect, test, type Page } from "@playwright/test";
import {
  RUNNING_PARITY_ID, RUNNING_PARITY_PROJECT, RUNNING_PARITY_TITLE, seedRunningParity,
  RUNNING_OWNER_ID, RUNNING_OWNER_TITLE, RUNNING_OWNER_EMAIL, RUNNING_OWNER_PASSWORD, RUNNING_PLAN_GOAL, RUNNING_PLAN_WEEK, RUNNING_PLAN_TITLE,
} from "../fixtures/running-parity";
import { RUNNING_P0_CASES, RUNNING_P0_EMAIL, RUNNING_P0_PASSWORD, seedRunningP0, type RunningP0Case } from "../fixtures/running-p0";

const browserErrors = new WeakMap<Page, string[]>();

test.beforeAll(seedRunningParity);
test.beforeAll(seedRunningP0);

test.afterEach(async ({ page }, info) => {
  const errors = browserErrors.get(page) ?? [];
  if (errors.length) await info.attach("browser-page-errors", { body: errors.join("\n\n"), contentType: "text/plain" });
  expect(errors, "Browser page errors (full stacks attached)").toEqual([]);
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", async message => {
    if (message.type() !== "error") return;
    for (const argument of message.args()) {
      const stack = await argument.evaluate(value => value instanceof Error ? value.stack : null).catch(() => null);
      if (stack) console.error(`[running-parity caught] ${stack}`);
    }
  });
  page.on("pageerror", error => {
    const stack = error.stack ?? `${error.name}: ${error.message}`;
    errors.push(stack);
    console.error(`[running-parity pageerror] ${stack}`);
  });
  await page.route("**/runtime-config.json*", (route) => route.fulfill({ json: {
    firebaseProjectId: RUNNING_PARITY_PROJECT, firebaseApiKey: "fake-api-key",
    firebaseAuthDomain: "localhost", firebaseAppId: "fake-app-id",
    firebaseStorageBucket: `${RUNNING_PARITY_PROJECT}.appspot.com`, useEmulators: true,
    canonicalRolloutEnabled: false, publicActivityDetailEnabled: true,
  } }));
  await page.route("**/ensureUserProfile", route => route.fulfill({ json: { result: {} } }));
  await page.route("**/revalidateTraining", route => route.fulfill({ json: { result: { status: "fresh" } } }));
  await page.route("**/getActivityOverview", (route) => route.fulfill({ json: { result: {
    status: "available", activityId: route.request().postDataJSON()?.data?.activityId ?? RUNNING_PARITY_ID, version: "activity-overview-v1",
    inputDigest: "synthetic-running-parity", presentation: {
      session: { discipline: "run", movingSec: 7082, distanceKm: 21.02, caloriesKcal: 1954 },
      zones: [{ kind: "heartRate", seconds: [90, 112, 3313, 3558, 9], priority: "primary" }],
    },
  } } }));
});

test("home running card prioritizes pace", async ({ page }, info) => {
  await page.goto("/ko/");
  if (info.project.name === "desktop") {
    await page.getByRole("tab", { name: "러닝", exact: true }).click();
  }
  await expect(page.getByText(RUNNING_PARITY_TITLE, { exact: true }).first()).toBeVisible();
  const card = info.project.name === "mobile"
    ? page.locator(".mobile-feed-card").filter({ hasText: RUNNING_PARITY_TITLE })
    : page.locator("article").filter({ hasText: RUNNING_PARITY_TITLE });
  // 카드 컨테이너 구현에 의존하지 않는 body 검증도 함께 유지한다.
  await expect(page.getByText(/5['′:]37/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("구간 기록 없음", { exact: true })).toHaveCount(0);
  await expect(page.getByText("10.7km/h", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("run-card-primary")).toContainText(/5['′:]37/);
  await expect(page.getByTestId("run-card-primary")).not.toContainText("264");
  // 공개 피드의 현재 Discovery 매핑은 요약의 민감 수치를 재구성하지 않습니다.
  await expect(page.getByTestId("run-card-secondary")).not.toContainText("264");
  await expect(page.getByTestId("run-card-secondary")).toContainText("48");
  if (await card.count()) await expect(card).toBeVisible();
  await page.screenshot({ path: info.outputPath("running-home.png"), fullPage: true });
});

test("public detail keeps running splits and excludes cycling analytics", async ({ page }, info) => {
  await page.goto(`/ko/activity/${RUNNING_PARITY_ID}`);
  await expect(page.getByRole("heading", { name: RUNNING_PARITY_TITLE })).toBeVisible();
  await expect(page.getByTestId("run-next-actions")).toHaveCount(0);
  await page.getByRole("tab", { name: "분석", exact: true }).click();
  await expect(page.getByRole("heading", { name: /스플릿/ })).toBeVisible();
  const recap = page.getByTestId("run-recap");
  const profile = page.getByTestId("run-split-profile");
  await expect(recap).toContainText(/5[:'′]37/);
  await expect(profile.getByRole("button", { name: /km 구간, 페이스/ })).toHaveCount(21);
  expect(await profile.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  const firstSplit = profile.getByRole("button", { name: /^1km 구간, 페이스/ });
  await firstSplit.focus();
  await firstSplit.press("ArrowDown");
  const secondSplit = profile.getByRole("button", { name: /^2km 구간, 페이스/ });
  await expect(secondSplit).toHaveAttribute("aria-pressed", "true");
  const selected = page.getByTestId("selected-run-split");
  await expect(selected.getByRole("button", { name: "지도·고도로 보기", exact: true })).toHaveCount(0);
  await expect(selected).toContainText(/5[:'′]47/);
  await expect(selected).toContainText(/5[:'′]57/);
  await expect(selected).toContainText("139 bpm");
  await expect(selected).toContainText("188 spm");
  await secondSplit.press("End");
  await expect(profile.getByRole("button", { name: /^21km 구간, 페이스/ })).toHaveAttribute("aria-pressed", "true");
  await secondSplit.click();
  await selected.getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("run-next-actions")).toHaveCount(0);
  await expect(page.getByTestId("run-raw-splits")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("run-recap-details")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("run-hr-details")).not.toHaveAttribute("open", "");
  await expect(page.getByText(/5[:'′]37/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("활동 당시 FTP 정본 없음", { exact: true })).toHaveCount(0);
  await expect(page.getByText("NP", { exact: true })).toHaveCount(0);
  await expect(page.getByText("평균 RPM", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "파워 커브", exact: true })).toHaveCount(0);
  await expect(page.getByText("심박 존을 계산할 수 없어요", { exact: true })).toHaveCount(0);
  await expect(page.getByText("analysis.section.hrZones", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("run-analysis")).toContainText(/21\.02\s*km/);
  await recap.evaluate(node => node.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: info.outputPath("running-analysis.png") });
  await page.getByRole("heading", { name: /스플릿/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("running-analysis-splits.png") });
  await page.getByTestId("run-recap-details").locator("summary").click();
  await expect(recap).toContainText(/5[:'′]01/);
  await page.getByTestId("run-hr-details").locator("summary").click();
  await page.screenshot({ path: info.outputPath("running-analysis-heart-rate.png") });
  await page.getByTestId("run-detail-disclosure").locator("summary").click();
  await expect(page.getByTestId("run-detail-disclosure")).toContainText(/191\s*spm/);
  await expect(page.getByTestId("run-detail-disclosure")).toContainText("264");
  await page.getByTestId("run-raw-splits").locator("summary").click();
  await expect(page.getByTestId("run-raw-splits").getByRole("table")).toBeVisible();
});


test("owner scheduled running plan opens exact read-only workout and stays private", async ({ page }, info) => {
  const commands: string[] = [];
  page.on("request", request => {
    if (/reserve.*Session|start.*Session|complete.*Session|apply.*Proposal|rerollPlan|updateWorkout/i.test(request.url())) commands.push(request.url());
  });
  await page.goto("/ko/");
  await page.waitForFunction(() => typeof (window as unknown as { __e2eSignIn?: unknown }).__e2eSignIn === "function");
  await page.evaluate(async ({ email, password }) => {
    await (window as unknown as { __e2eSignIn: (email: string, password: string) => Promise<unknown> }).__e2eSignIn(email, password);
  }, { email: RUNNING_OWNER_EMAIL, password: RUNNING_OWNER_PASSWORD });
  await page.goto(`/ko/activity/${RUNNING_OWNER_ID}`);
  await expect(page.getByRole("heading", { name: RUNNING_OWNER_TITLE })).toBeVisible();
  await page.getByRole("tab", { name: "분석", exact: true }).click();
  const card = page.getByTestId("run-next-training-card");
  await expect(card).toContainText(RUNNING_PLAN_TITLE, { timeout: 15000 });
  await expect(card).toContainText("30분");
  await expect(card.getByRole("listitem")).toHaveCount(3);
  const link = card.getByRole("link", { name: "이 훈련 계획 보기" });
  const target = new URL((await link.getAttribute("href"))!, "http://127.0.0.1:5190");
  expect(target.searchParams.get("goalId")).toBe(RUNNING_PLAN_GOAL);
  expect(target.searchParams.get("weekId")).toBe(RUNNING_PLAN_WEEK);
  expect(target.searchParams.get("dayIndex")).toBe("0");
  expect(target.searchParams.get("date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("running-next-training.png") });
  await link.click();
  const preview = page.getByRole("dialog", { name: "선택한 러닝 계획" });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(RUNNING_PLAN_TITLE);
  await expect(preview).toContainText("30분");
  await expect(preview.getByRole("button")).toHaveCount(1);
  await expect(preview.getByRole("button", { name: "닫기" })).toBeFocused();
  await page.screenshot({ path: info.outputPath("running-plan-preview.png") });
  await preview.getByRole("button", { name: "닫기" }).click();
  await expect(preview).toHaveCount(0);
  await page.goto(`/ko/activity/${RUNNING_PARITY_ID}`);
  await expect(page.getByRole("heading", { name: RUNNING_PARITY_TITLE })).toBeVisible();
  await page.getByRole("tab", { name: "분석", exact: true }).click();
  await expect(page.getByTestId("run-next-training-card")).toHaveCount(0);
  expect(commands).toEqual([]);
});

// ── P0 기록 형태: 실제 워치 기록에서 나온 빈 필드·보류 상태가 화면 전체에서 같은 말을 하는지 ──
const SPLIT_BUTTON = /km 구간, 페이스/;
const SPLIT_HELD = "이동 시간 기준이 달라 구간 페이스를 확인할 수 없어요.";
const SPLITS_UNAVAILABLE = "공유된 km별 스플릿이 아직 없습니다. 페이스·심박 등 제공된 지표를 표시합니다.";
const recapPace = (distance: string, pace: string) => `${distance}를 평균 ${pace}/km로 달렸어요.`;
const recapGap = (pace: string) => `경사를 보정한 평균 페이스는 ${pace}/km예요.`;
const recapFastestKm = (pace: string) => `이번 러닝에서 가장 빠른 1km 페이스는 ${pace}/km예요.`;
const recapHr = (bpm: number) => `기록된 평균 심박은 ${bpm} bpm이에요.`;

async function openOwnerRunAnalysis(page: Page, item: RunningP0Case) {
  // 개요 응답도 같은 합성 기록으로 맞춘다. beforeEach 의 하프 마라톤 응답보다 나중에 등록해 우선한다.
  await page.route("**/getActivityOverview", route => route.fulfill({ json: { result: {
    status: "available", activityId: item.id, version: "activity-overview-v1", inputDigest: `synthetic-${item.id}`,
    presentation: {
      session: { discipline: "run", movingSec: item.metrics.movingTimeSec, distanceKm: item.metrics.distanceKm, caloriesKcal: item.metrics.caloriesKcal },
      zones: item.metrics.hrZoneSec.length === 5 ? [{ kind: "heartRate", seconds: item.metrics.hrZoneSec, priority: "primary" }] : [],
    },
  } } }));
  await page.goto("/ko/");
  await page.waitForFunction(() => typeof (window as unknown as { __e2eSignIn?: unknown }).__e2eSignIn === "function");
  await page.evaluate(async ({ email, password }) => {
    await (window as unknown as { __e2eSignIn: (email: string, password: string) => Promise<unknown> }).__e2eSignIn(email, password);
  }, { email: RUNNING_P0_EMAIL, password: RUNNING_P0_PASSWORD });
  await page.goto(`/ko/activity/${item.id}`);
  await expect(page.getByRole("heading", { name: item.title })).toBeVisible();
  await page.getByRole("tab", { name: "분석", exact: true }).click();
  const analysis = page.getByTestId("run-analysis");
  await expect(analysis).toBeVisible();
  const recap = page.getByTestId("run-recap");
  return { analysis, recap, openRecapDetails: () => recap.getByTestId("run-recap-details").locator("summary").click() };
}

test.describe("running P0 record shapes (owner view)", () => {
  test("native timer mismatch holds km pace, GAP and fastest km together", async ({ page }, info) => {
    const { analysis, recap, openRecapDetails } = await openOwnerRunAnalysis(page, RUNNING_P0_CASES.timerHold);
    await expect(analysis.getByText(SPLIT_HELD, { exact: true })).toBeVisible();
    await expect(analysis.getByText(SPLITS_UNAVAILABLE, { exact: true })).toHaveCount(0);
    await expect(analysis.getByRole("button", { name: SPLIT_BUTTON })).toHaveCount(0);
    await expect(page.getByTestId("run-raw-splits")).toHaveCount(0);
    // 평균 페이스는 앱 타이머 기준이다: 1.2km / 400초.
    await expect(recap).toContainText(recapPace("1.2km", "5:33"));
    await openRecapDetails();
    await expect(recap).toContainText(recapHr(148));
    await expect(recap).not.toContainText("경사를 보정한 평균 페이스");
    await expect(recap).not.toContainText("가장 빠른 1km 페이스");
    await page.screenshot({ path: info.outputPath("running-p0-timer-hold.png"), fullPage: true });
  });

  test("run shorter than 1 km keeps pace and heart rate without km splits", async ({ page }, info) => {
    const { analysis, recap, openRecapDetails } = await openOwnerRunAnalysis(page, RUNNING_P0_CASES.underOneKm);
    await expect(analysis.getByText(SPLITS_UNAVAILABLE, { exact: true })).toBeVisible();
    await expect(analysis.getByText(SPLIT_HELD, { exact: true })).toHaveCount(0);
    await expect(analysis.getByRole("button", { name: SPLIT_BUTTON })).toHaveCount(0);
    await expect(page.getByTestId("run-raw-splits")).toHaveCount(0);
    await expect(recap).toContainText(recapPace("300m", "7:00"));
    await openRecapDetails();
    // GAP 은 1km 미만 잔여 구간까지 거리가중으로 계산한다(계단 오르막이라 평지 페이스보다 빠르다).
    await expect(recap).toContainText(recapGap("5:22"));
    await expect(recap).toContainText(recapHr(146));
    await expect(recap).not.toContainText("가장 빠른 1km 페이스");
    await expect(analysis).toContainText(/0\.30\s*km/);
    await page.screenshot({ path: info.outputPath("running-p0-under-1km.png"), fullPage: true });
  });

  test("distance gaps keep recorded distance and pace but place no km splits", async ({ page }, info) => {
    const { analysis, recap, openRecapDetails } = await openOwnerRunAnalysis(page, RUNNING_P0_CASES.sparseDistance);
    await expect(analysis.getByText(SPLITS_UNAVAILABLE, { exact: true })).toBeVisible();
    await expect(analysis.getByText(SPLIT_HELD, { exact: true })).toHaveCount(0);
    await expect(analysis.getByRole("button", { name: SPLIT_BUTTON })).toHaveCount(0);
    await expect(page.getByTestId("run-raw-splits")).toHaveCount(0);
    await expect(recap).toContainText(recapPace("3.0km", "5:50"));
    await openRecapDetails();
    await expect(recap).toContainText(recapHr(150));
    // 끊긴 거리 사이를 평지로 잇지 않으므로 GAP·가장 빠른 1km 도 만들지 않는다.
    await expect(recap).not.toContainText("경사를 보정한 평균 페이스");
    await expect(recap).not.toContainText("가장 빠른 1km 페이스");
    await expect(analysis).toContainText(/3\.00\s*km/);
    await page.screenshot({ path: info.outputPath("running-p0-sparse-distance.png"), fullPage: true });
  });

  test("run without a heart-rate sensor omits heart-rate output instead of showing zero", async ({ page }, info) => {
    const { analysis, recap, openRecapDetails } = await openOwnerRunAnalysis(page, RUNNING_P0_CASES.noHeartRate);
    await expect(analysis.getByRole("button", { name: SPLIT_BUTTON })).toHaveCount(5);
    const selected = page.getByTestId("selected-run-split");
    await expect(selected).toContainText("5:23");
    await expect(selected).not.toContainText("bpm");
    await expect(page.getByRole("heading", { name: "심박 분석", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("run-hr-details")).toHaveCount(0);
    await expect(recap).toContainText(recapPace("5.0km", "5:30"));
    await openRecapDetails();
    await expect(recap).toContainText(recapGap("5:28"));
    await expect(recap).toContainText(recapFastestKm("5:22"));
    await expect(recap).not.toContainText("기록된 평균 심박");
    await expect(analysis).not.toContainText("bpm");
    await page.screenshot({ path: info.outputPath("running-p0-no-heart-rate.png"), fullPage: true });
  });

  test("last partial km stays out of the km splits", async ({ page }, info) => {
    const { analysis, recap, openRecapDetails } = await openOwnerRunAnalysis(page, RUNNING_P0_CASES.partialKm);
    await expect(analysis.getByRole("button", { name: SPLIT_BUTTON })).toHaveCount(5);
    await expect(analysis.getByRole("button", { name: /^5km 구간, 페이스 6:37/ })).toBeVisible();
    await expect(analysis.getByRole("button", { name: /^6km 구간/ })).toHaveCount(0);
    await expect(analysis).not.toContainText("부분 구간");
    await expect(recap).toContainText(recapPace("5.4km", "6:06"));
    await openRecapDetails();
    // GAP 은 마지막 0.4km 까지 거리가중으로 포함하고, 가장 빠른 1km 는 완전한 km 만 본다.
    await expect(recap).toContainText(recapGap("6:04"));
    await expect(recap).toContainText(recapFastestKm("5:56"));
    await expect(recap).toContainText(recapHr(152));
    await expect(analysis).toContainText(/5\.40\s*km/);
    await page.screenshot({ path: info.outputPath("running-p0-partial-km.png"), fullPage: true });
  });
});
