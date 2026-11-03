import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityAnalysisModel } from "../../hooks/useActivityAnalysisModel";
import ActivityCompareSurface from "./ActivityCompareSurface";

const state = vi.hoisted(() => ({
  model: {} as ActivityAnalysisModel,
  options: [] as unknown[],
  panelProps: [] as Record<string, unknown>[],
}));
vi.mock("../../hooks/useActivityAnalysisModel", () => ({
  useActivityAnalysisModel: (...args: unknown[]) => {
    state.options.push(args[3]);
    return state.model;
  },
}));
vi.mock("../../features/activity/detail/ActivityGrowthPanel", () => ({
  ActivityGrowthPanel: (props: Record<string, unknown>) => {
    state.panelProps.push(props);
    return <div data-testid="growth-panel" />;
  },
}));

afterEach(cleanup);
beforeEach(() => {
  state.options.length = 0;
  state.panelProps.length = 0;
  state.model = {
    activity: { id: "a", userId: "owner-1" },
    loadingActivity: false,
    activityProcessing: false,
    activityLoadError: null,
    isActivityOwner: true,
    serverMetrics: { status: "ready", metrics: { computedAt: 1 } },
    retryActivity: vi.fn(),
  } as unknown as ActivityAnalysisModel;
});

describe("embedded activity compare surface", () => {
  it("renders the comparison-only panel for the owner and signals ready once without loading streams", () => {
    const onReady = vi.fn(); const onError = vi.fn();
    const { rerender } = render(<ActivityCompareSurface activityId="a" retryKey={0} onReady={onReady} onError={onError} />);
    expect(screen.getByTestId("embedded-activity-compare")).toBeInTheDocument();
    expect(state.panelProps.at(-1)).toMatchObject({
      activity: state.model.activity,
      metrics: state.model.serverMetrics.metrics,
      currentMetricsStatus: "ready",
      isOwner: true,
      comparisonOnly: true,
    });
    expect(state.options.at(-1)).toEqual({ analysisData: false });
    rerender(<ActivityCompareSurface activityId="a" retryKey={0} onReady={onReady} onError={onError} />);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("waits for the server metrics verdict before signalling ready", () => {
    state.model = { ...state.model, serverMetrics: { status: "loading", metrics: null } } as ActivityAnalysisModel;
    const onReady = vi.fn();
    const { rerender } = render(<ActivityCompareSurface activityId="a" retryKey={0} onReady={onReady} onError={vi.fn()} />);
    expect(onReady).not.toHaveBeenCalled();
    state.model = { ...state.model, serverMetrics: { status: "missing", metrics: null } } as ActivityAnalysisModel;
    rerender(<ActivityCompareSurface activityId="a" retryKey={0} onReady={onReady} onError={vi.fn()} />);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("reports a non-owner activity as not found and renders nothing", () => {
    state.model = { ...state.model, isActivityOwner: false } as ActivityAnalysisModel;
    const onReady = vi.fn(); const onError = vi.fn();
    render(<ActivityCompareSurface activityId="a" retryKey={0} onReady={onReady} onError={onError} />);
    expect(onError).toHaveBeenCalledWith("activity_not_found");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();
    expect(screen.queryByTestId("embedded-activity-compare")).not.toBeInTheDocument();
  });

  it("reports load failures and missing activities with the existing codes", () => {
    state.model = { ...state.model, activity: null, activityLoadError: new Error("permission-denied"), isActivityOwner: false } as ActivityAnalysisModel;
    const onError = vi.fn();
    const { rerender } = render(<ActivityCompareSurface activityId="a" retryKey={0} onReady={vi.fn()} onError={onError} />);
    expect(onError).toHaveBeenLastCalledWith("activity_load_failed");
    state.model = { ...state.model, activityLoadError: null } as ActivityAnalysisModel;
    rerender(<ActivityCompareSurface activityId="a" retryKey={0} onReady={vi.fn()} onError={onError} />);
    expect(onError).toHaveBeenLastCalledWith("activity_not_found");
  });

  it("reloads the activity on host retry and signals ready again", () => {
    const onReady = vi.fn();
    const { rerender } = render(<ActivityCompareSurface activityId="a" retryKey={0} onReady={onReady} onError={vi.fn()} />);
    rerender(<ActivityCompareSurface activityId="a" retryKey={1} onReady={onReady} onError={vi.fn()} />);
    expect(state.model.retryActivity).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(2);
  });
});
