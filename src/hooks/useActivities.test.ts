import { renderHook, act, waitFor } from "@testing-library/react";
import { useActivities, useWeeklyStats, useActivitySearch, useMonthlyActivityDistance } from "./useActivities";
import { simulateLogin, simulateLogout, setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import { createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import { ToastProvider } from "../contexts/ToastContext";
import React from "react";
import * as publicProfiles from "../services/publicProfiles";
import * as errorLogger from "../services/errorLogger";
import { getDocs, where } from "firebase/firestore";

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

describe("useActivities", () => {
  it("returns empty activities initially for guest", async () => {
    const { result } = renderHook(() => useActivities(), { wrapper });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.activities).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it("returns activities from collection data", async () => {
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ id: "a1" }) },
      { id: "a2", ...createMockActivity({ id: "a2" }) },
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

  it("refills a source after a full raw page contains summary-less documents", async () => {
    const mockedGetDocs = vi.mocked(getDocs);
    const defaultImplementation = mockedGetDocs.getMockImplementation();
    mockedGetDocs.mockClear();

    const snapshot = (docs: Array<{ id: string; summary: boolean; createdAt: number }>) => ({
      docs: docs.map(({ id, summary, createdAt }) => {
        const data = {
          ...createMockActivity({ id, createdAt, profileImage: "https://example.com/avatar.jpg" }),
          ...(summary ? {} : { summary: null }),
        };
        return { id, data: () => data, exists: () => true, ref: { path: `activities/${id}` } };
      }),
      size: docs.length,
      empty: docs.length === 0,
    });

    mockedGetDocs
      .mockResolvedValueOnce(snapshot([
        { id: "broken-1", summary: false, createdAt: 400 },
        { id: "valid-newer", summary: true, createdAt: 300 },
        { id: "broken-2", summary: false, createdAt: 200 },
      ]) as never)
      .mockResolvedValueOnce(snapshot([
        { id: "valid-older", summary: true, createdAt: 100 },
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
          createdAt: Date.now() - index,
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
});

describe("useMonthlyActivityDistance", () => {
  it("sums monthly activity distances and ignores summary-less documents", async () => {
    simulateLogin({ uid: "user-1" });
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ id: "a1", userId: "user-1", summary: createMockSummary({ distance: 12_000 }) }) },
      { id: "broken", userId: "user-1", startTime: Date.now(), deletedAt: null },
      { id: "a2", ...createMockActivity({ id: "a2", userId: "user-1", summary: createMockSummary({ distance: 8_000 }) }) },
    ]);

    const { result } = renderHook(() => useMonthlyActivityDistance(new Date(2026, 6, 7)), { wrapper });

    await waitFor(() => {
      expect(result.current).toBe(20_000);
    });
  });
});

describe("useActivitySearch", () => {
  it("starts in inactive state", () => {
    const { result } = renderHook(() => useActivitySearch(), { wrapper });
    expect(result.current.active).toBe(false);
    expect(result.current.results).toEqual([]);
  });

  it("activates search when search() is called", async () => {
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ description: "한강 라이딩" }) },
    ]);

    const { result } = renderHook(() => useActivitySearch(), { wrapper });

    act(() => { result.current.search("한강"); });

    await waitFor(() => {
      expect(result.current.active).toBe(true);
    });
  });

  it("resets search state on reset()", async () => {
    const { result } = renderHook(() => useActivitySearch(), { wrapper });

    act(() => { result.current.search("test"); });
    expect(result.current.active).toBe(true);

    act(() => { result.current.reset(); });
    expect(result.current.active).toBe(false);
    expect(result.current.results).toEqual([]);
  });
});
