import { expect, test, type Page } from "@playwright/test";
import {
  RUNNING_PARITY_ID, RUNNING_PARITY_PROJECT, RUNNING_PARITY_TITLE, seedRunningParity,
} from "../fixtures/running-parity";

const browserErrors = new WeakMap<Page, string[]>();

test.beforeAll(seedRunningParity);

test.afterEach(async ({ page }, info) => {
  const errors = browserErrors.get(page) ?? [];
  if (errors.length) await info.attach("browser-page-errors", { body: errors.join("\n\n"), contentType: "text/plain" });
  expect(errors, "Browser page errors (full stacks attached)").toEqual([]);
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", error => {
    const stack = error.stack ?? `${error.name}: ${error.message}`;
    errors.push(stack);
    console.error(`[running-parity pageerror] ${stack}`);
  });
  await page.route("**/runtime-config.json*", (route) => route.fulfill({ json: {
    firebaseProjectId: RUNNING_PARITY_PROJECT, firebaseApiKey: "fake-api-key",
    firebaseAuthDomain: "localhost", firebaseAppId: "fake-app-id",
    firebaseStorageBucket: `${RUNNING_PARITY_PROJECT}.appspot.com`, useEmulators: true,
    canonicalRolloutEnabled: false,
  } }));
  await page.route("**/getActivityOverview", (route) => route.fulfill({ json: { result: {
    status: "available", activityId: RUNNING_PARITY_ID, version: "activity-overview-v1",
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
  await expect(page.getByText(RUNNING_PARITY_TITLE, { exact: true })).toBeVisible();
  const card = info.project.name === "mobile"
    ? page.locator(".mobile-feed-card").filter({ hasText: RUNNING_PARITY_TITLE })
    : page.locator("article").filter({ hasText: RUNNING_PARITY_TITLE });
  // 카드 컨테이너 구현에 의존하지 않는 body 검증도 함께 유지한다.
  await expect(page.getByText(/5['′:]37/).first()).toBeVisible();
  await expect(page.getByText("구간 기록 없음", { exact: true })).toHaveCount(0);
  await expect(page.getByText("10.7km/h", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("run-card-primary")).toContainText(/5['′:]37/);
  await expect(page.getByTestId("run-card-primary")).not.toContainText("264");
  await expect(page.getByTestId("run-card-secondary")).toContainText("264");
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
  await expect(page.getByText(/5[:'′]37/).first()).toBeVisible();
  await expect(page.getByText("활동 당시 FTP 정본 없음", { exact: true })).toHaveCount(0);
  await expect(page.getByText("NP", { exact: true })).toHaveCount(0);
  await expect(page.getByText("평균 RPM", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "파워 커브", exact: true })).toHaveCount(0);
  await expect(page.getByText("심박 존을 계산할 수 없어요", { exact: true })).toHaveCount(0);
  await expect(page.getByText("spm", { exact: true }).first()).toBeVisible();
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
  await expect(page.getByTestId("run-detail-disclosure")).toContainText("191");
  await expect(page.getByTestId("run-detail-disclosure")).toContainText("264");
  await page.getByTestId("run-raw-splits").locator("summary").click();
  await expect(page.getByTestId("run-raw-splits").getByRole("table")).toBeVisible();
});
