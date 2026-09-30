import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import PlanPage from "./PlanPage";

const mocks = vi.hoisted(() => ({
  model: {} as Record<string, unknown>,
  run30: {} as Record<string, unknown>,
  presentationProps: null as null | Record<string, unknown>,
  mobileProps: null as null | Record<string, unknown>,
}));

vi.mock("../hooks/usePlanModel", () => ({ usePlanModel: () => mocks.model }));
vi.mock("../features/training/run30/useRun30Program", () => ({ useRun30Program: () => mocks.run30 }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => false }));
vi.mock("../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: vi.fn() }) }));
vi.mock("../features/trainingDecision/TodayTrainingDecisionCard", () => ({ default: () => null }));
vi.mock("../components/training/WorkoutEditModal", () => ({ default: () => <div data-testid="workout-editor" /> }));
vi.mock("../components/mobile/MobilePlanPage", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.mobileProps = props;
    return null;
  },
}));
vi.mock("../features/training/run30/Run30ProgramView", () => ({
  default: () => <div data-testid="run30-program-view" />,
}));
vi.mock("../features/training/plan/PlanPresentation", () => ({
  default: (props: Record<string, unknown> & { renderMobile?: (p: Record<string, unknown>) => ReactNode }) => {
    mocks.presentationProps = props;
    return <div data-testid="plan-presentation">{props.renderMobile?.({ currentWeek: null })}</div>;
  },
}));

function planModel(goal: Record<string, unknown> | null, discipline = "run") {
  return {
    discipline,
    goal,
    weeks: [],
    loading: false,
    loadError: null,
    freshLoaded: true,
    isTodayCell: () => false,
    retryLoad: vi.fn(),
    refreshPlanWeeks: vi.fn(),
  };
}

describe("PlanPage with server-managed Run30 goals", () => {
  beforeEach(() => {
    mocks.run30 = { status: "ready", program: null, api: {}, refresh: vi.fn(), retry: vi.fn() };
    mocks.presentationProps = null;
    mocks.mobileProps = null;
  });

  it("renders the program view for sport=run when a program is active", () => {
    mocks.model = planModel({ id: "run30_goal", userId: "test-uid", discipline: "run", runProgram: { template: "run-30-intro-v1" } });
    mocks.run30 = { ...mocks.run30, program: { goalId: "run30_goal" } };
    renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/plan?sport=run" });
    expect(screen.getByTestId("run30-program-view")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-presentation")).not.toBeInTheDocument();
  });

  it("hides direct-write edit affordances for goals with runProgram", () => {
    mocks.model = planModel({
      id: "run30_goal", userId: "test-uid", discipline: "run", status: "active",
      runProgram: { template: "run-30-intro-v1" }, adaptationFlag: { kind: "x" },
    });
    renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/plan?sport=run" });
    expect(screen.getByTestId("plan-presentation")).toBeInTheDocument();
    expect(mocks.presentationProps?.onEditWorkout).toBeUndefined();
    expect(mocks.presentationProps?.onReroll).toBeUndefined();
    expect(mocks.presentationProps?.onGoalReset).toBeUndefined();
    expect(mocks.presentationProps?.adaptationSlot).toBeUndefined();
    expect(mocks.presentationProps?.onIcsExport).toEqual(expect.any(Function));
    expect(mocks.mobileProps?.goalId).toBeUndefined();
    expect(mocks.mobileProps?.onReroll).toBeUndefined();
    expect(mocks.mobileProps?.onGoalReset).toBeUndefined();
  });

  it("keeps edit affordances for ordinary goals", () => {
    mocks.model = planModel({ id: "bike_goal", userId: "test-uid", discipline: "bike", status: "active" }, "bike");
    mocks.run30 = { status: "idle", program: null, api: {}, refresh: vi.fn(), retry: vi.fn() };
    renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/plan?sport=bike" });
    expect(mocks.presentationProps?.onEditWorkout).toEqual(expect.any(Function));
    expect(mocks.presentationProps?.onReroll).toEqual(expect.any(Function));
    expect(mocks.presentationProps?.onGoalReset).toEqual(expect.any(Function));
    expect(mocks.mobileProps?.goalId).toBe("bike_goal");
  });

  it("offers enrollment instead of the empty state when no running goal exists", () => {
    mocks.model = planModel(null);
    renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/plan?sport=run" });
    expect(screen.getByTestId("run30-enroll-intro")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "다른 러닝 목표 만들기" })).toHaveAttribute("href", "/ko/goal-setup?sport=run");
  });
});
