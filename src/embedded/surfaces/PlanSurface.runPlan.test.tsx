import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 앱 계획 탭(임베드)의 러닝 훈련 계획은 제목·종목 탭·날짜 이동·계획 대비 기록만 보여 준다(2026-11-19).
// 러닝 30일 프로그램·오늘의 훈련 결정·주간 계획은 두지 않고, Run30 조회를 기다리지 않는다.
const mocks = vi.hoisted(() => ({
  planModel: {} as Record<string, unknown>,
  run30Lookups: 0,
}));

vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner", isAnonymous: false }, profile: {} }) }));
vi.mock("../../features/trainingDecision/TodayTrainingDecisionCard", () => ({ default: () => <div data-testid="today-decision" /> }));
vi.mock("../../hooks/usePlanModel", () => ({ usePlanModel: () => mocks.planModel }));
vi.mock("../../features/training/run30/useRun30Program", () => ({
  useRun30Program: () => { mocks.run30Lookups += 1; return { status: "ready", program: null }; },
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
  });

  it("shows only the header, date navigation and plan-vs-record comparison", async () => {
    const onReady = vi.fn();
    render(wrapper(<PlanSurface onReady={onReady} retryKey={0} />));
    expect(screen.getByTestId("K4-0")).toBeInTheDocument();
    expect(screen.getByTestId("plan-load-comparison")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-presentation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("today-decision")).not.toBeInTheDocument();
    expect(mocks.run30Lookups).toBe(0);
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("fresh"));
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
