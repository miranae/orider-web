import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal } from "@shared/types/goal";
import { readActivePlanGoals, readPreferredActiveGoal } from "./readActivePlanGoals";
import { usePlanRecordOverlay } from "./usePlanRecordOverlay";
vi.mock("./readActivePlanGoals", () => ({ readActivePlanGoals: vi.fn(), readPreferredActiveGoal: vi.fn() }));
const goal = (id: string, discipline?: string) => ({ id, discipline }) as Goal;
const week = (workout: string, plannedTSS: number, extra = {}) => ({ id: "week", data: () => ({ days: [{ date: Date.UTC(2026, 9, 1), workout, plannedTSS, plannedDurationMin: 30, ...extra }] }) });
beforeEach(() => {
  vi.mocked(readActivePlanGoals).mockReset(); vi.mocked(readPreferredActiveGoal).mockReset();
  vi.mocked(getDocs).mockReset().mockResolvedValue({ docs: [] } as never);
});
describe("active plans in the record calendar", () => {
  it("keeps rest, skipped workouts and actual zero rather than treating positive load as plan existence", async () => {
    vi.mocked(readPreferredActiveGoal).mockResolvedValue(goal("bike", "bike"));
    vi.mocked(getDocs).mockResolvedValue({ docs: [week("rest", 0), week("z2", 0, { skipped: true, actualTSS: 0, actualActivityId: "linked", matchMethod: "explicit-start", matchConfidence: "exact" })] } as never);
    const { result } = renderHook(() => usePlanRecordOverlay("owner", "bike"));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const rows = result.current.plans.get("2026-10-01")!;
    expect(rows).toHaveLength(2); expect(rows[0]?.workout).toBe("rest");
    expect(rows[1]).toMatchObject({ skipped: true, plannedTSS: 0, actualTSS: 0, actualActivityId: "linked" });
  });
  it("loads every active goal for all sports without combining activity load", async () => {
    vi.mocked(readActivePlanGoals).mockResolvedValue([goal("bike", "bike"), goal("run", "run")]);
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [week("z2", 40)] } as never).mockResolvedValueOnce({ docs: [week("easyRun", 30)] } as never);
    const { result } = renderHook(() => usePlanRecordOverlay("owner", "all"));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.plans.get("2026-10-01")?.map(row => row.discipline)).toEqual(["bike", "run"]);
    expect(readPreferredActiveGoal).not.toHaveBeenCalled();
  });
  it("preserves a legacy goal but never places another sport's fallback goal under the selected sport", async () => {
    vi.mocked(readPreferredActiveGoal).mockResolvedValueOnce(goal("legacy")).mockResolvedValueOnce(goal("run", "run"));
    vi.mocked(getDocs).mockResolvedValue({ docs: [week("z2", 40)] } as never);
    const { result, rerender } = renderHook(({ uid }) => usePlanRecordOverlay(uid, "bike"), { initialProps: { uid: "one" } });
    await waitFor(() => expect(result.current.plans.size).toBe(1));
    rerender({ uid: "two" });
    expect(result.current.plans.size).toBe(0);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.plans.size).toBe(0); expect(getDocs).toHaveBeenCalledTimes(1);
  });
  it("reports a failed read and retries without presenting it as no active plan", async () => {
    vi.mocked(readPreferredActiveGoal).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePlanRecordOverlay("owner", "bike"));
    await waitFor(() => expect(result.current.state).toBe("error"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.plans.size).toBe(0);
  });
  it("ignores a cancelled rejection and does not start old-sport plan reads after a delayed goal response", async () => {
    let rejectOld: (error: Error) => void = () => undefined;
    const oldGoal = new Promise<Goal | null>((_, reject) => { rejectOld = reject; });
    vi.mocked(readPreferredActiveGoal).mockReturnValueOnce(oldGoal).mockResolvedValueOnce(goal("run", "run"));
    vi.mocked(getDocs).mockResolvedValue({ docs: [week("easyRun", 30)] } as never);
    const { result, rerender } = renderHook(({ sport }: { sport: "bike" | "run" }) => usePlanRecordOverlay("owner", sport), { initialProps: { sport: "bike" } });
    rerender({ sport: "run" });
    await waitFor(() => expect(result.current.plans.size).toBe(1));
    await act(async () => rejectOld(new Error("cancelled old request")));
    expect(result.current.state).toBe("ready");
    expect(result.current.plans.get("2026-10-01")?.[0]?.discipline).toBe("run");
    expect(getDocs).toHaveBeenCalledTimes(1);
  });
});
