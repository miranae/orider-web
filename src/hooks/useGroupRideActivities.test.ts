import { act, renderHook, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { useGroupRideActivities } from "./useGroupRideActivities";
import { loadActivityDiscovery } from "../services/activityDiscovery";
import { createMockActivity } from "../__tests__/fixtures/mockData";
vi.mock("../services/activityDiscovery", () => ({ loadActivityDiscovery: vi.fn() }));
const owner = { uid: "owner" } as User;
const page = (ids: string[], cursor: string | null = null) => ({ items: ids.map(id => createMockActivity({ id })), nextCursor: cursor, exhausted: !cursor, scannedCount: 20, totalCount: null, expiresAt: Date.now() + 600000, order: "startTime_desc" as const, includesUndated: false, consistency: "current_authorized_seek_pages" as const });
beforeEach(() => { vi.mocked(loadActivityDiscovery).mockReset(); });
it("continues an empty authorized page and deduplicates later records", async () => {
  vi.mocked(loadActivityDiscovery).mockResolvedValueOnce(page([], "first")).mockResolvedValueOnce(page(["a"], "next")).mockResolvedValueOnce(page(["a", "b"]));
  const { result } = renderHook(() => useGroupRideActivities("ride", owner));
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  expect(result.current.activities).toEqual([]);
  await act(async () => result.current.loadMore());
  await act(async () => result.current.loadMore());
  expect(result.current.activities.map(a => a.id)).toEqual(["a", "b"]);
  expect(result.current.hasMore).toBe(false);
});
it("does not append an old page into another authentication session", async () => {
  let resolve!: (value: ReturnType<typeof page>) => void;
  vi.mocked(loadActivityDiscovery).mockResolvedValueOnce(page(["a"], "next")).mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce(page(["new"]));
  const { result, rerender } = renderHook(({ user }) => useGroupRideActivities("ride", user), { initialProps: { user: owner } });
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  let pending!: Promise<void>;
  act(() => { pending = result.current.loadMore(); });
  rerender({ user: { uid: "owner" } as User });
  expect(result.current.activities).toEqual([]);
  await act(async () => { resolve(page(["old"])); await pending; });
  await waitFor(() => expect(result.current.activities.map(a => a.id)).toEqual(["new"]));
});
it("discards the observed pages after an in-app privacy change", async () => {
  vi.mocked(loadActivityDiscovery).mockResolvedValueOnce(page(["hidden"])).mockResolvedValueOnce(page([]));
  const { result } = renderHook(() => useGroupRideActivities("ride", owner));
  await waitFor(() => expect(result.current.activities).toHaveLength(1));
  act(() => window.dispatchEvent(new CustomEvent("orider:activity-safety-changed")));
  expect(result.current.activities).toEqual([]);
  await waitFor(() => expect(result.current.loading).toBe(false));
});
it("stops after the view budget without reporting a complete participant count", async () => {
  vi.mocked(loadActivityDiscovery).mockResolvedValue(page([], "next"));
  const { result } = renderHook(() => useGroupRideActivities("ride", owner));
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  for (let i = 1; i < 10; i++) await act(async () => result.current.loadMore());
  expect(result.current.limited).toBe(true);
  expect(result.current.hasMore).toBe(false);
  await act(async () => result.current.loadMore());
  expect(loadActivityDiscovery).toHaveBeenCalledTimes(10);
});
