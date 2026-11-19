import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { simulateLogout } from "../__tests__/mocks/firebase";
import PlanPage from "./PlanPage";

const mocks = vi.hoisted(() => ({
  model: {} as Record<string, unknown>,
  run30: {} as Record<string, unknown>,
  presentationProps: null as null | Record<string, unknown>,
  mobileProps: null as null | Record<string, unknown>,
  editorProps: null as null | Record<string, unknown>,
  toast: vi.fn(),
}));

vi.mock("../hooks/usePlanModel", () => ({ usePlanModel: () => mocks.model }));
vi.mock("../features/training/run30/useRun30Program", () => ({ useRun30Program: () => mocks.run30 }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => false }));
vi.mock("../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: vi.fn() }) }));
vi.mock("../features/trainingDecision/TodayTrainingDecisionCard", () => ({ default: () => null }));
vi.mock("../contexts/ToastContext", async (importOriginal) => ({ ...await importOriginal<typeof import("../contexts/ToastContext")>(), useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("../components/training/WorkoutEditModal", () => ({ default: (props: Record<string, unknown>) => { mocks.editorProps = props; return <div data-testid="workout-editor" />; } }));
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

  it("shows the comparison by default and opens the enrolled Run30 program on request", () => {
    mocks.model = planModel({ id: "run30_goal", userId: "test-uid", discipline: "run", runProgram: { template: "run-30-intro-v1" } });
    mocks.run30 = { ...mocks.run30, program: { goalId: "run30_goal" } };
    renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/plan?sport=run" });
    expect(screen.getByTestId("K4-0")).toBeInTheDocument();
    expect(screen.queryByTestId("run30-program-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-presentation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("run30-enroll-intro")).not.toBeInTheDocument();

    const details = screen.getByText("운동 계획").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.getByTestId("run30-program-view")).toBeVisible();
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

  it("shows no enrollment card when no running goal exists", () => {
    mocks.model = planModel(null);
    renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/plan?sport=run" });
    expect(screen.getByTestId("K4-0")).toBeInTheDocument();
    expect(screen.queryByTestId("run30-enroll-intro")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-presentation")).not.toBeInTheDocument();
  });
});


it("closes the editor when its goal or sport owner changes and does not reopen old selection", () => {
  mocks.model = planModel({ id: "bike-a", userId: "test-uid", discipline: "bike", status: "active" }, "bike");
  mocks.run30 = { status: "idle", program: null, api: {}, refresh: vi.fn(), retry: vi.fn() };
  const view = renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/coach/plan?sport=bike" });
  act(() => (mocks.presentationProps?.onEditWorkout as (...args: unknown[]) => void)(
    { date: 1000000, workout: "z2", plannedTSS: 65, plannedDurationMin: 90 }, "w", 0,
  ));
  expect(screen.getByTestId("workout-editor")).toBeInTheDocument();
  mocks.model = planModel({ id: "bike-b", userId: "test-uid", discipline: "bike", status: "active" }, "bike");
  view.rerender(<PlanPage />);
  expect(screen.queryByTestId("workout-editor")).not.toBeInTheDocument();
  mocks.model = planModel({ id: "bike-a", userId: "test-uid", discipline: "bike", status: "active" }, "bike");
  view.rerender(<PlanPage />);
  expect(screen.queryByTestId("workout-editor")).not.toBeInTheDocument();
});


it("reports a saved-plan refresh failure separately and retries the full load", async () => {
  const refresh = vi.fn().mockRejectedValue(new Error("offline refresh"));
  const retry = vi.fn();
  mocks.toast.mockClear();
  mocks.model = { ...planModel({ id: "bike-a", userId: "test-uid", discipline: "bike", status: "active" }, "bike"), refreshPlanWeeks: refresh, retryLoad: retry };
  mocks.run30 = { status: "idle", program: null, api: {}, refresh: vi.fn(), retry: vi.fn() };
  renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/coach/plan?sport=bike" });
  act(() => (mocks.presentationProps?.onEditWorkout as (...args: unknown[]) => void)(
    { date: 1000000, workout: "z2", plannedTSS: 65, plannedDurationMin: 90 }, "w", 0,
  ));
  act(() => (mocks.editorProps?.onUpdate as () => void)());
  await waitFor(() => expect(retry).toHaveBeenCalledOnce());
  expect(refresh).toHaveBeenCalledOnce();
  expect(mocks.toast).toHaveBeenCalledWith(expect.stringMatching(/저장.*불러오/), "error", { resolve: { onClick: expect.any(Function) } });
  expect(screen.queryByTestId("workout-editor")).not.toBeInTheDocument();
  // 알림 문구를 누르면 같은 계정일 때만 계획을 다시 불러온다.
  const resolve = (mocks.toast.mock.calls.at(-1)?.[2] as { resolve: { onClick: () => void } }).resolve;
  resolve.onClick();
  expect(retry).toHaveBeenCalledTimes(2);
  // 계정이 바뀐 뒤 남은 알림을 눌러도 다른 계정의 계획을 다시 불러오지 않는다.
  act(() => simulateLogout());
  resolve.onClick();
  expect(retry).toHaveBeenCalledTimes(2);
});
