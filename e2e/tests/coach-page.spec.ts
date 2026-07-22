import { expect, test, type Page } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "../fixtures/test-fixtures";

const THREAD_ID = "123e4567-e89b-42d3-a456-426614174000";
const REQUEST_ID = "223e4567-e89b-42d3-a456-426614174001";
const NOW = "2026-07-19T02:00:00.000Z";

const summary = {
  threadId: THREAD_ID,
  title: "최근 한 달 훈련과 몸 상태",
  discipline: "bike",
  createdAt: "2026-07-19T01:00:00.000Z",
  updatedAt: NOW,
  turnCount: 1,
  revision: 1,
};

const response = {
  apiVersion: "v2",
  capabilityVersion: "p1",
  schemaVersion: "coach-response-envelope-v1",
  requestId: REQUEST_ID,
  outcome: "unsupported",
  unsupported: {
    reasonCodes: ["unsupported_question"],
    missingCapabilities: [],
    suggestedQueries: [{ queryTemplateId: "show_weekly_trend", labelKey: "coach.followup.weekly" }],
  },
  quota: { limit: 3, remaining: 2, resetAt: "2026-07-19T15:00:00.000Z", consumed: true },
  budget: { blocked: false, providerCalls: 0, inputTokens: 0, outputTokens: 0 },
  retry: {
    mode: "none",
    quotaImpact: "none",
    previousTurnConsumed: true,
    providerCallAllowed: false,
    retryable: false,
    reasonCode: "completed",
  },
  execution: { parser: "deterministic", asOf: NOW },
};

const stressEvidence = Array.from({ length: 21 }, (_, index) => ({
  evidenceId: `ev_stress_${index + 1}`,
  source: "derived",
  sourceId: `stress_source_${index + 1}`,
  field: ["ftp_watts", "weight_kg", "target_w_per_kg", "current_w_per_kg", "target_ftp_watts"][index] ?? "value",
  value: index === 0 ? 161 : index === 1 ? 78 : index === 2 ? 3.5 : index === 3 ? 2.06 : index === 4 ? 273 : `최근 훈련 데이터 ${index - 4}`,
  sourceRevision: `stress_revision_${index + 1}`,
  asOf: NOW,
  ownerScope: "authenticated_user",
}));

const stressResponse = {
  ...response,
  outcome: "answer",
  unsupported: undefined,
  answer: {
    schemaVersion: "coach-answer-document-v2",
    catalogVersion: "coach-answer-block-catalog-v2",
    answerId: "stress_answer_1",
    sourceFactsId: "stress_facts_1",
    questionSummary: "coach.answer.summary.load",
    status: "complete",
    blocks: [{
      blockId: "stress_report",
      kind: "grounded_markdown",
      sourceSlotIds: ["stress_slot"],
      partial: false,
      stale: false,
      truncated: false,
      omittedCount: 0,
      markdown: [
        "## FTP 3.5 W/kg 목표 도달 코칭",
        "현재 FTP는 **161 W**, 체중은 **78 kg**, 현재 파워는 **2.06 W/kg**입니다.",
        "### 목표와의 격차",
        "목표 FTP는 **273 W**이며 현재보다 **112 W** 향상이 필요합니다.",
        "- 단기간 수치보다 일관된 훈련과 회복을 우선하세요.",
        "- 4~6주마다 현재 FTP와 피로도를 함께 다시 확인하세요.",
        "### 훈련 방향",
        "주 1~2회 역치 세션과 충분한 회복을 조합합니다.",
        "### 주간 실행",
        "1. 역치 세션은 2×10~15분으로 시작합니다.",
        "2. Z2 라이딩은 60~90분 유지합니다.",
        "3. 강도가 높은 다음 날은 회복 또는 휴식으로 둡니다.",
      ].join("\n\n"),
      evidenceIds: stressEvidence.map((item) => item.evidenceId),
    }],
    evidence: stressEvidence,
    warnings: [],
    freshness: { asOf: NOW, timezone: "Asia/Seoul", staleSourceSlotIds: [] },
    followUps: [],
  },
  budget: { blocked: false, providerCalls: 1, inputTokens: 800, outputTokens: 500 },
  execution: { parser: "report_provider", queryPlanHash: "stress_plan_1", catalogVersion: "stress_catalog_1", factsId: "stress_facts_1", asOf: NOW },
};

const failedResponse = (requestId: string) => ({
  ...response,
  requestId,
  outcome: "failed",
  unsupported: undefined,
  error: { code: "token_cap_exceeded", retryable: false, fallbackAvailable: false },
  budget: { blocked: false, providerCalls: 1, inputTokens: 800, outputTokens: 0 },
  retry: { mode: "none", quotaImpact: "none", previousTurnConsumed: true, providerCallAllowed: false, retryable: false, reasonCode: "completed" },
  execution: { parser: "provider", asOf: NOW },
});

