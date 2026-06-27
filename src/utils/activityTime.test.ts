import { describe, it, expect } from "vitest";
import { resolveDuration, resolveAvgSpeedKph } from "./activityTime";

const H = 3_600_000; // 1시간 ms

describe("resolveDuration (#236 이동시간 우선 정책)", () => {
  it("metrics 없으면 경과시간 그대로 — 회귀 X", () => {
    const d = resolveDuration({ ridingTimeMillis: 2 * H });
    expect(d.displayMs).toBe(2 * H);
    expect(d.usingMoving).toBe(false);
    expect(d.movingMs).toBeNull();
    expect(d.pauseMs).toBeNull();
  });

  it("정지가 60초 이상이면 이동시간으로 전환", () => {
    // elapsed 9h57m, moving 3h, pause ~6h57m
    const elapsed = 9 * H + 57 * 60_000;
    const d = resolveDuration({
      ridingTimeMillis: elapsed,
      movingTimeSec: 3 * 3600,
      pauseTimeSec: (elapsed - 3 * H) / 1000,
    });
    expect(d.usingMoving).toBe(true);
    expect(d.displayMs).toBe(3 * H);
    expect(d.elapsedMs).toBe(elapsed);
    expect(d.pauseMs).toBe(elapsed - 3 * H);
  });

  it("정지가 60초 미만이면 경과시간 유지 (짧은 정차는 무시)", () => {
    const d = resolveDuration({
      ridingTimeMillis: 2 * H,
      movingTimeSec: 2 * 3600 - 30, // 30초 적음
      pauseTimeSec: 30,
    });
    expect(d.usingMoving).toBe(false);
    expect(d.displayMs).toBe(2 * H);
  });

  it("정지가 정확히 60초면 전환 (경계 포함)", () => {
    const d = resolveDuration({
      ridingTimeMillis: 2 * H,
      movingTimeSec: 2 * 3600 - 60,
      pauseTimeSec: 60,
    });
    expect(d.usingMoving).toBe(true);
    expect(d.displayMs).toBe((2 * 3600 - 60) * 1000);
  });

  it("movingTimeSec=0 은 데이터 없음으로 취급 → 경과시간", () => {
    const d = resolveDuration({ ridingTimeMillis: H, movingTimeSec: 0, pauseTimeSec: 120 });
    expect(d.usingMoving).toBe(false);
    expect(d.displayMs).toBe(H);
    expect(d.movingMs).toBeNull();
  });

  it("pauseTimeSec 누락 시 전환 안 함 (정지량 판단 불가)", () => {
    const d = resolveDuration({ ridingTimeMillis: 2 * H, movingTimeSec: 3600 });
    expect(d.usingMoving).toBe(false);
    expect(d.displayMs).toBe(2 * H);
    expect(d.movingMs).toBe(H);
    expect(d.pauseMs).toBeNull();
  });
});

describe("resolveAvgSpeedKph (#236 후속 — 이동시간 기준 평균 속도)", () => {
  it("이동시간 전환 시 거리/이동시간으로 재계산 (fallback 무시)", () => {
    // 30km / 이동 1h → 30 km/h. 경과 기준 fallback(20)은 무시.
    const resolved = resolveDuration({
      ridingTimeMillis: 1.5 * H,
      movingTimeSec: 3600,
      pauseTimeSec: 1800, // 30분 정지 ≥60s → usingMoving
    });
    expect(resolved.usingMoving).toBe(true);
    expect(resolveAvgSpeedKph(30000, resolved, 20)).toBeCloseTo(30, 5);
  });

  it("전환 안 하면 기존 평균 속도(fallback) 유지", () => {
    const resolved = resolveDuration({ ridingTimeMillis: H }); // metrics 없음
    expect(resolved.usingMoving).toBe(false);
    expect(resolveAvgSpeedKph(30000, resolved, 27.3)).toBe(27.3);
  });

  it("정지 60초 미만이면 fallback 유지", () => {
    const resolved = resolveDuration({
      ridingTimeMillis: H,
      movingTimeSec: 3600 - 30,
      pauseTimeSec: 30,
    });
    expect(resolveAvgSpeedKph(30000, resolved, 30)).toBe(30);
  });

  it("거리 0 이면 fallback (0 나눗셈 방지)", () => {
    const resolved = resolveDuration({
      ridingTimeMillis: H,
      movingTimeSec: 1800,
      pauseTimeSec: 1800,
    });
    expect(resolveAvgSpeedKph(0, resolved, 0)).toBe(0);
  });
});
