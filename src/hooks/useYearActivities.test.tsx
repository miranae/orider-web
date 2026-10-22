import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocs, query, where } from "firebase/firestore";
import { useYearActivities } from "./useYearActivities";

vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
type Snapshot = Awaited<ReturnType<typeof getDocs>>;
function snapshot(id: string): Snapshot {
  return { docs: [{ id, data: () => ({ summary: { distance: 1000 } }) }] } as unknown as Snapshot;
}
function deferred() {
  let resolve!: (value: Snapshot) => void;
  const promise = new Promise<Snapshot>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { vi.mocked(getDocs).mockReset(); vi.mocked(query).mockClear(); });
afterEach(() => vi.useRealTimers());

describe("annual activity loading", () => {
  it("uses flat owner/deletion filters so persisted targets can be reused", async () => {
    vi.mocked(getDocs).mockResolvedValue(snapshot("ride"));
    const h = renderHook(() => useYearActivities("owner"));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const constraints = vi.mocked(query).mock.calls.at(-1)!.slice(1);
    expect(constraints).toHaveLength(3);
    expect(constraints[0]).toEqual(vi.mocked(where).mock.results.at(-2)!.value);
    expect(constraints[1]).toEqual(vi.mocked(where).mock.results.at(-1)!.value);
    expect(where).toHaveBeenCalledWith("userId", "==", "owner");
    expect(where).toHaveBeenCalledWith("deletedAt", "==", null);
    expect(h.result.current.activities[0]?.id).toBe("ride");
    expect(h.result.current.error).toBe(false);
  });

  it("ends stalled reads with an error and retries without accepting late results", async () => {
    vi.useFakeTimers();
    const old = deferred();
    vi.mocked(getDocs).mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot("retry"));
    const h = renderHook(() => useYearActivities("owner"));
    await act(async () => vi.advanceTimersByTimeAsync(12_000));
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.error).toBe(true);
    await act(async () => h.result.current.retry());
    expect(h.result.current.activities[0]?.id).toBe("retry");
    expect(h.result.current.error).toBe(false);
    await act(async () => old.resolve(snapshot("stale")));
    expect(h.result.current.activities[0]?.id).toBe("retry");
    expect(getDocs).toHaveBeenCalledTimes(2);
    h.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports rejected reads instead of an empty successful year", async () => {
    vi.mocked(getDocs).mockRejectedValue(new Error("permission-denied"));
    const h = renderHook(() => useYearActivities("owner"));
    await waitFor(() => expect(h.result.current.error).toBe(true));
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.activities).toEqual([]);
  });

  it("drops previous-account results and does not read while signed out", async () => {
    const old = deferred();
    vi.mocked(getDocs).mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot("new-owner"));
    const h = renderHook(({ uid }: { uid: string | undefined }) => useYearActivities(uid), { initialProps: { uid: "owner" as string | undefined } });
    h.rerender({ uid: "new-owner" });
    expect(h.result.current.activities).toEqual([]);
    await waitFor(() => expect(h.result.current.activities[0]?.id).toBe("new-owner"));
    await act(async () => old.resolve(snapshot("old-owner")));
    expect(h.result.current.activities[0]?.id).toBe("new-owner");
    h.rerender({ uid: undefined });
    expect(h.result.current.activities).toEqual([]);
    expect(h.result.current.loading).toBe(false);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });
});
