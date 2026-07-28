import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, ActivityStreams } from "@shared/types";

import { useActivitySensorDetail } from "./useActivitySensorDetail";

const mocks = vi.hoisted(() => ({ logClientError: vi.fn() }));
vi.mock("../../../services/errorLogger", () => ({ logClientError: mocks.logClientError }));

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
  },
} as unknown as Activity;

function renderSensorDetail(streams: ActivityStreams) {
  return renderHook(
    ({ currentStreams }) => useActivitySensorDetail({
      activityId: activity.id,
      activity,
      streams: currentStreams,
      effectiveStreams: currentStreams,
      preferTopLevelPower: false,
      hoverIndex: 2,
      hoveredSegment: null,
    }),
    { initialProps: { currentStreams: streams } },
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

    rerender({ currentStreams: { ...streams } });

    expect(mocks.logClientError).toHaveBeenCalledTimes(1);
    expect(mocks.logClientError).toHaveBeenCalledWith(
      "ActivityPage.sensorStreamRejected.power.invalid_metadata",
      expect.any(Error),
      expect.objectContaining({ activityId: activity.id, reason: "invalid_metadata" }),
    );
  });
});
