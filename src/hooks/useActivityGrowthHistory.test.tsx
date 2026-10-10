import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDocs, limit, startAfter, where } from "firebase/firestore";
import { useActivityGrowthHistory } from "./useActivityGrowthHistory";
const context = vi.hoisted(() => ({ user: { uid: "owner" } as { uid: string } | null, firestore: {} }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: context.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ firestore: context.firestore }) }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
function page(count: number, owner = "owner", confirmed = true) {
  return { docs: Array.from({ length: count }, (_, i) => ({ id: `${owner}-${i}`, ref: { path: `activities/${owner}-${i}` }, data: () => ({ userId: owner, deletedAt: null, startTime: 100 - i }) })), metadata: { fromCache: !confirmed, hasPendingWrites: false } } as unknown as Awaited<ReturnType<typeof getDocs>>;
}
beforeEach(() => { context.user = { uid: "owner" }; context.firestore = {}; vi.mocked(getDocs).mockReset(); });
describe("owner-only growth history", () => {
  it("does not request anything while disabled or signed out", () => {
    const h = renderHook(() => useActivityGrowthHistory("statistics", 100, false));
    expect(getDocs).not.toHaveBeenCalled(); h.unmount(); context.user = null;
    const loggedOut = renderHook(() => useActivityGrowthHistory("comparison", 0));
    expect(getDocs).not.toHaveBeenCalled(); expect(loggedOut.result.current.activities).toEqual([]);
  });
  it("bounds statistics to one 200-document query and explicit metadata coverage", async () => {
    vi.mocked(getDocs).mockResolvedValue(page(200));
    const h = renderHook(() => useActivityGrowthHistory("statistics", 100000));
    await waitFor(() => expect(h.result.current.coverage).toBe("partial"));
    expect(getDocs).toHaveBeenCalledTimes(1); expect(limit).toHaveBeenCalledWith(200);
    expect(where).toHaveBeenCalledWith("userId", "==", "owner");
    expect(where).toHaveBeenCalledWith("deletedAt", "==", null);
    expect(where).toHaveBeenCalledWith("startTime", ">=", 100000 - 12 * 7 * 86400000);
  });
  it("does not declare cached or pending data complete", async () => {
    vi.mocked(getDocs).mockResolvedValue(page(1, "owner", false));
    const h = renderHook(() => useActivityGrowthHistory("statistics", 100));
    await waitFor(() => expect(h.result.current.coverage).toBe("partial"));
  });
  it("paginates comparisons as 3 then 7, followed by an explicit 10", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(page(3)).mockResolvedValueOnce(page(7)).mockResolvedValueOnce(page(2));
    const h = renderHook(() => useActivityGrowthHistory("comparison", 0));
    await waitFor(() => expect(h.result.current.activities).toHaveLength(10));
    expect(getDocs).toHaveBeenCalledTimes(2);
    await act(async () => h.result.current.loadMore());
    expect(getDocs).toHaveBeenCalledTimes(3); expect(startAfter).toHaveBeenCalled(); expect(limit).toHaveBeenCalledWith(10);
    expect(h.result.current.hasMore).toBe(false);
  });
  it("keeps first-page cache coverage partial when the remainder is confirmed", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(page(3, "owner", false)).mockResolvedValueOnce(page(2));
    const h = renderHook(() => useActivityGrowthHistory("comparison", 0));
    await waitFor(() => expect(h.result.current.activities).toHaveLength(5));
    expect(h.result.current.coverage).toBe("partial");
  });
  it("keeps earlier page coverage partial after a terminal load-more page", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(page(3)).mockResolvedValueOnce(page(7, "owner", false)).mockResolvedValueOnce(page(1));
    const h = renderHook(() => useActivityGrowthHistory("comparison", 0));
    await waitFor(() => expect(h.result.current.activities).toHaveLength(10));
    await act(async () => h.result.current.loadMore());
    expect(h.result.current.coverage).toBe("partial");
  });
  it("drops old account responses and hides data immediately on account changes", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof getDocs>>) => void;
    vi.mocked(getDocs).mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce(page(1, "new"));
    const h = renderHook(() => useActivityGrowthHistory("statistics", 100));
    context.user = { uid: "new" }; h.rerender();
    expect(h.result.current.activities).toEqual([]);
    await waitFor(() => expect(h.result.current.activities[0]?.userId).toBe("new"));
    await act(async () => resolve(page(1)));
    expect(h.result.current.activities[0]?.userId).toBe("new");
    context.user = null; h.rerender(); expect(h.result.current.activities).toEqual([]);
  });
  it("does not rejoin a stale request after owner A to B to A", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof getDocs>>) => void;
    vi.mocked(getDocs).mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce(page(1, "new")).mockResolvedValueOnce(page(2));
    const h = renderHook(() => useActivityGrowthHistory("statistics", 100));
    await act(async () => { context.user = { uid: "new" }; h.rerender(); });
    expect(h.result.current.activities[0]?.userId).toBe("new");
    await act(async () => { context.user = { uid: "owner" }; h.rerender(); });
    expect(h.result.current.activities).toHaveLength(2);
    await act(async () => resolve(page(1)));
    expect(h.result.current.activities).toHaveLength(2);
    expect(getDocs).toHaveBeenCalledTimes(3);
  });
  it("times out stalled reads and allows a fresh retry", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getDocs).mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce(page(1));
      const h = renderHook(() => useActivityGrowthHistory("statistics", 100));
      await act(async () => vi.advanceTimersByTimeAsync(12001));
      expect(h.result.current.error).toBe(true);
      await act(async () => h.result.current.retry());
      expect(h.result.current.coverage).toBe("ready");
      expect(getDocs).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it("drops old Firebase instance responses and deduplicates StrictMode in-flight reads", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof getDocs>>) => void;
    vi.mocked(getDocs).mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce(page(2));
    const h = renderHook(() => useActivityGrowthHistory("statistics", 100), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
    expect(getDocs).toHaveBeenCalledTimes(1);
    context.firestore = {}; h.rerender(); expect(h.result.current.activities).toEqual([]);
    await waitFor(() => expect(h.result.current.activities).toHaveLength(2));
    await act(async () => resolve(page(1)));
    expect(h.result.current.activities).toHaveLength(2);
  });
  it("rejects foreign-owner records even when returned by the query", async () => {
    vi.mocked(getDocs).mockResolvedValue(page(1, "foreign"));
    const h = renderHook(() => useActivityGrowthHistory("statistics", 100));
    await waitFor(() => expect(h.result.current.coverage).toBe("partial"));
    expect(h.result.current.activities).toEqual([]);
  });
});
