import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  planModel: {} as Record<string, unknown>,
  run30: {} as Record<string, unknown>,
  programViewProps: null as null | Record<string, unknown>,
  presentationProps: null as null | Record<string, unknown>,
}));

vi.mock("../../hooks/usePlanModel", () => ({
  usePlanModel: () => mocks.planModel,
}));
vi.mock("../../features/training/run30/useRun30Program", () => ({
  useRun30Program: () => mocks.run30,
}));
vi.mock("../../features/training/run30/Run30ProgramView", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.programViewProps = props;
    return <div data-testid="run30-program-view" />;
  },
}));
vi.mock("../../features/training/run30/Run30EnrollCard", () => ({
  default: ({ variant }: { variant: string }) => <div data-testid={`run30-enroll-${variant}`} />,
}));
vi.mock("../../features/training/plan/PlanPresentation", () => ({
  default: (props: { decisionSlot?: ReactNode }) => {
    mocks.presentationProps = props;
    return <div data-testid="plan-presentation">{props.decisionSlot}</div>;
  },
}));

import PlanSurface from "./PlanSurface";

function wrapper(children: ReactNode) {
  return <MemoryRouter initialEntries={["/ko/embed/plan?sport=run"]}>{children}</MemoryRouter>;
}

const loadedPlan = {
  discipline: "run",
  goal: null,
  weeks: [],
  goalLoading: false,
  planLoading: false,
  goalError: null,
  planError: null,
  loading: false,
  loadError: null,
  cacheHit: false,
  freshLoaded: true,
  retryLoad: vi.fn(),
};

const program = { goalId: "run30_goal", revision: 1, sessions: [] };

describe("PlanSurface Run30 mode", () => {
  beforeEach(() => {
    mocks.planModel = { ...loadedPlan };
    mocks.run30 = { status: "ready", program: null, api: {}, refresh: vi.fn(), retry: vi.fn() };
    mocks.programViewProps = null;
    mocks.presentationProps = null;
  });

  it("renders the program view instead of the generic calendar and reports fresh", async () => {
    mocks.planModel = { ...loadedPlan, goal: { id: "run30_goal", discipline: "run", runProgram: { template: "run-30-intro-v1" } } };
    mocks.run30 = { ...mocks.run30, program };
    const onReady = vi.fn();
    render(wrapper(<PlanSurface onReady={onReady} retryKey={0} />));
    expect(screen.getByTestId("run30-program-view")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-presentation")).not.toBeInTheDocument();
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("fresh"));
    expect(mocks.programViewProps?.startMode).toEqual({ kind: "host-unsupported" });
  });

  it("passes the host starter when the capability was negotiated", () => {
    mocks.run30 = { ...mocks.run30, program };
    const starter = { start: vi.fn() };
    render(wrapper(<PlanSurface onReady={vi.fn()} retryKey={0} scheduledRunStarter={starter} />));
    expect(mocks.programViewProps?.startMode).toEqual({ kind: "host", starter });
  });

  it("shows the enrollment intro when no running goal is active", async () => {
    const onReady = vi.fn();
    render(wrapper(<PlanSurface onReady={onReady} retryKey={0} />));
    expect(screen.getByTestId("run30-enroll-intro")).toBeInTheDocument();
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("fresh"));
  });

  it("keeps another running goal and offers the program with replacement", () => {
    mocks.planModel = { ...loadedPlan, goal: { id: "half", discipline: "run" } };
    render(wrapper(<PlanSurface onReady={vi.fn()} retryKey={0} />));
    expect(screen.getByTestId("plan-presentation")).toBeInTheDocument();
    expect(screen.getByTestId("run30-enroll-offer")).toBeInTheDocument();
  });

  it("waits for the program lookup before reporting cached plan content", async () => {
    mocks.planModel = { ...loadedPlan, cacheHit: true, freshLoaded: false };
    mocks.run30 = { ...mocks.run30, status: "loading" };
    const onReady = vi.fn();
    const { rerender } = render(wrapper(<PlanSurface onReady={onReady} retryKey={0} />));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(onReady).not.toHaveBeenCalled();
    mocks.run30 = { ...mocks.run30, status: "ready" };
    rerender(wrapper(<PlanSurface onReady={onReady} retryKey={0} />));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("cached"));
  });

  it("reports error with retry when the program lookup fails", async () => {
    mocks.run30 = { ...mocks.run30, status: "error", error: new Error("x") };
    const onReady = vi.fn();
    render(wrapper(<PlanSurface onReady={onReady} retryKey={0} />));
    expect(screen.getByRole("button")).toBeInTheDocument();
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("error"));
    screen.getByRole("button").click();
    expect(mocks.run30.retry).toHaveBeenCalled();
    expect(loadedPlan.retryLoad).toHaveBeenCalled();
  });

  it("leaves bike plans untouched", async () => {
    mocks.planModel = { ...loadedPlan, discipline: "bike", goal: { id: "gf", discipline: "bike" } };
    mocks.run30 = { status: "idle", program: null, api: {}, refresh: vi.fn(), retry: vi.fn() };
    const onReady = vi.fn();
    render(wrapper(<PlanSurface onReady={onReady} retryKey={0} />));
    expect(screen.getByTestId("plan-presentation")).toBeInTheDocument();
    expect(mocks.presentationProps?.decisionSlot).toBeUndefined();
    await waitFor(() => expect(onReady).toHaveBeenCalledWith("fresh"));
  });
});
