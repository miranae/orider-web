import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCallableInvocations, setCallableImplementation } from "../__tests__/mocks/firebase";
import { auth, ensureAppCheckReady } from "../services/firebase";
import { useGroupWeekRanking } from "./useGroupWeekRanking";
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "viewer" } }) }));
beforeEach(() => {
  Object.assign(auth, { currentUser: { uid: "viewer" } });
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
  mockCallableInvocations.length = 0;
});
describe("week ranking pages", () => {
  it("loads only the first page until explicit action, preserves rows on failure and retries the cursor", async () => {
    const cursor = { phase: "members", userId: "", value: 0, metric: "distance", weekStartAt: 1 };
    let attempts = 0;
    setCallableImplementation("getGroupWeekRanking", request => {
      if ((request as { cursor?: unknown }).cursor) {
        if (++attempts === 1) throw new Error("offline");
        return { data: { entries: [{ userId: "zero", nickname: "Zero", distance: 0 }], nextCursor: null } };
      }
      return { data: { entries: [{ userId: "rider", nickname: "Rider", distance: 100 }], nextCursor: cursor } };
    });
    const { result } = renderHook(() => useGroupWeekRanking("club", "distance"));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(mockCallableInvocations).toHaveLength(1);
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.moreError).toBe(true); expect(result.current.entries).toHaveLength(1); expect(result.current.hasMore).toBe(true);
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.entries.map(entry => entry.userId)).toEqual(["rider", "zero"]);
    expect(result.current.hasMore).toBe(false);
    expect(mockCallableInvocations.filter(call => call.name === "getGroupWeekRanking").map(call => call.data)).toEqual([
      { groupId: "club", metric: "distance", pageSize: 20 },
      { groupId: "club", metric: "distance", pageSize: 20, cursor },
      { groupId: "club", metric: "distance", pageSize: 20, cursor },
    ]);
  });
  it("clears stale accumulated pages and waits for explicit reload after a revision change", async () => {
    let pageRequested = false;
    setCallableImplementation("getGroupWeekRanking", request => {
      if ((request as { cursor?: unknown }).cursor) {
        pageRequested = true;
        throw Object.assign(new Error("group_ranking_changed"), { code: "functions/failed-precondition" });
      }
      return { data: { entries: [{ userId: "old-first" }], nextCursor: { phase: "scores", userId: "old-first", value: 100, metric: "distance", weekStartAt: 1, revision: 1, membershipVersion: 1 } } };
    });
    const { result } = renderHook(() => useGroupWeekRanking("club", "distance"));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    await act(async () => { await result.current.loadMore(); });
    expect(pageRequested).toBe(true); expect(result.current.entries).toEqual([]); expect(result.current.error).toBe(true); expect(result.current.hasMore).toBe(false);
    expect(mockCallableInvocations.filter(call => call.name === "getGroupWeekRanking")).toHaveLength(2);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(mockCallableInvocations.filter(call => call.name === "getGroupWeekRanking")).toHaveLength(3);
  });
  it("discards old metric responses and clears old rows while the new metric loads", async () => {
    let resolve!: (response: unknown) => void;
    setCallableImplementation("getGroupWeekRanking", request => (request as { metric: string }).metric === "distance"
      ? new Promise(done => { resolve = done; }) : { data: { entries: [{ userId: "time" }], nextCursor: null } });
    const { result, rerender } = renderHook(({ metric }) => useGroupWeekRanking("club", metric), { initialProps: { metric: "distance" as "distance" | "time" } });
    await waitFor(() => expect(mockCallableInvocations).toHaveLength(1));
    rerender({ metric: "time" });
    await waitFor(() => expect(result.current.entries[0]?.userId).toBe("time"));
    await act(async () => { resolve({ data: { entries: [{ userId: "old" }], nextCursor: null } }); });
    expect(result.current.entries[0].userId).toBe("time");
  });
});
