import { beforeEach, describe, expect, it } from "vitest";
import { mockCallableInvocations, setCallableResult } from "../__tests__/mocks/firebase";
import { createGroupChallenge, currentKstMonthKey, getGroupChallengeStandings, joinGroupChallenge } from "./useGroupChallenges";

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
