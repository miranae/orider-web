import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCallableInvocations, setCallableImplementation, setCallableResult } from "../__tests__/mocks/firebase";
import { normalizeGroupRideAggregate, useGroupRideStats } from "./useGroupRides";

import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady } from "../services/firebase";
const context = vi.hoisted(() => ({ uid: "qa-owner" }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: context.uid } }) }));
beforeEach(() => {
  context.uid = "qa-owner";
  Object.assign(auth, { currentUser: { uid: context.uid } });
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
  vi.mocked(httpsCallable).mockClear();
  mockCallableInvocations.length = 0;
});

describe("useGroupRideStats", () => {
  it("retains loaded records, statistics and cursor after page failure, then retries only that page", async () => {
    const cursor = { startTime: 200, groupRideId: "first" };
    let pageCalls = 0;
    setCallableImplementation("getGroupRideStats", (request) => {
      if ((request as { cursor?: unknown }).cursor) {
        pageCalls += 1;
        if (pageCalls === 1) throw Object.assign(new Error("offline"), { code: "functions/unavailable" });
        return { data: { rides: [{ groupRideId: "second" }], nextCursor: null } };
      }
      return { data: { rides: [{ groupRideId: "first" }], memberStats: { member: { distance: 42 } },
        weeklyStats: { totalDistance: 42 }, memberWeekStats: { member: { distance: 42 } }, nextCursor: cursor } };
    });
    const { result } = renderHook(() => useGroupRideStats("pages"));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.error).toBeNull();
    expect(result.current.loadMoreError).toBe("unavailable");
    expect(result.current.rides.map(ride => ride.groupRideId)).toEqual(["first"]);
    expect(result.current.memberStats.member.distance).toBe(42);
    expect(result.current.weeklyStats?.totalDistance).toBe(42);
    expect(result.current.memberWeekStats?.member.distance).toBe(42);
    expect(result.current.hasMore).toBe(true);
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.loadMoreError).toBeNull();
    expect(result.current.rides.map(ride => ride.groupRideId)).toEqual(["first", "second"]);
    expect(mockCallableInvocations.filter(call => call.name === "getGroupRideStats").map(call => call.data)).toEqual([
      { groupId: "pages", pageSize: 20 },
      { groupId: "pages", pageSize: 20, cursor, pageOnly: true },
      { groupId: "pages", pageSize: 20, cursor, pageOnly: true },
    ]);
  });

  it.each(["initial", "page"] as const)("dispatches the %s payload only after readiness succeeds", async (phase) => {
    const cursor = { startTime: 1, groupRideId: "r" };
    setCallableResult("getGroupRideStats", { data: { rides: [], memberStats: {}, nextCursor: cursor } });
    let resolveReady!: () => void;
    const gate = new Promise<void>((resolve) => { resolveReady = resolve; });
    if (phase === "initial") vi.mocked(ensureAppCheckReady).mockReturnValue(gate);
    const { result } = renderHook(() => useGroupRideStats("qa-group"));
    if (phase === "page") {
      await waitFor(() => expect(result.current.hasMore).toBe(true));
      vi.mocked(ensureAppCheckReady).mockReturnValue(gate);
      mockCallableInvocations.length = 0;
      vi.mocked(httpsCallable).mockClear();
      act(() => { void result.current.loadMore(); });
    }
    expect(httpsCallable).not.toHaveBeenCalled();
    await act(async () => { resolveReady(); });
    expect(mockCallableInvocations).toEqual([{ name: "getGroupRideStats", data: phase === "initial"
      ? { groupId: "qa-group", pageSize: 20 }
      : { groupId: "qa-group", pageSize: 20, cursor, pageOnly: true } }]);
  });

  it.each(["initial", "page"] as const)("gates the %s request and propagates readiness failure without dispatch", async (phase) => {
    setCallableResult("getGroupRideStats", { data: { rides: [], memberStats: {}, nextCursor: { startTime: 1, groupRideId: "r" } } });
    let rejectReady!: (error: Error) => void;
    const gate = new Promise<void>((_, reject) => { rejectReady = reject; });
    if (phase === "initial") vi.mocked(ensureAppCheckReady).mockReturnValue(gate);
    const { result } = renderHook(() => useGroupRideStats("qa-group"));
    if (phase === "page") {
      await waitFor(() => expect(result.current.hasMore).toBe(true));
      vi.mocked(ensureAppCheckReady).mockReturnValue(gate);
      vi.mocked(httpsCallable).mockClear();
      act(() => { void result.current.loadMore(); });
    }
    expect(httpsCallable).not.toHaveBeenCalled();
    await act(async () => { rejectReady(new Error("app-check/token-timeout")); });
    expect(httpsCallable).not.toHaveBeenCalled();
    expect(phase === "page" ? result.current.loadMoreError : result.current.error).toBe("failed");
    expect(result.current.loadingMore).toBe(false);
  });

  it.each(["initial", "page"] as const)("does not dispatch a pending %s request after unmount or account change", async (phase) => {
    setCallableResult("getGroupRideStats", { data: { rides: [], memberStats: {}, nextCursor: { startTime: 1, groupRideId: "r" } } });
    for (const change of ["unmount", "account"] as const) {
      Object.assign(auth, { currentUser: { uid: context.uid } });
      vi.mocked(ensureAppCheckReady).mockResolvedValue(undefined);
      let resolveReady!: () => void;
      const gate = new Promise<void>((resolve) => { resolveReady = resolve; });
      if (phase === "initial") vi.mocked(ensureAppCheckReady).mockReturnValue(gate);
      const view = renderHook(() => useGroupRideStats("qa-group"));
      if (phase === "page") {
        await waitFor(() => expect(view.result.current.hasMore).toBe(true));
        vi.mocked(ensureAppCheckReady).mockReturnValue(gate);
        act(() => { void view.result.current.loadMore(); });
      }
      vi.mocked(httpsCallable).mockClear();
      if (change === "unmount") view.unmount();
      else Object.assign(auth, { currentUser: { uid: "other-owner" } });
      await act(async () => { resolveReady(); });
      expect(httpsCallable).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it("dispatches only the current group after pending readiness resolves", async () => {
    let resolveReady!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve) => { resolveReady = resolve; }));
    setCallableResult("getGroupRideStats", { data: { rides: [], memberStats: {} } });
    const { rerender } = renderHook(({ groupId }) => useGroupRideStats(groupId), { initialProps: { groupId: "old" } });
    rerender({ groupId: "new" });
    await act(async () => { resolveReady(); });
    expect(mockCallableInvocations).toEqual([{ name: "getGroupRideStats", data: { groupId: "new", pageSize: 20 } }]);
  });

  it("reports an unavailable callable and clears the error on retry", async () => {
    let calls = 0;
    setCallableImplementation("getGroupRideStats", () => {
      calls += 1;
      if (calls === 1) return Promise.reject(Object.assign(new Error("repair pending"), { code: "functions/unavailable" }));
      return { data: {
        rides: [{ groupRideId: "repaired", startTime: 1, participantCount: 1,
          totalDistance: 1000, activities: [] }],
        memberStats: {},
        weeklyStats: { totalDistance: 1000, totalTime: 10, totalElevation: 0,
          rideCount: 1, activeMembers: 1 },
      } };
    });
    const { result } = renderHook(() => useGroupRideStats("group-repair"));
    await waitFor(() => expect(result.current.error).toBe("unavailable"));
    expect(result.current.loading).toBe(false);
    expect(result.current.rides).toEqual([]);
    expect(result.current.weeklyStats).toBeNull();

    act(() => result.current.retry());
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.rides[0]?.groupRideId).toBe("repaired"));
    expect(result.current.weeklyStats?.totalDistance).toBe(1000);
    expect(calls).toBe(2);
  });

  it("clears a failed group's error when switching groups", async () => {
    setCallableImplementation("getGroupRideStats", (request) => {
      if ((request as { groupId: string }).groupId === "group-a") {
        return Promise.reject(Object.assign(new Error("repair pending"), { code: "functions/unavailable" }));
      }
      return { data: { rides: [], memberStats: {}, nextCursor: null } };
    });
    const { result, rerender } = renderHook(({ groupId }) => useGroupRideStats(groupId), {
      initialProps: { groupId: "group-a" },
    });
    await waitFor(() => expect(result.current.error).toBe("unavailable"));
    rerender({ groupId: "group-b" });
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rides).toEqual([]);
  });

  it("clears group stats and ignores an older group's pending page", async () => {
    let resolveOldPage!: (value: unknown) => void;
    setCallableImplementation("getGroupRideStats", (request) => {
      const { groupId, cursor } = request as { groupId: string; cursor?: unknown };
      if (groupId === "group-a" && cursor) {
        return new Promise((resolve) => { resolveOldPage = resolve; });
      }
      const isOldGroup = groupId === "group-a";
      return { data: {
        rides: [{ groupRideId: isOldGroup ? "a-ride" : "b-ride", startTime: 200,
          participantCount: 1, totalDistance: 1000, activities: [] }],
        memberStats: { [isOldGroup ? "a-member" : "b-member"]: {
          distance: 1000, rideCount: 1, lastActivityAt: 200,
        } },
        aggregate: { monthKey: "2026-07", monthlyDistance: isOldGroup ? 1000 : 2000,
          lifetimeDistance: isOldGroup ? 1000 : 2000, lifetimeRideCount: 1,
          longestRideDistance: 1000 },
        weeklyStats: { totalDistance: isOldGroup ? 1000 : 2000, totalTime: 100,
          totalElevation: 10, rideCount: 1, activeMembers: 1 },
        memberWeekStats: { [isOldGroup ? "a-member" : "b-member"]: {
          distance: 1000, elevation: 10, time: 100, tss: 5,
        } },
        nextCursor: isOldGroup ? { startTime: 200, groupRideId: "a-ride" } : null,
      } };
    });

    const { result, rerender } = renderHook(({ groupId }) => useGroupRideStats(groupId), {
      initialProps: { groupId: "group-a" },
    });
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => { void result.current.loadMore(); });
    expect(result.current.loadingMore).toBe(true);
    await waitFor(() => expect(resolveOldPage).toBeTypeOf("function"));

    rerender({ groupId: "group-b" });
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.rides).toEqual([]);
    expect(result.current.memberStats).toEqual({});
    expect(result.current.aggregate).toBeNull();
    expect(result.current.weeklyStats).toBeNull();
    expect(result.current.memberWeekStats).toBeNull();
    await waitFor(() => expect(result.current.rides[0]?.groupRideId).toBe("b-ride"));

    await act(async () => { resolveOldPage({ data: {
      rides: [{ groupRideId: "old-page", startTime: 100, participantCount: 1,
        totalDistance: 900, activities: [] }], nextCursor: null,
    } }); });
    expect(result.current.rides.map((ride) => ride.groupRideId)).toEqual(["b-ride"]);
    expect(result.current.memberStats).toHaveProperty("b-member");
    expect(result.current.memberStats).not.toHaveProperty("a-member");
    expect(result.current.aggregate?.lifetimeDistance).toBe(2000);
    expect(result.current.weeklyStats?.totalDistance).toBe(2000);
    expect(result.current.memberWeekStats).toHaveProperty("b-member");
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
  });

  it("appends the next ride page without changing lifetime aggregates", async () => {
    const cursor = { startTime: 200, groupRideId: "new" };
    const calls: unknown[] = [];
    setCallableImplementation("getGroupRideStats", (request) => {
      calls.push(request);
      const isNext = (request as { cursor?: unknown }).cursor != null;
      return { data: {
        rides: [{ groupRideId: isNext ? "old" : "new", startTime: isNext ? 100 : 200,
          participantCount: 2, totalDistance: 1000, activities: [] }],
        memberStats: { member: { distance: 2000, rideCount: 2, lastActivityAt: 200 } },
        aggregate: { monthKey: "2026-07", monthlyDistance: 2000, lifetimeDistance: 2000,
          lifetimeRideCount: 2, longestRideDistance: 1000 },
        nextCursor: isNext ? null : cursor,
      } };
    });
    const { result } = renderHook(() => useGroupRideStats("group-pages"));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { await result.current.loadMore(); });
    expect(calls).toEqual([{ groupId: "group-pages", pageSize: 20 },
      { groupId: "group-pages", pageSize: 20, cursor, pageOnly: true }]);
    expect(result.current.rides.map((ride) => ride.groupRideId)).toEqual(["new", "old"]);
    expect(result.current.aggregate?.lifetimeRideCount).toBe(2);
    expect(result.current.hasMore).toBe(false);
  });

  it("loads grouped rides from the callable response", async () => {
    setCallableResult("getGroupRideStats", {
      data: {
        rides: [
          {
            groupRideId: "ride-1",
            startTime: 1_700_000_000_000,
            participantCount: 2,
            totalDistance: 12_000,
            activities: [{
              id: "activity-a",
              userId: "member-a",
              nickname: "A",
              profileImage: null,
              startTime: 1_700_000_000_000,
              summary: {
                distance: 12_000,
                ridingTimeMillis: 3_600_000,
                elevationGain: 100,
                relativeEffort: null,
              },
            }],
          },
        ],
        memberStats: {
          "member-a": { distance: 12_000, rideCount: 1, lastActivityAt: 1_700_000_000_000 },
        },
        computedAt: 1_700_000_100_000,
        cached: false,
        aggregate: {
          monthKey: "2026-07",
          monthlyDistance: 42_000,
          lifetimeDistance: 1_000_000,
          lifetimeRideCount: 20,
          longestRideDistance: 120_000,
        },
      },
    });

    const { result } = renderHook(() => useGroupRideStats("group-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.rides).toHaveLength(1);
    expect(result.current.rides[0]?.totalDistance).toBe(12_000);
    expect(result.current.memberStats["member-a"]?.rideCount).toBe(1);
    expect(result.current.aggregate).toEqual(expect.objectContaining({
      monthKey: "2026-07",
      lifetimeRideCount: 20,
    }));
  });

  it("does not query when group id is missing", async () => {
    setCallableResult("getGroupRideStats", {
      data: {
        rides: [
          {
            groupRideId: "ride-1",
            activities: [{
              id: "activity-a",
              userId: "member-a",
              nickname: "A",
              profileImage: null,
              startTime: 1,
              summary: {
                distance: 12_000,
                ridingTimeMillis: 3_600_000,
                elevationGain: 100,
                relativeEffort: null,
              },
            }],
            startTime: 1,
            participantCount: 1,
            totalDistance: 12_000,
          },
        ],
        memberStats: {
          "member-a": { distance: 12_000, rideCount: 1, lastActivityAt: 1 },
        },
        computedAt: 1,
        cached: false,
      },
    });

    const { result } = renderHook(() => useGroupRideStats(undefined));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.rides).toEqual([]);
    expect(result.current.memberStats).toEqual({});
  });
});

describe("normalizeGroupRideAggregate", () => {
  it("rejects partial or non-finite server aggregates", () => {
    expect(normalizeGroupRideAggregate({ monthKey: "2026-07", monthlyDistance: Number.NaN })).toBeNull();
    expect(normalizeGroupRideAggregate({ monthKey: "July" })).toBeNull();
  });
});


it("reloads previously denied stats when the same user's membership is approved", async () => {
  setCallableImplementation("getGroupRideStats", async () => { throw Object.assign(new Error("nonmember"), { code: "functions/permission-denied" }); });
  const { result, rerender } = renderHook(({ accessKey }) => useGroupRideStats("approval", accessKey), { initialProps: { accessKey: "qa-owner:" } });
  await waitFor(() => expect(result.current.error).toBe("failed"));
  setCallableImplementation("getGroupRideStats", async () => ({ data: { rides: [], memberStats: { approved: { distance: 42, rideCount: 1, lastActivityAt: 10 } } } }));
  rerender({ accessKey: "qa-owner:member" });
  await waitFor(() => expect(result.current.memberStats.approved?.distance).toBe(42));
  expect(result.current.error).toBeNull();
  expect(mockCallableInvocations.filter(call => call.name === "getGroupRideStats")).toHaveLength(2);
});
