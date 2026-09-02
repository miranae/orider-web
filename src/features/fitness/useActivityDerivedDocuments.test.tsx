import { act, renderHook, waitFor } from "@testing-library/react";
import { getDoc, onSnapshot } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { mockDocData, setDocData } from "../../__tests__/mocks/firebase";
import * as errorLogger from "../../services/errorLogger";
import {
  DERIVED_DOCUMENT_CREATION_WATCH_MS,
  DERIVED_DOCUMENT_CREATION_RETRY_MS,
  DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND,
  DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS,
  DERIVED_DOCUMENT_READ_TIMEOUT_MS,
  useActivityDerivedDocuments,
} from "./useActivityDerivedDocuments";

const defaultOnSnapshotImplementation = vi.mocked(onSnapshot).getMockImplementation();

function activity(id: string, userId: string, averagePower: number | null = 180): Activity {
  return {
    id,
    userId,
    type: "Ride",
    startTime: 1,
    summary: {
      distance: 10_000,
      ridingTimeMillis: 1_000,
      averagePower,
    },
  } as Activity;
}

describe("useActivityDerivedDocuments", () => {
  beforeEach(() => {
    vi.mocked(getDoc).mockImplementation(async (reference) => {
      const path = (reference as { path: string }).path;
      const data = mockDocData.get(path) ?? null;
      return {
        exists: () => data !== null,
        data: () => data,
        id: path.split("/").at(-1) ?? "",
        ref: reference,
      } as Awaited<ReturnType<typeof getDoc>>;
    });
    vi.mocked(getDoc).mockClear();
    if (defaultOnSnapshotImplementation) {
      vi.mocked(onSnapshot).mockImplementation(defaultOnSnapshotImplementation);
    }
    vi.mocked(onSnapshot).mockClear();
  });

  it("observes a derived document created after an unchanged activity snapshot", async () => {
    const current = activity("late", "user-a");
    const hook = renderHook(() => useActivityDerivedDocuments("user-a", [current]));

    await waitFor(() => expect(vi.mocked(getDoc).mock.calls.length).toBe(2));
    expect(hook.result.current.streamsMap.has("late")).toBe(false);
    expect(hook.result.current.metricsMap.has("late")).toBe(false);

    act(() => {
      setDocData("activity_streams/late", { watts: [180, 190] });
      setDocData("activity_metrics/late", { tss: 42 });
    });

    await waitFor(() => {
      expect(hook.result.current.streamsMap.get("late")).toEqual({ watts: [180, 190] });
      expect(hook.result.current.metricsMap.get("late")).toEqual({ tss: 42 });
    });
    expect(vi.mocked(getDoc).mock.calls.length).toBe(2);
  });

  it("settles a legitimate missing metrics document without waiting for its creation watch", async () => {
    const current = activity("missing-metrics", "user-a", null);
    const hook = renderHook(() => useActivityDerivedDocuments("user-a", [current]));

    await waitFor(() => {
      expect(hook.result.current.metricStatusMap.get("missing-metrics")?.state).toBe("missing");
    });
    expect(hook.result.current.metricsMap.has("missing-metrics")).toBe(false);
    expect(vi.mocked(onSnapshot)).toHaveBeenCalled();
  });

  it("settles a mixed displayed activity set as loaded missing or skipped", async () => {
    setDocData("activity_metrics/loaded", { tss: 52 });
    const activities = [
      activity("loaded", "user-a", null),
      activity("absent", "user-a", null),
      { ...activity("unsupported", "user-a", null), type: "Yoga" },
      activity("foreign", "user-b", null),
    ];
    const hook = renderHook(() => useActivityDerivedDocuments("user-a", activities));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hook.result.current.metricStatusMap.size).toBe(4);
    expect(hook.result.current.metricStatusMap.get("loaded")?.state).toBe("loaded");
    expect(hook.result.current.metricStatusMap.get("absent")?.state).toBe("missing");
    expect(hook.result.current.metricStatusMap.get("unsupported")?.state).toBe("skipped");
    expect(hook.result.current.metricStatusMap.get("foreign")?.state).toBe("skipped");
    const metricReads = vi.mocked(getDoc).mock.calls
      .map(([reference]) => (reference as { path: string }).path)
      .filter((path) => path.startsWith("activity_metrics/"));
    expect(metricReads).toEqual(["activity_metrics/loaded", "activity_metrics/absent"]);
  });

  it("settles a hanging metrics read as error after the bounded timeout", async () => {
    vi.useFakeTimers();
    vi.mocked(getDoc).mockImplementation(() => new Promise(() => undefined) as ReturnType<typeof getDoc>);
    const current = activity("hanging", "user-a", null);
    const hook = renderHook(() => useActivityDerivedDocuments("user-a", [current]));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hook.result.current.metricStatusMap.get("hanging")?.state).toBe("loading");

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_READ_TIMEOUT_MS));
    expect(hook.result.current.metricStatusMap.get("hanging")?.state).toBe("error");
    hook.unmount();
    vi.useRealTimers();
  });

  it("resets terminal metrics state until the current activity revision settles", async () => {
    const pending: Array<(snapshot: unknown) => void> = [];
    vi.mocked(getDoc).mockImplementation(() => new Promise((resolve) => {
      pending.push(resolve);
    }) as ReturnType<typeof getDoc>);
    const original = activity("revision", "user-a", null);
    const hook = renderHook(
      ({ current }) => useActivityDerivedDocuments("user-a", [current]),
      { initialProps: { current: original } },
    );
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0]?.({ exists: () => true, data: () => ({ tss: 40 }) }));
    expect(hook.result.current.metricStatusMap.get("revision")?.state).toBe("loaded");

    hook.rerender({
      current: { ...original, summary: { ...original.summary, ridingTimeMillis: 2_000 } },
    });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(hook.result.current.metricStatusMap.get("revision")?.state).toBe("loading");
    expect(hook.result.current.metricsMap.has("revision")).toBe(false);

    await act(async () => pending[1]?.({ exists: () => false, data: () => null }));
    expect(hook.result.current.metricStatusMap.get("revision")?.state).toBe("missing");
  });

  it("rechecks a missing document once after watcher TTL without an activity snapshot change", async () => {
    vi.useFakeTimers();
    let reads = 0;
    vi.mocked(getDoc).mockImplementation((reference) => {
      reads += 1;
      const data = reads === 1 ? null : { tss: 57 };
      return Promise.resolve({
        exists: () => data !== null,
        data: () => data,
        ref: reference,
      }) as ReturnType<typeof getDoc>;
    });
    const hook = renderHook(() => useActivityDerivedDocuments(
      "user-a",
      [activity("ttl-recheck", "user-a", null)],
    ));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(reads).toBe(1);

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_CREATION_WATCH_MS - 1));
    expect(reads).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(reads).toBe(2);
    expect(hook.result.current.metricsMap.get("ttl-recheck")).toEqual({ tss: 57 });

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 4));
    expect(reads).toBe(2);
    hook.unmount();
    vi.useRealTimers();
  });

  it("bounded-rechecks the oldest activity outside the 24-watcher window", async () => {
    vi.useFakeTimers();
    const oldestId = "outside-window";
    const activities = [
      { ...activity(oldestId, "user-a", null), startTime: 0 },
      ...Array.from(
        { length: DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND },
        (_, index) => ({ ...activity(`recent-${index}`, "user-a", null), startTime: index + 1 }),
      ),
    ];
    const readsByPath = new Map<string, number>();
    const recheckOrder: string[] = [];
    vi.mocked(getDoc).mockImplementation((reference) => {
      const path = (reference as { path: string }).path;
      const reads = (readsByPath.get(path) ?? 0) + 1;
      readsByPath.set(path, reads);
      if (reads === 2) recheckOrder.push(path);
      const data = path === `activity_metrics/${oldestId}` && reads === 2 ? { tss: 33 } : null;
      return Promise.resolve({ exists: () => data !== null, data: () => data, ref: reference }) as ReturnType<typeof getDoc>;
    });
    const hook = renderHook(() => useActivityDerivedDocuments("user-a", activities));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(vi.mocked(onSnapshot).mock.calls.some(
      ([reference]) => (reference as { path: string }).path === `activity_metrics/${oldestId}`,
    )).toBe(false);
    expect(readsByPath.get(`activity_metrics/${oldestId}`)).toBe(1);

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS));
    expect(readsByPath.get(`activity_metrics/${oldestId}`)).toBe(2);
    expect(hook.result.current.metricsMap.get(oldestId)).toEqual({ tss: 33 });
    expect(recheckOrder[0]).toBe("activity_metrics/recent-23");
    expect(recheckOrder.at(-1)).toBe(`activity_metrics/${oldestId}`);
    hook.unmount();
    vi.useRealTimers();
  });

  it("stops rechecking a persistently missing revision after the bounded attempts", async () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useActivityDerivedDocuments(
      "user-a",
      [activity("bounded-missing", "user-a", null)],
    ));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(vi.mocked(getDoc)).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS));
    expect(vi.mocked(getDoc)).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 2));
    expect(vi.mocked(getDoc)).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 10));
    expect(vi.mocked(getDoc)).toHaveBeenCalledTimes(3);
    hook.unmount();
    vi.useRealTimers();
  });

  it("preserves the missing budget across a transient recheck error", async () => {
    vi.useFakeTimers();
    let reads = 0;
    vi.mocked(getDoc).mockImplementation((reference) => {
      reads += 1;
      if (reads === 2) return Promise.reject(new Error("transient recheck failure"));
      return Promise.resolve({ exists: () => false, data: () => null, ref: reference }) as ReturnType<typeof getDoc>;
    });
    const hook = renderHook(() => useActivityDerivedDocuments(
      "user-a",
      [activity("missing-with-error", "user-a", null)],
    ));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS));
    expect(reads).toBe(2);
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_CREATION_RETRY_MS));
    expect(reads).toBe(3);
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 2));
    expect(reads).toBe(4);
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 10));
    expect(reads).toBe(4);
    hook.unmount();
    vi.useRealTimers();
  });

  it("does not re-read an existing document for the same activity revision", async () => {
    vi.useFakeTimers();
    setDocData("activity_metrics/complete", { tss: 48 });
    const hook = renderHook(() => useActivityDerivedDocuments(
      "user-a",
      [activity("complete", "user-a", null)],
    ));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hook.result.current.metricsMap.get("complete")).toEqual({ tss: 48 });

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 10));
    expect(vi.mocked(getDoc)).toHaveBeenCalledTimes(1);
    hook.unmount();
    vi.useRealTimers();
  });

  it("cancels missing rechecks when account or activity range changes", async () => {
    vi.useFakeTimers();
    const old = activity("removed-before-recheck", "user-a", null);
    const hook = renderHook(
      ({ uid, activities }) => useActivityDerivedDocuments(uid, activities),
      { initialProps: { uid: "user-a", activities: [old] } },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const oldReadCount = () => vi.mocked(getDoc).mock.calls.filter(
      ([reference]) => (reference as { path: string }).path === "activity_metrics/removed-before-recheck",
    ).length;
    expect(oldReadCount()).toBe(1);

    hook.rerender({ uid: "user-b", activities: [] });
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 3));
    expect(oldReadCount()).toBe(1);
    hook.unmount();
    vi.useRealTimers();
  });

  it("discards a failed retry timer on account cleanup without scheduling a requery", async () => {
    vi.useFakeTimers();
    let oldReads = 0;
    vi.mocked(getDoc).mockImplementation((reference) => {
      const path = (reference as { path: string }).path;
      if (path === "activity_metrics/failed-cleanup") {
        oldReads += 1;
        return Promise.reject(new Error("temporary failure"));
      }
      return Promise.resolve({ exists: () => false, data: () => null, ref: reference }) as ReturnType<typeof getDoc>;
    });
    const hook = renderHook(
      ({ uid, activities }) => useActivityDerivedDocuments(uid, activities),
      { initialProps: { uid: "user-a", activities: [activity("failed-cleanup", "user-a", null)] } },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(oldReads).toBe(1);

    hook.rerender({ uid: "user-b", activities: [] });
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 10));
    expect(oldReads).toBe(1);
    hook.unmount();
    vi.useRealTimers();
  });

  it("rejects an old in-flight result after range removal and same-revision re-add", async () => {
    const pending: Array<(snapshot: unknown) => void> = [];
    vi.mocked(getDoc).mockImplementation(() => new Promise((resolve) => {
      pending.push(resolve);
    }) as ReturnType<typeof getDoc>);
    const current = activity("range-aba", "user-a", null);
    const hook = renderHook(
      ({ activities }) => useActivityDerivedDocuments("user-a", activities),
      { initialProps: { activities: [current] } },
    );
    await waitFor(() => expect(pending).toHaveLength(1));

    hook.rerender({ activities: [] });
    hook.rerender({ activities: [{ ...current }] });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1]?.({ exists: () => true, data: () => ({ tss: 71 }) }));
    expect(hook.result.current.metricsMap.get("range-aba")).toEqual({ tss: 71 });

    await act(async () => pending[0]?.({ exists: () => false, data: () => null }));
    expect(hook.result.current.metricsMap.get("range-aba")).toEqual({ tss: 71 });
    expect(vi.mocked(onSnapshot)).not.toHaveBeenCalled();
  });

  it("drops pending results from the previous UID generation", async () => {
    let resolveOld!: (snapshot: unknown) => void;
    const oldRequest = new Promise((resolve) => { resolveOld = resolve; });
    setDocData("activity_metrics/new", { tss: 55 });
    vi.mocked(getDoc).mockImplementation((reference) => {
      const path = (reference as { path: string }).path;
      if (path === "activity_metrics/old") return oldRequest as ReturnType<typeof getDoc>;
      const data = path === "activity_metrics/new" ? { tss: 55 } : null;
      return Promise.resolve({
        exists: () => data !== null,
        data: () => data,
        id: path.split("/").at(-1),
        ref: reference,
      }) as ReturnType<typeof getDoc>;
    });
    const oldActivity = activity("old", "user-a", null);
    const newActivity = activity("new", "user-b", null);
    const hook = renderHook(
      ({ uid, activities }) => useActivityDerivedDocuments(uid, activities),
      { initialProps: { uid: "user-a", activities: [oldActivity] } },
    );
    await waitFor(() => expect(vi.mocked(getDoc).mock.calls.some(
      ([reference]) => (reference as { path: string }).path === "activity_metrics/old",
    )).toBe(true));

    // 계정 전환 렌더에 이전 activity 배열이 잠시 섞여도 B 권한으로 old를 다시 읽지 않는다.
    hook.rerender({ uid: "user-b", activities: [oldActivity, newActivity] });
    await waitFor(() => expect(hook.result.current.metricsMap.get("new")).toEqual({ tss: 55 }));
    expect(vi.mocked(getDoc).mock.calls.filter(
      ([reference]) => (reference as { path: string }).path === "activity_metrics/old",
    )).toHaveLength(1);

    await act(async () => {
      resolveOld({
        exists: () => true,
        data: () => ({ tss: 99 }),
      });
      await oldRequest;
    });
    expect(hook.result.current.metricsMap.has("old")).toBe(false);
    expect(hook.result.current.metricsMap.get("new")).toEqual({ tss: 55 });
  });

  it("prunes maps and creation watches when an activity leaves the snapshot", async () => {
    setDocData("activity_streams/pruned", { watts: [200] });
    const current = activity("pruned", "user-a");
    const hook = renderHook(
      ({ activities }) => useActivityDerivedDocuments("user-a", activities),
      { initialProps: { activities: [current] } },
    );
    await waitFor(() => expect(hook.result.current.streamsMap.has("pruned")).toBe(true));

    hook.rerender({ activities: [] });
    await waitFor(() => expect(hook.result.current.streamsMap.size).toBe(0));

    act(() => setDocData("activity_metrics/pruned", { tss: 30 }));
    expect(hook.result.current.metricsMap.size).toBe(0);
  });

  it("caps missing-document creation watches and prioritizes recent activities", async () => {
    const activities = Array.from(
      { length: DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND + 6 },
      (_, index) => ({ ...activity(`ride-${index}`, "user-a"), startTime: index }),
    );
    renderHook(() => useActivityDerivedDocuments("user-a", activities));

    const derivedWatchPaths = () => vi.mocked(onSnapshot).mock.calls
      .map(([reference]) => (reference as { path?: string }).path ?? "")
      .filter((path) => path.startsWith("activity_streams/") || path.startsWith("activity_metrics/"));
    await waitFor(() => expect(derivedWatchPaths()).toHaveLength(
      DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND * 2,
    ));
    expect(derivedWatchPaths().filter((path) => path.startsWith("activity_streams/"))).toHaveLength(
      DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND,
    );
    expect(derivedWatchPaths().filter((path) => path.startsWith("activity_metrics/"))).toHaveLength(
      DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND,
    );
    expect(derivedWatchPaths()).not.toContain("activity_metrics/ride-0");
    expect(derivedWatchPaths()).toContain(`activity_metrics/ride-${activities.length - 1}`);
  });

  it("replaces the oldest active watcher when a newer activity arrives at the cap", async () => {
    type Listener = (snapshot: { exists: () => boolean; data: () => Record<string, unknown> }) => void;
    const listeners = new Map<string, Listener>();
    const unsubscribeByPath = new Map<string, ReturnType<typeof vi.fn>>();
    const activePaths = new Set<string>();
    vi.mocked(onSnapshot).mockImplementation(((reference: { path: string }, next: Listener) => {
      const path = reference.path;
      const unsubscribe = vi.fn(() => activePaths.delete(path));
      listeners.set(path, next);
      unsubscribeByPath.set(path, unsubscribe);
      activePaths.add(path);
      next({ exists: () => false, data: () => ({}) });
      return unsubscribe;
    }) as typeof onSnapshot);
    const initialActivities = Array.from(
      { length: DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND },
      (_, index) => ({ ...activity(`metric-${String(index).padStart(2, "0")}`, "user-a", null), startTime: index }),
    );
    const hook = renderHook(
      ({ activities }) => useActivityDerivedDocuments("user-a", activities),
      { initialProps: { activities: initialActivities } },
    );
    await waitFor(() => expect(activePaths.size).toBe(DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND));

    const newest = { ...activity("metric-newest", "user-a", null), startTime: 100 };
    hook.rerender({ activities: [...initialActivities, newest] });

    const oldestPath = "activity_metrics/metric-00";
    const newestPath = "activity_metrics/metric-newest";
    await waitFor(() => expect(listeners.has(newestPath)).toBe(true));
    expect(unsubscribeByPath.get(oldestPath)).toHaveBeenCalledTimes(1);
    expect(activePaths.has(oldestPath)).toBe(false);
    expect(activePaths.has(newestPath)).toBe(true);
    expect(activePaths.size).toBe(DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND);

    act(() => {
      listeners.get(oldestPath)?.({ exists: () => true, data: () => ({ tss: 99 }) });
      listeners.get(newestPath)?.({ exists: () => true, data: () => ({ tss: 64 }) });
    });
    expect(hook.result.current.metricsMap.has("metric-00")).toBe(false);
    expect(hook.result.current.metricsMap.get("metric-newest")).toEqual({ tss: 64 });
    expect(activePaths.size).toBe(DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND - 1);
  });

  it("keeps the creation watcher after malformed JSON and reflects a corrected document", async () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    const current = activity("malformed", "user-a");
    const hook = renderHook(() => useActivityDerivedDocuments("user-a", [current]));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(vi.mocked(onSnapshot).mock.calls.some(
      ([reference]) => (reference as { path?: string }).path === "activity_streams/malformed",
    )).toBe(true);

    act(() => setDocData("activity_streams/malformed", { json: "{broken" }));

    expect(logSpy).toHaveBeenCalledWith(
      "useActivityDerivedDocuments.creationWatch.parse",
      expect.any(SyntaxError),
      { kind: "stream", activityId: "malformed" },
    );
    expect(hook.result.current.streamsMap.has("malformed")).toBe(false);

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_CREATION_RETRY_MS));
    act(() => setDocData("activity_streams/malformed", { watts: [210] }));
    expect(hook.result.current.streamsMap.get("malformed")).toEqual({ watts: [210] });
    hook.unmount();
    logSpy.mockRestore();
    vi.useRealTimers();
  });

  it("bounds repeated malformed creation documents after watcher TTL", async () => {
    vi.useFakeTimers();
    let streamReads = 0;
    vi.mocked(getDoc).mockImplementation((reference) => {
      const path = (reference as { path: string }).path;
      if (path.startsWith("activity_metrics/")) {
        return Promise.resolve({ exists: () => true, data: () => ({ tss: 12 }), ref: reference }) as ReturnType<typeof getDoc>;
      }
      streamReads += 1;
      const data = streamReads === 1 ? null : { json: "{still-broken" };
      return Promise.resolve({ exists: () => data !== null, data: () => data, ref: reference }) as ReturnType<typeof getDoc>;
    });
    const hook = renderHook(() => useActivityDerivedDocuments(
      "user-a",
      [activity("malformed-bounded", "user-a")],
    ));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => setDocData("activity_streams/malformed-bounded", { json: "{broken-watcher" }));
    expect(streamReads).toBe(1);

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_CREATION_WATCH_MS));
    expect(streamReads).toBe(2);
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_CREATION_RETRY_MS));
    expect(streamReads).toBe(3);
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS));
    expect(streamReads).toBe(4);
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 10));
    expect(streamReads).toBe(4);
    expect(hook.result.current.streamsMap.has("malformed-bounded")).toBe(false);
    hook.unmount();
    vi.useRealTimers();
  });

  it("does not recover a malformed creation watcher after account cleanup", async () => {
    vi.useFakeTimers();
    let streamReads = 0;
    vi.mocked(getDoc).mockImplementation((reference) => {
      const path = (reference as { path: string }).path;
      if (path === "activity_streams/malformed-cleanup") streamReads += 1;
      return Promise.resolve({ exists: () => false, data: () => null, ref: reference }) as ReturnType<typeof getDoc>;
    });
    const current = activity("malformed-cleanup", "user-a");
    const hook = renderHook(
      ({ uid, activities }) => useActivityDerivedDocuments(uid, activities),
      { initialProps: { uid: "user-a", activities: [current] } },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => setDocData("activity_streams/malformed-cleanup", { json: "{broken" }));
    expect(streamReads).toBe(1);

    hook.rerender({ uid: "user-b", activities: [] });
    act(() => setDocData("activity_streams/malformed-cleanup", { watts: [222] }));
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 10));
    expect(streamReads).toBe(1);
    expect(hook.result.current.streamsMap.has("malformed-cleanup")).toBe(false);
    hook.unmount();
    vi.useRealTimers();
  });

  it("logs listener errors and performs only one bounded backoff retry", async () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    vi.mocked(onSnapshot).mockImplementation(((
      _reference: unknown,
      _next: unknown,
      error: ((value: unknown) => void) | undefined,
    ) => {
      error?.(new Error("listener unavailable"));
      return vi.fn();
    }) as typeof onSnapshot);
    const hook = renderHook(() => useActivityDerivedDocuments(
      "user-a",
      [activity("retry", "user-a", null)],
    ));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(vi.mocked(onSnapshot)).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_CREATION_RETRY_MS));
    expect(vi.mocked(onSnapshot)).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_CREATION_RETRY_MS * 2));
    expect(vi.mocked(onSnapshot)).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith(
      "useActivityDerivedDocuments.creationWatch.error",
      expect.any(Error),
      expect.objectContaining({ kind: "metrics", activityId: "retry" }),
    );

    hook.unmount();
    logSpy.mockRestore();
    vi.useRealTimers();
  });

  it("awaits each batch so stream and metrics concurrency stay at 10 and 20", async () => {
    const active = { stream: 0, metrics: 0 };
    const maximum = { stream: 0, metrics: 0 };
    const pending: Array<() => void> = [];
    vi.mocked(getDoc).mockImplementation((reference) => {
      const path = (reference as { path: string }).path;
      const kind = path.startsWith("activity_streams/") ? "stream" : "metrics";
      active[kind] += 1;
      maximum[kind] = Math.max(maximum[kind], active[kind]);
      return new Promise((resolve) => {
        pending.push(() => {
          active[kind] -= 1;
          const data = kind === "stream" ? { watts: [200] } : { tss: 40 };
          resolve({ exists: () => true, data: () => data, ref: reference });
        });
      }) as ReturnType<typeof getDoc>;
    });
    const activities = Array.from({ length: 25 }, (_, index) => (
      { ...activity(`concurrency-${index}`, "user-a"), startTime: index }
    ));
    renderHook(() => useActivityDerivedDocuments("user-a", activities));

    await waitFor(() => expect(vi.mocked(getDoc)).toHaveBeenCalledTimes(30));
    expect(active).toEqual({ stream: 10, metrics: 20 });
    expect(maximum).toEqual({ stream: 10, metrics: 20 });

    await act(async () => pending.splice(0).forEach((resolve) => resolve()));
    await waitFor(() => expect(vi.mocked(getDoc)).toHaveBeenCalledTimes(45));
    expect(maximum).toEqual({ stream: 10, metrics: 20 });

    await act(async () => pending.splice(0).forEach((resolve) => resolve()));
    await waitFor(() => expect(vi.mocked(getDoc)).toHaveBeenCalledTimes(50));
    await act(async () => pending.splice(0).forEach((resolve) => resolve()));
    expect(maximum).toEqual({ stream: 10, metrics: 20 });
  });

  it("shares the metrics concurrency cap between active rechecks and new activities", async () => {
    vi.useFakeTimers();
    let initialReads = 0;
    let active = 0;
    let maximum = 0;
    const pending: Array<() => void> = [];
    vi.mocked(getDoc).mockImplementation((reference) => {
      if (initialReads < 20) {
        initialReads += 1;
        return Promise.resolve({ exists: () => false, data: () => null, ref: reference }) as ReturnType<typeof getDoc>;
      }
      active += 1;
      maximum = Math.max(maximum, active);
      return new Promise((resolve) => {
        pending.push(() => {
          active -= 1;
          resolve({ exists: () => false, data: () => null, ref: reference });
        });
      }) as ReturnType<typeof getDoc>;
    });
    const original = Array.from(
      { length: 20 },
      (_, index) => ({ ...activity(`recheck-${index}`, "user-a", null), startTime: index }),
    );
    const hook = renderHook(
      ({ activities }) => useActivityDerivedDocuments("user-a", activities),
      { initialProps: { activities: original } },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS));
    expect(active).toBe(20);
    const added = Array.from(
      { length: 20 },
      (_, index) => ({ ...activity(`new-${index}`, "user-a", null), startTime: 100 + index }),
    );
    hook.rerender({ activities: [...original, ...added] });
    expect(active).toBe(20);

    await act(async () => {
      pending.splice(0).forEach((resolve) => resolve());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(active).toBe(20);
    expect(maximum).toBe(20);
    await act(async () => pending.splice(0).forEach((resolve) => resolve()));
    expect(maximum).toBe(20);
    hook.unmount();
    vi.useRealTimers();
  });

  it("logs a transient initial read failure and retries once without an activity snapshot change", async () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    let requestCount = 0;
    vi.mocked(getDoc).mockImplementation((reference) => {
      requestCount += 1;
      if (requestCount === 1) return Promise.reject(new Error("temporary getDoc failure"));
      return Promise.resolve({
        exists: () => true,
        data: () => ({ tss: 61 }),
        ref: reference,
      }) as ReturnType<typeof getDoc>;
    });
    const hook = renderHook(() => useActivityDerivedDocuments(
      "user-a",
      [activity("initial-retry", "user-a", null)],
    ));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(requestCount).toBe(1);
    expect(logSpy).toHaveBeenCalledWith(
      "useActivityDerivedDocuments.initialRead.error",
      expect.any(Error),
      { kind: "metrics", activityId: "initial-retry", retryCount: 0 },
    );

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_CREATION_RETRY_MS));
    expect(requestCount).toBe(2);
    expect(hook.result.current.metricsMap.get("initial-retry")).toEqual({ tss: 61 });

    hook.unmount();
    logSpy.mockRestore();
    vi.useRealTimers();
  });

  it("recovers the same revision after both the initial read and retry fail", async () => {
    vi.useFakeTimers();
    let requestCount = 0;
    vi.mocked(getDoc).mockImplementation((reference) => {
      requestCount += 1;
      if (requestCount <= 2) return Promise.reject(new Error(`temporary failure ${requestCount}`));
      return Promise.resolve({
        exists: () => true,
        data: () => ({ tss: 69 }),
        ref: reference,
      }) as ReturnType<typeof getDoc>;
    });
    const hook = renderHook(() => useActivityDerivedDocuments(
      "user-a",
      [activity("double-failure", "user-a", null)],
    ));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(requestCount).toBe(1);

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_CREATION_RETRY_MS));
    expect(requestCount).toBe(2);
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS - 1));
    expect(requestCount).toBe(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(requestCount).toBe(3);
    expect(hook.result.current.metricsMap.get("double-failure")).toEqual({ tss: 69 });

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS * 10));
    expect(requestCount).toBe(3);
    hook.unmount();
    vi.useRealTimers();
  });

  it("recovers after repeated initial stream parse failures without an immediate loop", async () => {
    vi.useFakeTimers();
    let streamReads = 0;
    vi.mocked(getDoc).mockImplementation((reference) => {
      const path = (reference as { path: string }).path;
      if (path.startsWith("activity_metrics/")) {
        return Promise.resolve({ exists: () => true, data: () => ({ tss: 10 }), ref: reference }) as ReturnType<typeof getDoc>;
      }
      streamReads += 1;
      const data = streamReads <= 2 ? { json: "{broken" } : { watts: [201, 208] };
      return Promise.resolve({ exists: () => true, data: () => data, ref: reference }) as ReturnType<typeof getDoc>;
    });
    const hook = renderHook(() => useActivityDerivedDocuments(
      "user-a",
      [activity("parse-recovery", "user-a")],
    ));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(streamReads).toBe(1);

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_CREATION_RETRY_MS));
    expect(streamReads).toBe(2);
    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_MISSING_RECHECK_BASE_MS));
    expect(streamReads).toBe(3);
    expect(hook.result.current.streamsMap.get("parse-recovery")).toEqual({ watts: [201, 208] });
    hook.unmount();
    vi.useRealTimers();
  });

  it("keeps an evicted old retry timer eligible when a newer activity takes the capped slot", async () => {
    vi.useFakeTimers();
    const oldId = "old-failed";
    const readsByPath = new Map<string, number>();
    vi.mocked(getDoc).mockImplementation((reference) => {
      const path = (reference as { path: string }).path;
      const reads = (readsByPath.get(path) ?? 0) + 1;
      readsByPath.set(path, reads);
      if (path === `activity_metrics/${oldId}` && reads === 1) {
        return Promise.reject(new Error("old initial failure"));
      }
      const data = path === `activity_metrics/${oldId}` ? { tss: 77 } : null;
      return Promise.resolve({ exists: () => data !== null, data: () => data, ref: reference }) as ReturnType<typeof getDoc>;
    });
    const initialActivities = [
      { ...activity(oldId, "user-a", null), startTime: 0 },
      ...Array.from(
        { length: DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND - 1 },
        (_, index) => ({ ...activity(`watched-${index}`, "user-a", null), startTime: index + 1 }),
      ),
    ];
    const hook = renderHook(
      ({ activities }) => useActivityDerivedDocuments("user-a", activities),
      { initialProps: { activities: initialActivities } },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(readsByPath.get(`activity_metrics/${oldId}`)).toBe(1);

    const newest = { ...activity("newest-missing", "user-a", null), startTime: 100 };
    hook.rerender({ activities: [...initialActivities, newest] });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const metricWatchPaths = vi.mocked(onSnapshot).mock.calls
      .map(([reference]) => (reference as { path: string }).path)
      .filter((path) => path.startsWith("activity_metrics/"));
    expect(metricWatchPaths).toHaveLength(DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND);

    await act(async () => vi.advanceTimersByTimeAsync(DERIVED_DOCUMENT_CREATION_RETRY_MS));
    expect(readsByPath.get(`activity_metrics/${oldId}`)).toBe(2);
    expect(hook.result.current.metricsMap.get(oldId)).toEqual({ tss: 77 });
    expect(metricWatchPaths).toHaveLength(DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND);
    hook.unmount();
    vi.useRealTimers();
  });

  it("uses canonical discipline mapping for run and swim subtype stream eligibility", async () => {
    const activities = [
      { ...activity("trail", "user-a", null), type: "TrailRun" },
      { ...activity("virtual-run", "user-a", null), type: "VirtualRun" },
      { ...activity("open-water", "user-a", null), type: "OpenWaterSwim" },
      { ...activity("pool", "user-a", null), type: "PoolSwim" },
      { ...activity("virtual-ride", "user-a", null), type: "VirtualRide" },
    ] as Activity[];
    renderHook(() => useActivityDerivedDocuments("user-a", activities));

    const streamReadIds = () => vi.mocked(getDoc).mock.calls
      .map(([reference]) => (reference as { path: string }).path)
      .filter((path) => path.startsWith("activity_streams/"))
      .map((path) => path.split("/").at(-1));
    await waitFor(() => expect(streamReadIds()).toHaveLength(4));
    expect(new Set(streamReadIds())).toEqual(new Set(["trail", "virtual-run", "open-water", "pool"]));
    expect(streamReadIds()).not.toContain("virtual-ride");
  });
});
