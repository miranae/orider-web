import { act, renderHook, waitFor } from "@testing-library/react";
import { getDoc, onSnapshot } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { mockDocData, setDocData } from "../../__tests__/mocks/firebase";
import {
  DERIVED_DOCUMENT_MAX_CREATION_WATCHES_PER_KIND,
  useActivityDerivedDocuments,
} from "./useActivityDerivedDocuments";

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
});
