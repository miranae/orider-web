import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  planModel: {} as Record<string, unknown>,
  run30Lookups: 0,
  run30Program: null as { goalId: string } | null,
  startMode: null as unknown,
}));

vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner", isAnonymous: false }, profile: {} }) }));
vi.mock("../../features/trainingDecision/TodayTrainingDecisionCard", () => ({ default: () => <div data-testid="today-decision" /> }));
vi.mock("../../hooks/usePlanModel", () => ({ usePlanModel: () => mocks.planModel }));
vi.mock("../../features/training/run30/useRun30Program", () => ({
  useRun30Program: (enabled: boolean) => {
    if (enabled) mocks.run30Lookups += 1;
    return { status: "ready", program: mocks.run30Program };
  },
}));
vi.mock("../../features/training/run30/Run30ProgramView", () => ({
  default: ({ startMode }: { startMode: unknown }) => {
    mocks.startMode = startMode;
    return <div data-testid="run30-program-view" />;
  },
}));
vi.mock("../../features/training/plan/PlanPresentation", () => ({
  default: () => <div data-testid="plan-presentation" />,
}));
vi.mock("../../features/training/plan/PlanLoadComparisonPanel", () => ({
  default: () => <div data-testid="plan-load-comparison" />,
}));

import PlanSurface from "./PlanSurface";

function wrapper(children: ReactNode, sport = "run") {
  return <MemoryRouter initialEntries={[`/ko/embed/plan?sport=${sport}`]}>{children}</MemoryRouter>;
}

const loadedPlan = {
  discipline: "run",
  goal: { id: "half", discipline: "run" },
  weeks: [{ id: "week-1", days: [{ date: Date.parse("2026-11-19T00:00:00+09:00") }] }],
  isTodayCell: () => false,
  goalMatchesDiscipline: true,
  goalLoading: false,
  planLoading: false,
  goalError: null,
  planError: null,
  loading: false,
  loadError: null,
  cacheHit: false,
  freshLoaded: true,
  retryLoad: vi.fn(),
  refreshPlanWeeks: vi.fn().mockResolvedValue(undefined),
};

describe("PlanSurface running plan", () => {
  beforeEach(() => {
    mocks.planModel = { ...loadedPlan, retryLoad: vi.fn(), refreshPlanWeeks: vi.fn().mockResolvedValue(undefined) };
    mocks.run30Lookups = 0;
    mocks.run30Program = null;
    mocks.startMode = null;
  });

  it("shows the comparison before loading the weekly plan", async () => {
    const onReady = vi.fn();
    render(wrapper(<PlanSurface onReady={onReady} retryKey={0} />));
    expect(screen.getByTestId("K4-0")).toBeInTheDocument();
    expect(screen.getByTestId("plan-load-comparison")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-presentation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("today-decision")).not.toBeInTheDocument();
    expect(mocks.run30Lookups).toBe(0);
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("fresh"));

    const details = screen.getByText("운동 계획").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.getByTestId("plan-presentation")).toBeVisible();
    expect(mocks.run30Lookups).toBeGreaterThan(0);
  });

  it("passes the scheduled-run bridge to an enrolled runner", () => {
    const starter = vi.fn();
    mocks.run30Program = { goalId: "half" };
    render(wrapper(<PlanSurface onReady={vi.fn()} retryKey={0} scheduledRunStarter={starter} />));
    expect(screen.queryByTestId("run30-program-view")).not.toBeInTheDocument();

    const details = screen.getByText("운동 계획").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.getByTestId("run30-program-view")).toBeVisible();
    expect(mocks.startMode).toEqual({ kind: "host", starter });
  });

  it("does not wait for a running goal before showing the screen", async () => {
    mocks.planModel = { ...mocks.planModel, goal: null, weeks: [], goalLoading: true, freshLoaded: false };
    render(wrapper(<PlanSurface onReady={vi.fn()} retryKey={0} />));
    expect(screen.getByTestId("K4-0")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-load-comparison")).not.toBeInTheDocument();
  });

  it("refreshes only the plan weeks when shown again", async () => {
    const onReady = vi.fn();
    const { rerender } = render(wrapper(<PlanSurface onReady={onReady} retryKey={0} backgroundRefreshKey={3} />));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("fresh"));
    expect(mocks.planModel.refreshPlanWeeks).not.toHaveBeenCalled();
    rerender(wrapper(<PlanSurface onReady={onReady} retryKey={0} backgroundRefreshKey={4} />));
    await waitFor(() => expect(mocks.planModel.refreshPlanWeeks).toHaveBeenCalledTimes(1));
    expect(mocks.run30Lookups).toBe(0);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("leaves bike plans untouched", async () => {
    mocks.planModel = { ...mocks.planModel, discipline: "bike", goal: { id: "gf", discipline: "bike" } };
    const onReady = vi.fn();
    render(wrapper(<PlanSurface onReady={onReady} retryKey={0} />, "bike"));
    expect(screen.getByTestId("plan-presentation")).toBeInTheDocument();
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("fresh"));
  });
});
