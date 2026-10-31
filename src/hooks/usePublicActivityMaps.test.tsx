import { act, renderHook, waitFor } from "@testing-library/react";
import { usePublicActivityMaps } from "./usePublicActivityMaps";
type Listener = { path: string; next: (snapshot: { data: () => { seq?: number } | undefined }) => void; error: (error: Error) => void; unsubscribe: ReturnType<typeof vi.fn> };
const m = vi.hoisted(() => ({ user: { uid: "owner" } as { uid: string; isAnonymous?: boolean }, services: { auth: { currentUser: {} as unknown }, firestore: {} }, load: vi.fn(), listeners: [] as Listener[] }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: m.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => m.services }));
vi.mock("../services/publicActivityMaps", () => ({ loadPublicActivityMap: (...args: unknown[]) => m.load(...args) }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => segments.join("/"),
  onSnapshot: (path: string, next: Listener["next"], error: Listener["error"]) => {
    const listener = { path, next, error, unsubscribe: vi.fn() }; m.listeners.push(listener); return listener.unsubscribe;
  },
}));
const map = { activityId: "a", revision: "r1", mapPreview: { encodedPolyline: "safe", imageUrl: null } };
const signalAt = (path: string, seq?: number) => act(() => { m.listeners.filter(l => l.path === path && !l.unsubscribe.mock.calls.length).forEach(l => l.next({ data: () => seq === undefined ? undefined : { seq } })); });
const signal = (id: string, seq?: number) => signalAt(`activity_map_signals/${id}`, seq);
const viewerSignal = (seq?: number) => signalAt("activity_map_viewer_signals/owner", seq);
beforeEach(() => { vi.clearAllMocks(); m.listeners = []; m.user = { uid: "owner", isAnonymous: true }; m.services.auth.currentUser = m.user; m.load.mockResolvedValue(map); });

