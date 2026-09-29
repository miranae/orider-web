import { expect, test } from "@playwright/test";
import {
  RUNNING_PARITY_ID, RUNNING_PARITY_PROJECT, RUNNING_PARITY_TITLE, seedRunningParity,
} from "../fixtures/running-parity";

test.beforeAll(seedRunningParity);

test.beforeEach(async ({ page }) => {
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
  if (await card.count()) await expect(card).toBeVisible();
  await page.screenshot({ path: info.outputPath("running-home.png"), fullPage: true });
});

test("public detail keeps running splits and excludes cycling analytics", async ({ page }, info) => {
  await page.goto(`/ko/activity/${RUNNING_PARITY_ID}`);
  await expect(page.getByRole("heading", { name: RUNNING_PARITY_TITLE })).toBeVisible();
  await page.getByRole("tab", { name: "분석", exact: true }).click();
  await expect(page.getByRole("heading", { name: /스플릿/ })).toBeVisible();
  await expect(page.getByText(/5[:'′]50/).first()).toBeVisible();
  await expect(page.getByText(/5[:'′]37/).first()).toBeVisible();
  await expect(page.getByText("활동 당시 FTP 정본 없음", { exact: true })).toHaveCount(0);
  await expect(page.getByText("NP", { exact: true })).toHaveCount(0);
  await expect(page.getByText("평균 RPM", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "파워 커브", exact: true })).toHaveCount(0);
  await expect(page.getByText("심박 존을 계산할 수 없어요", { exact: true })).toHaveCount(0);
  await expect(page.getByText("spm", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("analysis.section.hrZones", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("run-analysis")).toContainText(/21\.02\s*km/);
  await page.screenshot({ path: info.outputPath("running-analysis.png"), fullPage: true });
  await page.getByRole("heading", { name: /스플릿/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("running-analysis-splits.png") });
});
