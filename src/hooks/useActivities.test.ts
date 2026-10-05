import { renderHook, act, waitFor } from "@testing-library/react";
import { useActivities, useWeeklyStats, useActivitySearch } from "./useActivities";
import { simulateLogin, simulateLogout, setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import { createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import { ToastProvider } from "../contexts/ToastContext";
import React from "react";
import * as publicProfiles from "../services/publicProfiles";
import * as errorLogger from "../services/errorLogger";
import { getDocs, onSnapshot, orderBy, where } from "firebase/firestore";
import {
  __resetFirestoreSessionRecoveryForTests,
  FIRESTORE_B815_RECOVERY_SESSION_KEY,
  noteFirestoreServerSuccess,
  prepareFirestoreSessionRecovery,
} from "../utils/firestoreSessionRecovery";

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

describe("useActivities", () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockClear();
    __resetFirestoreSessionRecoveryForTests();
    window.sessionStorage.removeItem(FIRESTORE_B815_RECOVERY_SESSION_KEY);
    firestoreRecoveryMocks.execute.mockClear();
    vi.mocked(noteFirestoreServerSuccess).mockClear();
  });

  it("reports actual server metadata after a current feed request succeeds", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [],
      metadata: { fromCache: false, hasPendingWrites: false },
    } as unknown as Awaited<ReturnType<typeof getDocs>>);
    const { result } = renderHook(() => useActivities(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(noteFirestoreServerSuccess).toHaveBeenCalledWith({ fromCache: false, hasPendingWrites: false });
  });

  it("does not report server success when a pending feed read finishes after unmount", async () => {
    let resolveRead!: (value: Awaited<ReturnType<typeof getDocs>>) => void;
    vi.mocked(getDocs).mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    const { unmount } = renderHook(() => useActivities(), { wrapper });
    await waitFor(() => expect(getDocs).toHaveBeenCalled());
    unmount();
    await act(async () => resolveRead({
      docs: [],
      metadata: { fromCache: false, hasPendingWrites: false },
    } as unknown as Awaited<ReturnType<typeof getDocs>>));
    expect(noteFirestoreServerSuccess).not.toHaveBeenCalled();
  });

  it("shares the first Firestore request across concurrent hook mounts", async () => {
    let resolveRequest!: (value: {
      docs: Array<{ id: string; data: () => ReturnType<typeof createMockActivity> }>;
    }) => void;
    const request = new Promise<{
      docs: Array<{ id: string; data: () => ReturnType<typeof createMockActivity> }>;
    }>((resolve) => { resolveRequest = resolve; });
    vi.mocked(getDocs).mockReturnValueOnce(request as ReturnType<typeof getDocs>);

    const { result } = renderHook(() => ({ first: useActivities(), second: useActivities() }), {
      wrapper: strictWrapper,
    });

    await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(1));
    resolveRequest({
      docs: [{
        id: "shared",
        data: () => createMockActivity({ id: "shared", profileImage: "https://example.com/avatar.jpg" }),
      }],
    });

    await waitFor(() => {
      expect(result.current.first.loading).toBe(false);
      expect(result.current.second.loading).toBe(false);
    });
    expect(result.current.first.activities[0]?.id).toBe("shared");
    expect(result.current.second.activities[0]?.id).toBe("shared");
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it("stops retry waves after a poisoned shared request schedules session recovery", async () => {
    const assertion = new Error("INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)");
    vi.mocked(getDocs).mockRejectedValueOnce(assertion);
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);

    const { result } = renderHook(() => useActivities(), {
      wrapper: strictWrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(result.current.activities).toEqual([]);
    expect(logSpy).toHaveBeenCalledWith(
      "useActivities.initialLoad.first",
      assertion,
      expect.objectContaining({
        firestoreRecoveryKind: "b815",
        firestoreRecoveryAction: "reload-ready",
        firebaseSdkVersion: expect.any(String),
        pageVisibility: expect.any(String),
      }),
    );
    expect(window.sessionStorage.getItem(FIRESTORE_B815_RECOVERY_SESSION_KEY)).toBeTruthy();
    expect(firestoreRecoveryMocks.execute).toHaveBeenCalledTimes(1);
    expect(firestoreRecoveryMocks.execute).toHaveBeenCalledWith({ kind: "b815", action: "reload-ready" });
    expect(logSpy.mock.invocationCallOrder[0]).toBeLessThan(firestoreRecoveryMocks.execute.mock.invocationCallOrder[0]!);
    logSpy.mockRestore();
  });

  it("does not retry a fatal feed request after this session already attempted recovery", async () => {
    const assertion = new Error("INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)");
    prepareFirestoreSessionRecovery(assertion);
    __resetFirestoreSessionRecoveryForTests();
    vi.mocked(getDocs).mockRejectedValueOnce(assertion);
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);

    const { result } = renderHook(() => useActivities(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(result.current.activities).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(firestoreRecoveryMocks.execute).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "useActivities.initialLoad.first",
      assertion,
      expect.objectContaining({
        firestoreRecoveryKind: "b815",
        firestoreRecoveryAction: "already-attempted",
      }),
    );
    logSpy.mockRestore();
  });

  it("settles the guest feed without waiting for the signed-in request after logout", async () => {
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockReset();
    let rejectSignedIn!: (reason: unknown) => void;
    const signedInRequest = new Promise((_resolve, reject) => { rejectSignedIn = reject; });
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    const snapshot = (id: string) => ({
      docs: [{
        id,
        data: () => createMockActivity({
          id,
          profileImage: "https://example.com/avatar.jpg",
        }),
        exists: () => true,
        ref: { path: `activities/${id}` },
      }],
      size: 1,
      empty: false,
    });
    mockedGetDocs
      .mockImplementationOnce(() => signedInRequest as never)
      .mockResolvedValueOnce(snapshot("guest-public") as never);

    try {
      simulateLogin({ uid: "owner-1" });
      const { result } = renderHook(() => useActivities(), { wrapper });
      await waitFor(() => expect(mockedGetDocs).toHaveBeenCalledTimes(1));
      expect(result.current.loading).toBe(true);

      act(() => { simulateLogout(); });

      await waitFor(() => expect(mockedGetDocs).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.activities.map((activity) => activity.id)).toEqual(["guest-public"]);
      expect(result.current.hasMore).toBe(false);

      const stalePermissionError = Object.assign(
        new Error("Missing or insufficient permissions."),
        { code: "permission-denied" },
      );
      await act(async () => { rejectSignedIn(stalePermissionError); });
      expect(result.current.activities.map((activity) => activity.id)).toEqual(["guest-public"]);
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("useActivities.initialLoad"),
        stalePermissionError,
        expect.anything(),
      );
      expect(firestoreRecoveryMocks.execute).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      mockedGetDocs.mockReset();
      if (defaultImplementation) mockedGetDocs.mockImplementation(defaultImplementation);
    }
  });

  it("retries the initial feed once after a timeout and publishes the retry result", async () => {
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockReset();
    mockedGetDocs
      .mockImplementationOnce(() => new Promise(() => {}) as never)
      .mockResolvedValueOnce({
        docs: [{
          id: "retry-success",
          data: () => createMockActivity({ id: "retry-success", profileImage: "https://example.com/avatar.jpg" }),
          exists: () => true,
          ref: { path: "activities/retry-success" },
        }],
        size: 1,
        empty: false,
        metadata: { fromCache: false, hasPendingWrites: false },
      } as never);
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useActivities(), { wrapper });
      await act(async () => { await Promise.resolve(); });
      expect(mockedGetDocs).toHaveBeenCalledTimes(1);

      await act(async () => { await vi.advanceTimersByTimeAsync(12_600); });

      expect(mockedGetDocs).toHaveBeenCalledTimes(2);
      expect(result.current.loading).toBe(false);
      expect(result.current.activities.map((activity) => activity.id)).toEqual(["retry-success"]);
      expect(result.current.hasMore).toBe(false);
    } finally {
      vi.useRealTimers();
      logSpy.mockRestore();
      mockedGetDocs.mockReset();
      if (defaultImplementation) mockedGetDocs.mockImplementation(defaultImplementation);
    }
  });

  it("settles the initial feed after the timeout retry also times out", async () => {
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockReset();
    mockedGetDocs.mockImplementation(() => new Promise(() => {}) as never);
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useActivities(), { wrapper });
      await act(async () => { await Promise.resolve(); });
      expect(mockedGetDocs).toHaveBeenCalledTimes(1);
      expect(result.current.loading).toBe(true);

      await act(async () => { await vi.advanceTimersByTimeAsync(24_600); });

      expect(result.current.loading).toBe(false);
      expect(result.current.activities).toEqual([]);
      expect(result.current.error).toBe(true);
      expect(result.current.hasMore).toBe(false);
      expect(mockedGetDocs).toHaveBeenCalledTimes(2);
      expect(firestoreRecoveryMocks.execute).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        "useActivities.initialLoad.timeout",
        expect.objectContaining({ message: "activity-feed-timeout" }),
        expect.objectContaining({ context: "first", scope: "all", timeoutMs: 12_000 }),
      );
    } finally {
      vi.useRealTimers();
      logSpy.mockRestore();
      mockedGetDocs.mockReset();
      if (defaultImplementation) mockedGetDocs.mockImplementation(defaultImplementation);
    }
  });

  it("returns empty activities initially for guest", async () => {
    const { result } = renderHook(() => useActivities(), { wrapper });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.activities).toEqual([]);
    expect(result.current.error).toBe(false);
    expect(result.current.totalCount).toBe(0);
  });

  it("retries a failed feed separately from a successful empty feed", async () => {
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockReset();
    mockedGetDocs.mockRejectedValueOnce(new Error("offline"));
    mockedGetDocs.mockRejectedValueOnce(new Error("offline"));
    mockedGetDocs.mockRejectedValueOnce(new Error("offline"));
    mockedGetDocs.mockResolvedValue({ docs: [], metadata: { fromCache: false, hasPendingWrites: false } } as never);
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useActivities(), { wrapper });
      await act(async () => { await vi.advanceTimersByTimeAsync(2_300); });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(true);
      expect(result.current.activities).toEqual([]);

      act(() => result.current.retry());
      await act(async () => { await Promise.resolve(); });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(false);
      expect(result.current.activities).toEqual([]);
    } finally {
      vi.useRealTimers();
      logSpy.mockRestore();
      mockedGetDocs.mockReset();
      if (defaultImplementation) mockedGetDocs.mockImplementation(defaultImplementation);
    }
  });

  it("returns activities from collection data", async () => {
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ id: "a1", startTime: 2_000 }) },
      { id: "a2", ...createMockActivity({ id: "a2", startTime: 1_000 }) },
    ]);

    const { result } = renderHook(() => useActivities(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // summary 가 있는 문서는 fetchPage 의 `summary != null` 필터를 통과해 노출된다.
    expect(result.current.activities).toHaveLength(2);
    expect(result.current.activities.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("fills missing activity avatar from the public profile photo", async () => {
    setDocData("users_public/user-1", {
      nickname: "테스트 라이더",
      photoURL: "https://example.com/profile-avatar.jpg",
    });
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ id: "a1", userId: "user-1", profileImage: null }) },
    ]);

    const { result } = renderHook(() => useActivities(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.activities[0]?.profileImage).toBe("https://example.com/profile-avatar.jpg");
  });

  it("keeps activities and skips error logging when profile image hydration is denied", async () => {
    const err = new Error("Missing or insufficient permissions.");
    Object.assign(err, { code: "permission-denied" });
    const profileSpy = vi.spyOn(publicProfiles, "getPublicUserProfiles").mockRejectedValueOnce(err);
    const logSpy = vi.spyOn(errorLogger, "logClientError");
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ id: "a1", userId: "user-1", profileImage: null }) },
    ]);

    const { result } = renderHook(() => useActivities(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0]?.profileImage).toBeNull();
    expect(logSpy).not.toHaveBeenCalledWith(
      "useActivities.profileImages",
      err,
      expect.anything(),
    );
    profileSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("filters out documents without a summary field", async () => {
    setCollectionDocs("activities", [
      { id: "ok", ...createMockActivity({ id: "ok" }) },
      // summary 누락 문서 — 다운스트림 통계 크래시 방지 위해 제외돼야 함
      { id: "broken", userId: "u", visibility: "everyone", startTime: 0 },
    ]);

    const { result } = renderHook(() => useActivities(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0]?.id).toBe("ok");
  });

  it("adds the signed-in owner constraint to the self feed query", async () => {
    simulateLogin({ uid: "owner-1" });
    vi.mocked(where).mockClear();

    const { result } = renderHook(() => useActivities("self"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(where).toHaveBeenCalledWith("userId", "==", "owner-1");
  });

  it("chunks friend owner queries and includes public and friends visibility", async () => {
    simulateLogin({ uid: "owner-1" });
    vi.mocked(where).mockClear();
    const friendIds = Array.from({ length: 16 }, (_, index) => `friend-${index}`);

    const { result } = renderHook(() => useActivities("friends", friendIds), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const ownerCalls = vi.mocked(where).mock.calls.filter(([field, operator]) => field === "userId" && operator === "in");
    expect(ownerCalls.map(([, , ids]) => (ids as string[]).length)).toEqual([10, 6]);
    expect(where).toHaveBeenCalledWith("visibility", "in", ["everyone", "friends"]);
  });

  it("orders the feed by ride time, not upload time", async () => {
    // 지난 라이딩을 나중에 업로드하거나 Strava 동기화·앱 재업로드가 끼면 createdAt 순서가
    // 실제 운동 순서와 어긋난다. 카드에 찍힌 날짜와 목록 순서가 같아야 한다.
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockClear();
    vi.mocked(orderBy).mockClear();

    const docs = [
      // 어제 탄 라이딩을 방금 업로드 — createdAt 은 가장 최신이지만 startTime 은 더 오래됐다.
      { id: "ridden-yesterday", startTime: 1_000, createdAt: 9_000 },
      { id: "ridden-today", startTime: 5_000, createdAt: 1_000 },
    ];
    mockedGetDocs.mockResolvedValue({
      docs: docs.map(({ id, startTime, createdAt }) => ({
        id,
        data: () => createMockActivity({ id, startTime, createdAt, profileImage: "https://example.com/avatar.jpg" }),
        exists: () => true,
        ref: { path: `activities/${id}` },
      })),
      size: docs.length,
      empty: false,
    } as never);

    try {
      const { result } = renderHook(() => useActivities(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.activities.map((activity) => activity.id)).toEqual([
        "ridden-today",
        "ridden-yesterday",
      ]);
      // 커서 페이지네이션은 쿼리 정렬키와 병합 정렬키가 같아야 성립한다.
      expect(orderBy).toHaveBeenCalledWith("startTime", "desc");
      expect(orderBy).not.toHaveBeenCalledWith("createdAt", "desc");
    } finally {
      mockedGetDocs.mockReset();
      if (defaultImplementation) mockedGetDocs.mockImplementation(defaultImplementation);
    }
  });

  it("refills a source after a full raw page contains summary-less documents", async () => {
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockClear();

    // startTime 을 명시한다 — 피드 정렬키라서 기본값(호출 시각 기반)에 맡기면 문서 생성
    // 순서에 따라 순서가 뒤집혀 테스트가 비결정적이 된다.
    const snapshot = (docs: Array<{ id: string; summary: boolean; startTime: number }>) => ({
      docs: docs.map(({ id, summary, startTime }) => {
        const data = {
          ...createMockActivity({ id, startTime, profileImage: "https://example.com/avatar.jpg" }),
          ...(summary ? {} : { summary: null }),
        };
        return { id, data: () => data, exists: () => true, ref: { path: `activities/${id}` } };
      }),
      size: docs.length,
      empty: docs.length === 0,
    });

    mockedGetDocs
      .mockResolvedValueOnce(snapshot([
        { id: "broken-1", summary: false, startTime: 400 },
        { id: "valid-newer", summary: true, startTime: 300 },
        { id: "broken-2", summary: false, startTime: 200 },
      ]) as never)
      .mockResolvedValueOnce(snapshot([
        { id: "valid-older", summary: true, startTime: 100 },
      ]) as never);

    try {
      const { result } = renderHook(() => useActivities(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.activities.map((activity) => activity.id)).toEqual(["valid-newer", "valid-older"]);
      expect(mockedGetDocs).toHaveBeenCalledTimes(2);
    } finally {
      mockedGetDocs.mockReset();
      if (defaultImplementation) mockedGetDocs.mockImplementation(defaultImplementation);
    }
  });

  it("does not reload all-scope activities when the async friend list changes", async () => {
    const mockedGetDocs = vi.mocked(getDocs);
    mockedGetDocs.mockClear();

    const { result, rerender } = renderHook(
      ({ friendIds }: { friendIds: string[] }) => useActivities("all", friendIds),
      { wrapper, initialProps: { friendIds: [] } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsAfterInitialLoad = mockedGetDocs.mock.calls.length;

    rerender({ friendIds: ["friend-loaded-later"] });
    await act(async () => { await Promise.resolve(); });

    expect(mockedGetDocs).toHaveBeenCalledTimes(callsAfterInitialLoad);
  });

  it("does not append an old load-more response after an all-self-all scope cycle", async () => {
    simulateLogin({ uid: "owner-1" });
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockClear();
    let resolveOldPage!: (value: unknown) => void;

    const snapshot = (ids: string[]) => ({
      docs: ids.map((id, index) => {
        const data = createMockActivity({
          id,
          userId: id === "self-new" ? "owner-1" : "other-1",
          // 정렬키(startTime)를 인덱스로 고정 — 기본값은 호출 시각 기반이라 순서가 흔들린다.
          startTime: 1_000 - index,
        });
        return { id, data: () => data, exists: () => true, ref: { path: `activities/${id}` } };
      }),
      size: ids.length,
      empty: ids.length === 0,
    });

    const oldPage = new Promise((resolve) => { resolveOldPage = resolve; });
    mockedGetDocs
      .mockResolvedValueOnce(snapshot(["all-1", "all-2", "all-3"]) as never)
      .mockResolvedValueOnce(snapshot(Array.from({ length: 7 }, (_, index) => `all-rest-${index}`)) as never)
      .mockImplementationOnce(() => oldPage as never)
      .mockResolvedValueOnce(snapshot(["self-new"]) as never)
      .mockResolvedValueOnce(snapshot(["all-new"]) as never);

    try {
      const { result, rerender } = renderHook(
        ({ scope }: { scope: "all" | "self" }) => useActivities(scope),
        { wrapper, initialProps: { scope: "all" as const } },
      );

      await waitFor(() => expect(result.current.activities).toHaveLength(10));
      await waitFor(() => expect(result.current.loadingMore).toBe(false));
      expect(result.current.hasMore).toBe(true);

      act(() => { void result.current.loadMore(); });
      await waitFor(() => expect(mockedGetDocs).toHaveBeenCalledTimes(3));
      rerender({ scope: "self" });
      await waitFor(() => expect(result.current.activities.map((activity) => activity.id)).toEqual(["self-new"]));
      rerender({ scope: "all" });
      await waitFor(() => expect(result.current.activities.map((activity) => activity.id)).toEqual(["all-new"]));

      await act(async () => { resolveOldPage(snapshot(["old-scope-result"])); });
      expect(result.current.activities.map((activity) => activity.id)).toEqual(["all-new"]);
    } finally {
      mockedGetDocs.mockReset();
      if (defaultImplementation) mockedGetDocs.mockImplementation(defaultImplementation);
    }
  });
});

describe("useWeeklyStats", () => {
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
      { id: "before", ...createMockActivity({ id: "before", userId: "user-1", type: "Run", startTime: Date.parse("2026-07-12T14:30:00Z") }) },
      { id: "after", ...createMockActivity({ id: "after", userId: "user-1", type: "Run", startTime: Date.parse("2026-07-12T15:15:00Z") }) },
    ]);
    const { result } = renderHook(() => useWeeklyStats({ now, discipline: "run" }), { wrapper });
    await waitFor(() => expect(result.current.coverage).not.toBe("loading"));
    expect(result.current.coverage).toBe("ready");
    expect(result.current.weeklyStats.at(-1)).toMatchObject({ week: "7/13", rides: 1 });
    expect(result.current.weeklyStats.at(-2)).toMatchObject({ week: "7/6", rides: 1 });
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

  it("주 경계의 연동 기록은 전체 입력 대표 날짜에만 부하를 배분하고 원본 활동 수는 보존한다", async () => {
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
    expect(result.current.weeklyStats.at(-2)?.rides).toBe(1);
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

      await waitFor(() => expect(result.current.weeklyStats.at(-1)?.rides).toBe(201));
      expect(result.current.coverage).toBe("partial");
      expect(result.current.recent7DayCoverage).toBe("ready");
      expect(result.current.monthlyActivityDistance).toBe(0);
      expect(result.current.recent7DayCount).toBe(201);
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

describe("useActivitySearch", () => {
  it("does not open duplicate friend listeners before search", () => {
    simulateLogin({ uid: "user-1" });
    vi.mocked(onSnapshot).mockClear();

    renderHook(() => useActivitySearch(new Set(["friend-1"])), { wrapper });

    const subscribedPaths = vi.mocked(onSnapshot).mock.calls.map(([reference]) => (
      (reference as { path?: string }).path ?? ""
    ));
    expect(subscribedPaths).not.toContain("friends/user-1/users");
    expect(subscribedPaths).not.toContain("friend_requests/user-1/items");
  });

  it("starts in inactive state", () => {
    const { result } = renderHook(() => useActivitySearch(new Set()), { wrapper });
    expect(result.current.active).toBe(false);
    expect(result.current.results).toEqual([]);
  });

  it("activates search when search() is called", async () => {
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ description: "한강 라이딩" }) },
    ]);

    const { result } = renderHook(() => useActivitySearch(new Set()), { wrapper });

    act(() => { result.current.search("한강"); });

    await waitFor(() => {
      expect(result.current.active).toBe(true);
    });
  });

  it("updates the friends filter from new IDs without repeating the activity query", async () => {
    simulateLogin({ uid: "user-1" });
    setCollectionDocs("activities", [
      { id: "friend-a-ride", ...createMockActivity({ id: "friend-a-ride", userId: "friend-a" }) },
      { id: "friend-b-ride", ...createMockActivity({ id: "friend-b-ride", userId: "friend-b" }) },
    ]);
    const mockedGetDocs = vi.mocked(getDocs);
    mockedGetDocs.mockClear();

    const { result, rerender } = renderHook(
      ({ friendIds }: { friendIds: ReadonlySet<string> }) => useActivitySearch(friendIds),
      { wrapper, initialProps: { friendIds: new Set(["friend-a"]) } },
    );
    act(() => { result.current.search("ride"); });
    await waitFor(() => expect(result.current.totalResults).toBe(2));
    act(() => { result.current.setOwnerPreset("friends"); });
    await waitFor(() => expect(result.current.results.map((activity) => activity.userId)).toEqual(["friend-a"]));
    const queryCount = mockedGetDocs.mock.calls.length;

    rerender({ friendIds: new Set(["friend-b"]) });

    await waitFor(() => expect(result.current.results.map((activity) => activity.userId)).toEqual(["friend-b"]));
    expect(mockedGetDocs).toHaveBeenCalledTimes(queryCount);
  });

  it("hides the previous account's search results while the new account query is pending", async () => {
    simulateLogin({ uid: "user-a" });
    setCollectionDocs("activities", [
      { id: "user-a-ride", ...createMockActivity({ id: "user-a-ride", userId: "user-a" }) },
    ]);
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();

    const { result } = renderHook(() => useActivitySearch(new Set()), { wrapper });
    act(() => { result.current.search("ride"); });
    await waitFor(() => expect(result.current.totalResults).toBe(1));

    const pending = new Promise<never>(() => {});
    mockedGetDocs
      .mockImplementationOnce(() => pending)
      .mockImplementationOnce(() => pending);

    try {
      act(() => { simulateLogin({ uid: "user-b" }); });
      expect(result.current.results).toEqual([]);
      expect(result.current.totalResults).toBe(0);
    } finally {
      mockedGetDocs.mockReset();
      if (defaultImplementation) mockedGetDocs.mockImplementation(defaultImplementation);
    }
  });

  it("resets search state on reset()", async () => {
    const { result } = renderHook(() => useActivitySearch(new Set()), { wrapper });

    act(() => { result.current.search("test"); });
    expect(result.current.active).toBe(true);

    act(() => { result.current.reset(); });
    expect(result.current.active).toBe(false);
    expect(result.current.results).toEqual([]);
  });
});
