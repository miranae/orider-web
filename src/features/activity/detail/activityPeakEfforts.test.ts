import { describe, expect, it } from "vitest";
import type { ActivityMetrics, RidePeakEffort } from "@shared/types/activity-metrics";
import { resolvePeakEffortLocation, visiblePeakEfforts } from "./activityPeakEfforts";

const peak = { durationSec: 60, startIndex: 987, endIndex: 1047, startOffsetSec: 100,
  fromKm: 0.1, toKm: 0.3, avgPowerW: 250, maxPowerW: 400, avgHr: null, maxHr: null,
  avgSpeedKmh: null, maxSpeedKmh: null, avgCadence: null, containsMaxHr: false, leadsToMaxHr: false } satisfies RidePeakEffort;
const metrics = { discipline: "bike", isVirtualPower: false, peakEfforts: { peaks: [peak], highlight: peak, indexAxis: "route" } } as ActivityMetrics;
describe("canonical peak efforts", () => {
  it("requires owner, confirmed measured power and settled input", () => {
    expect(visiblePeakEfforts(metrics, true)).toEqual([peak]);
    expect(visiblePeakEfforts(metrics, false)).toEqual([]);
    expect(visiblePeakEfforts(metrics, true, true)).toEqual([]);
    for (const change of [{ isVirtualPower: undefined }, { isVirtualPower: true }, { inputPending: true }, { inputCoverage: "pending" }, { discipline: "run" }]) {
      expect(visiblePeakEfforts({ ...metrics, ...change } as ActivityMetrics, true)).toEqual([]);
    }
  });
  it("retains missing sensor values and does not substitute highlight or fabricate durations", () => {
    expect(visiblePeakEfforts(metrics, true)[0]?.avgHr).toBeNull();
    expect(visiblePeakEfforts({ ...metrics, peakEfforts: { peaks: [], highlight: peak } }, true)).toEqual([]);
    expect(visiblePeakEfforts({ ...metrics, peakEfforts: { peaks: [peak, peak, { ...peak, durationSec: 30 }, { ...peak, durationSec: 300, avgPowerW: NaN }], highlight: null } }, true)).toEqual([peak]);
  });
  it("maps route and downsampled chart independently by absolute distance, never raw peak indices", () => {
    const streams = { distance: [0, 50, 100, 150, 200, 250, 300, 350], latlng: Array.from({ length: 8 }, () => [37, 127] as [number, number]) };
    expect(resolvePeakEffortLocation(peak, "route", streams, [0, 100, 200, 300, 350].map(distance => ({ distance }))))
      .toEqual({ chartRange: [1, 3], routeRange: { startIndex: 2, endIndex: 6 }, markerPosition: [37, 127] });
    expect(resolvePeakEffortLocation(peak, "sensor", streams, [])).toBeNull();
    expect(resolvePeakEffortLocation(peak, undefined, streams, [])).toBeNull();
  });
  it("refuses truncated/non-monotonic axes and invalid GPS but can highlight a valid chart without GPS", () => {
    const sampled = [0, 100, 200, 300].map(distance => ({ distance }));
    expect(resolvePeakEffortLocation(peak, "route", { distance: [0, 100, 200] }, sampled)).toBeNull();
    expect(resolvePeakEffortLocation(peak, "route", { distance: [0, 200, 100, 300] }, [])).toBeNull();
    expect(resolvePeakEffortLocation(peak, "route", { distance: [0, 100, 200, 300], latlng: [[37, 127], [37, 127], [NaN, 127], [37, 127]] }, sampled))
      .toEqual({ chartRange: [1, 3], routeRange: undefined, markerPosition: null });
    expect(resolvePeakEffortLocation({ ...peak, fromKm: 0, toKm: 0 }, "route", null, sampled)).toBeNull();
  });
});
