import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { simulateLogin } from "../__tests__/mocks/firebase";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { useNotificationInbox } from "./useNotificationInbox";
const state = vi.hoisted(() => ({ user: { uid: "a", isAnonymous: false }, list: vi.fn(), markRead: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("../services/webNotifications", () => ({ createWebNotificationClient: () => ({ list: state.list, markRead: state.markRead }) }));
beforeEach(() => { vi.clearAllMocks(); state.user = { uid: "a", isAnonymous: false }; state.list.mockResolvedValue({ items: [{ id: "a-row", message: "private", read: false }], nextCursor: null }); });
afterEach(cleanup);
it("drops previous-account notifications and late read responses", async () => {
  const { result, rerender } = renderHook(() => useNotificationInbox());
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  let resolve!: (v: unknown) => void;
  state.list.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  act(() => { void result.current.refresh(); });
  state.user = { uid: "b", isAnonymous: false }; state.list.mockResolvedValue({ items: [], nextCursor: null }); rerender();
  await waitFor(() => expect(result.current.items).toHaveLength(0));
  await act(async () => resolve({ items: [{ id: "stale", message: "private" }], nextCursor: null }));
  expect(result.current.items).toHaveLength(0);
});
it("clears cached sensitive rows on a failed permission refresh and retries", async () => {
  const { result } = renderHook(() => useNotificationInbox());
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  state.list.mockRejectedValueOnce(new Error("offline"));
  await act(async () => result.current.refresh());
  expect(result.current.items).toHaveLength(0); expect(result.current.failed).toBe(true);
  state.list.mockResolvedValue({ items: [{ id: "a-row", type: "unavailable", access: "unavailable" }], nextCursor: null });
  await act(async () => result.current.refresh());
  expect(result.current.items[0]?.message).toBeUndefined();
});

it("recreates the client and hides stale rows when the same UID gets a new auth identity", async () => {
  const { result, rerender } = renderHook(() => useNotificationInbox());
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  let resolve!: (value: unknown) => void;
  state.list.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  state.user = { uid: "a", isAnonymous: false }; rerender();
  expect(result.current.items).toHaveLength(0);
  await act(async () => resolve({ items: [{ id: "new-session" }], nextCursor: null }));
  expect(result.current.items[0]?.id).toBe("new-session");
});
it("removes the inbox while backgrounded and revalidates on return", async () => {
  const { result } = renderHook(() => useNotificationInbox()); await waitFor(() => expect(result.current.items).toHaveLength(1));
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange"))); expect(result.current.items).toHaveLength(0);
  state.list.mockResolvedValue({ items: [], nextCursor: null }); visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await waitFor(() => expect(result.current.loading).toBe(false)); expect(result.current.items).toHaveLength(0); visibility.mockRestore();
});

it.each(["functions/permission-denied", "functions/unauthenticated"])("clears rows and invalidates pending pagination when mark-read returns %s", async (code) => {
  simulateLogin({ uid: "a" });
  state.list.mockResolvedValueOnce({ items: [{ id: "a-row", message: "private" }], nextCursor: "next" });
  const { result } = renderHook(() => useNotificationInbox());
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  let resolve!: (value: unknown) => void;
  state.list.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  act(() => { void result.current.more(); });
  state.markRead.mockRejectedValueOnce({ code });
  await act(async () => result.current.markRead(["a-row"]));
  expect(result.current.items).toHaveLength(0);
  await act(async () => resolve({ items: [{ id: "late-private" }], nextCursor: null }));
  expect(result.current.items).toHaveLength(0);
  expect(result.current.failed).toBe(true);
});

it("coalesces focus bursts while the current inbox read is pending", async () => {
  let resolve!: (value: unknown) => void;
  state.list.mockReturnValue(new Promise(r => { resolve = r; }));
  const { result } = renderHook(() => useNotificationInbox());
  act(() => { for (let n = 0; n < 12; n += 1) window.dispatchEvent(new Event("focus")); });
  expect(state.list).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ items: [{ id: "current" }], nextCursor: null }));
  expect(result.current.items[0]?.id).toBe("current");
});

