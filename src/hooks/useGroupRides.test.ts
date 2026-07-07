import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setCallableResult } from "../__tests__/mocks/firebase";
import { useGroupRideStats } from "./useGroupRides";

describe("useGroupRideStats", () => {
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
      },
    });

    const { result } = renderHook(() => useGroupRideStats("group-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.rides).toHaveLength(1);
    expect(result.current.rides[0]?.totalDistance).toBe(12_000);
    expect(result.current.memberStats["member-a"]?.rideCount).toBe(1);
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
