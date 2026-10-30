import * as activityAcceptance from "../utils/estimateTSS";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useActivities, useWeeklyStats, useActivitySearch } from "./useActivities";
import { simulateLogin, simulateLogout, setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import { createMockActivity as baseMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import { ToastProvider } from "../contexts/ToastContext";
import React from "react";
import * as publicProfiles from "../services/publicProfiles";
import * as errorLogger from "../services/errorLogger";
import { getDocs, getCountFromServer, query, onSnapshot, orderBy, where, limit, startAfter } from "firebase/firestore";
import {
  __resetFirestoreSessionRecoveryForTests,
  FIRESTORE_B815_RECOVERY_SESSION_KEY,
  noteFirestoreServerSuccess,
  prepareFirestoreSessionRecovery,
} from "../utils/firestoreSessionRecovery";

// 과거 날짜 fixture가 실행 시각까지 이어지는 잘못된 구간을 만들지 않게 고정한다.
const createMockActivity: typeof baseMockActivity = (overrides) => {
  const activity = baseMockActivity(overrides);
  if (overrides?.startTime !== undefined && overrides.endTime === undefined) {
    const duration = activity.summary?.ridingTimeMillis;
    activity.endTime = activity.startTime + (Number.isFinite(duration) && duration > 0 ? duration : 1800000);
  }
  return activity;
};

const firestoreRecoveryMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("../utils/firestoreSessionRecovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/firestoreSessionRecovery")>();
  return {
    ...actual,
    executeFirestoreSessionRecovery: firestoreRecoveryMocks.execute,
    noteFirestoreServerSuccess: vi.fn(actual.noteFirestoreServerSuccess),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    MemoryRouter,
    null,
    React.createElement(
      AuthProvider,
      null,
      React.createElement(ToastProvider, null, children),
    ),
  );
}

function strictWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(React.StrictMode, null, wrapper({ children }));
}