it("skips hidden polls and renews the generation once on visible plus focus", async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  try {
    const { result } = renderHook(() => useNotificationInbox());
    await act(async () => {});
    let oldResolve!: (value: unknown) => void;
    state.list.mockReturnValueOnce(new Promise(r => { oldResolve = r; }));
    act(() => { void result.current.refresh(); });
    visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(state.list).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([]);
    let freshResolve!: (value: unknown) => void;
    state.list.mockReturnValueOnce(new Promise(r => { freshResolve = r; }));
    visibility.mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    expect(state.list).toHaveBeenCalledTimes(3);
    await act(async () => oldResolve({ items: [{ id: "stale" }], nextCursor: null }));
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(true);
    await act(async () => freshResolve({ items: [{ id: "fresh" }], nextCursor: null }));
    expect(result.current.items[0]?.id).toBe("fresh");
  } finally { visibility.mockRestore(); vi.useRealTimers(); }
});

describe("notification signal subscription", () => {
  type Listener = (snap: { exists: () => boolean; data: () => Record<string, unknown> }) => void;
  const signal = (revision: number) => ({ exists: () => true, data: () => ({ revision }) });
  it("does not poll while open and re-reads only when the signal revision changes", async () => {
    const { onSnapshot } = await import("firebase/firestore");
    const original = vi.mocked(onSnapshot).getMockImplementation();
    let listener: Listener | undefined; let path = "";
    vi.mocked(onSnapshot).mockImplementation(((ref: { path?: string }, next: Listener) => { path = String(ref?.path ?? ""); listener = next; return () => {}; }) as unknown as typeof onSnapshot);
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useNotificationInbox());
      await act(async () => {});
      expect(path).toContain("notification_signals/a");
      act(() => listener?.(signal(6)));
      await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
      expect(state.list).toHaveBeenCalledTimes(1);
      act(() => listener?.(signal(6)));
      expect(state.list).toHaveBeenCalledTimes(1);
      state.list.mockResolvedValue({ items: [{ id: "new" }], nextCursor: null });
      await act(async () => listener?.(signal(7)));
      expect(state.list).toHaveBeenCalledTimes(2);
      expect(result.current.items[0]?.id).toBe("new");
    } finally { vi.useRealTimers(); vi.mocked(onSnapshot).mockImplementation(original!); }
  });
  it("starts the first read from the first signal snapshot so nothing between them is missed", async () => {
    const { onSnapshot } = await import("firebase/firestore");
    const original = vi.mocked(onSnapshot).getMockImplementation();
    let listener: Listener | undefined;
    vi.mocked(onSnapshot).mockImplementation(((_ref: unknown, next: Listener) => { listener = next; return () => {}; }) as unknown as typeof onSnapshot);
    try {
      renderHook(() => useNotificationInbox());
      await act(async () => {});
      expect(state.list).not.toHaveBeenCalled();
      await act(async () => listener?.(signal(3)));
      expect(state.list).toHaveBeenCalledTimes(1);
    } finally { vi.mocked(onSnapshot).mockImplementation(original!); }
  });
  it("reads again when a newer signal arrives during a tab-return or explicit refresh", async () => {
    const { onSnapshot } = await import("firebase/firestore");
    const original = vi.mocked(onSnapshot).getMockImplementation();
    let listener: Listener | undefined;
    vi.mocked(onSnapshot).mockImplementation(((_ref: unknown, next: Listener) => { listener = next; return () => {}; }) as unknown as typeof onSnapshot);
    try {
      const { result } = renderHook(() => useNotificationInbox());
      await act(async () => listener?.(signal(1)));
      expect(state.list).toHaveBeenCalledTimes(1);
      let resolve!: (value: unknown) => void;
      state.list.mockReturnValueOnce(new Promise(r => { resolve = r; }));
      act(() => { void result.current.refresh(); });
      expect(state.list).toHaveBeenCalledTimes(2);
      await act(async () => listener?.(signal(2)));
      expect(state.list).toHaveBeenCalledTimes(2);
      state.list.mockResolvedValue({ items: [{ id: "arrived-during-explicit-refresh" }], nextCursor: null });
      await act(async () => resolve({ items: [], nextCursor: null }));
      await waitFor(() => expect(state.list).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(result.current.items[0]?.id).toBe("arrived-during-explicit-refresh"));
    } finally { vi.mocked(onSnapshot).mockImplementation(original!); }
  });
  it("reads again after an in-flight read when a newer signal arrives meanwhile", async () => {
    const { onSnapshot } = await import("firebase/firestore");
    const original = vi.mocked(onSnapshot).getMockImplementation();
    let listener: Listener | undefined;
    vi.mocked(onSnapshot).mockImplementation(((_ref: unknown, next: Listener) => { listener = next; return () => {}; }) as unknown as typeof onSnapshot);
    try {
      let resolve!: (value: unknown) => void;
      state.list.mockReturnValueOnce(new Promise(r => { resolve = r; }));
      const { result } = renderHook(() => useNotificationInbox());
      await act(async () => listener?.(signal(1)));
      expect(state.list).toHaveBeenCalledTimes(1);
      await act(async () => listener?.(signal(2)));
      expect(state.list).toHaveBeenCalledTimes(1);
      state.list.mockResolvedValue({ items: [{ id: "arrived-during-read" }], nextCursor: null });
      await act(async () => resolve({ items: [], nextCursor: null }));
      await waitFor(() => expect(state.list).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(result.current.items[0]?.id).toBe("arrived-during-read"));
    } finally { vi.mocked(onSnapshot).mockImplementation(original!); }
  });
});

