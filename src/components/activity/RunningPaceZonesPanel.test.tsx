import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getCurrentUser } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { runningPaceAnalysisFixture, runningPacePeriodFixture } from "../../services/trainingAnalysisPeriods.fixture";
import RunningPaceZonesPanel from "./RunningPaceZonesPanel";
import RunAnalysisPanel from "./RunAnalysisPanel";
import type { ActivityMetricsDoc } from "../../hooks/useActivityMetrics";

describe("recorded GAP pace-zone presentation", () => {
  it("shows six slow-to-fast zones with human pace, observed denominator and interval partition", () => {
    renderWithProviders(<RunningPaceZonesPanel analysis={runningPaceAnalysisFixture()} />);
    expect(screen.getByText(/기준 역치 5:00/)).toBeInTheDocument();
    expect(screen.getByText(/GAP을 확인한 관측 시간 2:00 기준/)).toBeInTheDocument();
    expect(screen.getByText(/Z1 · 6:40/)).toBeInTheDocument();
    expect(screen.getByText(/Z6 · 4:21/)).toBeInTheDocument();
    expect(screen.getAllByText("1:00 · 50.0%")).toHaveLength(2);
    expect(screen.getByText("제공된 관측 간격 · 3:20")).toBeInTheDocument();
    expect(screen.getByText("정지 관측 · 0:40")).toBeInTheDocument();
    expect(screen.getByText("이동 중 고도 없음 · 0:20")).toBeInTheDocument();
    expect(screen.getByText("기록 간격 제외 · 0:10")).toBeInTheDocument();
    expect(screen.getByText("유효하지 않은 거리 구간 · 0:10")).toBeInTheDocument();
    expect(screen.getByText(/활동 당시 역치와 다를 수/)).toBeInTheDocument();
    expect(screen.queryByText(/300 sec|300초/)).not.toBeInTheDocument();
  });
  it.each(["threshold_missing", "profile_read_failed", "gap_input_unavailable"] as const)("does not display six zero bars when %s", reason => {
    const analysis = runningPaceAnalysisFixture();
    analysis.state = "unavailable"; analysis.reason = reason; analysis.zoneSeconds.fill(0); analysis.eligibleGapSeconds = 0; analysis.intervalCoverage = null;
    if (reason !== "gap_input_unavailable") { analysis.thresholdPaceSecPerKm = null; analysis.thresholdSource = null; }
    const view = renderWithProviders(<RunningPaceZonesPanel analysis={analysis} />);
    expect(screen.queryByText(/Z1 ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0.0%/)).not.toBeInTheDocument();
    expect(screen.getByText("제공된 관측 간격의 범위를 확인할 수 없습니다.")).toBeInTheDocument();
    expect(view.container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
    expect(screen.queryByText("제공된 관측 간격 · 0:00")).not.toBeInTheDocument();
  });
  it("keeps fractional elapsed intervals readable and a positive tiny share distinct from zero", () => {
    const analysis = runningPaceAnalysisFixture(); analysis.zoneSeconds = [0.004, 5400.496, 0, 0, 0, 0]; analysis.eligibleGapSeconds = 5400.5;
    analysis.intervalCoverage = { ...analysis.intervalCoverage!, observedIntervalSeconds: 5480.5, eligibleGapSeconds: 5400.5 };
    renderWithProviders(<RunningPaceZonesPanel analysis={analysis} />);
    expect(screen.getByText("0:00.004 · <0.1%")).toBeInTheDocument();
    expect(screen.getByText(/GAP을 확인한 관측 시간 1:30:00.5 기준/)).toBeInTheDocument();
  });
  it("retains private source provenance without generating records from current settings", () => {
    const data = runningPacePeriodFixture(), pace = data.periods[0]!.zones.pace;
    if (!("groups" in pace)) throw new Error("fixture");
    renderWithProviders(<RunningPaceZonesPanel analysis={pace.groups[0]!} />, { route: "/ko/activity/a" });
    expect(screen.getByRole("link", { hidden: true })).toHaveAttribute("href", `/ko/activity/${pace.groups[0]!.sources[0]!.sourceActivityId}`);
    expect(screen.getByText(/기준 프로필 저장 버전 2026-10-03T14:00/)).toBeInTheDocument();
    expect(screen.getByText(/^분석 계산 2026.*한국 시간/)).toBeInTheDocument();
  });
  it("keeps evidence controls touch-sized and long profile revisions inside the available width", () => {
    const data = runningPacePeriodFixture(), pace = data.periods[0]!.zones.pace;
    if (!("groups" in pace)) throw new Error("fixture");
    const revision = "r".repeat(240);
    pace.groups[0]!.sources[0]!.thresholdProfileRevision = revision;
    const view = renderWithProviders(<RunningPaceZonesPanel analysis={pace.groups[0]!} />);
    const summary = view.container.querySelector("summary")!;
    expect(summary).toHaveClass("inline-flex", "items-center");
    expect(summary).toHaveStyle({ minHeight: "calc(var(--dim-button-height) + var(--space-1))" });
    const source = screen.getByRole("link", { hidden: true });
    expect(source).toHaveClass("inline-flex", "items-center");
    expect(source).toHaveStyle({ minHeight: "calc(var(--dim-button-height) + var(--space-1))" });
    expect(screen.getByText(`기준 프로필 저장 버전 ${revision}`)).toHaveStyle({ overflowWrap: "anywhere" });
  });
  it("does not expose the new private pace panel to an anonymous owner or signed-out viewer", () => {
    const metrics = { runMetrics: { gapAvgSec: null, paceZoneAnalysis: runningPaceAnalysisFixture() }, mmp: {} } as ActivityMetricsDoc;
    const view = renderWithProviders(<RunAnalysisPanel metrics={metrics} isOwner />, { authenticated: false });
    expect(screen.queryByRole("region", { name: "GAP 페이스존" })).not.toBeInTheDocument();
    view.unmount();
    const authenticated = renderWithProviders(<RunAnalysisPanel metrics={metrics} isOwner />, { authenticated: true });
    expect(screen.getByRole("region", { name: "GAP 페이스존" })).toBeInTheDocument();
    Object.assign(getCurrentUser()!, { isAnonymous: true });
    authenticated.rerender(<RunAnalysisPanel metrics={{ ...metrics }} isOwner />);
    expect(screen.queryByRole("region", { name: "GAP 페이스존" })).not.toBeInTheDocument();
  });
  it("only exposes genuine private single-activity pace snapshots to the owner", () => {
    const metrics = { runMetrics: { gapAvgSec: null, paceZoneAnalysis: runningPaceAnalysisFixture() }, mmp: {} } as ActivityMetricsDoc;
    const view = renderWithProviders(<RunAnalysisPanel metrics={metrics} isOwner={false} />, { authenticated: true });
    expect(screen.queryByRole("region", { name: "GAP 페이스존" })).not.toBeInTheDocument();
    view.rerender(<RunAnalysisPanel metrics={metrics} isOwner />);
    expect(within(screen.getByRole("region", { name: "GAP 페이스존" })).getByText(/기준 역치 5:00/)).toBeInTheDocument();
    view.rerender(<RunAnalysisPanel metrics={{ ...metrics, runMetrics: { gapAvgSec: null } }} isOwner />);
    expect(screen.queryByRole("region", { name: "GAP 페이스존" })).not.toBeInTheDocument();
  });
});
