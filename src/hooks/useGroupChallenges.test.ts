import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCallableInvocations, setCallableResult, setCallableImplementation, setCollectionDocs } from "../__tests__/mocks/firebase";
import { useGroupChallenges, createGroupChallenge, currentKstMonthKey, getGroupChallengeProgress, getGroupChallengeStandings, getVisibleChallengeStandings, joinGroupChallenge } from "./useGroupChallenges";

describe("group challenge callable contracts", () => {
  beforeEach(() => {
    mockCallableInvocations.length = 0;
  });

  it("creates a league for the selected managed group", async () => {
    setCallableResult("createGroupChallenge", { data: { challengeId: "challenge-1" } });
    await expect(createGroupChallenge({ groupId: "group-1", name: "  7월 거리 리그  " })).resolves.toBe("challenge-1");
    expect(mockCallableInvocations).toContainEqual({
      name: "createGroupChallenge",
      data: { groupId: "group-1", name: "7월 거리 리그" },
    });
  });

  it("joins with the exact challenge and managed group ids", async () => {
    setCallableResult("joinGroupChallenge", { data: { success: true } });
    await joinGroupChallenge({ challengeId: "challenge-1", groupId: "group-2" });
    expect(mockCallableInvocations).toContainEqual({
      name: "joinGroupChallenge",
      data: { challengeId: "challenge-1", groupId: "group-2" },
    });
  });

  it("reads server-authoritative standings through the callable", async () => {
    setCallableResult("getGroupChallengeStandings", { data: {
      challengeId: "challenge-1", name: "League", monthKey: "2026-07", metric: "distance_km",
      standings: [{ rank: 1, groupId: "group-1", name: "A", badge: null, distanceKm: 100, goalKm: 200 }],
      computedAt: 123,
    } });
    await expect(getGroupChallengeStandings("challenge-1")).resolves.toEqual(expect.objectContaining({ metric: "distance_km" }));
    expect(mockCallableInvocations).toContainEqual({
      name: "getGroupChallengeStandings",
      data: { challengeId: "challenge-1" },
    });
  });
});

describe("currentKstMonthKey", () => {
  it("switches month at KST midnight", () => {
    expect(currentKstMonthKey(Date.parse("2026-06-30T14:59:59Z"))).toBe("2026-06");
    expect(currentKstMonthKey(Date.parse("2026-06-30T15:00:00Z"))).toBe("2026-07");
  });
});

describe("getGroupChallengeProgress", () => {
  it("calculates partial progress and remaining distance", () => {
    expect(getGroupChallengeProgress(125, 500)).toEqual({
      distanceKm: 125, goalKm: 500, percent: 25, remainingKm: 375, completed: false,
    });
  });

  it("clamps over-complete progress to 100 percent", () => {
    expect(getGroupChallengeProgress(650, 500)).toEqual({
      distanceKm: 650, goalKm: 500, percent: 100, remainingKm: 0, completed: true,
    });
  });

  it.each([null, undefined, 0, -1, Number.NaN])("omits progress for an invalid goal: %s", (goal) => {
    expect(getGroupChallengeProgress(20, goal)).toEqual({
      distanceKm: 20, goalKm: null, percent: null, remainingKm: null, completed: false,
    });
  });

  it("normalizes missing, negative, and non-finite distance", () => {
    expect(getGroupChallengeProgress(undefined, 500).distanceKm).toBe(0);
    expect(getGroupChallengeProgress(-20, 500).percent).toBe(0);
    expect(getGroupChallengeProgress(Number.POSITIVE_INFINITY, 500).remainingKm).toBe(500);
  });
});

describe("getVisibleChallengeStandings", () => {
  const standings = Array.from({ length: 7 }, (_, index) => ({
    rank: index + 1, groupId: `group-${index + 1}`, name: `Group ${index + 1}`,
    badge: null, distanceKm: 100 - index, goalKm: 500,
  }));

  it("keeps a participating group visible when it ranks below the leaders", () => {
    expect(getVisibleChallengeStandings(standings, "group-7").map((standing) => standing.groupId))
      .toEqual(["group-1", "group-2", "group-3", "group-4", "group-5", "group-7"]);
  });

  it("does not duplicate a participating group already among the leaders", () => {
    expect(getVisibleChallengeStandings(standings, "group-2")).toHaveLength(5);
  });
});

describe("league read failures", () => {
  it("distinguishes a failed standings request from an empty league and retries only on request", async () => {
    const monthKey = currentKstMonthKey();
    setCollectionDocs("group_challenges", [{ id: "league-1", status: "OPEN", monthKey, participantGroupIds: [] }]);
    const read = vi.fn<() => unknown>(() => { throw new Error("unavailable"); });
    setCallableImplementation("getGroupChallengeStandings", read);
    const { result } = renderHook(() => useGroupChallenges());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(read).toHaveBeenCalledOnce();
    read.mockImplementation(() => ({ data: { name: "League", monthKey, standings: [], computedAt: 1 } }));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBe(false));
    await waitFor(() => expect(result.current.challenges).toHaveLength(1));
    expect(read).toHaveBeenCalledTimes(2);
  });
});
