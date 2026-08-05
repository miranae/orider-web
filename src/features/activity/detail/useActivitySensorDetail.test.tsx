import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, ActivityStreams } from "@shared/types";

import { useActivitySensorDetail } from "./useActivitySensorDetail";
import type { ActivityPowerOverride } from "./activityDetailDerived";
import { buildActivityPowerSourceFingerprint } from "./activityPowerOverride";

const mocks = vi.hoisted(() => ({ debugLog: vi.fn(), logClientError: vi.fn() }));
vi.mock("../../../services/errorLogger", () => ({
  debugLog: mocks.debugLog,
  logClientError: mocks.logClientError,
}));

const activity = {
  id: "activity-1",
  startTime: 1_700_000_000_000,
  avgPower: 180,
  weightedAvgPower: 190,
  summary: {
    ridingTimeMillis: 4_000,
    elapsedTimeMillis: 4_000,
    averagePower: 175,
    normalizedPower: 185,
    averageHeartRate: 155,
    maxHeartRate: 165,
    averageCadence: 88,
    maxCadence: 110,
  },
} as unknown as Activity;

function renderSensorDetail(streams: ActivityStreams, powerOverride: ActivityPowerOverride | null = null) {
  return renderHook(
    ({ currentStreams, currentPowerOverride }) => useActivitySensorDetail({
      activityId: activity.id,
      activity,
      streams: currentStreams,
      powerOverride: currentPowerOverride,
      hoverIndex: 2,
      hoveredSegment: null,
    }),
    { initialProps: { currentStreams: streams, currentPowerOverride: powerOverride } },
  );
}

