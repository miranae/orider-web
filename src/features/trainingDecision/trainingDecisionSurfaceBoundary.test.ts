import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../services/trainingDecisionContract.test";
import TodayTrainingDecisionCard, { type TrainingDecisionSurface } from "./TodayTrainingDecisionCard";

const mocks = vi.hoisted(() => ({ hook: vi.fn() }));
vi.mock("../../hooks/useTodayTrainingDecision", () => ({ useTodayTrainingDecision: mocks.hook }));
vi.mock("../coach/CoachQuestionLauncher", () => ({ CoachQuestionLauncher: () => createElement("button", null, "Coach") }));
vi.mock("./useTrainingProposalController", () => ({ useTrainingProposalController: () => ({ state: "unavailable", proposal: null }) }));
vi.mock("./TrainingExecutionPanel", () => ({ TrainingExecutionPanel: () => null }));

const user = { uid: "owner" } as never;

function renderSurface(surface: TrainingDecisionSurface) {
  const view = render(createElement(MemoryRouter, null,
    createElement(TodayTrainingDecisionCard, { user, discipline: "bike", surface })));
  return view.container.querySelector("[data-decision-id]");
}

describe("training decision surface boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
  });

  it("renders the identical authoritative tuple across Home, Fitness, and Plan surfaces", () => {
    for (const surface of ["home", "fitness", "plan"] as const) {
      const card = renderSurface(surface);
      expect(card).toHaveAttribute("data-decision-id", "today_cccccccccccccccccccccccc");
      expect(card).toHaveAttribute("data-facts-id", "facts_123");
      expect(card).toHaveAttribute("data-plan-revision", "plan_123");
    }
  });

  it("keeps the visible scheduled and recommended labels separated without local readiness copy", () => {
    renderSurface("home");
    expect(screen.getByText("원래 계획")).toBeVisible();
    expect(screen.getByText("조정 권고")).toBeVisible();
    expect(screen.queryByText(/CTL|ATL|TSB|ACWR/i)).not.toBeInTheDocument();
  });
});
