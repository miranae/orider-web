import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs, where, type QuerySnapshot } from "firebase/firestore";
import { beforeEach, expect, it, vi } from "vitest";
import { useRunBaselinePace } from "./useRunBaselinePace";
const auth = vi.hoisted(() => ({ user: { uid: "owner" } }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => auth }));
const anchor = 1_800_000_000_000;
function snapshot(count = 3, speed = 12): QuerySnapshot {
 return { docs: Array.from({ length: count }, (_, index) => ({ id: `run-${index}`, data: () => ({ type: "Run", startTime: anchor - 86400000, summary: { distance: 5000, averageSpeed: speed } }) })) } as unknown as QuerySnapshot;
}
beforeEach(() => { vi.mocked(getDocs).mockReset(); auth.user = { uid: "owner" }; });
it("anchors the bounded window strictly before the viewed activity", async () => {
 vi.mocked(getDocs).mockResolvedValueOnce(snapshot());
 const { result } = renderHook(() => useRunBaselinePace("current", true, anchor, "Run"));
 await waitFor(() => expect(result.current.loading).toBe(false));
 expect(where).toHaveBeenCalledWith("startTime", ">=", anchor - 28 * 86400000);
 expect(where).toHaveBeenCalledWith("startTime", "<", anchor);
 expect(result.current.paceSecPerKm).toBe(300);
});
it("does not expose the preceding activity baseline while the new request is pending", async () => {
 vi.mocked(getDocs).mockResolvedValueOnce(snapshot());
 const { result, rerender } = renderHook(({ asof }) => useRunBaselinePace("current", true, asof, "Run"), { initialProps: { asof: anchor } });
 await waitFor(() => expect(result.current.paceSecPerKm).toBe(300));
 let resolve!: (value: QuerySnapshot) => void;
 vi.mocked(getDocs).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
 rerender({ asof: anchor - 86400000 });
 expect(result.current.paceSecPerKm).toBeNull();
 expect(result.current.loading).toBe(true);
 await act(async () => resolve(snapshot()));
});
it("declines a truncated window and implausible running measurements", async () => {
 vi.mocked(getDocs).mockResolvedValueOnce(snapshot(100));
 const first = renderHook(() => useRunBaselinePace("current", true, anchor, "Run"));
 await waitFor(() => expect(first.result.current.loading).toBe(false));
 expect(first.result.current.paceSecPerKm).toBeNull();
 first.unmount();
 vi.mocked(getDocs).mockResolvedValueOnce(snapshot(3, 100));
 const second = renderHook(() => useRunBaselinePace("current", true, anchor, "Run"));
 await waitFor(() => expect(second.result.current.loading).toBe(false));
 expect(second.result.current.sampleCount).toBe(0);
 expect(second.result.current.paceSecPerKm).toBeNull();
});
it("does not query when personal access is disabled", () => {
 const { result } = renderHook(() => useRunBaselinePace("current", false, anchor, "Run"));
 expect(getDocs).not.toHaveBeenCalled();
 expect(result.current.paceSecPerKm).toBeNull();
});

