import { describe, expect, it } from "vitest";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { runningPaceCurve } from "./runningPaceCurve";

const canonical = (paceCurve: unknown) => ({ runMetrics: { paceCurve }, speedCurve: { "1m": 36 } }) as unknown as ActivityMetrics;

describe("canonical running pace presentation", () => {
  it("prefers canonical elapsed points including three minutes and two hours without mutating or substituting legacy speed", () => {
    const raw = [{ durationSec: 7200, paceSecPerKm: 800 }, { durationSec: 180, paceSecPerKm: 750 }, { durationSec: 30, paceSecPerKm: 700 }];
    expect(runningPaceCurve(canonical(raw))).toEqual({ sourceBasis: "run_metrics_pace_curve", points: [
      { durationSeconds: 30, paceSecPerKm: 700 }, { durationSeconds: 180, paceSecPerKm: 750 }, { durationSeconds: 7200, paceSecPerKm: 800 },
    ] });
    expect(raw[0]!.durationSec).toBe(7200);
  });
  it("accepts one slow canonical point without the cycling speed floor or a minimum point count", () => {
    expect(runningPaceCurve(canonical([{ durationSec: 60, paceSecPerKm: 1200 }])).points).toEqual([{ durationSeconds: 60, paceSecPerKm: 1200 }]);
  });
  it.each([
    [], null, {}, [{ durationSec: 60, paceSecPerKm: NaN }], [{ durationSec: 60, paceSecPerKm: Infinity }],
    [{ durationSec: 60, paceSecPerKm: 0 }], [{ durationSec: 60, paceSecPerKm: -1 }],
    [{ durationSec: 47, paceSecPerKm: 300 }], [{ durationSec: 60, paceSecPerKm: 300 }, { durationSec: 60, paceSecPerKm: 250 }],
    [{ durationSec: 60, paceSecPerKm: 300 }, null], Array.from({ length: 10 }, () => ({ durationSec: 30, paceSecPerKm: 300 })),
  ])("never fills an explicit empty or invalid canonical curve from legacy speed: %j", raw => {
    expect(runningPaceCurve(canonical(raw))).toEqual({ sourceBasis: "run_metrics_pace_curve", points: [] });
  });
  it("converts absent-canonical legacy km/h using its supported producer durations and 5km/h floor", () => {
    const value = { speedCurve: { "1s": 40, "5s": 35, "2m": 30, "30s": 18, "1m": 12, "5m": 5, "10m": 4.8, "20m": Infinity } } as unknown as ActivityMetrics;
    expect(runningPaceCurve(value)).toEqual({ sourceBasis: "speed_curve_kmh_converted", points: [
      { durationSeconds: 30, paceSecPerKm: 200 }, { durationSeconds: 60, paceSecPerKm: 300 }, { durationSeconds: 300, paceSecPerKm: 720 },
    ] });
  });
  it("does not fill entirely absent curves", () => {
    expect(runningPaceCurve({})).toEqual({ sourceBasis: null, points: [] });
  });
});
