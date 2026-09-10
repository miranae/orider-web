import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { collection, getDoc, onSnapshot } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import type { Activity, ActivityStreams } from "@shared/types";
import { setDocData } from "../__tests__/mocks/firebase";
import AnalysisTab from "../components/AnalysisTab";
import { useActivityAnalysisModel } from "./useActivityAnalysisModel";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner" } as { uid: string } | null,
  getStreams: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("./useStrava", () => ({
  useStrava: () => ({ getStreams: mocks.getStreams }),
}));

vi.mock("./useFitnessTimeseries", () => ({
  useFitnessTimeseries: () => ({ timeseries: null }),
}));

vi.mock("../contexts/LocaleContext", () => ({
  useLocale: () => ({ units: "metric", locale: "ko-KR" }),
}));

vi.mock("../components/ZoneDistributionChart", () => ({ default: () => null }));
vi.mock("../components/PowerCurveChart", () => ({ default: () => null }));

vi.mock("./useActiveBikeProfile", () => ({
  useActiveBikeProfile: () => ({ active: null }),
}));

function makeActivity(id: string, userId = "owner"): Activity {
  return {
    id,
    userId,
    nickname: "Rider",
    profileImage: null,
    type: "Ride",
    createdAt: 1_700_000_000_000,
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_004_000,
    summary: {
      distance: 30,
      ridingTimeMillis: 4_000,
      elapsedTimeMillis: 4_000,
      averageSpeed: 27,
      maxSpeed: 35,
      averageCadence: 80,
      maxCadence: 100,
      averageHeartRate: 140,
      maxHeartRate: 160,
      averagePower: 175,
      maxPower: 300,
      normalizedPower: 190,
      elevationGain: 10,
      calories: 100,
      relativeEffort: 20,
      tss: 30,
      swolf: null,
    },
    thumbnailTrack: "",
    groupId: null,
    groupRideId: null,
    photoCount: 0,
    kudosCount: 0,
    commentCount: 0,
    segmentEffortCount: 0,
    description: "Morning Ride",
    visibility: "everyone",
    gpxPath: null,
    source: "orider",
  };
}

const streams: ActivityStreams = {
  userId: "owner",
  time: [0, 1, 2, 3],
  distance: [0, 10, 20, 30],
  altitude: [10, 11, 12, 13],
  velocity_smooth: [5, 6, 7, 8],
  watts: [100, 200, 300, 400],
  heartrate: [130, 140, 150, 160],
  cadence: [70, 80, 90, 100],
};

function seedActivity(activity: Activity, activityStreams: ActivityStreams = streams) {
  setDocData(`activities/${activity.id}`, activity as unknown as Record<string, unknown>);
  setDocData(`activity_streams/${activity.id}`, {
    userId: activity.userId,
    json: JSON.stringify(activityStreams),
  });
}

