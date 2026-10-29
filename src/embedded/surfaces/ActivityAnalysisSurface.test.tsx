import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityAnalysisModel } from "../../hooks/useActivityAnalysisModel";
import ActivityAnalysisSurface from "./ActivityAnalysisSurface";

const state = vi.hoisted(() => ({ model: {} as ActivityAnalysisModel }));
vi.mock("../../hooks/useActivityAnalysisModel", () => ({ useActivityAnalysisModel: () => state.model }));
vi.mock("../../components/AnalysisTab", () => ({ default: () => <div>stream analysis</div> }));
afterEach(cleanup);
beforeEach(() => {
  state.model = {
    activity: { id: "a" }, loadingActivity: false, activityProcessing: false, loadingStreams: false,
    showStreamSpinner: false, streamsError: "offline", analysisTabProps: null,
    retryActivity: vi.fn(), retryStreams: vi.fn(), overview: { enabled: true, loading: true, response: null, error: false, retry: vi.fn() },
  } as unknown as ActivityAnalysisModel;
});

describe("embedded activity independent overview readiness", () => {
  it("waits for overview then signals ready, not a terminal stream error, without streams", () => {
    const onError = vi.fn(); const onReady = vi.fn();
    const { rerender } = render(<ActivityAnalysisSurface activityId="a" retryKey={0} onError={onError} onReady={onReady} />);
    expect(onError).not.toHaveBeenCalled();
    state.model.overview = { ...state.model.overview, loading: false, response: { status: "available", activityId: "a", version: "activity-overview-v1", inputDigest: "d", presentation: { coachSentence: "saved evidence", session: { discipline: "swim" } } } };
    rerender(<ActivityAnalysisSurface activityId="a" retryKey={0} onError={onError} onReady={onReady} />);
    expect(screen.getByText("saved evidence")).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("signals readiness again after visiting another activity error with the same retry key", () => {
    const onReady = vi.fn(); const onError = vi.fn();
    state.model.overview = { ...state.model.overview, loading: false, response: { status: "available", activityId: "a", version: "activity-overview-v1", inputDigest: "d", presentation: { coachSentence: "saved evidence", session: { discipline: "swim" } } } };
    const savedModel = state.model;
    const { rerender } = render(<ActivityAnalysisSurface activityId="a" retryKey={0} onReady={onReady} onError={onError} />);
    expect(onReady).toHaveBeenCalledTimes(1);
    state.model = { ...savedModel, activity: { ...savedModel.activity!, id: "b" }, overview: { ...savedModel.overview, response: null, error: true } };
    rerender(<ActivityAnalysisSurface activityId="b" retryKey={0} onReady={onReady} onError={onError} />);
    expect(onError).toHaveBeenCalledWith("streams_load_failed");
    state.model = savedModel;
    rerender(<ActivityAnalysisSurface activityId="a" retryKey={0} onReady={onReady} onError={onError} />);
    expect(screen.getByText("saved evidence")).toBeInTheDocument();
    expect(onReady).toHaveBeenCalledTimes(2);
    rerender(<ActivityAnalysisSurface activityId="a" retryKey={0} onReady={onReady} onError={onError} />);
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(savedModel.retryActivity).not.toHaveBeenCalled();
    expect(savedModel.retryStreams).not.toHaveBeenCalled();
    expect(savedModel.overview.retry).not.toHaveBeenCalled();
  });
  it("reports the same error separately for each activity entry without duplicate rerender reports", () => {
    state.model.overview = { ...state.model.overview, loading: false, error: true };
    const onError = vi.fn(); const onReady = vi.fn();
    const { rerender } = render(<ActivityAnalysisSurface activityId="a" retryKey={0} onReady={onReady} onError={onError} />);
    state.model = { ...state.model, activity: { ...state.model.activity!, id: "b" } };
    rerender(<ActivityAnalysisSurface activityId="b" retryKey={0} onReady={onReady} onError={onError} />);
    expect(onError).toHaveBeenCalledTimes(2);
    rerender(<ActivityAnalysisSurface activityId="b" retryKey={0} onReady={onReady} onError={onError} />);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onReady).not.toHaveBeenCalled();
  });
  it("retries canonical overview together with streams after host retry", () => {
    const { rerender } = render(<ActivityAnalysisSurface activityId="a" retryKey={0} onError={vi.fn()} onReady={vi.fn()} />);
    rerender(<ActivityAnalysisSurface activityId="a" retryKey={1} onError={vi.fn()} onReady={vi.fn()} />);
    expect(state.model.overview.retry).toHaveBeenCalledTimes(1);
    expect(state.model.retryStreams).toHaveBeenCalledTimes(1);
  });
  it("reports stream failure only when overview is also unavailable", () => {
    state.model.overview = { ...state.model.overview, loading: false, error: true };
    const onError = vi.fn();
    render(<ActivityAnalysisSurface activityId="a" retryKey={0} onError={onError} onReady={vi.fn()} />);
    expect(onError).toHaveBeenCalledWith("streams_load_failed");
  });
  it("does not hide activity authorization/load failures behind optional overview", () => {
    state.model.activityLoadError = new Error("permission-denied");
    const onError = vi.fn();
    render(<ActivityAnalysisSurface activityId="a" retryKey={0} onError={onError} onReady={vi.fn()} />);
    expect(onError).toHaveBeenCalledWith("activity_load_failed");
  });
});
