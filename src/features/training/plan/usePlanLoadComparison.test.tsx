import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs, limit, onSnapshot, where } from "firebase/firestore";
import type { Activity } from "@shared/types";
import type { PlanWeek } from "@shared/types/goal";
import { usePlanLoadComparison } from "./usePlanLoadComparison";
const context = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, authLoading: false, firestore: {}, reps: new Map<string, Activity | null>(), repsLoading: false, repsError: false, realReps: false, retryReps: vi.fn() }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: context.user, loading: context.authLoading }) }));
vi.mock("../../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ firestore: context.firestore }) }));
vi.mock("../../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../../../hooks/useActivityRepresentatives", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../hooks/useActivityRepresentatives")>();
  return { ...actual, useActivityRepresentatives: (...args: Parameters<typeof actual.useActivityRepresentatives>) => context.realReps ? actual.useActivityRepresentatives(...args) : ({ representatives: context.reps, loading: context.repsLoading, error: context.repsError, retry: context.retryReps }) };
});
const start = Date.parse("2026-10-01T00:00:00+09:00");
const range = { start: "2026-10-01", end: "2026-10-01" };
const weeks: PlanWeek[] = [{ id: "week", weekNumber: 1, phase: "base", startDate: start, plannedTSS: 50,
  days: [{ date: start, dayOfWeek: 0, workout: "z2", plannedTSS: 50, plannedDurationMin: 60, completed: false, skipped: false }] }];
const options = { uid: "owner", discipline: "bike" as const, weeks, range, enabled: true };
type Snapshot = Awaited<ReturnType<typeof getDocs>>;
function activity(id: string, extra: Record<string, unknown> = {}): Activity {
  return { id, userId: "owner", source: "orider", type: "Ride", startTime: start + 3600000, summary: { ridingTimeMillis: 3600000 }, tss: 60, ...extra } as unknown as Activity;
}
function page(rows: Activity[], confirmed = true): Snapshot {
  return { docs: rows.map(row => ({ id: row.id, ref: { path: `activities/${row.id}` }, data: () => row })), metadata: { fromCache: !confirmed, hasPendingWrites: false } } as unknown as Snapshot;
}
beforeEach(() => {
  context.user = { uid: "owner", isAnonymous: false }; context.authLoading = false; context.firestore = {};
  context.realReps = false; context.reps = new Map(); context.repsLoading = false; context.repsError = false; context.retryReps.mockClear();
  vi.mocked(getDocs).mockReset(); vi.mocked(where).mockClear(); vi.mocked(limit).mockClear();
});
afterEach(() => vi.useRealTimers());
it("reads bounded owner records and includes unlinked activity load", async () => {
  vi.mocked(getDocs).mockResolvedValue(page([activity("unlinked")]));
  const h = renderHook(() => usePlanLoadComparison(options));
  await waitFor(() => expect(h.result.current.state).toBe("ready"));
  expect(h.result.current.summary).toMatchObject({ plannedTss: 50, actualTss: 60, ratioPct: 120, deltaTss: 10 });
  expect(where).toHaveBeenCalledWith("userId", "==", "owner");
  expect(where).toHaveBeenCalledWith("deletedAt", "==", null);
  expect(where).toHaveBeenCalledWith("startTime", ">=", start - 86400000);
  expect(limit).toHaveBeenCalledWith(200);
});
it("requires complete server coverage and does not declare cached or truncated pages exact", async () => {
  vi.mocked(getDocs).mockResolvedValueOnce(page([activity("cache")], false));
  const h = renderHook(() => usePlanLoadComparison(options));
  await waitFor(() => expect(h.result.current.state).toBe("incomplete"));
  expect(h.result.current.summary).toMatchObject({ actualTss: null, ratioPct: null, deltaTss: null });
  h.unmount();
  vi.mocked(getDocs).mockResolvedValue(page(Array.from({ length: 200 }, (_, i) => activity(`row-${i}`))));
  const capped = renderHook(() => usePlanLoadComparison(options));
  await waitFor(() => expect(capped.result.current.state).toBe("incomplete"));
  // Repeated cursors stop safely, without an unbounded pagination loop.
  expect(getDocs).toHaveBeenCalledTimes(3);
  expect(capped.result.current.summary.actualTss).toBeNull();
});
it("paginates all pages up to the 1,000-document guard", async () => {
  for (let p = 0; p < 5; p++) vi.mocked(getDocs).mockResolvedValueOnce(page(Array.from({ length: 200 }, (_, i) => activity(`${p}-${i}`))));
  const h = renderHook(() => usePlanLoadComparison(options));
  await waitFor(() => expect(h.result.current.state).toBe("incomplete"));
  expect(getDocs).toHaveBeenCalledTimes(5);
  expect(h.result.current.summary.actualTss).toBeNull();
});
it("blocks signed-out, anonymous, wrong-owner and invalid-range reads", () => {
  context.user = null;
  const h = renderHook(() => usePlanLoadComparison(options));
  expect(h.result.current.state).toBe("idle");
  context.user = { uid: "owner", isAnonymous: true }; h.rerender(); expect(h.result.current.state).toBe("idle");
  context.user = { uid: "other", isAnonymous: false }; h.rerender(); expect(h.result.current.state).toBe("idle"); h.unmount();
  context.user = { uid: "owner", isAnonymous: false };
  const invalid = renderHook(() => usePlanLoadComparison({ ...options, range: { start: "2026-01-01", end: "2027-01-02" } }));
  expect(invalid.result.current.state).toBe("invalid");
  expect(getDocs).not.toHaveBeenCalled();
});
it("drops late results when account or period changes", async () => {
  let resolve!: (value: Snapshot) => void;
  vi.mocked(getDocs).mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue(page([]));
  const h = renderHook(({ range }) => usePlanLoadComparison({ ...options, range }), { initialProps: { range } });
  h.rerender({ range: { start: "2026-10-02", end: "2026-10-02" } });
  await waitFor(() => expect(h.result.current.state).toBe("ready"));
  await act(async () => resolve(page([activity("old")])));
  expect(h.result.current.summary.actualTss).toBe(0);
  context.user = { uid: "new-owner", isAnonymous: false }; h.rerender({ range: { start: "2026-10-02", end: "2026-10-02" } });
  expect(h.result.current.state).toBe("idle"); expect(h.result.current.summary.actualTss).toBeNull();
});
it("times out stalled reads, retries, and masks unresolved representatives", async () => {
  vi.useFakeTimers();
  vi.mocked(getDocs).mockReturnValueOnce(new Promise(() => {})).mockResolvedValue(page([activity("ride")]));
  const h = renderHook(() => usePlanLoadComparison(options));
  await act(async () => vi.advanceTimersByTimeAsync(12000));
  expect(h.result.current.state).toBe("error");
  await act(async () => h.result.current.retry());
  expect(h.result.current.state).toBe("ready");
  context.repsLoading = true; h.rerender(); expect(h.result.current.state).toBe("loading");
  await act(async () => vi.advanceTimersByTimeAsync(12000));
  expect(h.result.current.state).toBe("incomplete"); expect(h.result.current.summary.actualTss).toBeNull();
  context.repsLoading = false; h.rerender();
  expect(h.result.current.state).toBe("ready"); expect(h.result.current.summary.actualTss).toBe(60);
});
it("supplements representatives before range filtering and rejects foreign query rows", async () => {
  const fragment = activity("fragment", { stravaTwinActivityId: 123, endTime: start + 2 * 3600000, rollupSupersededBy: "full" });
  context.reps.set("full", activity("full", { source: "strava", stravaActivityId: 123, startTime: start - 3600000, endTime: start + 2 * 3600000 }));
  vi.mocked(getDocs).mockResolvedValueOnce(page([fragment]));
  const h = renderHook(() => usePlanLoadComparison(options));
  await waitFor(() => expect(h.result.current.state).toBe("ready")); expect(h.result.current.summary.actualTss).toBe(0);
  h.unmount(); vi.mocked(getDocs).mockResolvedValueOnce(page([activity("foreign", { userId: "other" })]));
  const foreign = renderHook(() => usePlanLoadComparison(options));
  await waitFor(() => expect(foreign.result.current.state).toBe("incomplete"));
});
it("does not query future-only periods and holds actual ratios unavailable", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T12:00:00+09:00"));
  const h = renderHook(() => usePlanLoadComparison(options));
  await act(async () => {});
  expect(h.result.current.state).toBe("ready"); expect(h.result.current.summary).toMatchObject({ plannedTss: 50, actualTss: null, ratioPct: null });
  expect(getDocs).not.toHaveBeenCalled();
});

