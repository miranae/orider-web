import { test, expect } from "@playwright/test";

// 운영 모바일 뷰포트 스모크 — sticky/fixed 요소가 화면을 과점유하면 실패.
// #374 장애(상·하단 스티키 배너가 피드를 가림)의 사후 감지 라인.
// 배포 직후 prod-smoke.yml 이 실행하며, 사용자 신고 전에 잡는 것이 목적.

const ROUTES = ["/ko/", "/en/"];

// 뷰포트에 실제로 보이는 position: sticky/fixed 요소들의 세로 점유 합계(px)를 계산.
// 같은 y 구간이 겹치면 한 번만 센다(구간 병합).
async function stickyOccupiedHeight(page: import("@playwright/test").Page): Promise<{ occupied: number; viewport: number; offenders: string[] }> {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const intervals: Array<[number, number]> = [];
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const cs = getComputedStyle(el);
      if (cs.position !== "sticky" && cs.position !== "fixed") continue;
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      const top = Math.max(0, r.top);
      const bottom = Math.min(vh, r.bottom);
      if (bottom - top < 24 || r.width < window.innerWidth * 0.5) continue; // 얇은 라인·부분 폭 요소는 제외
      intervals.push([top, bottom]);
      offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} (${Math.round(r.height)}px @${Math.round(r.top)})`);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let occupied = 0;
    let curStart = -1;
    let curEnd = -1;
    for (const [s, e] of intervals) {
      if (s > curEnd) {
        if (curEnd > curStart) occupied += curEnd - curStart;
        curStart = s;
        curEnd = e;
      } else {
        curEnd = Math.max(curEnd, e);
      }
    }
    if (curEnd > curStart) occupied += curEnd - curStart;
    return { occupied, viewport: vh, offenders };
  });
}

for (const route of ROUTES) {
  test(`${route} — sticky/fixed 요소가 모바일 뷰포트의 35%를 넘지 않는다`, async ({ page }) => {
    // networkidle 은 Firebase 상시 연결 때문에 라이브에서 settle 하지 않는다 — 루트 렌더를 기다린다.
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.locator("#root > *").first().waitFor({ state: "visible" });
    await page.waitForTimeout(2000); // 지연 마운트되는 배너·오버레이 포착

    const { occupied, viewport, offenders } = await stickyOccupiedHeight(page);
    const ratio = occupied / viewport;

    expect(
      ratio,
      `sticky/fixed 요소 세로 점유 ${Math.round(ratio * 100)}% (${occupied}px/${viewport}px)\n${offenders.join("\n")}`,
    ).toBeLessThanOrEqual(0.35);
  });

  test(`${route} — 페이지가 정상 렌더링된다 (엔트리 번들 + 루트 컨텐츠)`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("#root > *").first()).toBeVisible({ timeout: 15000 });
  });
}
