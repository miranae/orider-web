import { describe, it, expect } from "vitest";
import type { Activity } from "@shared/types";
import { latestShoeStatus } from "./shoeStatus";

const NOW = Date.parse("2026-07-15T00:00:00Z");
const DAY = 86400000;

function runWithGear(
  daysAgo: number,
  gear: { type: string; name: string; totalDistanceKm: number; maxDistanceKm?: number } | undefined,
): Activity {
  return { id: `r${daysAgo}`, type: "Run", startTime: NOW - daysAgo * DAY, summary: {}, gear } as unknown as Activity;
}

const shoes = (total: number, max = 650, name = "페가수스 40") => ({
  type: "shoes",
  name,
  totalDistanceKm: total,
  maxDistanceKm: max,
});

describe("latestShoeStatus", () => {
  it("가장 최근 러닝의 신발 스냅샷을 쓴다", () => {
    const s = latestShoeStatus([
      runWithGear(10, shoes(100, 650, "옛날 신발")),
      runWithGear(1, shoes(300, 650, "새 신발")),
    ])!;
    expect(s.name).toBe("새 신발");
    expect(s.totalDistanceKm).toBe(300);
    expect(s.remainingKm).toBe(350);
  });

  it("잔여 15% 미만이면 교체 임박", () => {
    expect(latestShoeStatus([runWithGear(1, shoes(560))])!.replacementDue).toBe(true);
    expect(latestShoeStatus([runWithGear(1, shoes(500))])!.replacementDue).toBe(false);
  });

  it("수명을 넘겼어도 잔여는 음수가 되지 않는다", () => {
    const s = latestShoeStatus([runWithGear(1, shoes(700))])!;
    expect(s.remainingKm).toBe(0);
    expect(s.replacementDue).toBe(true);
  });

  it("신발이 아닌 장비는 무시", () => {
    expect(latestShoeStatus([runWithGear(1, { type: "bike", name: "자전거", totalDistanceKm: 5000, maxDistanceKm: 10000 })])).toBeNull();
  });

  it("maxDistanceKm 이 없으면 잔여를 계산할 수 없으므로 제외", () => {
    expect(latestShoeStatus([runWithGear(1, { type: "shoes", name: "x", totalDistanceKm: 100 })])).toBeNull();
  });

  it("gear 가 없는 활동만 있으면 null — 렌더하지 않는다", () => {
    expect(latestShoeStatus([runWithGear(1, undefined)])).toBeNull();
    expect(latestShoeStatus([])).toBeNull();
  });

  it("gear 없는 활동이 더 최근이어도, gear 있는 러닝 중 최신을 고른다", () => {
    const s = latestShoeStatus([runWithGear(0, undefined), runWithGear(3, shoes(200))])!;
    expect(s.totalDistanceKm).toBe(200);
  });
});