it("uses an owned Redis signal and keeps pagination on a reconnect with the same revision", async () => {
  const { onSnapshot } = await import("firebase/firestore");
  const originalSnapshot = vi.mocked(onSnapshot).getMockImplementation();
  vi.mocked(onSnapshot).mockImplementation(() => () => {});
  const sockets: FakeSocket[] = [];
  class FakeSocket extends EventTarget {
    static CLOSING = 2;
    readyState = 1;
    send = vi.fn();
    close = vi.fn();
    constructor(public url: string) { super(); sockets.push(this); }
    deliver(revision: string | null) {
      this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ v: 1, type: "notification_signal", revision }) }));
    }
  }
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  vi.stubEnv("VITE_ORIDER_LOCAL_WORLD", "1");
  vi.stubEnv("VITE_ORIDER_LOCAL_NOTIFICATION_REDIS", "1");
  resetRuntimeConfigForTests({ useEmulators: true, firebaseProjectId: "demo-orider-lab" });
  Object.assign(state.user, { getIdToken: async () => "local-test-token" });
  try {
    const { result, unmount } = renderHook(() => useNotificationInbox());
    await act(async () => {});
    expect(sockets[0]?.url).toBe("ws://127.0.0.1:19487/notification-signals");
    sockets[0]?.dispatchEvent(new Event("open"));
    expect(sockets[0]?.send).toHaveBeenCalledWith(JSON.stringify({ v: 1, type: "notification_subscribe", token: "local-test-token" }));
    expect(onSnapshot).toHaveBeenCalledOnce();
    const initialReads = state.list.mock.calls.length;
    const revision = "1790000000:012345678";
    await act(async () => sockets[0]?.deliver(revision));
    await act(async () => sockets[0]?.deliver(revision));
    expect(state.list).toHaveBeenCalledTimes(initialReads + 1);
    state.list.mockImplementation(async (cursor?: string) => cursor === "page-2"
      ? { items: [{ id: "older" }], nextCursor: null }
      : { items: [{ id: "newest" }], nextCursor: "page-2" });
    await act(async () => result.current.refresh());
    await act(async () => result.current.more());
    expect(result.current.items.map(item => item.id)).toEqual(["newest", "older"]);
    act(() => { sockets[0]?.dispatchEvent(new CloseEvent("close", { code: 1013 })); });
    const canonicalSignal = vi.mocked(onSnapshot).mock.calls[1]?.[2] as (snap: unknown) => void;
    await act(async () => canonicalSignal({
      metadata: { fromCache: false }, exists: () => true, data: () => ({ revision: 2 }),
    }));
    expect(result.current.items.map(item => item.id)).toEqual(["newest", "older"]);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(sockets).toHaveLength(2);
    expect(onSnapshot).toHaveBeenCalledTimes(2);
    const fallbackReads = state.list.mock.calls.length;
    await act(async () => sockets[1]?.deliver(revision));
    expect(state.list).toHaveBeenCalledTimes(fallbackReads);
    act(() => { sockets[1]?.dispatchEvent(new CloseEvent("close", { code: 4003 })); });
    expect(result.current.items).toEqual([]);
    expect(result.current.failed).toBe(true);
    unmount();
  } finally {
    vi.mocked(onSnapshot).mockImplementation(originalSnapshot!);
    vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetRuntimeConfigForTests();
  }
});
