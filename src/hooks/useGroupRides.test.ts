import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setCallableImplementation, setCallableResult } from "../__tests__/mocks/firebase";
import { normalizeGroupRideAggregate, useGroupRideStats } from "./useGroupRides";

describe("useGroupRideStats", () => {
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
