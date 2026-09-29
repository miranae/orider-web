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
beforeEach(() => { vi.mocked(getDocs).mockReset(); });
it("anchors the bounded window strictly before the viewed activity", async () => {
 vi.mocked(getDocs).mockResolvedValueOnce(snapshot());
 const { result } = renderHook(() => useRunBaselinePace("current", true, anchor));
 await waitFor(() => expect(result.current.loading).toBe(false));
 expect(where).toHaveBeenCalledWith("startTime", ">=", anchor - 28 * 86400000);
 expect(where).toHaveBeenCalledWith("startTime", "<", anchor);
 expect(result.current.paceSecPerKm).toBe(300);
});
it("does not expose the preceding activity baseline while the new request is pending", async () => {
 vi.mocked(getDocs).mockResolvedValueOnce(snapshot());
 const { result, rerender } = renderHook(({ asof }) => useRunBaselinePace("current", true, asof), { initialProps: { asof: anchor } });
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
 const first = renderHook(() => useRunBaselinePace("current", true, anchor));
 await waitFor(() => expect(first.result.current.loading).toBe(false));
 expect(first.result.current.paceSecPerKm).toBeNull();
 first.unmount();
 vi.mocked(getDocs).mockResolvedValueOnce(snapshot(3, 100));
 const second = renderHook(() => useRunBaselinePace("current", true, anchor));
 await waitFor(() => expect(second.result.current.loading).toBe(false));
 expect(second.result.current.sampleCount).toBe(0);
 expect(second.result.current.paceSecPerKm).toBeNull();
});
it("does not query when personal access is disabled", () => {
 const { result } = renderHook(() => useRunBaselinePace("current", false, anchor));
 expect(getDocs).not.toHaveBeenCalled();
 expect(result.current.paceSecPerKm).toBeNull();
});
