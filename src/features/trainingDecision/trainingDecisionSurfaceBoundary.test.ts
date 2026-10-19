import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../__tests__/fixtures/trainingDecision";
import TodayTrainingDecisionCard, { type TrainingDecisionSurface } from "./TodayTrainingDecisionCard";

const mocks = vi.hoisted(() => ({ hook: vi.fn(), proposal: vi.fn() }));
vi.mock("../../hooks/useTodayTrainingDecision", () => ({ useTodayTrainingDecision: mocks.hook }));
vi.mock("../coach/CoachQuestionLauncher", () => ({ CoachQuestionLauncher: () => createElement("button", null, "Coach") }));
vi.mock("./useTrainingProposalController", () => ({ useTrainingProposalController: mocks.proposal }));
vi.mock("./TrainingExecutionPanel", () => ({ TrainingExecutionPanel: () => createElement("button", null, "Execution") }));

const user = { uid: "owner" } as never;

function renderSurface(surface: TrainingDecisionSurface) {
  const view = render(createElement(MemoryRouter, null,
    createElement(TodayTrainingDecisionCard, { user, discipline: "bike", surface })));
  return view.container.querySelector("[data-decision-id]");
}

describe("training decision surface boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.proposal.mockReturnValue({ state: "unavailable", proposal: null });
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
  });

  it("keeps the identical authoritative tuple on Fitness and Plan adjustment surfaces", () => {
    for (const surface of ["fitness", "today", "plan"] as const) {
      const card = renderSurface(surface);
      expect(card).toHaveAttribute("data-decision-id", "today_cccccccccccccccccccccccc");
      expect(card).toHaveAttribute("data-facts-id", "facts_123");
      expect(card).toHaveAttribute("data-plan-revision", "plan_123");
    }
  });

  it("keeps the visible scheduled and recommended labels on Fitness without local readiness copy", () => {
    renderSurface("fitness");
    expect(screen.getByText("원래 계획")).toBeVisible();
    expect(screen.getByText("조정 권고")).toBeVisible();
    expect(screen.getByText("현재 실행안")).toBeVisible();
    expect(screen.queryByText(/CTL|ATL|TSB|ACWR/i)).not.toBeInTheDocument();
  });

  it("forbids cross-surface actions in the DOM", () => {
    const fitness = renderSurface("fitness")!;
    expect(fitness).toHaveTextContent("Coach");
    expect(fitness).toHaveTextContent("Execution");
    expect(fitness).not.toHaveTextContent("계획 변경 검토");
    expect(fitness.querySelector("a")).toBeNull();

    const plan = renderSurface("plan")!;
    expect(plan).toHaveTextContent("원래 계획");
    expect(plan).toHaveTextContent("조정 권고");
    expect(plan).not.toHaveTextContent("계획 변경 검토");
    expect(plan).not.toHaveTextContent("Coach");
    expect(plan).not.toHaveTextContent("Execution");
    expect(plan.querySelector("a")).toHaveAttribute("href", "/ko/coach/today?sport=bike");
    expect(plan.querySelector("button")).toBeNull();

    const today = renderSurface("today")!;
    expect(today).toHaveTextContent("계획 변경 검토");
    expect(today).toHaveTextContent("Execution");
    expect(today).toHaveTextContent("Coach");
    expect(today.querySelector("a")).toHaveAttribute("href", expect.stringContaining("/coach/plan?sport=bike&date="));
  });

  it.each([false, true])("keeps one run execution owner when suppression is %s", (suppressExecution) => {
    const view = render(createElement(MemoryRouter, null,
      createElement(TodayTrainingDecisionCard, { user, discipline: "run", surface: "today", suppressExecution })));
    const card = view.container.querySelector("[data-decision-id]")!;
    expect(card).toHaveTextContent("원래 계획");
    expect(card).toHaveTextContent("계획 변경 검토");
    expect(card).toHaveTextContent("Coach");
    if (suppressExecution) expect(card).not.toHaveTextContent("Execution");
    else expect(card).toHaveTextContent("Execution");
  });

  it("never instantiates the mutation controller on Plan", () => {
    renderSurface("plan");
    expect(mocks.proposal).not.toHaveBeenCalled();
  });
});
