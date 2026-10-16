import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getDoc, updateDoc } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanDay } from "@shared/types/goal";
import { usesEffectiveExecutionPrescription } from "@shared/training/effectiveExecutionPrescription";
import { GlossaryProvider } from "../common/GlossaryProvider";
import WorkoutEditModal from "./WorkoutEditModal";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ alert: vi.fn() }) }));
const original: PlanDay = { date: 1000000, dayOfWeek: 1, workout: "vo2", plannedTSS: 95,
  plannedDurationMin: 60, completed: false, skipped: false,
  intervals: [{ label: "Z5", durationMin: 10 }], workoutName: "원본 고강도" };
function show(day: PlanDay, weekAdjustmentReason?: string) {
  return render(<WorkoutEditModal day={day} weekId="week-01" dayIndex={0} goalId="goal"
    weekAdjustmentReason={weekAdjustmentReason} goalDiscipline="bike" onClose={vi.fn()} onUpdate={vi.fn()} />);
}
beforeEach(() => { vi.mocked(updateDoc).mockClear(); vi.mocked(getDoc).mockReset(); });
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
    show(old);
    const content = '<workout_file><name>새 임포트</name><workout><SteadyState Duration="1800" Power="0.8"/></workout></workout_file>';
    const file = new File([content], "workout.zwo");
    Object.defineProperty(file, "text", { value: async () => content });
    fireEvent.change(document.body.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    const saved = (vi.mocked(updateDoc).mock.calls[0]?.[1] as { days: Record<string, unknown>[] }).days[0]!;
    expect(saved.workoutName).toBe("새 임포트");
    for (const field of ["executionWorkoutOverride", "closedLoopAdjustment", "adjustedTSS", "adjustedDurationMin"]) expect(saved).not.toHaveProperty(field);
  });
});

describe("Firestore rules 가 거부하는 완료·건너뛰기 쓰기 잠금", () => {
  function showFor(day: PlanDay, goalDiscipline: "bike" | "run") {
    return render(<WorkoutEditModal day={day} weekId="week-01" dayIndex={0} goalId="goal"
      goalDiscipline={goalDiscipline} onClose={vi.fn()} onUpdate={vi.fn()} />);
  }
  it("러닝 목표는 완료·건너뛰기를 잠그고 안내한다", () => {
    showFor(original, "run");
    expect(screen.getByRole("button", { name: "edit.markCompleted" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "edit.skip" })).toBeDisabled();
    expect(screen.getByText("edit.runningOutcomeLocked")).toBeInTheDocument();
  });
  it("서버가 활동 연결을 기록한 날은 사이클도 잠근다", () => {
    showFor({ ...original, actualActivityId: "a1", completed: true }, "bike");
    expect(screen.getByRole("button", { name: "edit.uncheckCompleted" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "edit.skip" })).toBeDisabled();
    expect(screen.getByText("edit.serverOutcomeLocked")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "edit.uncheckCompleted" }));
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it("실행 결과가 없는 사이클 일정은 그대로 바꿀 수 있다", () => {
    showFor(original, "bike");
    expect(screen.getByRole("button", { name: "edit.markCompleted" })).toBeEnabled();
    expect(screen.queryByText("edit.serverOutcomeLocked")).not.toBeInTheDocument();
  });
});


const generatedProof: NonNullable<PlanDay["prescriptionIntensityProvenance"]> = {
  origin: "generator", basis: { discipline: "bike", value: 200, source: "assumed", revision: null }, contentRevision: "old-generator-proof",
};
const relativeWorkout = '<workout_file><name>상대 구간</name><workout><SteadyState Duration="600" Power="0.8"/></workout></workout_file>';
async function importFile(_container: HTMLElement, filename: string, content: string) {
  const file = new File([content], filename);
  Object.defineProperty(file, "text", { value: async () => content });
  fireEvent.change(document.body.querySelector('input[type="file"]')!, { target: { files: [file] } });
}
function savedDays(): PlanDay[] {
  return (vi.mocked(updateDoc).mock.calls[0]?.[1] as { days: PlanDay[] }).days;
}