it("loads once every signal has a baseline and never polls", async () => {
  vi.useFakeTimers();
  const view = renderHook(() => usePublicActivityMaps(["a", "b"]));
  try {
    expect(m.load).not.toHaveBeenCalled();
    signal("a"); expect(m.load).not.toHaveBeenCalled();
    signal("b", 3); await act(async () => {}); expect(m.load).toHaveBeenCalledTimes(2);
    await act(async () => { vi.advanceTimersByTime(10 * 60_000); window.dispatchEvent(new Event("focus")); });
    expect(m.load).toHaveBeenCalledTimes(2);
  } finally { view.unmount(); vi.useRealTimers(); }
});
it("reloads only when the public-state signal changes and keeps the same object for an unchanged revision", async () => {
  const { result } = renderHook(() => usePublicActivityMaps(["a"]));
  signal("a", 1); await waitFor(() => expect(result.current.maps.a).toEqual(map));
  const before = result.current;
  signal("a", 1); await act(async () => {}); expect(m.load).toHaveBeenCalledOnce();
  m.load.mockResolvedValue({ ...map }); signal("a", 2); await waitFor(() => expect(m.load).toHaveBeenCalledTimes(2)); await act(async () => {});
  expect(result.current).toBe(before);
});
it("replaces geometry when the refreshed revision changes", async () => {
  const { result } = renderHook(() => usePublicActivityMaps(["a"]));
  signal("a", 1); await waitFor(() => expect(result.current.maps.a).toEqual(map));
  const hidden = { ...map, revision: "r2", mapPreview: { encodedPolyline: null, imageUrl: null } }; m.load.mockResolvedValue(hidden);
  signal("a", 2); expect(result.current.maps.a).toEqual(map);
  await waitFor(() => expect(result.current.maps.a).toEqual(hidden));
});
it("does not restore stale geometry when the signalled reload fails", async () => {
  const { result } = renderHook(() => usePublicActivityMaps(["a"]));
  signal("a", 1); await waitFor(() => expect(result.current.maps.a).toEqual(map));
  m.load.mockRejectedValue(Error("offline")); signal("a", 2);
  await waitFor(() => expect(result.current.failed).toBe(true)); expect(result.current.maps).toEqual({});
});
it("still loads once when the signal subscription fails", async () => {
  const { result } = renderHook(() => usePublicActivityMaps(["a"]));
  act(() => m.listeners[0].error(Error("unavailable"))); await waitFor(() => expect(result.current.maps.a).toEqual(map));
});
it("clears offscreen maps, unsubscribes, and drops a late response", async () => {
  const { result, rerender } = renderHook(({ enabled }) => usePublicActivityMaps(["a"], enabled), { initialProps: { enabled: true } });
  signal("a", 1); await waitFor(() => expect(result.current.maps.a).toEqual(map));
  let done!: (value: unknown) => void; m.load.mockImplementation(() => new Promise(resolve => { done = resolve; }));
  signal("a", 2); rerender({ enabled: false });
  expect(result.current.maps).toEqual({}); expect(m.listeners[0].unsubscribe).toHaveBeenCalled();
  await act(async () => done(map)); expect(result.current.maps).toEqual({});
});
it("same UID identity replacement clears already verified geometry", async () => {
  const { result, rerender } = renderHook(() => usePublicActivityMaps(["a"]));
  signal("a", 1); await waitFor(() => expect(result.current.maps.a).toEqual(map));
  m.load.mockImplementation(() => new Promise(() => {})); m.user = { uid: "owner", isAnonymous: true }; m.services.auth.currentUser = m.user; rerender(); expect(result.current.maps).toEqual({});
});
it("a signed-in viewer also waits for and reloads on its relationship signal", async () => {
  m.user = { uid: "owner", isAnonymous: false }; m.services.auth.currentUser = m.user;
  const { result } = renderHook(() => usePublicActivityMaps(["a"]));
  signal("a", 1); await act(async () => {}); expect(m.load).not.toHaveBeenCalled();
  viewerSignal(); await waitFor(() => expect(result.current.maps.a).toEqual(map));
  const before = result.current; m.load.mockResolvedValue({ ...map });
  viewerSignal(1); await waitFor(() => expect(m.load).toHaveBeenCalledTimes(2)); await act(async () => {});
  expect(result.current).toBe(before);
});
it("an anonymous viewer does not subscribe to a relationship signal", () => {
  renderHook(() => usePublicActivityMaps(["a"]));
  expect(m.listeners.map(l => l.path)).toEqual(["activity_map_signals/a"]);
});
it("reloads once more after an in-flight load when a signal arrives meanwhile", async () => {
  let done!: (value: unknown) => void; m.load.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  const { result } = renderHook(() => usePublicActivityMaps(["a"]));
  signal("a", 1); expect(m.load).toHaveBeenCalledOnce();
  signal("a", 2); signal("a", 3); expect(m.load).toHaveBeenCalledOnce();
  const fresh = { ...map, revision: "r2" }; m.load.mockResolvedValue(fresh);
  await act(async () => done(map));
  await waitFor(() => expect(result.current.maps.a).toEqual(fresh)); expect(m.load).toHaveBeenCalledTimes(2);
});
it("retries a failed load a few times without a new signal", async () => {
  vi.useFakeTimers();
  m.load.mockRejectedValue(Error("timeout"));
  const view = renderHook(() => usePublicActivityMaps(["a"]));
  try {
    signal("a", 1); await act(async () => {}); expect(view.result.current.failed).toBe(true);
    m.load.mockResolvedValue(map);
    await act(async () => { vi.advanceTimersByTime(5_000); }); await act(async () => {});
    expect(m.load).toHaveBeenCalledTimes(2); expect(view.result.current.maps.a).toEqual(map);
    await act(async () => { vi.advanceTimersByTime(10 * 60_000); }); expect(m.load).toHaveBeenCalledTimes(2);
  } finally { view.unmount(); vi.useRealTimers(); }
});
it("stops retrying after the bounded attempts", async () => {
  vi.useFakeTimers();
  m.load.mockRejectedValue(Error("down"));
  const view = renderHook(() => usePublicActivityMaps(["a"]));
  try {
    signal("a", 1); await act(async () => {});
    for (const ms of [5_000, 20_000, 60_000, 10 * 60_000]) { await act(async () => { vi.advanceTimersByTime(ms); }); await act(async () => {}); }
    expect(m.load).toHaveBeenCalledTimes(4);
  } finally { view.unmount(); vi.useRealTimers(); }
});
