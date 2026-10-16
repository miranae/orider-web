import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableResult } from "../../__tests__/mocks/firebase";
import enTraining from "../../i18n/resources/en/training.json";
import RunGoalSetupWizard from "./RunGoalSetupWizard";
import PlanPreviewStep from "./PlanPreviewStep";

vi.mock("../../hooks/useGoalFitnessInputs", () => ({ useGoalFitnessInputs: () => ({ thresholdPace: 300, thresholdPaceSource: "user" }) }));
vi.mock("../redesign", () => ({ DateField: ({ id, value, min, onChange }: { id?: string; value: string; min?: string; onChange: (value: string) => void }) => <input id={id} type="date" value={value} min={min} onChange={event => onChange(event.target.value)} /> }));

const targetDate = () => new Date(Date.now() + 42 * 86400000).toISOString().slice(0, 10);
const next = () => fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
const showRun = () => renderWithProviders(<RunGoalSetupWizard Stepper={() => null} />, { route: "/ko/goal-setup?sport=run" });
afterEach(async () => { cleanup(); await act(async () => { await i18n.changeLanguage("ko"); }); });

describe("goal setup input review", () => {
  it("supports native keyboard goal selection and preserves named time inputs when reviewing and returning", async () => {
    const user = userEvent.setup();
    showRun();
    expect(screen.getByText(/실제 대회 코스나 상승고도 정보는 포함하지 않습니다/)).toBeInTheDocument();
    expect(screen.queryByText("140 m")).not.toBeInTheDocument();
    next();
    const completion = screen.getByRole("radio", { name: /완주 페이스/ });
    await user.click(completion);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /목표 시간/ })).toBeChecked();
    const hours = screen.getByRole("spinbutton", { name: "목표 시간 (시)" });
    const minutes = screen.getByRole("spinbutton", { name: "목표 시간 (분)" });
    const seconds = screen.getByRole("spinbutton", { name: "목표 시간 (초)" });
    fireEvent.change(hours, { target: { value: "2" } });
    fireEvent.change(minutes, { target: { value: "23" } });
    fireEvent.change(seconds, { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("목표 날짜"), { target: { value: targetDate() } });
    next();
    expect(screen.getByTestId("K3-3-6")).toHaveTextContent("2시간 23분 45초");
    fireEvent.click(screen.getByRole("button", { name: "← 이전" }));
    expect(screen.getByRole("spinbutton", { name: "목표 시간 (시)" })).toHaveValue(2);
    expect(screen.getByRole("spinbutton", { name: "목표 시간 (분)" })).toHaveValue(23);
    expect(screen.getByRole("spinbutton", { name: "목표 시간 (초)" })).toHaveValue(45);
    expect(screen.queryByText("최근 5K PB")).not.toBeInTheDocument();
  });

  it("keeps a six-week setup unsaved without invented phases, totals or a fitness forecast", () => {
    mockCallableInvocations.length = 0;
    showRun();
    next();
    fireEvent.change(screen.getByLabelText("목표 날짜"), { target: { value: targetDate() } });
    next();
    const review = screen.getByTestId("K3-3-6");
    expect(review).toHaveTextContent("약 6주");
    expect(review).toHaveTextContent("주 4회 희망");
    expect(review).toHaveTextContent("아직 저장하지 않았습니다");
    expect(review).toHaveTextContent("계획 생성 후 확인");
    expect(review).not.toHaveTextContent("+12");
    expect(review).not.toHaveTextContent("7주");
    expect(review.querySelector("svg")).toBeNull();
    expect(mockCallableInvocations.filter(call => call.name === "createGoal")).toHaveLength(0);
  });

  it("requires a positive target duration and keeps the real createGoal payload", async () => {
    mockCallableInvocations.length = 0;
    setCallableResult("createGoal", { goalId: "new-run-goal" });
    const user = userEvent.setup();
    showRun();
    next();
    fireEvent.change(screen.getByLabelText("목표 날짜"), { target: { value: targetDate() } });
    for (const field of screen.getAllByRole("spinbutton")) fireEvent.change(field, { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "다음 →" })).toBeDisabled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "목표 시간 (분)" }), { target: { value: "30" } });
    next();
    await user.click(screen.getByTestId("K3-3-7"));
    expect(mockCallableInvocations.find(call => call.name === "createGoal")?.data).toEqual({ eventId: "half", eventType: "time", eventDate: targetDate(), targetDurationMin: 30, weeklySessions: 4, discipline: "run" });
  });

  it("renders English input names and an unsaved review with explicit units", async () => {
    i18n.addResourceBundle("en", "training", enTraining, true, true);
    await act(async () => { await i18n.changeLanguage("en"); });
    renderWithProviders(<RunGoalSetupWizard Stepper={() => null} />, { route: "/en/goal-setup?sport=run" });
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("spinbutton", { name: "Target duration hours" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Target duration minutes" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Target duration seconds" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: targetDate() } });
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    const review = screen.getByTestId("K3-3-6");
    expect(review).toHaveTextContent("21.1 km");
    expect(review).toHaveTextContent("Nothing has been saved yet");
    expect(review).not.toHaveTextContent("+12");
  });

  it("shows requested bike inputs instead of synthetic TSS, phase lengths or generated totals", () => {
    renderWithProviders(<PlanPreviewStep goal={{ courseName: "Test course", courseDist: 100, courseElev: 1200, eventType: "completion", eventDate: targetDate(), weeklySessions: 4 }} feasibility={{ label: "on_track" }} loading={false} projectedCtl={12} />);
    expect(screen.getByText("Test course")).toBeInTheDocument();
    expect(screen.getByText("100 km")).toBeInTheDocument();
    expect(screen.getByText("1200 m")).toBeInTheDocument();
    expect(screen.getByText("약 6주")).toBeInTheDocument();
    expect(screen.queryByText("328")).not.toBeInTheDocument();
    expect(screen.queryByText("+12")).not.toBeInTheDocument();
    expect(screen.getByText(/아직 저장하지 않았습니다/)).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: "목표 설정 확인" }).closest(".goal-preview")!).queryByText(/생성되었습니다/)).not.toBeInTheDocument();
  });
});
