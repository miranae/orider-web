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

async function openCoach(page: Page, detail = false) {
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
      await route.fulfill({ json: { data: { thread: { ...summary, turns: [{
        turnId: REQUEST_ID, requestId: REQUEST_ID, question: "최근 한 달 운동 기록을 보고 현재 몸 상태와 다음 훈련 방향을 코칭해줘.",
        createdAt: NOW, response,
      }] }, nextCursor: null } } });
      return;
    }
    if (url.pathname.endsWith("/threads")) {
      await route.fulfill({ json: { data: { threads: [summary], nextCursor: null } } });
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
    await page.evaluate(async () => { await document.fonts.ready; });
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
});
