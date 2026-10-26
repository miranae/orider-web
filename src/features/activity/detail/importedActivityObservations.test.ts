import { describe, expect, it } from "vitest";
import { buildActivityAnalysisProjection, buildAlignedActivityChartChannels, buildSampledData, deriveStreamSensorSummary, getAvailableOverlays, buildSummaryStats, selectActivityPowerStream } from "./activityDetailDerived";
import { withImportedObservationTime } from "./importedActivityObservations";
const origin = 1792970000000;
function fixture() {
  return { time: [0, 1, 1, 2, 2], distance: [0, 2, 4, 6, 8], altitude: [1, 2, 3, 4, 5],
    watts: [999, 999, 999, 999, 999], heartrate: [199, 199, 199, 199, 199], cadence: [99, 99, 99, 99, 99],
    importedSensorObservationsV1: { version: 1, source: "parsed_import_points", state: "available", timeUnit: "relative_milliseconds",
      originEpochMs: origin, timeMs: [0, 500, 1000, 1500, 2000], watts: [200, null, 0, 200, 200],
      heartrate: [150, null, 150, 150, 150], cadence: [80, null, 0, 80, 80] } };
}
describe("imported point observations", () => {
  it("preserves subsecond time, missing slots and genuine zero without trusting flattened legacy samples", () => {
    const streams = fixture();
    expect(withImportedObservationTime(streams, origin)?.time).toEqual([0, .5, 1, 1.5, 2]);
    const channels = buildAlignedActivityChartChannels(streams, { activityStartTime: origin });
    expect(channels.chartPower).toEqual([200, null, 0, 200, 200]);
    expect(channels.chartHeartRate).toEqual([150, null, 150, 150, 150]);
    const points = buildSampledData(streams);
    expect(points[1]?.power).toBeNull(); expect(points[2]?.power).toBe(0);
    expect(points[1]?.cadence).toBeNaN(); expect(points[2]?.cadence).toBe(0);
    const projection = buildActivityAnalysisProjection(streams)!;
    expect(projection.power?.time).toEqual([0, 1, 1.5, 2]);
    expect(projection.power?.segmentStarts).toEqual([true, true, false, false]);
    expect(projection.power?.durationsSec).toEqual([.5, .5, .5, 0]);
    expect(projection.power?.complete).toBe(false);
    expect(deriveStreamSensorSummary(streams)?.averagePower).toBeCloseTo(400 / 3);
  });
  it.each([undefined, null, { version: 2 }, { version: 1, source: "parsed_import_points", state: "unavailable", reason: "invalid_timestamps" }])("never falls back to flat sensor values for rejected marker %j", marker => {
    const streams = { ...fixture(), importedSensorObservationsV1: marker };
    expect(buildAlignedActivityChartChannels(streams).chartPower).toBeUndefined();
    expect(deriveStreamSensorSummary(streams)).toMatchObject({ averagePower: null, averageHeartRate: null, hasReliablePower: false });
    expect(buildActivityAnalysisProjection(streams)?.power).toBeUndefined();
    expect(buildSummaryStats(streams, deriveStreamSensorSummary(streams))?.overlays.power).toBeUndefined();
    expect(selectActivityPowerStream(streams).hasCandidate).toBe(true);
  });
  it("rejects origin mismatch, wrong slot counts and duplicate source clocks", () => {
    const streams = fixture();
    expect(buildAlignedActivityChartChannels(streams, { activityStartTime: origin + 1 }).chartPower).toBeUndefined();
    expect(buildAlignedActivityChartChannels({ ...streams, distance: [0, 1] }).chartPower).toBeUndefined();
    streams.importedSensorObservationsV1.timeMs[2] = 500;
    expect(buildAlignedActivityChartChannels(streams).chartPower).toBeUndefined();
  });
  it("allows a first point after session start while rejecting points beyond its elapsed bounds", () => {
    const streams = fixture();
    expect(withImportedObservationTime(streams, origin - 1000, 3)?.time).toEqual([1, 1.5, 2, 2.5, 3]);
    expect(buildAlignedActivityChartChannels(streams, { activityStartTime: origin - 1000, explicitDurationSec: 2 }).chartPower).toBeUndefined();
  });
  it("distinguishes all missing sensors from an observed all-zero power channel", () => {
    const streams = fixture();
    streams.importedSensorObservationsV1.watts = [null, null, null, null, null];
    expect(deriveStreamSensorSummary(streams)).toMatchObject({ averagePower: null, hasReliablePower: false, hasRejectedPowerStream: true });
    expect(buildSummaryStats(streams, deriveStreamSensorSummary(streams))?.overlays.power).toBeUndefined();
    expect(selectActivityPowerStream(streams).hasCandidate).toBe(true);
    streams.importedSensorObservationsV1.watts = [0, 0, 0, 0, 0];
    expect(deriveStreamSensorSummary(streams)).toMatchObject({ averagePower: 0, maxPower: 0, hasReliablePower: true });
    expect(getAvailableOverlays(buildSampledData(streams)).map(row => row.key)).toContain("power");
  });
});
