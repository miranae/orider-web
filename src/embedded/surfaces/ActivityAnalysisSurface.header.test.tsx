import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ActivityAnalysisSurface from "./ActivityAnalysisSurface";

const state = vi.hoisted(() => ({ isOwner: false }));
vi.mock("../../hooks/useActivityAnalysisModel", () => ({ useActivityAnalysisModel: () => ({
  activity: { id: "a1", nickname: "다른라이더", profileImage: null, description: "한강 라이딩", type: "Ride", startTime: Date.UTC(2026, 9, 1, 3) },
  isActivityOwner: state.isOwner, loadingActivity: false, activityProcessing: false,
  loadingStreams: false, showStreamSpinner: false, overview: { response: { status: "available" } },
  analysisTabProps: { activityId: "a1", isOwner: state.isOwner },
  retryActivity: vi.fn(), retryStreams: vi.fn(),
}) }));
vi.mock("../../features/activity/detail/ActivityOverviewEvidence", () => ({ default: () => <div /> }));
vi.mock("../../components/AnalysisTab", () => ({ default: () => <div data-testid="analysis" /> }));

describe("ActivityAnalysisSurface author header", () => {
  beforeEach(() => { state.isOwner = false; });
  it("non-owner sees author nickname and activity title", () => {
    render(<ActivityAnalysisSurface activityId="a1" retryKey={0} onReady={vi.fn()} onError={vi.fn()} />);
    const header = screen.getByTestId("embedded-activity-author");
    expect(header).toHaveTextContent("다른라이더");
    expect(header).toHaveTextContent("한강 라이딩");
  });
  it("owner sees no header", () => {
    state.isOwner = true;
    render(<ActivityAnalysisSurface activityId="a1" retryKey={0} onReady={vi.fn()} onError={vi.fn()} />);
    expect(screen.queryByTestId("embedded-activity-author")).toBeNull();
  });
});
