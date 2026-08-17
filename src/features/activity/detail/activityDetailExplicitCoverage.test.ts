import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  buildSampledData,
  buildSummaryStats,
  deriveStreamSensorSummary,
  getAvailableOverlays,
  selectActivityHeartRateStream,
  selectActivityPowerStream,
} from "./activityDetailDerived";
import {
  calculateKjPerHour,
  resolvePowerAnalysisDurationSec,
  selectWholeSessionSensorSeries,
} from "../../../components/AnalysisTab";
import { calculateTRIMP, calculateWorkKj } from "../../../utils/advancedMetrics";
import { calculateNP } from "../../../utils/powerMetrics";
import { calculatePowerCurve } from "../../../utils/powerCurve";
import { calculateHrZoneDistribution, calculatePowerZoneDistribution } from "../../../utils/zoneAnalysis";

const length = 20;
const time = Array.from({ length }, (_, index) => index);
const context = {
  legacyDurationSec: length,
  explicitDurationSec: length,
  activityStartTime: 1_700_000_000_000,
};

function explicitStreams(channels: { watts?: Array<number | null>; heartrate?: Array<number | null> }) {
  return {
    distance: time,
    time,
    watts: Array(length).fill(250),
    heartrate: Array(length).fill(150),
    sensorStreamsV1: {
      version: 1,
      timeUnit: "relative_seconds",
      resolutionSeconds: 1,
      timeOriginEpochMs: context.activityStartTime,
      time,
      ...channels,
    },
  };
}