async function openCoach(page: Page, detail = false, stress = false) {
  await page.route("**/runtime-config.json*", (route) => route.fulfill({
    json: { aiApiBase: "https://coach.e2e.test", useEmulators: true },
  }));
  await page.route("https://coach.e2e.test/v1/coach/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/status")) {
      await route.fulfill({ json: { data: { status: "available", quota: {
        limit: 3, remaining: 2, resetAt: "2026-07-19T15:00:00.000Z", timezone: "Asia/Seoul", consumed: 1, pending: 0,
      } } } });
      return;
    }
    if (url.pathname.endsWith(`/threads/${THREAD_ID}`)) {
      const turns = stress ? [
        { turnId: REQUEST_ID, requestId: REQUEST_ID, question: "FTP 3.5 W/kg을 만들고 싶어. 최근 한 달 운동 기록을 확인하고 목표까지의 차이와 훈련 방향을 코칭해줘.", createdAt: NOW, response: stressResponse, sessionRevision: 1 },
        ...Array.from({ length: 3 }, (_, index) => {
          const requestId = `323e4567-e89b-42d3-a456-42661417400${index}`;
          return { turnId: requestId, requestId, question: "지난주와 비교하면 어떤 점이 달라졌어?", createdAt: NOW,
            response: failedResponse(requestId), sessionRevision: index + 2 };
        }),
      ] : [{ turnId: REQUEST_ID, requestId: REQUEST_ID, question: "최근 한 달 운동 기록을 보고 현재 몸 상태와 다음 훈련 방향을 코칭해줘.",
        createdAt: NOW, response, sessionRevision: 1 }];
      await route.fulfill({ json: { data: { thread: { ...summary,
        ...(stress ? { title: "FTP 3.5 W/kg 목표를 위한 최근 한 달 상세 코칭과 훈련 방향" } : {}),
        turnCount: turns.length, revision: turns.length, turns }, nextCursor: null } } });
      return;
    }
    if (url.pathname.endsWith("/threads")) {
      const threads = stress ? Array.from({ length: 15 }, (_, index) => ({ ...summary,
        threadId: index === 0 ? THREAD_ID : `123e4567-e89b-42d3-a456-4266141740${String(index).padStart(2, "0")}`,
        title: index === 0 ? "FTP 3.5 W/kg 목표를 위한 최근 한 달 상세 코칭과 훈련 방향" : `저장된 장문 코칭 대화 ${index + 1}`,
        turnCount: index === 0 ? 4 : 1, revision: index === 0 ? 4 : 1,
      })) : [summary];
      await route.fulfill({ json: { data: { threads, nextCursor: null } } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });

  await page.goto("/ko/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof (window as Window & { __e2eSignIn?: unknown }).__e2eSignIn === "function");
  await page.evaluate(async ({ email, password }) => {
    await (window as Window & { __e2eSignIn: (email: string, password: string) => Promise<void> }).__e2eSignIn(email, password);
  }, { email: TEST_EMAIL, password: TEST_PASSWORD });
  await page.goto(`/ko/coach${detail ? `/${THREAD_ID}` : ""}`, { waitUntil: "domcontentloaded" });
}

test.describe("CoachPage", () => {
  test("renders the server-authoritative conversation workspace without horizontal overflow", async ({ page }) => {
    await openCoach(page);
    await expect(page.getByRole("heading", { name: "대화 내역" })).toBeVisible();
    await expect(page.getByRole("link", { name: /최근 한 달 훈련과 몸 상태/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test("keeps the selected mobile thread header and composer metadata visually intact", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Compact-thread assertions target the mobile layout");
    await openCoach(page, true);
    await expect(page.getByRole("heading", { name: "최근 한 달 훈련과 몸 상태" })).toBeVisible();
    await expect(page.getByText(/질문과 답변은 대화 또는 계정을 삭제할 때까지/)).toBeHidden();
    const composer = page.getByLabel("이 대화에서 이어 묻기");
    await page.setViewportSize({ width: 390, height: 500 });
    await composer.focus();
    const counter = page.getByText("0/1000");
    await expect(counter).toBeVisible();
    const box = await counter.boundingBox();
    expect(box?.width).toBeGreaterThan(35);
    expect(box?.height).toBeLessThan(24);
    const composerBox = await composer.boundingBox();
    expect(composerBox?.y).toBeGreaterThanOrEqual(0);
    expect((composerBox?.y ?? 500) + (composerBox?.height ?? 0)).toBeLessThanOrEqual(500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("coach-page-mobile-keyboard.png") });
  });

  test("preserves hierarchy and contrast in dark mode", async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openCoach(page, true);
    const warningTitle = page.getByText("현재 지원하지 않는 질문입니다");
    await expect(warningTitle).toBeVisible();
    await page.evaluate(async () => {
      await Promise.all([document.fonts.load('16px "Pretendard Variable"'), document.fonts.load('14px "JetBrains Mono"')]);
      await document.fonts.ready;
    });
    expect(await page.evaluate(() => document.fonts.check('16px "Pretendard Variable"')
      && document.fonts.check('14px "JetBrains Mono"'))).toBe(true);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).not.toBe("rgb(255, 255, 255)");
    const contrast = await warningTitle.evaluate((element) => {
      const parse = (value: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1; canvas.height = 1;
        const context = canvas.getContext("2d")!;
        context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data] as [number, number, number, number];
      };
      const composite = (foreground: [number, number, number, number], base: [number, number, number, number]) => {
        const alpha = foreground[3] / 255;
        return foreground.slice(0, 3).map((value, index) => value * alpha + base[index]! * (1 - alpha));
      };
      const luminance = (rgb: number[]) => {
        const channel = rgb.map((value) => {
          const normalized = value / 255;
          return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channel[0]! + 0.7152 * channel[1]! + 0.0722 * channel[2]!;
      };
      const surface = element.closest<HTMLElement>(".coach-thread-turn__outcome");
      const body = parse(getComputedStyle(document.body).backgroundColor);
      const surfaceColor = parse(getComputedStyle(surface ?? document.body).backgroundColor);
      const backgroundLuminance = luminance(composite(surfaceColor, body));
      const foreground = luminance(composite(parse(getComputedStyle(element).color), surfaceColor));
      return (Math.max(foreground, backgroundLuminance) + 0.05) / (Math.min(foreground, backgroundLuminance) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: testInfo.outputPath("coach-page-dark.png"), fullPage: true });
  });

  test("contains the long-answer and 21-evidence stress state inside the conversation workspace", async ({ page }, testInfo) => {
    test.skip(!["desktop", "tablet", "mobile"].includes(testInfo.project.name));
    await page.setViewportSize(testInfo.project.name === "desktop" ? { width: 1440, height: 1000 }
      : testInfo.project.name === "tablet" ? { width: 768, height: 1024 } : { width: 390, height: 844 });
    await openCoach(page, true, true);
    await expect(page.getByRole("heading", { name: "FTP 3.5 W/kg 목표를 위한 최근 한 달 상세 코칭과 훈련 방향" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "FTP 3.5 W/kg 목표 도달 코칭" })).toBeVisible();
    await expect(page.getByText("분석 근거 21개")).toBeVisible();
    await expect(page.getByText("답변을 완성하지 못했습니다.", { exact: false }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const list = page.locator(".coach-history-list");
    const detail = page.locator(".coach-thread-detail");
    if (testInfo.project.name === "desktop") {
      const [listBox, detailBox] = await Promise.all([list.boundingBox(), detail.boundingBox()]);
      expect((listBox?.x ?? 0) + (listBox?.width ?? 0)).toBeLessThanOrEqual((detailBox?.x ?? 0) + 1);
      expect(await page.locator(".coach-history-item__delete").evaluateAll((buttons) => buttons.every((button) => {
        const item = button.closest(".coach-history-item")!.getBoundingClientRect();
        const control = button.getBoundingClientRect();
        return control.left >= item.left && control.right <= item.right + 1;
      }))).toBe(true);
      const [composerBox, footerBox] = await Promise.all([
        page.locator(".coach-thread-composer").boundingBox(), page.getByRole("contentinfo").boundingBox(),
      ]);
      expect(composerBox).not.toBeNull();
      expect((composerBox?.y ?? 0) + (composerBox?.height ?? 0)).toBeLessThanOrEqual((footerBox?.y ?? 0) + 1);
    } else if (testInfo.project.name === "mobile") {
      const composerBox = await page.locator(".coach-thread-composer").boundingBox();
      expect(composerBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(88);
    }
    await expect(page.locator(".coach-history-item__link > strong").first()).toHaveText(/FTP 3.5 W\/kg/);
    await page.screenshot({ path: testInfo.outputPath(`coach-detail-stress-${testInfo.project.name}.png`) });
    const evidenceToggle = page.getByText("분석 근거 21개");
    await evidenceToggle.click();
    await expect(page.locator(".coach-answer__evidence ol")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`coach-detail-evidence-${testInfo.project.name}.png`) });
    const lastTurn = page.getByRole("heading", { name: "대화 4" });
    if (testInfo.project.name === "desktop") {
      await page.locator(".coach-thread-turns").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    } else {
      await lastTurn.scrollIntoViewIfNeeded();
    }
    await expect(lastTurn).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`coach-detail-failures-${testInfo.project.name}.png`) });
  });
});