function mixedSnapshot(rows: Array<{ type?: string; startTime?: number; averageSpeed?: number; createdAt?: number }>): QuerySnapshot {
 return { docs: rows.map((row, index) => ({ id: `run-${index}`, data: () => ({ ...row, startTime: row.startTime ?? anchor - 86400000, summary: { distance: 5000, averageSpeed: row.averageSpeed ?? 12 } }) })) } as unknown as QuerySnapshot;
}
it("keeps road, trail and virtual comparisons separate and ignores missing type", async () => {
 const rows = [{ type: "run" }, { type: "Run" }, { type: "RUN" }, { type: "TrailRun", averageSpeed: 6 }, { type: "VirtualRun", averageSpeed: 20 }, { type: "Ride", averageSpeed: 30 }, {}];
 vi.mocked(getDocs).mockResolvedValueOnce(mixedSnapshot(rows));
 const { result } = renderHook(() => useRunBaselinePace("current", true, anchor, "Run"));
 await waitFor(() => expect(result.current.loading).toBe(false));
 expect(result.current.paceSecPerKm).toBe(300);
 expect(result.current.sampleCount).toBe(3);
 expect(result.current.comparisonType).toBe("run");
});
it.each(["TrailRun", "VirtualRun"])("requires three matching %s samples instead of borrowing road runs", async type => {
 vi.mocked(getDocs).mockResolvedValueOnce(mixedSnapshot([{ type }, { type }, { type: "Run" }, { type: "Run" }, { type: "Run" }]));
 const { result } = renderHook(() => useRunBaselinePace("current", true, anchor, type));
 await waitFor(() => expect(result.current.loading).toBe(false));
 expect(result.current.sampleCount).toBe(2);
 expect(result.current.paceSecPerKm).toBeNull();
 expect(result.current.windowComplete).toBe(true);
});
it("does not query with a missing or unsupported current activity type", () => {
 const missing = renderHook(() => useRunBaselinePace("current", true, anchor));
 expect(missing.result.current.loading).toBe(false);
 missing.unmount();
 const unknown = renderHook(() => useRunBaselinePace("current", true, anchor, "running"));
 expect(unknown.result.current.comparisonType).toBeNull();
 expect(getDocs).not.toHaveBeenCalled();
});
it("rejects late imports outside the activity-time window and future runs", async () => {
 vi.mocked(getDocs).mockResolvedValueOnce(mixedSnapshot([
  { type: "Run" }, { type: "Run" },
  { type: "Run", startTime: anchor - 29 * 86400000, createdAt: anchor + 86400000 },
  { type: "Run", startTime: anchor }, { type: "Run", startTime: anchor + 86400000 },
 ]));
 const { result } = renderHook(() => useRunBaselinePace("current", true, anchor, "Run"));
 await waitFor(() => expect(result.current.loading).toBe(false));
 expect(result.current.sampleCount).toBe(2);
 expect(result.current.paceSecPerKm).toBeNull();
});
it("clears a road baseline immediately on a subtype switch and ignores a late prior response", async () => {
 let resolveRoad!: (value: QuerySnapshot) => void;
 vi.mocked(getDocs).mockImplementationOnce(() => new Promise(done => { resolveRoad = done; }));
 const { result, rerender } = renderHook(({ type }) => useRunBaselinePace("current", true, anchor, type), { initialProps: { type: "Run" } });
 vi.mocked(getDocs).mockResolvedValueOnce(mixedSnapshot([{ type: "TrailRun", averageSpeed: 6 }, { type: "TrailRun", averageSpeed: 6 }, { type: "TrailRun", averageSpeed: 6 }]));
 rerender({ type: "TrailRun" });
 expect(result.current.paceSecPerKm).toBeNull();
 await waitFor(() => expect(result.current.paceSecPerKm).toBe(600));
 await act(async () => resolveRoad(snapshot()));
 expect(result.current.paceSecPerKm).toBe(600);
 expect(result.current.comparisonType).toBe("trailrun");
});

it("clears prior-owner comparison evidence immediately on an account switch", async () => {
 vi.mocked(getDocs).mockResolvedValueOnce(snapshot());
 const { result, rerender } = renderHook(() => useRunBaselinePace("current", true, anchor, "Run"));
 await waitFor(() => expect(result.current.paceSecPerKm).toBe(300));
 let resolve!: (value: QuerySnapshot) => void;
 vi.mocked(getDocs).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
 auth.user = { uid: "different-owner" };
 rerender();
 expect(result.current.sampleCount).toBe(0);
 expect(result.current.windowComplete).toBeNull();
 expect(result.current.paceSecPerKm).toBeNull();
 await act(async () => resolve(snapshot()));
});
it("keeps query failure distinct from a completed empty window", async () => {
 vi.mocked(getDocs).mockRejectedValueOnce(new Error("query unavailable"));
 const { result } = renderHook(() => useRunBaselinePace("current", true, anchor, "Run"));
 await waitFor(() => expect(result.current.loading).toBe(false));
 expect(result.current.windowComplete).toBeNull();
 expect(result.current.paceSecPerKm).toBeNull();
});
