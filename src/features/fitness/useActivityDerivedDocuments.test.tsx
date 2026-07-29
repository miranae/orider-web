import { act, renderHook, waitFor } from "@testing-library/react";
import { getDoc, onSnapshot } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { mockDocData, setDocData } from "../../__tests__/mocks/firebase";
import * as errorLogger from "../../services/errorLogger";
import {
  DERIVED_DOCUMENT_CREATION_RETRY_MS,
  DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND,
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
    expect(derivedWatchPaths()).not.toContain("activity_metrics/ride-0");
    expect(derivedWatchPaths()).toContain(`activity_metrics/ride-${activities.length - 1}`);
  });

  it("contains malformed stream JSON, logs it, and releases the listener", async () => {
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    const current = activity("malformed", "user-a");
    const hook = renderHook(() => useActivityDerivedDocuments("user-a", [current]));
    await waitFor(() => expect(vi.mocked(onSnapshot).mock.calls.some(
      ([reference]) => (reference as { path?: string }).path === "activity_streams/malformed",
    )).toBe(true));

    act(() => setDocData("activity_streams/malformed", { json: "{broken" }));

    await waitFor(() => expect(logSpy).toHaveBeenCalledWith(
      "useActivityDerivedDocuments.creationWatch.parse",
      expect.any(SyntaxError),
      { kind: "stream", activityId: "malformed" },
    ));
    expect(hook.result.current.streamsMap.has("malformed")).toBe(false);

    act(() => setDocData("activity_streams/malformed", { watts: [210] }));
    expect(hook.result.current.streamsMap.has("malformed")).toBe(false);
    logSpy.mockRestore();
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
