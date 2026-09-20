import { describe, expect, it } from "vitest";
import { powerCurvePoints, speedCurvePoints } from "./metricsPresentation";

/** 2026-09-20 실측(strava_20235266547) 의 서버 커브. */
const METRICS = {
  mmp: { "1s": 845, "5s": 652, "10s": 620, "30s": 381, "1m": 371, "5m": 246 },
  speedCurve: { "5s": 56.9, "10s": 53.3, "30s": 52.2, "1m": 51.5, "5m": 43.1 },
} as Parameters<typeof speedCurvePoints>[0];

describe("speedCurvePoints", () => {
  it("서버 표를 초 단위 지속시간으로 푼다", () => {
    expect(speedCurvePoints(METRICS)).toEqual([
      { durationSeconds: 5, speedKmh: 56.9 },
      { durationSeconds: 10, speedKmh: 53.3 },
      { durationSeconds: 30, speedKmh: 52.2 },
      { durationSeconds: 60, speedKmh: 51.5 },
      { durationSeconds: 300, speedKmh: 43.1 },
    ]);
  });

  it("파워 커브와 같은 창 길이 순서를 쓴다 — 나란히 읽히도록", () => {
    const power = powerCurvePoints(METRICS).map((p) => p.durationSeconds);
    const speed = speedCurvePoints(METRICS).map((p) => p.durationSeconds);
    // 속도는 1초를 내보내지 않는다(GPS 미분 잡음). 그 외에는 같은 순서다.
    expect(speed).toEqual(power.filter((sec) => sec !== 1));
  });

  it("1초는 넣지 않는다 — 서버가 주더라도", () => {
    const withOneSecond = { ...METRICS, speedCurve: { ...METRICS.speedCurve, "1s": 61.9 } };
    expect(speedCurvePoints(withOneSecond as typeof METRICS)
      .some((p) => p.durationSeconds === 1)).toBe(false);
  });

  it("속도 커브가 없으면 빈 배열", () => {
    expect(speedCurvePoints({} as typeof METRICS)).toEqual([]);
    expect(speedCurvePoints({ speedCurve: undefined } as typeof METRICS)).toEqual([]);
  });
});
