import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getDoc, updateDoc } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanDay } from "@shared/types/goal";
import { usesEffectiveExecutionPrescription } from "@shared/training/effectiveExecutionPrescription";
import WorkoutEditModal from "./WorkoutEditModal";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ alert: vi.fn() }) }));
vi.mock("@shared/training/workoutImport", () => ({
  parseWorkoutFile: () => ({ name: "새 임포트" }),
  toIntervalBlocks: () => [{ label: "Z2", durationMin: 30 }],
  estimateWorkoutLoad: () => ({ durationMin: 30, tss: 25 }),
}));
const original: PlanDay = { date: 1000000, dayOfWeek: 1, workout: "vo2", plannedTSS: 95,
  plannedDurationMin: 60, completed: false, skipped: false,
  intervals: [{ label: "Z5", durationMin: 10 }], workoutName: "원본 고강도" };
function show(day: PlanDay, weekAdjustmentReason?: string) {
  return render(<WorkoutEditModal day={day} weekId="week-01" dayIndex={0} goalId="goal"
    weekAdjustmentReason={weekAdjustmentReason} goalDiscipline="bike" onClose={vi.fn()} onUpdate={vi.fn()} />);
}
beforeEach(() => { vi.mocked(updateDoc).mockClear(); });
afterEach(cleanup);

describe("강도 교체와 원본 임포트", () => {
  it("원본 구간은 보존하되 교체 처방에서는 원본 이름을 현재 운동으로 표시하지 않는다", () => {
    show({ ...original, workout: "rec", executionWorkoutOverride: "rec" });
    expect(screen.queryByText(/원본 고강도/)).not.toBeInTheDocument();
    expect(screen.getAllByText("workouts.rec").length).toBeGreaterThan(0);
  });
  it("일반 임포트 처방은 원본 이름을 유지한다", () => {
    show(original);
    expect(screen.getByText(/원본 고강도/)).toBeInTheDocument();
  });
  it("회복 주간 근거가 있는 교체만 원본 임포트 표시를 숨긴다", () => {
    const { unmount } = show({ ...original, workout: "rec", adjustedDurationMin: 20 }, "recovery_critical");
    expect(screen.queryByText(/원본 고강도/)).not.toBeInTheDocument();
    unmount();
    show({ ...original, workout: "rec", adjustedDurationMin: 20 });
    expect(screen.getByText(/원본 고강도/)).toBeInTheDocument();
  });
  it("새 임포트가 조정 근거를 지우면 이전 회복 주간에서도 원본 처방을 표시한다", () => {
    show({ ...original, workout: "rec" }, "recovery_critical");
    expect(screen.getByText(/원본 고강도/)).toBeInTheDocument();
  });
  it("수동 운동 교체는 명시적 실행 마커와 원본 구간을 함께 저장한다", async () => {
    const adjusted = { ...original, adjustedTSS: 81, adjustedDurationMin: 51, closedLoopAdjustment: { originalWorkout: "vo2", suggestedWorkout: "rec" } };
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ days: [adjusted] }) } as unknown as Awaited<ReturnType<typeof getDoc>>);
    show(adjusted);
    fireEvent.click(screen.getByRole("button", { name: "edit.changeWorkout" }));
    fireEvent.click(screen.getByRole("button", { name: "workouts.rec" }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    expect(vi.mocked(updateDoc).mock.calls[0]?.[1]).toEqual({ days: [expect.objectContaining({
      workout: "rec", executionWorkoutOverride: "rec", intervals: original.intervals, workoutName: original.workoutName,
      plannedTSS: 25, plannedDurationMin: 45,
    })] });
    const saved = (vi.mocked(updateDoc).mock.calls[0]?.[1] as { days: Record<string, unknown>[] }).days[0]!;
    for (const field of ["adjustedTSS", "adjustedDurationMin", "closedLoopAdjustment"]) expect(saved).not.toHaveProperty(field);
  });
  it("휴식의 명시적 실행 마커도 새 처방으로 판정한다", () => {
    expect(usesEffectiveExecutionPrescription({ workout: "rest", executionWorkoutOverride: "rest" })).toBe(true);
  });
  it("새 파일 임포트는 이전 교체 근거를 제거해 새 구간을 다시 덮어쓰지 않는다", async () => {
    const old = { ...original, workout: "rec" as const, executionWorkoutOverride: "rec" as const,
      adjustedTSS: 10, adjustedDurationMin: 20, closedLoopAdjustment: { originalWorkout: "vo2", suggestedWorkout: "rec" } };
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ days: [old], snapshot: { ftp: 200 } }) } as unknown as Awaited<ReturnType<typeof getDoc>>);
    const { container } = show(old);
    const file = new File(["workout"], "workout.zwo");
    Object.defineProperty(file, "text", { value: async () => "workout" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    const saved = (vi.mocked(updateDoc).mock.calls[0]?.[1] as { days: Record<string, unknown>[] }).days[0]!;
    expect(saved.workoutName).toBe("새 임포트");
    for (const field of ["executionWorkoutOverride", "closedLoopAdjustment", "adjustedTSS", "adjustedDurationMin"]) expect(saved).not.toHaveProperty(field);
  });
});
