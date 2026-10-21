import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../contexts/ToastContext";
import { getDocs, query } from "firebase/firestore";
import { mockCollectionData, setCollectionDocs } from "../__tests__/mocks/firebase";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { useActivities, useActivitySearch } from "./useActivities";

const state = vi.hoisted(() => ({ user: { uid: "viewer", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, admit: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("../config/activitySubscriptions", () => ({ ACTIVITY_SUBSCRIPTIONS_ENABLED: true }));
vi.mock("../services/subscriptionFeed", () => ({ admitSubscriptionActivities: state.admit }));
function wrapper({ children }: { children: ReactNode }) { return <MemoryRouter><ToastProvider>{children}</ToastProvider></MemoryRouter>; }
function activity(id: string, userId: string, startTime: number, visibility = "everyone") {
  return { id, ...createMockActivity({ id, userId, startTime, visibility, deletedAt: null, keywords: ["ride"], profileImage: "https://example.com/avatar.jpg" }) };
}
type Constraint = { type: string; args: unknown[] };
const originalQuery = vi.mocked(query).getMockImplementation();
const originalDocs = vi.mocked(getDocs).getMockImplementation();
afterEach(() => {
  vi.mocked(query).mockReset(); vi.mocked(getDocs).mockReset();
  if (originalQuery) vi.mocked(query).mockImplementation(originalQuery);
  if (originalDocs) vi.mocked(getDocs).mockImplementation(originalDocs);
});
beforeEach(() => {
  vi.mocked(query).mockImplementation(((_col: unknown, ...constraints: Constraint[]) => ({ constraints })) as never);
  vi.mocked(getDocs).mockImplementation((async (request: { constraints: Constraint[] }) => {
    let rows = [...(mockCollectionData.get("activities") ?? [])].filter(row => request.constraints.every(({ type, args }) => {
      if (type !== "where") return true;
      const [field, op, value] = args;
      const actual = row[field as string];
      return op === "in" ? (value as unknown[]).includes(actual) : op === "array-contains" ? (actual as unknown[]).includes(value) : actual === value;
    })).sort((a, b) => Number(b.startTime) - Number(a.startTime));
    const cursor = request.constraints.find(c => c.type === "startAfter")?.args[0] as { id: string } | undefined;
    if (cursor) rows = rows.slice(rows.findIndex(row => row.id === cursor.id) + 1);
    const count = request.constraints.find(c => c.type === "limit")?.args[0] as number;
    return { docs: rows.slice(0, count).map(row => ({ id: row.id, data: () => row, ref: { path: `activities/${row.id}` } })) };
  }) as never);
  state.user = { uid: "viewer", isAnonymous: false };
  state.admit.mockReset().mockImplementation(async (_uid, items) => items);
});

it("merges all subscription chunks globally newest first and keeps only own private activities", async () => {
  const ids = Array.from({ length: 7 }, (_, index) => `target-${index}`);
  const expected = Array.from({ length: 16 }, (_, index) => activity(`a${index}`, ids[index % ids.length]!, 100000 + index));
  setCollectionDocs("activities", [...expected, activity("own", "viewer", 200000, "private"), activity("unrelated", "other", 300000), activity("friends-only", ids[0]!, 400000, "friends")]);
  const { result } = renderHook(() => useActivities("following", ["other"], { subscriptionIds: ids, subscriptionKey: "one" }), { wrapper });
  await waitFor(() => expect(result.current.loadingMore).toBe(false));
  await waitFor(() => expect(result.current.activities).toHaveLength(10));
  expect(result.current.activities.map(item => item.id)).toEqual(["own", ...expected.slice().reverse().slice(0, 9).map(item => item.id)]);
  await act(async () => { await result.current.loadMore(); });
  expect(result.current.activities.map(item => item.id)).toEqual(["own", ...expected.slice().reverse().map(item => item.id)]);
  expect(result.current.hasMore).toBe(false);
});

it("advances rejected candidates without calling an empty page the end", async () => {
  state.admit.mockResolvedValue([]);
  setCollectionDocs("activities", Array.from({ length: 18 }, (_, index) => activity(`a${index}`, "target", 100000 + index)));
  const { result } = renderHook(() => useActivities("following", [], { subscriptionIds: ["target"], subscriptionKey: "one" }), { wrapper });
  await waitFor(() => expect(state.admit).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.loadingMore).toBe(false));
  expect(result.current.activities).toEqual([]);
  expect(result.current.hasMore).toBe(true);
  await act(async () => { await result.current.loadMore(); });
  expect(result.current.activities).toEqual([]);
  expect(result.current.hasMore).toBe(false);
});

it("discards pending admission after the subscription generation changes", async () => {
  let resolveOld!: (items: ReturnType<typeof activity>[]) => void;
  state.admit.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const old = activity("old", "target", 100000);
  setCollectionDocs("activities", [old]);
  const { result, rerender } = renderHook(({ generation }) => useActivities("following", [], { subscriptionIds: ["target"], subscriptionKey: generation }), { wrapper, initialProps: { generation: "old" } });
  await waitFor(() => expect(state.admit).toHaveBeenCalled());
  setCollectionDocs("activities", []);
  rerender({ generation: "new" });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { resolveOld([old]); });
  expect(result.current.activities).toEqual([]);
});

it("restricts keyword search to own and subscribed public candidates before admission", async () => {
  setCollectionDocs("activities", [activity("subscribed", "target", 100000), activity("own", "viewer", 200000, "private"), activity("other", "unrelated", 300000), activity("friends", "target", 400000, "friends")]);
  state.admit.mockImplementation(async (_uid, items) => items.filter((item: { id: string }) => item.id !== "subscribed"));
  const { result } = renderHook(() => useActivitySearch(new Set(["unrelated"]), { ids: ["target"], key: "one", ready: true }), { wrapper });
  act(() => result.current.search("ride"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() => expect(result.current.allResults.map(item => item.id)).toEqual(["own"]));
  expect(state.admit.mock.calls[0]![1].map((item: { id: string }) => item.id)).toEqual(["own", "subscribed"]);
});