it("never exposes cache-only representative totals and recovers after a late server confirmation", async () => {
  vi.useFakeTimers();
  context.realReps = true;
  const fragment = activity("fragment", { stravaTwinActivityId: 123, endTime: start + 2 * 3600000, rollupSupersededBy: "full" });
  const full = activity("full", { source: "strava", stravaActivityId: 123, startTime: start - 3600000, endTime: start + 2 * 3600000 });
  let notify!: (snapshot: never) => void;
  vi.mocked(onSnapshot).mockImplementation((_reference, options, next) => {
    expect(options).toEqual({ includeMetadataChanges: true });
    notify = next as typeof notify;
    return vi.fn();
  });
  vi.mocked(getDocs).mockResolvedValue(page([fragment]));
  const h = renderHook(() => usePlanLoadComparison(options));
  await act(async () => {});
  await act(async () => notify({ exists: () => false, metadata: { fromCache: true, hasPendingWrites: false } } as never));
  expect(h.result.current.state).toBe("loading");
  expect(h.result.current.summary.actualTss).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(12000));
  expect(h.result.current.state).toBe("incomplete");
  expect(h.result.current.summary.ratioPct).toBeNull();
  await act(async () => notify({ exists: () => true, data: () => full, metadata: { fromCache: false, hasPendingWrites: false } } as never));
  expect(h.result.current.state).toBe("ready");
  // 확인된 대표는 선택 일자 밖이므로 원본 조각의 60 TSS를 잘못 더하지 않는다.
  expect(h.result.current.summary.actualTss).toBe(0);
  h.unmount();
});