describe("explicit V1 measured-slot coverage", () => {
  it("accepts power that covers most of the session and counts zero as measured", () => {
    const streams = explicitStreams({ watts: [200, null, ...Array(17).fill(200), 0] });
    const selected = selectActivityPowerStream(streams as never, context);
    const summary = deriveStreamSensorSummary(streams as never, context)!;
    const projection = buildActivityAnalysisProjection(streams as never, context)!;

    expect(selected).toMatchObject({ source: "sensorStreamsV1", hasCandidate: true });
    expect(selected.finiteValues).toHaveLength(19);
    expect(summary).toMatchObject({ hasPowerStream: true, hasRejectedPowerStream: false });
    expect(summary.averagePower).toBeCloseTo(3_600 / 19);
    expect(getAvailableOverlays(buildSampledData(streams as never, context)).map(({ key }) => key))
      .toContain("power");
    expect(projection.power).toMatchObject({
      values: Array(18).fill(200).concat(0),
      complete: false,
      wholeSessionCoverageAccepted: true,
    });
    expect(selectWholeSessionSensorSeries(projection.power, streams.watts, streams.time)).toMatchObject({
      values: Array(18).fill(200).concat(0),
      time: [0, ...Array.from({ length: 18 }, (_, index) => index + 2)],
      durationsSec: Array(19).fill(1),
      segmentStarts: [true, true, ...Array(17).fill(false)],
      fullSessionDurationSec: 20,
      source: "explicit",
    });
    const chart = buildSampledData(streams as never, context);
    expect(chart[1]?.power).toBeNull();
    expect(chart.at(-1)?.power).toBe(0);
  });

  it.each([
    ["one sample", [200, ...Array(19).fill(null)]],
    ["below half the session", [...Array(9).fill(200), ...Array(11).fill(null)]],
  ])("rejects %s power without legacy, summary, chart, or analysis fallback", (_case, watts) => {
    const streams = explicitStreams({ watts });
    const selected = selectActivityPowerStream(streams as never, context);
    const summary = deriveStreamSensorSummary(streams as never, context)!;
    const projection = buildActivityAnalysisProjection(streams as never, context)!;

    expect(selected).toMatchObject({
      source: null,
      hasCandidate: true,
      rejection: { source: "sensorStreamsV1", reason: "insufficient_coverage" },
    });
    expect(summary).toMatchObject({ averagePower: null, hasRejectedPowerStream: true });
    expect(projection).toMatchObject({ streams: { watts: undefined, watts_calc: undefined }, power: undefined });
    expect(buildSummaryStats(streams as never, summary)?.overlays.power).toBeUndefined();
    expect(getAvailableOverlays(buildSampledData(streams as never, context)).map(({ key }) => key))
      .not.toContain("power");
  });

  it("accepts heart rate that covers most of the session", () => {
    const heartrate = [...Array(19).fill(150), null];
    const streams = explicitStreams({ heartrate });
    const selected = selectActivityHeartRateStream(streams as never, context);
    const projection = buildActivityAnalysisProjection(streams as never, context)!;

    expect(selected).toMatchObject({
      source: "sensorStreamsV1",
      positiveValues: Array(19).fill(150),
      hasRejectedMeasurement: false,
    });
    expect(deriveStreamSensorSummary(streams as never, context)).toMatchObject({
      averageHeartRate: 150,
      hasRejectedHeartRateStream: false,
    });
    expect(getAvailableOverlays(buildSampledData(streams as never, context)).map(({ key }) => key))
      .toContain("hr");
    expect(selectWholeSessionSensorSeries(projection.heartRate, streams.heartrate, streams.time).values)
      .toEqual(Array(19).fill(150));
  });

  it.each([
    ["one sample", [150, ...Array(19).fill(null)]],
    ["below half the session", [...Array(9).fill(150), ...Array(11).fill(null)]],
    ["zero heart rate", Array(20).fill(0)],
  ])("rejects %s heart rate without legacy or stored fallback", (_case, heartrate) => {
    const streams = explicitStreams({ heartrate });
    const selected = selectActivityHeartRateStream(streams as never, context);
    const projection = buildActivityAnalysisProjection(streams as never, context)!;

    expect(selected).toMatchObject({
      source: null,
      hasRejectedMeasurement: true,
      rejection: { source: "sensorStreamsV1", reason: "insufficient_coverage" },
    });
    expect(deriveStreamSensorSummary(streams as never, context)).toMatchObject({
      averageHeartRate: null,
      hasRejectedHeartRateStream: true,
    });
    expect(projection.streams.heartrate).toBeUndefined();
    expect(projection.heartRate).toBeUndefined();
    expect(getAvailableOverlays(buildSampledData(streams as never, context)).map(({ key }) => key))
      .not.toContain("hr");
  });

  it("evaluates power and heart-rate slot coverage independently", () => {
    const streams = explicitStreams({
      watts: [200, ...Array(19).fill(null)],
      heartrate: Array(20).fill(150),
    });
    const summary = deriveStreamSensorSummary(streams as never, context)!;

    expect(summary).toMatchObject({
      powerSource: null,
      hasRejectedPowerStream: true,
      heartRateSource: "sensorStreamsV1",
      averageHeartRate: 150,
      hasRejectedHeartRateStream: false,
    });

    const inverseSummary = deriveStreamSensorSummary(explicitStreams({
      watts: Array(20).fill(200),
      heartrate: [150, ...Array(19).fill(null)],
    }) as never, context)!;
    expect(inverseSummary).toMatchObject({
      powerSource: "sensorStreamsV1",
      averagePower: 200,
      hasRejectedPowerStream: false,
      heartRateSource: null,
      hasRejectedHeartRateStream: true,
    });
  });

  it.each(["absent", "all-null"])(
    "keeps per-channel legacy fallback for a genuinely unmeasured %s explicit channel",
    (mode) => {
      const powerStreams = explicitStreams({ heartrate: Array(20).fill(150) });
      const heartRateStreams = explicitStreams({ watts: Array(20).fill(200) });
      if (mode === "all-null") {
        powerStreams.sensorStreamsV1.watts = Array(20).fill(null);
        heartRateStreams.sensorStreamsV1.heartrate = Array(20).fill(null);
      }

      expect(selectActivityPowerStream(powerStreams as never, context).source).toBe("watts");
      expect(selectActivityHeartRateStream(heartRateStreams as never, context).source).toBe("heartrate");
    },
  );

  it.each([
    ["start", 0],
    ["middle", 10],
    ["end", 19],
  ])("keeps 19/20 work, zones, TRIMP, and kJ/h invariant for a %s gap", (_case, gapIndex) => {
    const watts: Array<number | null> = Array(20).fill(200);
    const heartrate: Array<number | null> = Array(20).fill(150);
    watts[gapIndex] = null;
    heartrate[gapIndex] = null;
    const streams = explicitStreams({ watts, heartrate });
    const projection = buildActivityAnalysisProjection(streams as never, context)!;
    const power = selectWholeSessionSensorSeries(projection.power, streams.watts, streams.time, undefined, 20);
    const hr = selectWholeSessionSensorSeries(projection.heartRate, streams.heartrate, streams.time, undefined, 20);
    const powerTiming = { durationsSec: power.durationsSec, segmentStarts: power.segmentStarts };
    const hrTiming = { durationsSec: hr.durationsSec, segmentStarts: hr.segmentStarts };
    const durationSec = resolvePowerAnalysisDurationSec({
      powerLength: power.values.length,
      powerTime: power.time,
      trustedPowerDurationSec: power.fullSessionDurationSec,
    });

    expect(calculateWorkKj(power.values, power.time, powerTiming)).toBeCloseTo(3.8, 10);
    expect(calculatePowerZoneDistribution(power.values, 250, power.time, powerTiming)
      .reduce((seconds, zone) => seconds + zone.seconds, 0)).toBe(19);
    expect(calculateHrZoneDistribution(hr.values, 190, hr.time, hrTiming)
      .reduce((seconds, zone) => seconds + zone.seconds, 0)).toBe(19);
    expect(calculateTRIMP(hr.values, 190, 60, "male", hr.time, hrTiming)).toBeCloseTo(
      calculateTRIMP(Array(19).fill(150), 190)!,
      10,
    );
    expect(durationSec).toBe(20);
    expect(calculateKjPerHour(3.8, durationSec)).toBe(684);
  });

  it("keeps multiple gaps as separate runs and never builds rolling windows across them", () => {
    const axis = Array.from({ length: 40 }, (_, index) => index);
    const watts: Array<number | null> = Array(40).fill(200);
    watts[10] = null;
    watts[25] = null;
    const streams = {
      distance: axis,
      time: axis,
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: context.activityStartTime,
        time: axis,
        watts,
      },
    };
    const projection = buildActivityAnalysisProjection(streams as never, {
      ...context,
      legacyDurationSec: 40,
      explicitDurationSec: 40,
    })!;
    const power = selectWholeSessionSensorSeries(projection.power, undefined, axis, undefined, 40);
    const timing = { durationsSec: power.durationsSec, segmentStarts: power.segmentStarts };

    expect(power.values).toHaveLength(38);
    expect(power.segmentStarts?.filter(Boolean)).toHaveLength(3);
    expect(calculateNP(power.values, power.time, timing)).toBeNull();
    expect(calculatePowerCurve(power.values, power.time, timing)
      .map(({ durationSeconds }) => durationSeconds)).not.toContain(30);
  });

  describe("a sensor that stops before the ride does", () => {
    // 실주행 재현: 심박 스트랩/파워미터가 종료 몇 분 전에 끊기면 V1 축 span 이 세션보다
    // 짧아진다. 하드웨어 정상 동작이므로 남은 측정값은 살려 써야 한다.
    function truncatedStreams(slots: number, sessionSec: number) {
      const axis = Array.from({ length: slots }, (_, index) => index);
      return {
        distance: Array.from({ length: sessionSec }, (_, index) => index),
        time: Array.from({ length: sessionSec }, (_, index) => index),
        sensorStreamsV1: {
          version: 1,
          timeUnit: "relative_seconds",
          resolutionSeconds: 1,
          timeOriginEpochMs: context.activityStartTime,
          time: axis,
          watts: Array(slots).fill(200),
          heartrate: Array(slots).fill(150),
        },
      };
    }

    it("keeps both channels when the axis falls short but still covers the session", () => {
      const streams = truncatedStreams(14, 20);
      const summary = deriveStreamSensorSummary(streams as never, {
        ...context,
        legacyDurationSec: 20,
        explicitDurationSec: 20,
      })!;

      expect(summary).toMatchObject({
        powerSource: "sensorStreamsV1",
        averagePower: 200,
        hasRejectedPowerStream: false,
        heartRateSource: "sensorStreamsV1",
        averageHeartRate: 150,
        hasRejectedHeartRateStream: false,
      });
      expect(summary.rejections).toEqual([]);
    });

    it("still rejects an axis that overruns the session as a foreign clock", () => {
      const streams = truncatedStreams(60, 20);
      const summary = deriveStreamSensorSummary(streams as never, {
        ...context,
        legacyDurationSec: 20,
        explicitDurationSec: 20,
      })!;

      expect(summary).toMatchObject({ powerSource: null, heartRateSource: null });
      expect(summary.rejections).toEqual([
        expect.objectContaining({ channel: "heart_rate", reason: "duration_mismatch" }),
        expect.objectContaining({ channel: "power", reason: "duration_mismatch" }),
      ]);
    });

    it("rejects a stub that measured less than half the session", () => {
      const streams = truncatedStreams(9, 20);
      const summary = deriveStreamSensorSummary(streams as never, {
        ...context,
        legacyDurationSec: 20,
        explicitDurationSec: 20,
      })!;

      expect(summary).toMatchObject({ powerSource: null, heartRateSource: null });
      expect(summary.rejections).toEqual([
        expect.objectContaining({ channel: "heart_rate", reason: "insufficient_coverage" }),
        expect.objectContaining({ channel: "power", reason: "insufficient_coverage" }),
      ]);
    });
  });

  it("keeps an exact 100% channel as one fully measured run", () => {
    const streams = explicitStreams({ watts: Array(20).fill(200) });
    const power = buildActivityAnalysisProjection(streams as never, context)!.power!;

    expect(power).toMatchObject({
      complete: true,
      durationsSec: Array(20).fill(1),
      segmentStarts: [true, ...Array(19).fill(false)],
      fullSessionDurationSec: 20,
    });
  });
});