describe("워크아웃 작성 행위와 강도 근거", () => {
  it.each([160, 190])("같거나 바뀐 %iW 구간 임포트도 이전 생성기 증명을 재사용하지 않는다", async power => {
    const day = { ...original, intervals: [{ label: "Z2" as const, durationMin: 10, targetPowerW: [power, power] as [number, number] }], prescriptionIntensityProvenance: generatedProof };
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => ({ snapshot: { ftp: 200, ftpSource: "assumed" } }) } as never)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ days: [day] }) } as never);
    const { container } = show(day);
    await importFile(container, "relative.zwo", relativeWorkout);
    await waitFor(() => expect(updateDoc).toHaveBeenCalledOnce());
    expect(savedDays()[0]?.intervals?.[0]?.targetPowerW).toEqual([160, 160]);
    expect(savedDays()[0]).not.toHaveProperty("prescriptionIntensityProvenance");
  });

  it("현재 계획의 값으로 상대 파일을 환산하며 과거 가정 시작값과 섞지 않는다", async () => {
    const day = { ...original, prescriptionIntensityProvenance: generatedProof };
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => ({ snapshot: { ftp: 200, ftpSource: "assumed" }, planInputSources: { ftp: 250, ftpSource: "user" } }) } as never)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ days: [day] }) } as never);
    const { container } = show(day);
    await importFile(container, "relative.zwo", relativeWorkout);
    await waitFor(() => expect(updateDoc).toHaveBeenCalledOnce());
    expect(savedDays()[0]?.intervals?.[0]?.targetPowerW).toEqual([200, 200]);
    expect(savedDays()[0]).not.toHaveProperty("prescriptionIntensityProvenance");
  });

  it("JSON 직접 편집 경로는 없고 지원하지 않는 JSON 파일은 저장하지 않는다", async () => {
    const { container } = show({ ...original, prescriptionIntensityProvenance: generatedProof });
    await importFile(container, "absolute.json", '{"target":{"type":"POWER","watts":160}}');
    await waitFor(() => expect(document.body.querySelector('input[type="file"]')).not.toBeDisabled());
    expect(updateDoc).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it("프리셋 교체는 사용자 절대 입력으로 승격하지 않고 기존 생성기 증명을 제거한다", async () => {
    const day = { ...original, prescriptionIntensityProvenance: generatedProof };
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ days: [day] }) } as never);
    show(day);
    fireEvent.click(screen.getByRole("button", { name: "edit.changeWorkout" }));
    fireEvent.click(screen.getByRole("button", { name: "workouts.rec" }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledOnce());
    expect(savedDays()[0]).toMatchObject({ workout: "rec", executionWorkoutOverride: "rec", intervals: original.intervals });
    expect(savedDays()[0]).not.toHaveProperty("prescriptionIntensityProvenance");
  });

  it.each(["edit.markCompleted", "edit.skip"])("%s 결과 변경은 강도 내용과 작성 근거를 보존한다", async action => {
    const day = { ...original, prescriptionIntensityProvenance: generatedProof };
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ days: [day] }) } as never);
    show(day);
    fireEvent.click(screen.getByRole("button", { name: action }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledOnce());
    expect(savedDays()[0]).toMatchObject({ prescriptionIntensityProvenance: generatedProof, intervals: original.intervals, workoutName: original.workoutName });
  });
});

it("폼 열기와 이름 표시만으로 기존 강도 근거를 사용자 확인으로 바꾸지 않는다", () => {
  show({ ...original, workoutName: "이름만 다른 원본", prescriptionIntensityProvenance: generatedProof });
  expect(screen.getByText(/이름만 다른 원본/)).toBeInTheDocument();
  expect(updateDoc).not.toHaveBeenCalled();
});

it("기존 이웃일 교환은 강도 구간과 각 날짜의 출처 메타를 그대로 보존한다", async () => {
  const day = { ...original, prescriptionIntensityProvenance: generatedProof };
  const next: PlanDay = { ...original, date: original.date + 86400000, workout: "z2", prescriptionIntensityProvenance: { origin: "user" } };
  vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ days: [day, next] }) } as never);
  show(day);
  fireEvent.click(screen.getByRole("button", { name: "edit.swapNext" }));
  await waitFor(() => expect(updateDoc).toHaveBeenCalledOnce());
  expect(savedDays()[0]).toMatchObject({ workout: "z2", intervals: original.intervals, prescriptionIntensityProvenance: generatedProof });
  expect(savedDays()[1]).toMatchObject({ workout: "vo2", prescriptionIntensityProvenance: { origin: "user" } });
});

describe("편집창 키보드와 최신 날짜 보호", () => {
  it("열리면 닫기로 포커스를 옮기고 Tab을 가두며 취소는 쓰지 않고 포커스를 돌린다", () => {
    const trigger = document.createElement('button');
    document.body.append(trigger); trigger.focus();
    const onClose = vi.fn();
    const view = render(<WorkoutEditModal day={original} weekId="w" dayIndex={0} goalId="g" onClose={onClose} onUpdate={vi.fn()} />);
    const modal = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'edit.closeAria' });
    expect(close).toHaveFocus();
    const controls = modal.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
    const last = controls[controls.length - 1]!;
    last.focus(); fireEvent.keyDown(last, { key: 'Tab' }); expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Escape' }); expect(onClose).toHaveBeenCalledOnce();
    expect(updateDoc).not.toHaveBeenCalled();
    view.unmount(); expect(trigger).toHaveFocus(); trigger.remove();
  });
  it("서버의 같은 인덱스 날짜가 바뀌면 다른 날에 쓰지 않는다", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ days: [{ ...original, date: original.date + 86400000 }] }) } as never);
    show(original);
    fireEvent.click(screen.getByRole('button', { name: 'edit.markCompleted' }));
    await waitFor(() => expect(getDoc).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: 'edit.markCompleted' })).toBeEnabled());
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it("저장 중 Escape와 배경으로 닫을 수 없다", async () => {
    vi.mocked(getDoc).mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    render(<WorkoutEditModal day={original} weekId="w" dayIndex={0} goalId="g" onClose={onClose} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'edit.markCompleted' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getAllByTestId('K4-6-7')[0]!);
    expect(onClose).not.toHaveBeenCalled();
  });
});

it("종류 선택 버튼 밖 범례에서 강도 설명을 열며 쓰기를 실행하지 않는다", () => {
  render(<GlossaryProvider><WorkoutEditModal day={original} weekId="w" dayIndex={0} goalId="g" onClose={vi.fn()} onUpdate={vi.fn()} /></GlossaryProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'edit.changeWorkout' }));
  const legend = screen.getByTestId('workout-intensity-glossary');
  fireEvent.click(legend.closest('details')!.querySelector('summary')!);
  expect(legend.closest('details')).toHaveAttribute('open');
  const trigger = legend.querySelector('[data-glossary-term="z4"] button')!;
  expect(trigger).not.toBeNull();
  fireEvent.focus(trigger);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  expect(document.querySelector('button button')).toBeNull();
  expect(updateDoc).not.toHaveBeenCalled();
});
