import { act, renderHook, waitFor } from "@testing-library/react";
import { usePublicActivityMaps } from "./usePublicActivityMaps";
const m = vi.hoisted(() => ({ user: { uid: "owner" }, services: { auth: { currentUser: {} } }, load: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: m.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => m.services }));
vi.mock("../services/publicActivityMaps", () => ({ loadPublicActivityMap: (...args: unknown[]) => m.load(...args) }));
const map = { activityId: "a", revision: "r1", mapPreview: { encodedPolyline: "safe", imageUrl: null } };
beforeEach(() => { vi.clearAllMocks(); m.user = { uid: "owner" }; m.services.auth.currentUser = m.user; Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); m.load.mockResolvedValue(map); });
it("clears geometry before focus refresh and does not restore stale geometry on network failure", async () => {
 const { result } = renderHook(() => usePublicActivityMaps(["a"])); await waitFor(() => expect(result.current.maps.a).toEqual(map));
 m.load.mockRejectedValue(Error("offline")); act(() => window.dispatchEvent(new Event("focus"))); expect(result.current.maps).toEqual({}); await waitFor(() => expect(result.current.failed).toBe(true));
});
it("clears hidden/offscreen maps and refreshes only on visible return", async () => {
 const { result, rerender } = renderHook(({ enabled }) => usePublicActivityMaps(["a"], enabled), { initialProps: { enabled: true } }); await waitFor(() => expect(result.current.maps.a).toEqual(map));
 Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); act(() => document.dispatchEvent(new Event("visibilitychange"))); expect(result.current.maps).toEqual({}); expect(m.load).toHaveBeenCalledOnce();
 Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); act(() => document.dispatchEvent(new Event("visibilitychange"))); await waitFor(() => expect(m.load).toHaveBeenCalledTimes(2));
 rerender({ enabled: false }); expect(result.current.maps).toEqual({});
});
it("same UID identity replacement clears already verified geometry", async () => {
 const { result, rerender } = renderHook(() => usePublicActivityMaps(["a"])); await waitFor(() => expect(result.current.maps.a).toEqual(map));
 m.load.mockImplementation(() => new Promise(() => {})); m.user = { uid: "owner" }; m.services.auth.currentUser = m.user; rerender(); expect(result.current.maps).toEqual({});
});
it("drops a late focus-refresh response after hiding", async () => {
 const { result } = renderHook(() => usePublicActivityMaps(["a"])); await waitFor(() => expect(result.current.maps.a).toEqual(map));
 let done!: (value: unknown) => void; m.load.mockImplementation(() => new Promise(resolve => { done = resolve; }));
 act(() => window.dispatchEvent(new Event("focus"))); Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); act(() => document.dispatchEvent(new Event("visibilitychange")));
 await act(async () => done(map)); expect(result.current.maps).toEqual({});
});

it("polls only while the document is visible at the thirty-second boundary", async () => {
 vi.useFakeTimers(); const view = renderHook(() => usePublicActivityMaps(["a"]));
 try {
   await act(async () => {}); expect(m.load).toHaveBeenCalledOnce();
   await act(async () => { vi.advanceTimersByTime(30_000); }); expect(m.load).toHaveBeenCalledTimes(2);
   Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
   await act(async () => { document.dispatchEvent(new Event("visibilitychange")); vi.advanceTimersByTime(60_000); });
   expect(m.load).toHaveBeenCalledTimes(2); expect(view.result.current.maps).toEqual({});
 } finally { view.unmount(); vi.useRealTimers(); }
});
