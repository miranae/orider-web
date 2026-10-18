import { test, expect, TEST_EMAIL, TEST_PASSWORD } from "../fixtures/test-fixtures";
import type { Page, Route, TestInfo } from "@playwright/test";
import { signInUser } from "../fixtures/auth";
import { todayTrainingDecisionE2eEnvelope } from "../fixtures/today-training-decision";

const FIRESTORE = "http://localhost:8080/v1/projects/orider-g1/databases/(default)/documents";
const CHOICE_TSS = { rest: 0, recovery: 20, endurance: 45 } as const;

/** 계획 세션이 없는 날 — 홈이 "정하기"로 코치 오늘 화면을 연다. */
function noPlanDecision() {
  const envelope = todayTrainingDecisionE2eEnvelope();
  return { ...envelope, data: { ...envelope.data, scheduledSessions: [], recommendedAdjustments: [], effectiveSessions: [],
    representativeSessionId: null, plan: null, loadAdjustment: { ...envelope.data.loadAdjustment, recommendations: [] } } };
}

function kstDate(ms: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

async function writeChoiceDoc(uid: string, discipline: string, workoutType: keyof typeof CHOICE_TSS | null) {
  const url = `${FIRESTORE}/users/${uid}/today_choices/${discipline}`;
  if (workoutType === null) {
    await fetch(url, { method: "DELETE", headers: { Authorization: "Bearer owner" } });
    return null;
  }
  const choice = { schemaVersion: "today-choice-v1", discipline, localDate: kstDate(Date.now()), workoutType,
    targetTss: CHOICE_TSS[workoutType], chosenAt: Date.now() };
  const fields = Object.fromEntries(Object.entries(choice).map(([key, value]) =>
    [key, typeof value === "number" ? { integerValue: String(value) } : { stringValue: value }]));
  const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields }) });
  if (!response.ok) throw new Error(`choice write failed: ${response.status}`);
  return choice;
}

/** 서버 callable 대신 같은 계약으로 Firestore 에뮬레이터에 쓴다 — 홈은 실제 구독으로 바뀐다. */
async function mockTodayChoiceServer(page: Page, uid: string, calls: unknown[]) {
  await page.route("**/runtime-config.json*", (route) => route.fulfill({ json: {
    aiApiBase: "https://coach.e2e.test", useEmulators: true, trainingDecisionEnabled: true, riderWorkoutDeliveryEnabled: true,
  } }));
  await page.route("https://coach.e2e.test/v1/coach/training-decisions/today?discipline=bike", (route) => route.fulfill({ json: noPlanDecision() }));
  await page.route("https://coach.e2e.test/v1/coach/capabilities", (route) => route.fulfill({ json: { status: "ok", data: {} } }));
  await page.route("**/setTodayWorkoutChoice", async (route: Route) => {
    const body = route.request().postDataJSON() as { data: { discipline: string; workoutType: keyof typeof CHOICE_TSS | null } };
    calls.push(body.data);
    const choice = await writeChoiceDoc(uid, body.data.discipline, body.data.workoutType);
    await route.fulfill({ json: { result: { choice } } });
  });
}

async function signIn(page: Page) {
  await page.goto("/ko/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof (window as Window & { __e2eSignIn?: unknown }).__e2eSignIn === "function");
  await page.evaluate(async ({ email, password }) => {
    await (window as Window & { __e2eSignIn: (email: string, password: string) => Promise<void> }).__e2eSignIn(email, password);
  }, { email: TEST_EMAIL, password: TEST_PASSWORD });
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
  if (process.env.TODAY_CHOICE_SHOTS) await page.screenshot({ path: `${process.env.TODAY_CHOICE_SHOTS}/${name}.png` });
}

test.describe("today workout choice", () => {
  test("mobile: choosing on Coach today sets Home's today workout", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "모바일 웹 흐름");
    const { localId: uid } = await signInUser(TEST_EMAIL, TEST_PASSWORD);
    await writeChoiceDoc(uid, "bike", null);
    const calls: unknown[] = [];
    await mockTodayChoiceServer(page, uid, calls);
    await signIn(page);

    await page.goto("/ko/");
    const homeCard = page.getByTestId("H2-2-1");
    await expect(homeCard).toContainText("오늘 운동을 코치에서 정해보세요");
    await homeCard.scrollIntoViewIfNeeded();
    await shot(page, testInfo, "01-home-before");

    await homeCard.getByRole("link", { name: "정하기 →" }).click();
    await expect(page).toHaveURL(/\/coach\/today\?sport=bike/);
    const chooser = page.getByTestId("K2-1");
    await expect(chooser).toBeVisible();
    await chooser.getByText("회복 라이딩").click();
    const actions = page.getByTestId("K2-4");
    await actions.scrollIntoViewIfNeeded();
    await shot(page, testInfo, "02-today-selected");

    await actions.getByRole("button", { name: "오늘 운동으로 정하기" }).click();
    await expect(page.getByTestId("K2-4-2")).toContainText("오늘 운동으로 정했어요");
    await expect(page.getByTestId("K2-4-2")).toContainText("회복 라이딩 · 예상 부하 20 TSS");
    expect(calls).toEqual([{ discipline: "bike", workoutType: "recovery" }]);
    await page.getByTestId("K2-4-2").scrollIntoViewIfNeeded();
    await shot(page, testInfo, "03-today-decided");

    await page.goto("/ko/");
    await expect(homeCard).toHaveAttribute("data-today-source", "user-choice");
    await expect(homeCard).toContainText("회복 라이딩 · 20 TSS");
    await expect(homeCard).toContainText("직접 정함");
    await homeCard.scrollIntoViewIfNeeded();
    await shot(page, testInfo, "04-home-after");

    // 다시 열면 정한 운동에서 시작하고, 취소하면 홈이 원래대로 돌아간다.
    await homeCard.getByRole("link", { name: "바꾸기 →" }).click();
    await expect(page.getByRole("radio", { name: /회복 라이딩/ })).toBeChecked();
    await page.getByTestId("K2-4-3").click();
    await expect(page.getByRole("button", { name: "오늘 운동으로 정하기" })).toBeVisible();
    await page.goto("/ko/");
    await expect(homeCard).toContainText("오늘 운동을 코치에서 정해보세요");
    expect(calls).toEqual([{ discipline: "bike", workoutType: "recovery" }, { discipline: "bike", workoutType: null }]);
  });
});