describe("useActivityAnalysisModel", () => {
  beforeEach(() => {
    mocks.user = { uid: "owner" };
    mocks.getStreams.mockReset();
    vi.mocked(getDoc).mockClear();
    vi.mocked(onSnapshot).mockClear();
    vi.mocked(collection).mockClear();
  });

  it("loads an owner activity and inline streams into complete AnalysisTab props", async () => {
    const activity = makeActivity("orider_owner");
    seedActivity(activity);
    setDocData("activity_metrics/orider_owner", {
      // version 없는 문서는 이제 stale 로 격하된다 (#2237) — 정상 경로 테스트라 현재 버전을 심는다.
      version: ACTIVITY_METRICS_VERSION,
      movingTimeSec: 3,
      pauseTimeSec: 1,
    });

    const { result } = renderHook(() => useActivityAnalysisModel(activity.id));

    await waitFor(() => expect(result.current.loadingActivity).toBe(false));
    await waitFor(() => expect(result.current.streams).not.toBeNull());

    expect(result.current.activity?.id).toBe(activity.id);
    expect(result.current.isActivityOwner).toBe(true);
    expect(result.current.serverMetrics.status).toBe("ready");
    expect(result.current.streamSensorSummary?.averagePower).toBe(250);
    expect(result.current.displayedSummary?.averagePower).toBe(250);
    expect(result.current.avgPowerValue).toBe(250);
    expect(result.current.normalizedPowerValue).toBeNull();
    expect(result.current.hasAnalysisStreams).toBe(true);
    expect(result.current.analysisTabProps).toMatchObject({
      activityId: activity.id,
      isOwner: true,
      startTime: activity.startTime,
      sport: "ride",
      hasStreamPowerCandidate: true,
      hasStreamHeartRateCandidate: true,
      hasStreamCadenceCandidate: true,
      summary: {
        averagePower: 250,
        movingTimeSec: 3,
        pauseTimeSec: 1,
      },
    });
    expect(result.current.analysisTabProps?.streams.watts).toEqual(streams.watts);
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ path: `activity_metrics/${activity.id}` }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("keeps production-shaped pause-gapped HR in the analysis model without rewriting moving time", async () => {
    const sampleCount = 9_388;
    const pauseGaps = new Map([
      [1_000, 1_000],
      [3_000, 1_000],
      [5_000, 1_000],
      [7_000, 1_000],
      [9_000, 1_815],
    ]);
    let elapsedSec = 0;
    const time = Array.from({ length: sampleCount }, (_, index) => {
      if (index > 0) elapsedSec += 1 + (pauseGaps.get(index) ?? 0);
      return elapsedSec;
    });
    const heartrate = Array.from({ length: sampleCount }, (_, index) => 93 + index % 94);
    const activity = {
      ...makeActivity("strava_19949890213"),
      endTime: 1_700_015_203_000,
      summary: {
        ...makeActivity("strava_19949890213").summary,
        elapsedTimeMillis: undefined,
        ridingTimeMillis: 9_385_000,
      },
    } as Activity;
    seedActivity(activity, {
      userId: activity.userId,
      time,
      distance: time.map((_, index) => index * 5),
      altitude: time.map((_, index) => 10 + index % 100),
      heartrate,
    });

    const { result } = renderHook(() => useActivityAnalysisModel(activity.id));

    await waitFor(() => expect(result.current.loadingActivity).toBe(false));
    await waitFor(() => expect(result.current.streams).not.toBeNull());

    expect(time.at(-1)).toBe(15_202);
    expect(result.current.sensorSelectionContext).toMatchObject({
      legacyDurationSec: 9_385,
      explicitDurationSec: 15_203,
    });
    expect(result.current.streamSensorSummary).toMatchObject({
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
      heartRateSource: "heartrate",
    });
    expect(result.current.displayedSummary).toMatchObject({
      ridingTimeMillis: 9_385_000,
      averageHeartRate: result.current.streamSensorSummary?.averageHeartRate,
      maxHeartRate: 186,
    });
    expect(result.current.displayedSummary?.elapsedTimeMillis).toBeUndefined();
    expect(result.current.analysisProjection?.streams.heartrate).toHaveLength(sampleCount);
    expect(result.current.analysisTabProps?.streams.heartrate).toHaveLength(sampleCount);
    expect(result.current.hasStreamHeartRateCandidate).toBe(true);
    expect(result.current.hasAnalysisStreams).toBe(true);
  });

  it("reads the public metrics projection for another rider and never subscribes to social or photo data", async () => {
    mocks.user = { uid: "viewer" };
    const activity = makeActivity("orider_public", "owner");
    seedActivity(activity);

    const { result } = renderHook(() => useActivityAnalysisModel(activity.id));

    await waitFor(() => expect(result.current.loadingActivity).toBe(false));
    await waitFor(() => expect(result.current.streams).not.toBeNull());

    expect(result.current.isActivityOwner).toBe(false);
    // 공개 문서가 없으면 missing — 예전엔 여기서 구독 자체를 막아(`disabled`) 타인의 공개
    // 활동 분석이 영구히 빈 화면이었다.
    expect(result.current.serverMetrics.status).toBe("missing");
    expect(collection).not.toHaveBeenCalled();
    const subscribedPaths = vi.mocked(onSnapshot).mock.calls
      .map(([ref]) => (ref as { path?: string }).path ?? "");
    // owner-only 정본은 건드리지 않는다(rules 가 거부한다). 공개 projection 만 읽는다.
    expect(subscribedPaths).not.toContain(`activity_metrics/${activity.id}`);
    expect(subscribedPaths).toContain(`activity_metrics_public/${activity.id}`);
    expect(subscribedPaths).not.toEqual(expect.arrayContaining([
      expect.stringContaining("kudos"),
      expect.stringContaining("comments"),
      expect.stringContaining("activity_photos"),
    ]));
  });

  it("공개 비소유자의 승인된 현재 센서 평균만 AnalysisTab에 그리고 과거 서버 파생값은 숨긴다", async () => {
    mocks.user = { uid: "viewer" };
    const activity = makeActivity("orider_public_accepted", "owner");
    seedActivity(activity);
    setDocData(`activity_metrics_public/${activity.id}`, {
      version: ACTIVITY_METRICS_VERSION,
      np: 999,
      avgPower: 998,
      avgHr: 197,
      cyclingDynamics: {
        source: "records",
        sampleCount: 10,
        validSampleCount: 9,
        coverage: 0.9,
        balance: { leftAvgPct: 49, rightAvgPct: 51, asymmetryPct: 2 },
      },
      contextSnapshot: { ftp: 400 },
    });

    const { result } = renderHook(() => useActivityAnalysisModel(activity.id));
    await waitFor(() => expect(result.current.serverMetrics.status).toBe("ready"));
    await waitFor(() => expect(result.current.analysisTabProps).not.toBeNull());

    expect(result.current.serverMetrics.metrics).toMatchObject({ np: 999, avgPower: 998, avgHr: 197 });
    expect(result.current.serverMetrics.metrics?.contextSnapshot).toBeUndefined();
    expect(result.current.analysisTabProps).toMatchObject({
      isOwner: false,
      hasStreamPowerCandidate: true,
      hasStreamHeartRateCandidate: true,
      summary: { averagePower: 250, averageHeartRate: 145 },
    });

    render(<AnalysisTab {...result.current.analysisTabProps!} />);

    expect(screen.queryByTestId("analysis-missing")).not.toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("145")).toBeInTheDocument();
    expect(screen.queryByText("999")).not.toBeInTheDocument();
    expect(screen.queryByText("998")).not.toBeInTheDocument();
    expect(screen.queryByText("197")).not.toBeInTheDocument();
    expect(screen.queryByText("사이클링 다이내믹스")).not.toBeInTheDocument();
  });

  it("공개 비소유자의 거부된 파워·심박 후보는 AnalysisTab에서 과거 서버 지표로 되살아나지 않는다", async () => {
    mocks.user = { uid: "viewer" };
    const activity = makeActivity("orider_public_rejected", "owner");
    seedActivity(activity, {
      userId: activity.userId,
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
    } as unknown as ActivityStreams);
    setDocData(`activity_metrics_public/${activity.id}`, {
      version: ACTIVITY_METRICS_VERSION,
      np: 999,
      avgPower: 998,
      avgHr: 197,
      cyclingDynamics: {
        source: "records",
        sampleCount: 10,
        validSampleCount: 9,
        coverage: 0.9,
        balance: { leftAvgPct: 49, rightAvgPct: 51, asymmetryPct: 2 },
      },
    });

    const { result } = renderHook(() => useActivityAnalysisModel(activity.id));
    await waitFor(() => expect(result.current.serverMetrics.status).toBe("ready"));
    await waitFor(() => expect(result.current.analysisTabProps).not.toBeNull());

    expect(result.current.streamSensorSummary).toMatchObject({
      hasRejectedPowerStream: true,
      hasRejectedHeartRateStream: true,
      averagePower: null,
      averageHeartRate: null,
    });
    expect(result.current.analysisTabProps).toMatchObject({
      hasStreamPowerCandidate: true,
      hasStreamHeartRateCandidate: true,
      summary: { averagePower: null, averageHeartRate: null },
    });

    render(<AnalysisTab {...result.current.analysisTabProps!} />);

    expect(screen.queryByText("999")).not.toBeInTheDocument();
    expect(screen.queryByText("998")).not.toBeInTheDocument();
    expect(screen.queryByText("197")).not.toBeInTheDocument();
    expect(screen.queryByText("파워 분석")).not.toBeInTheDocument();
    expect(screen.queryByText("심박 분석")).not.toBeInTheDocument();
    expect(screen.queryByText("사이클링 다이내믹스")).not.toBeInTheDocument();
  });

  it("preserves processing state and retries the activity document after three seconds", async () => {
    vi.useFakeTimers();
    const activity = makeActivity("orider_processing");
    setDocData(`activities/${activity.id}`, { userId: activity.userId });
    const timerSpy = vi.spyOn(window, "setTimeout");

    try {
      const { result } = renderHook(() => useActivityAnalysisModel(activity.id));

      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.loadingActivity).toBe(false);
      expect(result.current.activityProcessing).toBe(true);
      expect(result.current.activity).toBeNull();
      expect(timerSpy).toHaveBeenCalledWith(expect.any(Function), 3000);

      seedActivity(activity);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(result.current.loadingActivity).toBe(false);
      expect(result.current.activityProcessing).toBe(false);
      expect(result.current.activity?.id).toBe(activity.id);
    } finally {
      timerSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
