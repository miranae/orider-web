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