describe("useWeeklyStats", () => {
  it("disabled weekly statistics do not read and reenable for the current owner", async () => {
    simulateLogin({ uid: "user-1" });
    const now = new Date(2026, 9, 7, 15, 45);
    setCollectionDocs("activities", [createMockActivity({ id: "old-owner", userId: "user-1", startTime: now.getTime() - 1000, summary: createMockSummary({ distance: 12000 }) })]);
    const get = vi.mocked(getDocs);
    get.mockClear();
    const { result, rerender } = renderHook(({ enabled }) => useWeeklyStats({ now, enabled }), { wrapper, initialProps: { enabled: false } });
    expect(get).not.toHaveBeenCalled();
    expect(result.current.recent7DayCoverage).toBe("unavailable");
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.recent7DayCoverage).toBe("ready"));
    expect(result.current.thisWeek.distance).toBe(12000);
    rerender({ enabled: false });
    expect(result.current.thisWeek.distance).toBe(0);
    act(() => simulateLogin({ uid: "user-2" }));
    setCollectionDocs("activities", []);
    rerender({ enabled: true });
    expect(result.current.thisWeek.distance).toBe(0);
    await waitFor(() => expect(result.current.recent7DayCoverage).toBe("ready"));
    expect(result.current.thisWeek.distance).toBe(0);
  });
  it("주간 근거는 전체 원본의 중복과 비훈련 종목을 구분하고 선택된 대표 부하만 계산한다", async () => {
    simulateLogin({ uid: "user-1" });
    const now = new Date(2026, 9, 7, 15, 45);
    const startTime = new Date(2026, 9, 6, 10).getTime();
    setCollectionDocs("activities", [
      createMockActivity({ id: "native", userId: "user-1", source: "orider", localSessionId: "same-session", startTime,
        summary: createMockSummary({ tss: 70 }) }),
      createMockActivity({ id: "strava-twin", userId: "user-1", source: "strava", localSessionId: "same-session", startTime: startTime + 1000,
        summary: createMockSummary({ tss: 70 }) }),
      createMockActivity({ id: "unsupported", userId: "user-1", type: "WeightTraining", startTime: startTime + 7200000,
        summary: createMockSummary({ tss: 30 }) }),
    ]);
    const { result } = renderHook(() => useWeeklyStats({ now }), { wrapper });
    await waitFor(() => expect(result.current.coverage).toBe("ready"));
    expect(result.current.weeklyStats.at(-1)).toMatchObject({ tss: 70, loadEvidence: {
      rawCount: 3, acceptedCount: 1, duplicateCount: 1, unsupportedOrDeletedCount: 1,
    } });
  });
  it.each([undefined, "bike", "swim"] as const)("주간 %s 범위는 로컬 월요일 00:00부터 포함하고 근거 기간과 일치한다", async discipline => {
    simulateLogin({ uid: "user-1" });
    const now = new Date(2026, 9, 7, 15, 45);
    const monday = new Date(2026, 9, 5, 0, 0, 0, 0).getTime();
    const type = discipline === "swim" ? "Swim" : "Ride";
    setCollectionDocs("activities", [
      createMockActivity({ id: "before-midnight", userId: "user-1", type, startTime: monday - 1, endTime: monday,
        summary: createMockSummary({ tss: 20 }) }),
      createMockActivity({ id: "monday-midnight", userId: "user-1", type, startTime: monday, endTime: monday + 3600000,
        summary: createMockSummary({ tss: 40 }) }),
      createMockActivity({ id: "monday-morning", userId: "user-1", type, startTime: monday + 8 * 3600000, endTime: monday + 9 * 3600000,
        summary: createMockSummary({ tss: 60 }) }),
    ]);
    const { result } = renderHook(() => useWeeklyStats({ now, discipline }), { wrapper });
    await waitFor(() => expect(result.current.coverage).toBe("ready"));
    expect(result.current.weeklyStats.at(-1)).toMatchObject({ rides: 2, tss: 100, loadEvidence: {
      total: 100, periodStartMs: monday, periodEndMs: new Date(2026, 9, 12).getTime(),
      coverage: "ready", scope: discipline ?? "allSupported", rawCount: 2, acceptedCount: 2,
      storedTotal: 100, estimatedTotal: 0, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    } });
    expect(result.current.weeklyStats.at(-2)).toMatchObject({ rides: 1, tss: 20 });
  });
  it("같은 원본의 재렌더링은 대표를 다시 고르지 않고 주별 부하는 재중복 판정하지 않는다", async () => {
    const now = new Date(2026, 9, 6, 12);
    simulateLogin({uid: "user-1"});
    setCollectionDocs("activities", [{id: "memo-weekly", ...createMockActivity({id: "memo-weekly", userId: "user-1", startTime: now.getTime() - 3600000,
      summary: createMockSummary({distance: 3000, tss: 70})})}]);
    const representatives = vi.spyOn(activityAcceptance, "acceptedPhysicalActivities");
    const regroupedTss = vi.spyOn(activityAcceptance, "sumActivityTss");
    try {
      const {result, rerender} = renderHook(() => useWeeklyStats(now), {wrapper});
      await waitFor(() => expect(result.current.coverage).toBe("ready"));
      expect(result.current.weeklyStats.reduce((sum, week) => sum + (week.tss ?? 0), 0)).toBe(70);
      const calls = representatives.mock.calls.length;
      rerender();
      rerender();
      expect(representatives.mock.calls.length).toBe(calls);
      expect(regroupedTss).not.toHaveBeenCalled();
    } finally { representatives.mockRestore(); regroupedTss.mockRestore(); }
  });
  it.each(["bike", "swim"] as const)("filters %s 7-day totals without changing all-sport history and mobile breakdown", async (discipline) => {
    const now = new Date(2026, 9, 6, 12);
    simulateLogin({ uid: "user-1" });
    setCollectionDocs("activities", [
      { id: "ride", ...createMockActivity({ id: "ride", userId: "user-1", type: "Ride", startTime: now.getTime() - 3600000, summary: createMockSummary({ distance: 22700, ridingTimeMillis: 6600000, elevationGain: 40 }) }) },
      { id: "run-1", ...createMockActivity({ id: "run-1", userId: "user-1", type: "Run", startTime: now.getTime() - 7200000, summary: createMockSummary({ distance: 5000 }) }) },
      { id: "run-2", ...createMockActivity({ id: "run-2", userId: "user-1", type: "Run", startTime: now.getTime() - 10800000, summary: createMockSummary({ distance: 7000 }) }) },
      { id: "swim", ...createMockActivity({ id: "swim", userId: "user-1", type: "Swim", startTime: now.getTime() - 14400000, summary: createMockSummary({ distance: 1500 }) }) },
    ]);
    const { result } = renderHook(() => useWeeklyStats({ now, includeMonthlyDistance: true, recent7DayDiscipline: discipline }), { wrapper });
    await waitFor(() => expect(result.current.recent7DayCoverage).toBe("ready"));
    expect(result.current.thisWeek).toMatchObject(discipline === "bike"
      ? { rides: 1, distance: 22700, time: 6600000, elevation: 40 }
      : { rides: 1, distance: 1500 });
    expect(result.current.monthlyActivityDistance).toBe(36200);
    expect(result.current.recent7DayCount).toBe(4);
    expect(result.current.recent7DayDistances).toEqual({ bike: 22700, run: 12000, swim: 1500 });
  });
  it.each([
    { fromCache: true, hasPendingWrites: false },
    { fromCache: false, hasPendingWrites: true },
  ])("does not certify an incomplete running read as a full 7-day total: %j", async (metadata) => {
    const now = new Date(2026, 6, 14, 12);
    const mockedGetDocs = vi.mocked(getDocs);
    const original = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockReset();
    mockedGetDocs.mockResolvedValueOnce({ docs: [{ id: "run", data: () => createMockActivity({ id: "run", userId: "user-1", type: "Run", startTime: now.getTime() - 3600000 }) }], size: 1, metadata } as never);
    try {
      simulateLogin({ uid: "user-1" });
      const { result } = renderHook(() => useWeeklyStats({ now, discipline: "run" }), { wrapper });
      await waitFor(() => expect(result.current.coverage).toBe("partial"));
      expect(result.current.recent7DayCoverage).toBe("partial");
    } finally {
      mockedGetDocs.mockReset();
      if (original) mockedGetDocs.mockImplementation(original);
    }
  });
  it("uses only the run-axis activities for running KPIs while keeping the mobile sport breakdown complete", async () => {
    const now = new Date(2026, 6, 14, 12);
    simulateLogin({ uid: "user-1" });
    setCollectionDocs("activities", [
      { id: "ride", ...createMockActivity({ id: "ride", userId: "user-1", type: "Ride", startTime: now.getTime() - 3600000, summary: createMockSummary({ distance: 25000, ridingTimeMillis: 3600000, elevationGain: 200 }) }) },
      { id: "run", ...createMockActivity({ id: "run", userId: "user-1", type: "Run", startTime: now.getTime() - 7200000, summary: createMockSummary({ distance: 10000, ridingTimeMillis: 3300000, elevationGain: 40 }) }) },
      { id: "walk", ...createMockActivity({ id: "walk", userId: "user-1", type: "Walk", startTime: now.getTime() - 10800000, summary: createMockSummary({ distance: 2000, ridingTimeMillis: 1800000, elevationGain: 10 }) }) },
    ]);
    const { result } = renderHook(() => useWeeklyStats({ now, includeMonthlyDistance: true, discipline: "run" }), { wrapper });
    await waitFor(() => expect(result.current.coverage).not.toBe("loading"));
    expect(result.current.coverage).toBe("ready");
    expect(result.current.thisWeek).toEqual({ rides: 2, distance: 12000, time: 5100000, elevation: 50 });
    expect(result.current.monthlyActivityDistance).toBe(12000);
    expect(result.current.recent7DayCount).toBe(3);
    expect(result.current.recent7DayDistances).toMatchObject({ bike: 25000, run: 12000 });
  });
  it("places run-week activity at the Monday 00:00 KST boundary", async () => {
    const now = new Date("2026-07-12T15:30:00Z");
    simulateLogin({ uid: "user-1" });
    setCollectionDocs("activities", [
      { id: "before", ...createMockActivity({ id: "before", userId: "user-1", type: "Run", startTime: Date.parse("2026-07-12T14:30:00Z"), endTime: Date.parse("2026-07-12T14:45:00Z") }) },
      { id: "after", ...createMockActivity({ id: "after", userId: "user-1", type: "Run", startTime: Date.parse("2026-07-12T15:15:00Z") }) },
    ]);
    const { result } = renderHook(() => useWeeklyStats({ now, discipline: "run" }), { wrapper });
    await waitFor(() => expect(result.current.coverage).not.toBe("loading"));
    expect(result.current.coverage).toBe("ready");
    expect(result.current.weeklyStats.at(-1)).toMatchObject({ week: "7/13", rides: 1 });
    expect(result.current.weeklyStats.at(-2)).toMatchObject({ week: "7/6", rides: 1 });
  });
  it("거리 통계에서 제외된 Health도 같은 주의 훈련 부하에는 남긴다", async () => {
    simulateLogin({uid: "user-1"});
    const now = new Date(2026, 8, 8, 12);
    setCollectionDocs("activities", [{id: "health-load", userId: "user-1", source: "apple_health", statsCountable: false,
      type: "Ride", startTime: now.getTime() - 3600000, summary: {distance: 10000, tss: 30, ridingTimeMillis: 3600000}}]);
    const {result} = renderHook(() => useWeeklyStats(now), {wrapper});
    await waitFor(() => expect(result.current.weeklyStats.at(-1)?.tss).toBe(30));
    expect(result.current.weeklyStats.at(-1)).toMatchObject({rides: 0, distance: 0, tss: 30});
  });
  it.each([null, undefined])("summary %s 복구 대기 기록을 원본 수와 미확인 부하에 포함한다", async summary => {
    simulateLogin({ uid: "user-1" });
    const now = new Date(2026, 8, 8, 12);
    setCollectionDocs("activities", [
      { id: "known", userId: "user-1", type: "Ride", startTime: now.getTime() - 3600000,
        summary: { tss: 100, distance: 20000, ridingTimeMillis: 3600000, elevationGain: 100 } },
      { id: "recovering", userId: "user-1", type: "Ride", startTime: now.getTime() - 1800000,
        summary, invalidSummaryRecoveryState: "pending", deletedAt: null },
    ]);
    const { result } = renderHook(() => useWeeklyStats({ now, includeMonthlyDistance: true }), { wrapper });
    await waitFor(() => expect(result.current.weeklyStats.at(-1)?.rides).toBe(2));
    expect(result.current.weeklyStats.at(-1)).toMatchObject({ tss: 100, tssEstimated: false, tssUnknownCount: 1,
      distance: 20, time: 1, elevation: 100 });
    expect(result.current.thisWeek).toEqual({ rides: 2, distance: 20000, time: 3600000, elevation: 100 });
    expect(result.current.monthlyActivityDistance).toBe(20000);
  });
  it.each([
    [100, { tss: 100, ridingTimeMillis: 3600000 }, false],
    [0, { tss: 0, ridingTimeMillis: 0 }, false],
    [null, null, false],
    [42, { ridingTimeMillis: 3600000 }, true],
  ])("주간 부하 %s와 미확인 활동의 coverage/추정 상태를 분리한다", async (expected, summary, estimated) => {
    simulateLogin({ uid: "user-1" });
    const now = new Date(2026, 8, 7, 12);
    const docs = [{ id: "unknown", userId: "user-1", type: "Ride", startTime: now.getTime() + 3 * 3600000, summary: {} }];
    if (summary) docs.push({ id: "known", userId: "user-1", type: "Ride", startTime: now.getTime() + 3600000, summary });
    setCollectionDocs("activities", docs);
    const { result } = renderHook(() => useWeeklyStats(now), { wrapper });
    await waitFor(() => expect(result.current.weeklyStats.at(-1)?.rides).toBe(docs.length));
    expect(result.current.weeklyStats.at(-1)).toMatchObject({ tss: expected, tssEstimated: estimated, tssUnknownCount: 1 });
  });

  it("주 경계의 연동 기록은 전체 입력 대표 날짜에만 모든 지표를 배분한다", async () => {
    simulateLogin({ uid: "user-1" });
    const boundary = new Date(2026, 9, 5, 0, 0, 0);
    const nativeStart = boundary.getTime() - 15000;
    const stravaStart = boundary.getTime() + 15000;
    setCollectionDocs("activities", [
      createMockActivity({ id: "native", userId: "user-1", source: "orider", startTime: nativeStart,
        endTime: nativeStart + 3600000, summary: createMockSummary({ tss: 100, ridingTimeMillis: 3600000 }) }),
      createMockActivity({ id: "strava_1", userId: "user-1", source: "strava", startTime: stravaStart,
        endTime: stravaStart + 3600000, summary: createMockSummary({ tss: 100, ridingTimeMillis: 3600000 }) }),
    ]);
    const { result } = renderHook(() => useWeeklyStats(boundary), { wrapper });
    await waitFor(() => expect(result.current.weeklyStats.at(-1)?.rides).toBe(1));
    expect(result.current.weeklyStats.at(-2)?.rides).toBe(0);
    expect(result.current.weeklyStats.at(-2)?.tss).toBeNull();
    expect(result.current.weeklyStats.at(-1)?.tss).toBe(100);
    expect(result.current.weeklyStats.reduce((total, row) => total + (row.tss ?? 0), 0)).toBe(100);
  });

  it("returns empty stats for guest", async () => {
    const { result } = renderHook(() => useWeeklyStats(), { wrapper });
    expect(result.current.thisWeek.rides).toBe(0);
    expect(result.current.weeklyStats).toEqual([]);
  });

  it("keeps Sunday activities in the current Monday-start week bucket", async () => {
    simulateLogin({ uid: "user-1" });
    setCollectionDocs("activities", [
      {
        id: "sunday-ride",
        ...createMockActivity({
          id: "sunday-ride",
          userId: "user-1",
          startTime: new Date(2026, 6, 5, 10, 0, 0).getTime(),
          summary: createMockSummary({ distance: 42_000 }),
        }),
      },
    ]);

    const { result } = renderHook(() => useWeeklyStats(new Date(2026, 6, 5, 12, 0, 0)), { wrapper });

    await waitFor(() => {
      expect(result.current.weeklyStats.at(-1)?.rides).toBe(1);
    });
    expect(result.current.weeklyStats.at(-1)?.week).toBe("6/29");
  });

  it("aggregates only the signed-in user's bike, run, and swim distances from the recent 7 days", async () => {
    const now = new Date(2026, 6, 14, 12, 0, 0);
    simulateLogin({ uid: "user-1" });
    setCollectionDocs("activities", [
      {
        id: "recent-bike",
        ...createMockActivity({
          id: "recent-bike",
          userId: "user-1",
          type: "Ride",
          startTime: now.getTime() - 86400000,
          summary: createMockSummary({ distance: 12_400 }),
        }),
      },
      {
        id: "recent-run",
        ...createMockActivity({
          id: "recent-run",
          userId: "user-1",
          type: "Run",
          startTime: now.getTime() - 6 * 86400000,
          summary: createMockSummary({ distance: 5_600 }),
        }),
      },
      {
        id: "recent-swim",
        ...createMockActivity({
          id: "recent-swim",
          userId: "user-1",
          type: "Swim",
          startTime: now.getTime() - 2 * 86400000,
          summary: createMockSummary({ distance: 1_450 }),
        }),
      },
      {
        id: "old-own-ride",
        ...createMockActivity({
          id: "old-own-ride",
          userId: "user-1",
          type: "Ride",
          startTime: now.getTime() - 8 * 86400000,
          summary: createMockSummary({ distance: 99_000 }),
        }),
      },
      {
        id: "public-other-ride",
        ...createMockActivity({
          id: "public-other-ride",
          userId: "other-user",
          type: "Ride",
          startTime: now.getTime() - 86400000,
          summary: createMockSummary({ distance: 88_000 }),
        }),
      },
    ]);

    const { result } = renderHook(() => useWeeklyStats(now), { wrapper });

    await waitFor(() => expect(result.current.thisWeek.rides).toBe(3));
    expect(result.current.thisWeek.distance).toBe(19_450);
    expect(result.current.recent7DayDistances).toEqual({
      bike: 12_400,
      run: 5_600,
      swim: 1_450,
    });
  });

  it("derives the monthly distance from the complete 12-week response without another query", async () => {
    const now = new Date(2026, 6, 14, 12, 0, 0);
    simulateLogin({ uid: "user-1" });
    setCollectionDocs("activities", [
      {
        id: "july-ride",
        ...createMockActivity({
          id: "july-ride",
          userId: "user-1",
          startTime: new Date(2026, 6, 10, 8, 0, 0).getTime(),
          summary: createMockSummary({ distance: 31_000 }),
        }),
      },
      {
        id: "june-ride",
        ...createMockActivity({
          id: "june-ride",
          userId: "user-1",
          startTime: new Date(2026, 5, 30, 8, 0, 0).getTime(),
          summary: createMockSummary({ distance: 99_000 }),
        }),
      },
    ]);
    vi.mocked(getDocs).mockClear();

    const { result } = renderHook(() => useWeeklyStats({ now, includeMonthlyDistance: true }), { wrapper });

    await waitFor(() => expect(result.current.monthlyActivityDistance).toBe(31_000));
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it("falls back to the exact monthly query when the 12-week response reaches its limit", async () => {
    const now = new Date(2026, 6, 14, 12, 0, 0);
    const cappedDocs = Array.from({ length: 200 }, (_, index) => ({
      id: `capped-${index}`,
      data: () => createMockActivity({
        id: `capped-${index}`,
        userId: "user-1",
        startTime: new Date(2026, 5, 20, 8, 0, 0).getTime(),
      }),
    }));
    const monthlyDocs = [{
      id: "monthly-full-result",
      data: () => createMockActivity({
        id: "monthly-full-result",
        userId: "user-1",
        startTime: new Date(2026, 6, 10, 8, 0, 0).getTime(),
        summary: createMockSummary({ distance: 42_000 }),
      }),
    }];
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockReset();
    mockedGetDocs
      .mockResolvedValueOnce({ docs: cappedDocs } as never)
      .mockResolvedValueOnce({ docs: monthlyDocs } as never);

    try {
      simulateLogin({ uid: "user-1" });
      const { result } = renderHook(() => useWeeklyStats({ now, includeMonthlyDistance: true }), { wrapper });

      await waitFor(() => expect(result.current.monthlyActivityDistance).toBe(42_000));
      expect(result.current.coverage).toBe("partial");
      expect(mockedGetDocs).toHaveBeenCalledTimes(2);
    } finally {
      mockedGetDocs.mockReset();
      if (defaultImplementation) mockedGetDocs.mockImplementation(defaultImplementation);
    }
  });

  it("월간 capped 조회는 월 경계 밖의 Strava 대표까지 읽어 월초 ORider를 중복 집계하지 않는다", async () => {
    const now = new Date(2026, 9, 31, 12);
    const monthStart = new Date(2026, 9, 1).getTime();
    const monthEnd = new Date(2026, 10, 1).getTime();
    const day = 86400000;
    const cappedDocs = Array.from({ length: 200 }, (_, index) => ({
      id: `capped-${index}`,
      data: () => createMockActivity({ id: `capped-${index}`, userId: "user-1", source: "orider",
        startTime: monthStart + 19 * day, summary: createMockSummary({ distance: 1000, ridingTimeMillis: 3600000 }) }),
    }));
    const native = createMockActivity({ id: "month-start-native", userId: "user-1", source: "orider",
      startTime: monthStart + 15000, summary: createMockSummary({ distance: 10000, ridingTimeMillis: 3600000 }) });
    const strava = createMockActivity({ id: "previous-month-strava", userId: "user-1", source: "strava",
      startTime: monthStart - 15000, summary: createMockSummary({ distance: 9000, ridingTimeMillis: 3600000 }) });
    const separate = createMockActivity({ id: "separate", userId: "user-1", source: "orider",
      startTime: monthStart + 9 * day, summary: createMockSummary({ distance: 5000, ridingTimeMillis: 3600000 }) });
    const mockedGetDocs = vi.mocked(getDocs);
    const original = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockReset();
    mockedGetDocs.mockResolvedValueOnce({ docs: cappedDocs } as never).mockImplementationOnce(async () => {
      // Firestore 조회 범위를 실제로 적용하여 경계 후보를 읽지 않는 회귀를 재현한다.
      const constraints = vi.mocked(query).mock.calls.at(-1)!.slice(1) as unknown as { type: string; args: unknown[] }[];
      const lower = constraints.find((constraint) => constraint.type === "where" && constraint.args[0] === "startTime" && constraint.args[1] === ">=")!.args[2] as number;
      const upper = constraints.find((constraint) => constraint.type === "where" && constraint.args[0] === "startTime" && constraint.args[1] === "<")!.args[2] as number;
      return { docs: [native, strava, separate].filter((activity) => activity.startTime >= lower && activity.startTime < upper)
        .map((activity) => ({ id: activity.id, data: () => activity })) } as never;
    });
    try {
      simulateLogin({ uid: "user-1" });
      vi.mocked(where).mockClear();
      const { result } = renderHook(() => useWeeklyStats({ now, includeMonthlyDistance: true }), { wrapper });
      // 200개 응답의 정상 실주행 1km + 독립 활동 5km. 월초 ORider는 전월 Strava의 쌍둥이다.
      await waitFor(() => expect(result.current.monthlyActivityDistance).toBe(6000));
      expect(where).toHaveBeenCalledWith("startTime", ">=", monthStart - day);
      expect(where).toHaveBeenCalledWith("startTime", "<", monthEnd + day);
      expect(getDocs).toHaveBeenCalledTimes(2);
    } finally {
      mockedGetDocs.mockReset();
      if (original) mockedGetDocs.mockImplementation(original);
    }
  });

  it("reads all recent rides when the 200-document chart cap falls within seven days", async () => {
    const now = new Date(2026, 6, 14, 12, 0, 0);
    const cappedDocs = Array.from({ length: 200 }, (_, index) => ({
      id: `weekly-only-${index}`,
      data: () => createMockActivity({
        id: `weekly-only-${index}`,
        userId: "user-1",
        startTime: now.getTime() - 86400000,
      }),
    }));
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockReset();
    const extraDoc = {
      id: "weekly-extra",
      data: () => createMockActivity({
        id: "weekly-extra",
        userId: "user-1",
        startTime: now.getTime() - 86400000,
        summary: createMockSummary({ distance: 22_700 }),
      }),
    };
    mockedGetDocs
      .mockResolvedValueOnce({ docs: cappedDocs } as never)
      .mockResolvedValueOnce({ docs: [...cappedDocs, extraDoc], metadata: { fromCache: false, hasPendingWrites: false } } as never);

    try {
      simulateLogin({ uid: "user-1" });
      vi.mocked(where).mockClear();
      vi.mocked(orderBy).mockClear();
      const { result } = renderHook(() => useWeeklyStats(now), { wrapper });

      await waitFor(() => expect(result.current.weeklyStats.at(-1)?.rides).toBe(1));
      expect(result.current.coverage).toBe("partial");
      expect(result.current.recent7DayCoverage).toBe("ready");
      expect(result.current.monthlyActivityDistance).toBe(0);
      expect(result.current.recent7DayCount).toBe(1);
      expect(result.current.recent7DayDistances.bike).toBeGreaterThanOrEqual(22_700);
      expect(mockedGetDocs).toHaveBeenCalledTimes(2);
      expect(where).toHaveBeenCalledWith("startTime", ">=", now.getTime() - 12 * 7 * 86400000);
      expect(orderBy).toHaveBeenCalledWith("startTime", "desc");
      expect(where).not.toHaveBeenCalledWith("createdAt", expect.anything(), expect.anything());
    } finally {
      mockedGetDocs.mockReset();
      if (defaultImplementation) mockedGetDocs.mockImplementation(defaultImplementation);
    }
  });

  it("keeps weekly totals finite when a recent activity has incomplete summary metrics", async () => {
    const now = new Date(2026, 6, 14, 12, 0, 0);
    simulateLogin({ uid: "user-1" });
    setCollectionDocs("activities", [
      {
        id: "complete-ride",
        ...createMockActivity({
          id: "complete-ride",
          userId: "user-1",
          startTime: now.getTime() - 6 * 3_600_000,
          summary: createMockSummary({
            distance: 20_000,
            ridingTimeMillis: 3_600_000,
            elevationGain: 250,
          }),
        }),
      },
      {
        id: "incomplete-ride",
        ...createMockActivity({
          id: "incomplete-ride",
          userId: "user-1",
          startTime: now.getTime() - 12 * 3_600_000,
          summary: {
            ...createMockSummary(),
            distance: undefined,
            ridingTimeMillis: Number.NaN,
            elapsedTimeMillis: 1_800_000,
            elevationGain: Number.POSITIVE_INFINITY,
          } as never,
        }),
      },
    ]);

    const { result } = renderHook(() => useWeeklyStats(now), { wrapper });

    await waitFor(() => expect(result.current.thisWeek.rides).toBe(2));
    expect(result.current.thisWeek).toEqual({
      rides: 2,
      distance: 20_000,
      time: 5_400_000,
      elevation: 250,
    });
    expect(result.current.recent7DayDistances.bike).toBe(20_000);
    expect(result.current.weeklyStats.at(-1)).toEqual(expect.objectContaining({
      rides: 2,
      distance: 20,
      time: 1.5,
      elevation: 250,
    }));
  });

  it("keeps user B stats when user A's older request resolves last", async () => {
    const now = new Date(2026, 6, 14, 12, 0, 0);
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockClear();
    let resolveA!: (value: unknown) => void;
    let resolveB!: (value: unknown) => void;
    const requestA = new Promise((resolve) => { resolveA = resolve; });
    const requestB = new Promise((resolve) => { resolveB = resolve; });
    mockedGetDocs
      .mockImplementationOnce(() => requestA as never)
      .mockImplementationOnce(() => requestB as never);

    try {
      simulateLogin({ uid: "user-a" });
      const { result } = renderHook(() => useWeeklyStats(now), { wrapper });
      await waitFor(() => expect(mockedGetDocs).toHaveBeenCalledTimes(1));

      act(() => { simulateLogin({ uid: "user-b" }); });
      await waitFor(() => expect(mockedGetDocs).toHaveBeenCalledTimes(2));

      await act(async () => {
        resolveB({
          docs: [{
            id: "b-bike",
            data: () => createMockActivity({
              id: "b-bike",
              userId: "user-b",
              type: "Ride",
              startTime: now.getTime() - 86400000,
              summary: createMockSummary({ distance: 25_000 }),
            }),
          }],
        });
      });
      await waitFor(() => expect(result.current.recent7DayDistances.bike).toBe(25_000));

      await act(async () => {
        resolveA({
          docs: [{
            id: "a-bike",
            data: () => createMockActivity({
              id: "a-bike",
              userId: "user-a",
              type: "Ride",
              startTime: now.getTime() - 86400000,
              summary: createMockSummary({ distance: 99_000 }),
            }),
          }],
        });
      });

      expect(result.current.thisWeek.rides).toBe(1);
      expect(result.current.recent7DayDistances).toEqual({ bike: 25_000, run: 0, swim: 0 });
    } finally {
      mockedGetDocs.mockReset();
      if (defaultImplementation) mockedGetDocs.mockImplementation(defaultImplementation);
    }
  });
});
