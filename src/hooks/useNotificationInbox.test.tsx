import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { simulateLogin } from "../__tests__/mocks/firebase";
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
