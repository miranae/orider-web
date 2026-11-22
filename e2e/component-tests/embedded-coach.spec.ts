import { test, expect } from "@playwright/test";
import { powerCurveResponse, trainingPeriodsResponse } from "../fixtures/coach-analysis-responses";
for (const width of [320, 393, 768]) {
  test(`shared app coach at ${width}px keeps its owner through page navigation`, async ({ page, request }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
    });
    const email = `embedded-${crypto.randomUUID()}@example.invalid`;
    const signup = await request.post("http://127.0.0.1:19199/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-local-key", {
      data: { email, password: "local-fixture-only-password", returnSecureToken: true },
    });
    expect(signup.ok()).toBe(true);
    await page.goto(`/ko/embed/fitness?sport=bike&fixtureEmail=${encodeURIComponent(email)}`);
    await expect(page.getByTestId("embedded-fitness")).toBeVisible();
    const owner = await page.getByTestId("fixture-owner").textContent();
    // 상단 탭 아래 → 화면 제목 간격. 다섯 탭이 같아야 한다(계획만 붙어 보이던 회귀).
    const titleGaps: Record<string, number> = {};
    for (const [label, target] of [["컨디션", "condition"], ["오늘", "today"], ["분석", "analysis"], ["계획", "plan"], ["목표", "goals"]]) {
      await page.getByRole("navigation").getByRole("button", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`page=${target}`));
      await expect(page.getByTestId("fixture-owner")).toHaveText(owner!);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (target === "plan") await expect(page.getByTestId("K4-0")).toBeVisible();
      if (target === "goals") await expect(page.getByTestId("K3-1-4")).toBeEnabled();
      if (target === "today") await expect(page.getByTestId("K2-0")).toBeVisible();
      if (target === "analysis") await expect(page.getByTestId("K5-0-1")).toBeVisible();
      if (target === "condition") await expect(page.getByTestId("K1-0-1")).toBeVisible();
      titleGaps[target] = await page.evaluate(() => {
        const nav = document.querySelector("nav")!.getBoundingClientRect().bottom;
        const main = [...document.querySelectorAll<HTMLElement>("main.orider-embedded-surface")].find(m => m.offsetParent)!;
        return Math.round(main.querySelector("h1")!.getBoundingClientRect().top - nav);
      });
      await page.screenshot({ path: info.outputPath(`${target}-${width}.png`), animations: "disabled" });
    }
    expect(new Set(Object.values(titleGaps)).size, JSON.stringify(titleGaps)).toBe(1);
    await page.goBack();
    await expect(page).toHaveURL(/page=plan/);
    await expect(page.getByTestId("fixture-owner")).toHaveText(owner!);
    expect(errors).toEqual([]);
  });
}

// 코치 분석(앱 임베드) — 기간 비교 응답은 합성 데이터로 돌려준다(로컬 전용, 운영 호출 없음).
for (const state of ["data", "insufficient"] as const) {
  test(`app coach analysis at 390px shows the concise structure (${state})`, async ({ page, request }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 1400 });
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.port === "15001") {
        const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
        const name = url.pathname.split("/").pop();
        // 코치 질문 같은 다른 호출은 이 검증 범위 밖이다 — 사용할 수 없음으로 돌려준다.
        if (name !== "getPowerCurvePeriods" && name !== "getTrainingAnalysisPeriods") return route.fulfill({ status: 404, headers, contentType: "application/json", body: JSON.stringify({ error: { status: "NOT_FOUND", message: "fixture" } }) });
        const periods = (route.request().postDataJSON() as { data: { periods: { fromInclusive: number; toExclusive: number }[] } }).data.periods;
        const result = name === "getPowerCurvePeriods" ? powerCurveResponse(periods, state === "insufficient") : trainingPeriodsResponse(periods);
        return route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify({ result }) });
      }
      return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
    });
    const email = `embedded-analysis-${crypto.randomUUID()}@example.invalid`;
    const signup = await request.post("http://127.0.0.1:19199/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-local-key", {
      data: { email, password: "local-fixture-only-password", returnSecureToken: true },
    });
    expect(signup.ok()).toBe(true);
    await page.goto(`/ko/embed/fitness?sport=bike&page=analysis&analysisFixture=1&fixtureEmail=${encodeURIComponent(email)}`);
    await expect(page.getByTestId("coach-analysis")).toBeVisible();
    await expect(page.getByTestId("coach-analysis-composition")).toContainText(/h · 이전 .*h/);
    if (state === "data") {
      await expect(page.getByTestId("coach-analysis-summary")).toContainText("312 W이전 300");
      await expect(page.getByTestId("coach-analysis-curve").getByRole("row")).toHaveCount(5);
    } else {
      await expect(page.getByTestId("coach-analysis-insufficient")).toHaveText("파워 기록 3회 · 비교 불가");
      await expect(page.getByTestId("coach-analysis-curve")).toHaveCount(0);
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`analysis-${state}-390.png`), fullPage: true, animations: "disabled" });
    expect(errors).toEqual([]);
  });
}