describe("useActivitySensorDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishes one shared sensor selection to summary, chart, and analysis consumers", () => {
    const streams = {
      time: [0, 1, 2, 3],
      distance: [0, 10, 20, 30],
      latlng: [[37, 127], [37.1, 127.1], [37.2, 127.2], [37.3, 127.3]],
      altitude: [10, 11, 12, 13],
      velocity_smooth: [5, 5, 5, 5],
      watts: [100, 200, 300, 400],
    } as ActivityStreams;

    const { result } = renderSensorDetail(streams);

    expect(result.current.selectionContext).toEqual({
      legacyDurationSec: 4,
      explicitDurationSec: 4,
      activityStartTime: activity.startTime,
    });
    expect(result.current.displayedSummary?.averagePower).toBe(250);
    expect(result.current.avgPowerValue).toBe(250);
    expect(result.current.normalizedPowerValue).toBeNull();
    expect(result.current.analysisProjection?.streams.watts).toEqual(streams.watts);
    expect(result.current.markerPosition).toEqual([37.2, 127.2]);
  });

  it("uses Strava wall-clock duration when elapsed time is missing", () => {
    const activityWithoutElapsed = {
      ...activity,
      startTime: 1_700_000_000_000,
      endTime: 1_700_010_000_000,
      summary: { ...activity.summary, elapsedTimeMillis: undefined, ridingTimeMillis: 4_000 },
    } as unknown as Activity;
    const streams = {
      time: [0, 5_000, 10_000],
      distance: [0, 10, 20],
      watts: [100, 200, 300],
    } as ActivityStreams;
    const { result } = renderHook(() => useActivitySensorDetail({
      activityId: activityWithoutElapsed.id,
      activity: activityWithoutElapsed,
      streams,
      hoverIndex: 1,
      hoveredSegment: null,
    }));

    expect(result.current.selectionContext.legacyDurationSec).toBe(10_000);
    expect(result.current.hasStreamPowerCandidate).toBe(true);
    expect(result.current.hasAnalysisStreams).toBe(true);
  });

  it("reports the same rejection only once across stream object refreshes", () => {
    const streams = {
      time: [0, 1, 2, 3],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 2,
        timeOriginEpochMs: activity.startTime,
        time: [0, 1, 2, 3],
        heartrate: [null, null, null, null],
        watts: [100, 200, 300, 400],
      },
    } as unknown as ActivityStreams;
    const { rerender } = renderSensorDetail(streams);

    rerender({ currentStreams: { ...streams }, currentPowerOverride: null });

    expect(mocks.logClientError).toHaveBeenCalledTimes(1);
    expect(mocks.logClientError).toHaveBeenCalledWith(
      "ActivityPage.sensorStreamRejected.power.invalid_metadata",
      expect.any(Error),
      expect.objectContaining({ activityId: activity.id, reason: "invalid_metadata" }),
    );
  });

  it.each([
    ["power", "watts", [0, 200, 210, 220]],
    ["heart_rate", "heartrate", [140, 150, 160, 170]],
  ] as const)("reports invalid-version %s metadata only once", (diagnosticChannel, field, values) => {
    const streams = {
      time: [0, 1, 2, 3],
      watts: [200, 210, 220, 230],
      heartrate: [140, 150, 160, 170],
      sensorStreamsV1: {
        version: "tampered",
        time: [0, 1, 2, 3],
        [field]: values,
      },
    } as unknown as ActivityStreams;
    const { result, rerender } = renderSensorDetail(streams);

    rerender({ currentStreams: { ...streams }, currentPowerOverride: null });

    if (diagnosticChannel === "power") {
      expect(result.current.displayedSummary?.averagePower).toBeNull();
    }
    expect(mocks.logClientError).toHaveBeenCalledTimes(1);
    expect(mocks.logClientError).toHaveBeenCalledWith(
      `ActivityPage.sensorStreamRejected.${diagnosticChannel}.invalid_metadata`,
      expect.any(Error),
      expect.objectContaining({
        activityId: activity.id,
        channel: diagnosticChannel,
        sensorSource: "sensorStreamsV1",
        reason: "invalid_metadata",
      }),
    );
  });

  it("switches every power consumer to a validated override and restores the rejected base source", () => {
    const streams = {
      time: [0, 1, 2, 3],
      distance: [0, 10, 20, 30],
      latlng: [[37, 127], [37.1, 127.1], [37.2, 127.2], [37.3, 127.3]],
      altitude: [10, 11, 12, 13],
      velocity_smooth: [5, 5, 5, 5],
      heartrate: [140, 141, 142, 143],
      cadence: [80, 81, 82, 83],
      watts: [900, 901],
    } as ActivityStreams;
    const powerOverride: ActivityPowerOverride = {
      source: "virtualPowerOverride",
      activityId: activity.id,
      sourceFingerprint: buildActivityPowerSourceFingerprint(streams)!,
      params: { riderWeightKg: 70, bikeWeightKg: 9, rollingResistance: 0.005, cdA: 0.32 },
      values: [100, 200, 300, 400],
      time: [0, 1, 2, 3],
    };
    const { result, rerender } = renderSensorDetail(streams);

    expect(result.current.streamSensorSummary).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      powerSource: null,
      averageHeartRate: 141.5,
      averageCadence: 81.5,
    });
    expect(result.current.displayedSummary?.averagePower).toBeNull();
    expect(result.current.analysisProjection?.streams.watts).toBeUndefined();
    expect(result.current.sampledData.map(({ power }) => power)).toEqual([null, null, null, null]);

    rerender({ currentStreams: streams, currentPowerOverride: powerOverride });

    expect(result.current.selectionContext.powerOverride).toEqual({
      source: "virtualPowerOverride",
      time: [0, 1, 2, 3],
    });
    expect(result.current.streamSensorSummary).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      powerSource: "virtualPowerOverride",
      averagePower: 250,
      maxPower: 400,
      averageHeartRate: 141.5,
      averageCadence: 81.5,
    });
    expect(result.current.displayedSummary).toMatchObject({ averagePower: 250, maxPower: 400 });
    expect(result.current.avgPowerValue).toBe(250);
    expect(result.current.normalizedPowerValue).toBeNull();
    expect(result.current.summaryStats?.overlays).toMatchObject({
      power: { avg: 250, max: 400 },
      hr: { avg: 141.5, max: 143 },
      cadence: { avg: 81.5, max: 83 },
    });
    expect(result.current.sampledData.map(({ heartRate, cadence, power }) => [heartRate, cadence, power]))
      .toEqual([[140, 80, 100], [141, 81, 200], [142, 82, 300], [143, 83, 400]]);
    expect(result.current.availableOverlays.map(({ key }) => key)).toEqual(expect.arrayContaining(["power", "hr", "cadence"]));
    expect(result.current.analysisProjection).toMatchObject({
      streams: { heartrate: [140, 141, 142, 143], cadence: [80, 81, 82, 83], watts: powerOverride.values },
      power: { values: powerOverride.values, time: powerOverride.time, complete: true },
    });
    expect(result.current.hasStreamPowerCandidate).toBe(true);
    expect(result.current.hasAnalysisStreams).toBe(true);

    rerender({ currentStreams: streams, currentPowerOverride: null });
    expect(result.current.streamSensorSummary).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      powerSource: null,
    });
    expect(result.current.sampledData.map(({ power }) => power)).toEqual([null, null, null, null]);
  });

  it("rejects an override during render when activity identity or source revision changes", () => {
    const streamsA = {
      time: [0, 1, 2, 3],
      distance: [0, 10, 20, 30],
      velocity_smooth: [5, 5, 5, 5],
      altitude: [10, 11, 12, 13],
      watts: [10, 20, 30, 40],
    } as ActivityStreams;
    const streamsB = { ...streamsA, velocity_smooth: [6, 6, 6, 6], watts: [50, 60, 70, 80] };
    const override: ActivityPowerOverride = {
      source: "virtualPowerOverride",
      activityId: "activity-a",
      sourceFingerprint: buildActivityPowerSourceFingerprint(streamsA)!,
      params: { riderWeightKg: 70, bikeWeightKg: 9, rollingResistance: 0.005, cdA: 0.32 },
      values: [100, 200, 300, 400],
      time: [0, 1, 2, 3],
    };
    const activityA = { ...activity, id: "activity-a" } as Activity;
    const activityB = { ...activity, id: "activity-b" } as Activity;
    const { result, rerender } = renderHook(
      ({ activityId, currentActivity, currentStreams }) => useActivitySensorDetail({
        activityId,
        activity: currentActivity,
        streams: currentStreams,
        powerOverride: override,
        hoverIndex: null,
        hoveredSegment: null,
      }),
      { initialProps: { activityId: "activity-a", currentActivity: activityA, currentStreams: streamsA } },
    );

    expect(result.current.activePowerOverride).toBe(override);
    expect(result.current.avgPowerValue).toBe(250);
    rerender({ activityId: "activity-b", currentActivity: activityB, currentStreams: streamsA });
    expect(result.current.activePowerOverride).toBeNull();
    expect(result.current.avgPowerValue).toBe(25);
    expect(result.current.analysisProjection?.streams.watts).toEqual(streamsA.watts);
    rerender({ activityId: "activity-a", currentActivity: activityA, currentStreams: streamsB });
    expect(result.current.activePowerOverride).toBeNull();
    expect(result.current.avgPowerValue).toBe(65);
    expect(result.current.analysisProjection?.streams.watts).toEqual(streamsB.watts);
  });

  it("keeps sparse explicit channels out of summary, chart, analysis, and share inputs", () => {
    const streams = {
      time: [0, 1, 2, 3],
      distance: [0, 10, 20, 30],
      watts: [250, 250, 250, 250],
      heartrate: [150, 150, 150, 150],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: activity.startTime,
        time: [0, 1, 2, 3],
        watts: [200, null, null, null],
        heartrate: [145, null, null, null],
      },
    } as unknown as ActivityStreams;
    const { result } = renderSensorDetail(streams);

    expect(result.current.streamSensorSummary).toMatchObject({
      averagePower: null,
      averageHeartRate: null,
      hasRejectedPowerStream: true,
      hasRejectedHeartRateStream: true,
    });
    expect(result.current.displayedSummary).toMatchObject({
      averagePower: null,
      maxPower: null,
      averageHeartRate: null,
      maxHeartRate: null,
    });
    expect(result.current.analysisProjection).toMatchObject({
      streams: { watts: undefined, heartrate: undefined },
      power: undefined,
      heartRate: undefined,
    });
    expect(result.current.availableOverlays.map(({ key }) => key))
      .not.toEqual(expect.arrayContaining(["power", "hr"]));
    expect(result.current.hasStreamPowerCandidate).toBe(true);
    expect(result.current.hasStreamHeartRateCandidate).toBe(true);
  });

  it("clears stale stored HR and cadence when legacy candidates fail temporal coverage", () => {
    const streams = {
      time: [0, 1, 2, 3],
      distance: [0, 10, 20, 30],
      heartrate: [0, 150, 151, 0],
      cadence: [0, 85, 86, 0],
    } as unknown as ActivityStreams;
    const { result } = renderSensorDetail(streams);

    expect(result.current.streamSensorSummary).toMatchObject({
      hasRejectedHeartRateStream: true,
      hasRejectedCadenceStream: true,
      averageHeartRate: null,
      averageCadence: null,
    });
    expect(result.current.displayedSummary).toMatchObject({
      averageHeartRate: null,
      maxHeartRate: null,
      averageCadence: null,
      maxCadence: null,
    });
    expect(result.current.analysisProjection?.streams).toMatchObject({
      heartrate: undefined,
      cadence: undefined,
    });
    expect(result.current.hasStreamHeartRateCandidate).toBe(true);
    expect(result.current.hasStreamCadenceCandidate).toBe(true);
  });
});
