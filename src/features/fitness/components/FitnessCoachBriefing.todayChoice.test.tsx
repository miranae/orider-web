import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import type { TodayWorkoutChoiceState } from "../../../hooks/useTodayWorkoutChoice";
import FitnessCoachBriefing from "./FitnessCoachBriefing";

vi.mock("./RiderWorkoutDeliveryPanel", () => ({
  default: ({ workoutType }: { workoutType: string }) => <div data-testid="delivery-panel">G1 panel · {workoutType}</div>,
}));

function choiceState(overrides: Partial<TodayWorkoutChoiceState> = {}): TodayWorkoutChoiceState {
  return { choice: null, loading: false, loadFailed: false, saving: false, saveFailed: false, save: vi.fn(async () => undefined), ...overrides };
}

function renderToday(todayChoice: TodayWorkoutChoiceState, overrides: Partial<React.ComponentProps<typeof FitnessCoachBriefing>> = {}) {
  return renderWithProviders(
    <FitnessCoachBriefing part="today" impacts={[]} selectedActivityId={null} onSelectActivity={() => undefined}
      forecast={null} current={{ ctl: 40, atl: 42, tsb: -10 }} decisionSlot={null} locale="ko" canonicalAvailable
      discipline="bike" userId="owner" deliveryEnabled todayChoice={todayChoice} {...overrides} />,
  );
}

const recoveryChoice = { discipline: "bike" as const, localDate: "2026-10-18", workoutType: "recovery" as const, targetTss: 20 as const, chosenAt: 1 };

describe("FitnessCoachBriefing today choice", () => {
  it("saves the selected workout as today's workout", () => {
    const state = choiceState();
    renderToday(state);
    fireEvent.click(screen.getByRole("radio", { name: /이지 지구력 라이딩/ }));
    fireEvent.click(screen.getByRole("button", { name: "오늘 운동으로 정하기" }));
    expect(state.save).toHaveBeenCalledWith("endurance");
    // 정하기 전에는 기기 전송을 보여주지 않는다 — 정한 운동만 보낸다.
    expect(screen.queryByTestId("delivery-panel")).not.toBeInTheDocument();
  });

  it("starts from the saved choice, shows it as decided and sends only that workout to the G1", () => {
    renderToday(choiceState({ choice: recoveryChoice }));
    expect(screen.getByRole("radio", { name: /회복 라이딩/ })).toBeChecked();
    expect(screen.getByTestId("K2-4-2")).toHaveTextContent("오늘 운동으로 정했어요");
    expect(screen.getByTestId("K2-4-2")).toHaveTextContent("회복 라이딩 · 예상 부하 20 TSS");
    expect(screen.getByTestId("delivery-panel")).toHaveTextContent("recovery");
  });

  it("offers to switch when another option is selected after deciding", () => {
    const state = choiceState({ choice: recoveryChoice });
    renderToday(state);
    fireEvent.click(screen.getByRole("radio", { name: /완전 휴식/ }));
    expect(screen.getByText("지금 정한 운동: 회복 라이딩 · 예상 부하 20 TSS")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이 운동으로 바꾸기" }));
    expect(state.save).toHaveBeenCalledWith("rest");
  });

  it("clears today's choice", () => {
    const state = choiceState({ choice: recoveryChoice });
    renderToday(state);
    fireEvent.click(screen.getByRole("button", { name: "선택 취소" }));
    expect(state.save).toHaveBeenCalledWith(null);
  });

  it("explains why delivery is unavailable instead of leaving the space blank", () => {
    renderToday(choiceState({ choice: recoveryChoice }), { deliveryEnabled: false });
    expect(screen.queryByTestId("delivery-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("K2-3-0")).toHaveTextContent("기기 전송은 건강 상태와 유효한 오늘 결정을 확인한 뒤 사용할 수 있습니다.");
  });

  it("keeps running choices on the device-free path and reports save failures", () => {
    renderToday(choiceState({ choice: { ...recoveryChoice, discipline: "run" }, saveFailed: true }), { discipline: "run" });
    expect(screen.getByTestId("K2-4-2")).toHaveTextContent("가벼운 회복 조깅");
    expect(screen.queryByTestId("delivery-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("저장하지 못했어요");
  });
});
