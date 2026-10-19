vi.mock("./StagePowerDurationHistoryPanel", () => ({ default: (props: unknown) => { mocks.powerHistory(props); return <div data-testid="manual-period-power-history" />; } }));
vi.mock("./StageActivityPowerDurationPanel", () => ({ default: (props: unknown) => { mocks.powerDuration(props); return <div data-testid="manual-whole-activity-power" />; } }));
vi.mock("./RunEffortStageManagementPanel", () => ({ default: (props: unknown) => { mocks.effortTool(props); return <div data-testid="effort-choice-tool" />; } }));
vi.mock("./ActivityRouteIndexHistoryPanel", () => ({ default: (props: unknown) => { mocks.routeIndex(props); return <div data-testid="route-index-history-panel" />; } }));
vi.mock("./CyclingDistanceHistoryPanel", () => ({ default: (props: unknown) => { mocks.cyclingHistory(props); return <div data-testid="cycling-history-panel" />; } }));
vi.mock("./ObservedRouteHistoryPanel", () => ({ default: (props: unknown) => { mocks.routeHistory(props); return <div data-testid="observed-route-history-panel" />; } }));
vi.mock("./ActivityBikeDistanceEvidencePanel", () => ({ default: () => <div data-testid="manual-bike-distance-panel" /> }));
vi.mock("./ActivityRunDistanceEvidencePanel", () => ({ default: (props: unknown) => { mocks.manual(props); return <div data-testid="manual-distance-panel" />; } }));
import { useEffect } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import type { Activity } from "@shared/types";
import koTerms from "../../../i18n/resources/ko/termGlossary.json";
import enTerms from "../../../i18n/resources/en/termGlossary.json";
import ko from "../../../i18n/resources/ko/activity.json";
import en from "../../../i18n/resources/en/activity.json";
import { resetRuntimeConfigForTests } from "../../../services/runtimeConfig";
import { ActivityGrowthPanel } from "./ActivityGrowthPanel";
import { activityPeriods } from "./activityGrowth";
import { periodFixture, runningPeriodFixture } from "../../../services/trainingAnalysisPeriods.fixture";
const mocks = vi.hoisted(() => ({ user: { uid: "owner" } as { uid: string } | null, language: "ko", units: "metric", history: vi.fn(), metrics: vi.fn(), periodAvailable: false, periods: vi.fn(), annual: vi.fn(), route: vi.fn(), routeHistory: vi.fn(), cyclingHistory: vi.fn(), routeIndex: vi.fn(), effortTool: vi.fn(), powerDuration: vi.fn(), powerHistory: vi.fn(), manual: vi.fn() }));
vi.mock("./ObservedRouteComparisonPanel", () => ({ ObservedRouteComparisonPanel: (props: unknown) => { mocks.route(props); return null; } }));
vi.mock("./AnnualRunHistoryPanel", () => ({ default: (props: { ownerUid: string; activityId: string; year: number }) => { mocks.annual(props); return <div data-testid="annual-history-year">{props.year}</div>; } }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: mocks.units }) }));
vi.mock("../../../hooks/useActivityGrowthHistory", () => ({ useActivityGrowthHistory: mocks.history }));
vi.mock("../../../services/trainingAnalysisPeriods", () => ({ trainingAnalysisPeriodsAvailable: () => mocks.periodAvailable }));
vi.mock("../../../hooks/useTrainingAnalysisPeriods", () => ({ useTrainingAnalysisPeriods: mocks.periods }));
vi.mock("../../../hooks/useActivityMetrics", () => ({ useActivityMetrics: mocks.metrics }));
vi.mock("react-i18next", () => ({ useTranslation: (namespace = "activity") => ({ i18n: { language: mocks.language }, t: (key: string, params?: Record<string, unknown>) => {
  let text: unknown = namespace === "termGlossary" ? (mocks.language === "ko" ? koTerms : enTerms) : mocks.language === "ko" ? ko : en;
  for (const part of key.split(".")) text = (text as Record<string, unknown>)?.[part];
  return typeof text === "string" ? text.replace(/{{(\w+)}}/g, (_, name: string) => String(params?.[name] ?? "")) : key;
} }) }));
vi.mock("../../../components/LocalizedLink", () => ({ LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
const activity = { id: "current", userId: "owner", startTime: 100, type: "Run", summary: {} } as Activity;
const previous = { ...activity, id: "previous", startTime: 50, description: "earlier" };
beforeEach(() => {
  mocks.effortTool.mockReset(); mocks.powerDuration.mockReset(); mocks.powerHistory.mockReset();
  mocks.routeIndex.mockReset();
  mocks.cyclingHistory.mockReset();
  mocks.routeHistory.mockReset();
  mocks.annual.mockReset(); mocks.route.mockReset();
  mocks.periodAvailable = false; mocks.periods.mockReset().mockReturnValue({ state: "idle", response: null, retry: vi.fn() });
  resetRuntimeConfigForTests({ appEnvironment: "production" });
  mocks.user = { uid: "owner" }; mocks.language = "ko"; mocks.units = "metric";
  mocks.history.mockReset().mockReturnValue({ activities: [previous, { ...previous, id: "bike", type: "Ride" }], sourceActivities: [], coverage: "ready", loading: false, error: false, hasMore: false });
  mocks.metrics.mockReset().mockReturnValue({ status: "missing", metrics: null });
});
function chooseComparison(value: "previous" | "") {
  const control = screen.getByRole("combobox", { name: mocks.language === "ko" ? ko.growth.choose : en.growth.choose });
  if (control.getAttribute("aria-expanded") !== "true") fireEvent.click(control);
  fireEvent.keyDown(control, { key: "Home" });
  if (value === "previous") fireEvent.keyDown(control, { key: "ArrowDown" });
  fireEvent.keyDown(control, { key: "Enter" });
}
function openComparisonOptions() {
  const control = screen.getByRole("combobox", { name: mocks.language === "ko" ? ko.growth.choose : en.growth.choose });
  if (control.getAttribute("aria-expanded") !== "true") fireEvent.click(control);
}
describe("ActivityGrowthPanel", () => {

  it("web comparison keeps only normal activity comparison in production, without period/stage sections", () => {
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner comparisonOnly />);
    expect(screen.getByTestId("D1-5")).toBeInTheDocument();
    expect(mocks.history).toHaveBeenCalledWith("comparison", 0);
    expect(screen.queryByRole("button", { name: "활동 통계" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("manual-distance-panel")).not.toBeInTheDocument();
    expect(mocks.routeIndex).not.toHaveBeenCalled();
    expect(mocks.routeHistory).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /기간 분석은 코치/ })).toHaveAttribute("href", "/coach/analysis?sport=run");
  });
  it("Stage comparison retains its distance/route/arbitrary-power tools without period statistics", () => {
    resetRuntimeConfigForTests({ appEnvironment: "stage" });
    render(<ActivityGrowthPanel activity={{ ...activity, type: "Ride" }} metrics={null} isOwner comparisonOnly />);
    expect(screen.getByTestId("manual-bike-distance-panel")).toBeInTheDocument();
    expect(screen.getByTestId("route-index-history-panel")).toBeInTheDocument();
    expect(mocks.routeHistory).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("manual-whole-activity-power")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "활동 통계" })).not.toBeInTheDocument();
  });
  it("shares existing lazy loaded owner choices and bounded metric identity with GPS history without a second query", () => {
    const wrongOwner = { ...previous, id: "other", userId: "other" }, future = { ...previous, id: "future", startTime: 200 };
    mocks.history.mockReturnValue({ activities: [previous, wrongOwner, future], sourceActivities: [], coverage: "ready", loading: false, error: false, hasMore: false });
    const source = { version: ACTIVITY_METRICS_VERSION, computedAt: 7, inputCoverage: "complete" as const, inputPending: false, sourceLayer: "raw_parts" as const };
    const view = render(<ActivityGrowthPanel activity={activity} metrics={source} currentMetricsStatus="ready" isOwner />);
    expect(mocks.routeHistory).not.toHaveBeenCalled(); expect(mocks.history).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    expect(mocks.routeHistory).toHaveBeenLastCalledWith({ anchor: activity, activities: [previous], observedMetricsIdentity: JSON.stringify(["ready", 7, ACTIVITY_METRICS_VERSION, false, "complete", "raw_parts"]) });
    expect(mocks.history).toHaveBeenCalledTimes(1); expect(mocks.metrics).toHaveBeenLastCalledWith(null);
    view.rerender(<ActivityGrowthPanel activity={activity} metrics={{ ...source, computedAt: 8 }} currentMetricsStatus="ready" isOwner />);
    expect(mocks.routeHistory.mock.lastCall?.[0].observedMetricsIdentity).toBe(JSON.stringify(["ready", 8, ACTIVITY_METRICS_VERSION, false, "complete", "raw_parts"]));
    expect(mocks.metrics).toHaveBeenLastCalledWith(null);
    mocks.user = { uid: "other" }; view.rerender(<ActivityGrowthPanel activity={activity} metrics={source} isOwner />);
    expect(screen.queryByTestId("observed-route-history-panel")).not.toBeInTheDocument();
  });

  it("adds bike climb opt-in to the single existing request, never to run", () => {
    mocks.periodAvailable = true;
    const view = render(<ActivityGrowthPanel activity={{ ...activity, type: "Ride" }} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    expect(mocks.periods.mock.lastCall?.[1].request.includeCyclingClimbObservations).toBe(true);
    expect(mocks.periods.mock.lastCall?.[1].request.includeExpandedRunDistances).toBeUndefined();
    view.rerender(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    expect(mocks.periods.mock.lastCall?.[1].request.includeCyclingClimbObservations).toBeUndefined();
    expect(mocks.periods.mock.lastCall?.[1].request.includeExpandedRunDistances).toBe(true);
  });

  it("passes exactly the manually selected pair to route comparison without changing metric targets", () => {
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    expect(mocks.route).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    expect(mocks.route).not.toHaveBeenCalled();
    chooseComparison("previous");
    expect(mocks.route).toHaveBeenLastCalledWith({ current: activity, previous });
    expect(mocks.metrics).toHaveBeenLastCalledWith("previous");
    chooseComparison("");
    expect(mocks.metrics).toHaveBeenLastCalledWith(null);
  });
  it("uses the selected ready run splits without extra reads and hides them while stale", () => {
    const split = { km: 1, paceSec: 300, gapSec: 290, elevGain: 0, avgHr: null };
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { version: ACTIVITY_METRICS_VERSION, inputCoverage: "complete", distanceKm: 1.5, splits: [{ ...split, paceSec: 330 }] } });
    const r = render(<ActivityGrowthPanel activity={activity} metrics={{ version: ACTIVITY_METRICS_VERSION, inputCoverage: "complete", distanceKm: 1.5, splits: [split] }} currentMetricsStatus="ready" isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    chooseComparison("previous");
    expect(screen.getByRole("region", { name: ko.splitCompare.title })).toHaveTextContent("5:30/km");
    expect(screen.getByRole("link", { name: /선택한 지난 활동/ })).toHaveAttribute("href", "/ko/activity/previous");
    expect(mocks.metrics).toHaveBeenLastCalledWith("previous");
    mocks.metrics.mockReturnValue({ status: "stale", metrics: { version: ACTIVITY_METRICS_VERSION, inputCoverage: "complete", distanceKm: 1.5, splits: [split] } });
    r.rerender(<ActivityGrowthPanel activity={activity} metrics={{ version: ACTIVITY_METRICS_VERSION, inputCoverage: "complete", distanceKm: 1.5, splits: [split] }} currentMetricsStatus="ready" isOwner />);
    expect(screen.queryByRole("region", { name: ko.splitCompare.title })).not.toBeInTheDocument();
  });
  it.each(["stale", "missing"] as const)("hides new split comparison for current %s while preserving legacy summary", (currentMetricsStatus) => {
    const split = { km: 1, paceSec: 300, gapSec: 290, elevGain: 0, avgHr: 140 };
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { version: ACTIVITY_METRICS_VERSION, inputCoverage: "complete", distanceKm: 1.5, splits: [split] } });
    render(<ActivityGrowthPanel activity={activity} metrics={{ version: ACTIVITY_METRICS_VERSION, inputCoverage: "complete", distanceKm: 1.5, splits: [split] }} currentMetricsStatus={currentMetricsStatus} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    chooseComparison("previous");
    expect(screen.queryByRole("region", { name: ko.splitCompare.title })).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("1.5");
  });
  it("reuses the canonical statistics response for running records and changing curve duration", () => {
    mocks.periodAvailable = true;
    mocks.periods.mockReturnValue({ state: "ready", response: runningPeriodFixture(), retry: vi.fn() });
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    expect(screen.getByRole("region", { name: "러닝 기간별 최고 기록 비교" })).toHaveTextContent("20:00");
    const reads = mocks.periods.mock.calls.length, history = mocks.history.mock.calls.length;
    fireEvent.change(screen.getByRole("combobox", { name: "공통 시간 선택" }), { target: { value: "7200" } });
    expect(mocks.periods).toHaveBeenCalledTimes(reads);
    expect(mocks.history).toHaveBeenCalledTimes(history);
  });
  it("keeps both history and selected metrics requests lazy and reuses opened sections", () => {
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    expect(mocks.history).not.toHaveBeenCalled(); expect(mocks.metrics).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    expect(mocks.history).toHaveBeenCalledWith("comparison", 0);
    expect(mocks.metrics).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole("option", { name: /Ride/ })).toBeNull();
    chooseComparison("previous");
    expect(mocks.metrics).toHaveBeenLastCalledWith("previous");
    expect(screen.getByText("이 기록의 확정 분석 수치가 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "비교 해제" }));
    expect(mocks.metrics).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    expect(screen.getByRole("combobox")).toHaveTextContent(ko.growth.none);
  });
  it("keeps route recommendations opt-in, manual selection and one selected metrics subscription", () => {
    const thumbnailTrack = "37,127;37.003,127;37.006,127;37.009,127";
    const current = { ...activity, thumbnailTrack, summary: { distance: 1000 } } as Activity;
    mocks.history.mockReturnValue({ activities: [{ ...previous, thumbnailTrack, summary: { distance: 1000 } }, { ...previous, id: "unrelated", description: "unrelated" }], loading: false });
    render(<ActivityGrowthPanel activity={current} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    openComparisonOptions();
    expect(screen.getByRole("option", { name: /unrelated/ })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "유사 코스 후보 (1)" }));
    expect(screen.queryByRole("option", { name: /unrelated/ })).toBeNull();
    expect(mocks.metrics).toHaveBeenLastCalledWith(null);
    chooseComparison("previous");
    expect(mocks.metrics).toHaveBeenLastCalledWith("previous");
    fireEvent.click(screen.getByRole("button", { name: "모든 지난 활동" }));
    openComparisonOptions();
    expect(screen.getByRole("option", { name: /unrelated/ })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.getByRole("combobox")).toHaveTextContent("earlier");
  });
  it("reuses loaded similar-route records and the existing selected metrics target", () => {
    const thumbnailTrack = "37,127;37.003,127;37.006,127;37.009,127";
    const current = { ...activity, thumbnailTrack, summary: { distance: 1000, movingTimeSec: 300, pauseTimeSec: 30 } } as Activity;
    mocks.history.mockReturnValue({ activities: [{ ...previous, thumbnailTrack, summary: { distance: 1000, movingTimeSec: 320, pauseTimeSec: 20 } }], loading: false, hasMore: true });
    render(<ActivityGrowthPanel activity={current} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.click(screen.getByRole("button", { name: "유사 코스 후보 (1)" }));
    expect(screen.getByRole("region", { name: ko.similarRouteHistory.title })).toBeInTheDocument();
    expect(mocks.metrics).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "이 활동과 비교" }));
    expect(screen.getByRole("combobox")).toHaveTextContent("earlier");
    expect(mocks.metrics).toHaveBeenLastCalledWith("previous");
    const metricsCalls = mocks.metrics.mock.calls.length, historyCalls = mocks.history.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "거리 · km" }));
    expect(mocks.metrics).toHaveBeenCalledTimes(metricsCalls);
    expect(mocks.history).toHaveBeenCalledTimes(historyCalls);
  });
  it("never exposes owner history in a public or foreign-owner activity", () => {
    const r = render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner={false} />);
    expect(r.container).toBeEmptyDOMElement(); expect(mocks.history).not.toHaveBeenCalled();
    r.rerender(<ActivityGrowthPanel activity={{ ...activity, userId: "foreign" }} metrics={null} isOwner />);
    expect(r.container).toBeEmptyDOMElement(); expect(mocks.history).not.toHaveBeenCalled();
  });
  it("resets selection when the activity changes", () => {
    const r = render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    chooseComparison("previous");
    r.rerender(<ActivityGrowthPanel activity={{ ...activity, id: "other" }} metrics={null} isOwner />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
  it("renders translated partial coverage and withholds statistics totals", () => {
    mocks.language = "en";
    mocks.history.mockReturnValue({ sourceActivities: [previous], activities: [], coverage: "partial" });
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "Activity statistics" }));
    expect(screen.getByText("Only 1 loaded activities are confirmed. Full totals and changes are withheld.")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBe(8); expect(screen.queryByRole("img")).toBeNull();
  });
  it("shows known moving-time subtotal and coverage while withholding incomplete totals and deltas", () => {
    const periods = activityPeriods(Date.now(), "week");
    mocks.history.mockReturnValue({ activities: [], coverage: "ready", sourceActivities: [
      { ...activity, id: "known", startTime: periods.start, summary: { distance: 10000, movingTimeSec: 3600, elevationGain: 100 } },
      { ...activity, id: "missing", startTime: periods.start + 1, summary: { distance: 10000, ridingTimeMillis: 7200000, elevationGain: 100 } },
    ] });
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    expect(screen.getByText("확인된 합계 1.0 · 2개 중 1개")).toBeInTheDocument();
    expect(screen.getByText(/일부 활동의 수치가 없어/)).toBeInTheDocument();
    expect(screen.getByText("이동시간 · h", { selector: ".ds-stat__label" }).closest(".ds-stat")?.querySelector(".ds-stat__value")?.textContent).toBe("—");
  });
  it("uses owner period analysis without a parallel history query and keeps unknown time explicit", () => {
    mocks.periodAvailable = true;
    const bounds = activityPeriods(Date.now(), "week");
    const response = periodFixture();
    response.discipline = "run";
    const currentPeriod = response.periods[0]!;
    Object.assign(currentPeriod, { fromInclusive: bounds.start, toExclusive: Date.now() });
    currentPeriod.activities = [
      { ...currentPeriod.activities[0]!, activityId: "known", startTime: bounds.start, movingTimeSec: 3600 },
      { ...currentPeriod.activities[0]!, activityId: "unknown", startTime: bounds.start + 1, movingTimeSec: null, sourceBasis: { distanceM: "canonical_metrics", movingTimeSec: "unavailable", elevationGainM: "canonical_metrics" } },
    ];
    const previousPeriod = structuredClone(currentPeriod);
    Object.assign(previousPeriod, { fromInclusive: bounds.previousStart, toExclusive: bounds.previousEnd, activities: [] });
    response.periods.push(previousPeriod);
    mocks.periods.mockReturnValue({ state: "ready", response, retry: vi.fn() });
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    expect(mocks.history).toHaveBeenLastCalledWith("statistics", expect.any(Number), false, expect.any(Object));
    expect(mocks.periods).toHaveBeenNthCalledWith(1, "owner", expect.objectContaining({ request: expect.objectContaining({ discipline: "run", periods: expect.any(Array) }) }), true);
    expect(mocks.periods).toHaveBeenLastCalledWith("owner", null, true);
    expect(mocks.effortTool).toHaveBeenLastCalledWith({ ownerUid: "owner", currentActivity: activity, appliedResponse: response });
    expect(mocks.periods.mock.calls.filter(call => call[1] !== null)).toHaveLength(1);
    expect(screen.getByText("확인된 합계 1.0 · 2개 중 1개")).toBeInTheDocument();
    expect(screen.getByText("이동시간 · h", { selector: ".ds-stat__label" }).closest(".ds-stat")?.querySelector(".ds-stat__value")?.textContent).toBe("—");
    expect(screen.getByText(/확정 분석 수치를 우선/)).toBeInTheDocument();
  });
  it("withholds full totals on a bounded period scan and retries through its owner hook", () => {
    mocks.periodAvailable = true;
    const response = periodFixture();
    response.periods[0]!.coverage.truncated = true;
    const retry = vi.fn();
    mocks.periods.mockReturnValue({ state: "error", response, retry });
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    expect(screen.getByText("이동시간 · h", { selector: ".ds-stat__label" }).closest(".ds-stat")?.querySelector(".ds-stat__value")?.textContent).toBe("—");
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it.each(["current", "previous"])("hides curve and zone comparisons for pending %s input", (side) => {
    const ready = { avgPower: 200, mmp: { "1m": 300 }, hrZoneSec: [10, 20], powerZoneSec: [20, 30] };
    const pending = { ...ready, inputCoverage: "pending" as const };
    mocks.metrics.mockReturnValue({ status: "ready", metrics: side === "previous" ? pending : ready });
    render(<ActivityGrowthPanel activity={activity} metrics={side === "current" ? pending : ready} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    chooseComparison("previous");
    expect(screen.queryByText("심박 존 분포")).toBeNull(); expect(screen.queryByText("지속시간별 최대 파워")).toBeNull();
  });
  it("selects canonical common-duration values by graph or accessible control and resets baseline selection", () => {
    const metrics = { speedCurve: { "1m": 12, "5m": 10 }, hrZoneSec: [10, 20, 30, 0, 0] };
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { ...metrics, speedCurve: { "1m": 10, "5m": 8 } } });
    const r = render(<ActivityGrowthPanel activity={activity} metrics={metrics} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    chooseComparison("previous");
    const durationControl = screen.getByRole("combobox", { name: "비교할 지속시간" });
    expect(durationControl).toHaveValue("300");
    expect(screen.getByRole("img", { name: "지속시간별 최고 페이스" })).toBeInTheDocument();
    fireEvent.click(r.container.querySelector('[data-duration="60"]')!);
    expect(durationControl).toHaveValue("60");
    expect(screen.getByText("-60 s/km")).toBeInTheDocument();
    fireEvent.change(durationControl, { target: { value: "300" } });
    expect(screen.getByText("-90 s/km")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "비교 해제" }));
    chooseComparison("previous");
    expect(screen.getByRole("combobox", { name: "비교할 지속시간" })).toHaveValue("300");
    expect(screen.getByText("파워 분석 없음", { exact: false })).toBeInTheDocument();
  });

  it("withholds a power overlay for differing sources while retaining independently labeled zones", () => {
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { isVirtualPower: true, mmp: { "5m": 200 }, powerZoneSec: [10, 20, 0, 0, 0, 0, 0] } });
    render(<ActivityGrowthPanel activity={activity} metrics={{ isVirtualPower: false, mmp: { "5m": 250 }, powerZoneSec: [10, 20, 0, 0, 0, 0, 0] }} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    chooseComparison("previous");
    expect(screen.queryByRole("img", { name: "지속시간별 최대 파워" })).toBeNull();
    expect(screen.getByText("파워 존 분포")).toBeInTheDocument();
    expect(screen.getByText(/파워 출처가 같고 확인된/)).toBeInTheDocument();
  });
  it("does not render partial or invalid zone distributions as zeros", () => {
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { hrZoneSec: [10, 20, 0, 0, 0] } });
    render(<ActivityGrowthPanel activity={activity} metrics={{ hrZoneSec: [10, Number.NaN, 0, 0, 0], powerZoneSec: [10, 20], hrZoneBoundaries: null }} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    chooseComparison("previous");
    expect(screen.getByText("심박 존 분포")).toBeInTheDocument();
    expect(screen.queryByText("파워 존 분포")).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
  it.each([
    [0, 0, 0, 0, 0], [-1, 10, 0, 0, 0], Object.assign(Array(5), { 0: 10 }),
  ])("withholds zero-total, negative or sparse canonical zones (%s)", (...hrZoneSec) => {
    mocks.metrics.mockReturnValue({ status: "ready", metrics: {} });
    render(<ActivityGrowthPanel activity={activity} metrics={{ hrZoneSec }} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    chooseComparison("previous");
    expect(screen.queryByText("심박 존 분포")).toBeNull();
  });

  it("offers a retry when statistics fail", () => {
    const retry = vi.fn();
    mocks.history.mockReturnValue({ sourceActivities: [], coverage: "error", error: true, retry });
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["metric", -0.04, "0.0 km"], ["imperial", 0.16, "+0.1 mi"],
  ])("signs comparison changes at displayed precision after %s conversion (delta=%s)", (units, delta, displayed) => {
    mocks.units = String(units);
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { distanceKm: 10 } });
    render(<ActivityGrowthPanel activity={activity} metrics={{ distanceKm: 10 + Number(delta) }} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    chooseComparison("previous");
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === `변화 ${displayed}`)).toBeInTheDocument();
  });


});

describe("observed year application", () => {
  it("passes only the explicitly applied run year to the separate manual-history panel", () => {
    mocks.periodAvailable = true;
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    expect(mocks.annual).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "연도", exact: true }));
    const select = screen.getByRole("combobox", { name: "관측 연도" });
    const year = Number((select as HTMLSelectElement).value);
    fireEvent.change(select, { target: { value: String(year - 1) } });
    expect(mocks.annual).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "연도 적용" }));
    expect(mocks.annual).toHaveBeenLastCalledWith({ ownerUid: "owner", activityId: "current", year: year - 1 });
    fireEvent.change(select, { target: { value: String(year) } });
    expect(screen.getByTestId("annual-history-year")).toHaveTextContent(String(year - 1));
  });
  it.each(["flag-off", "unsupported-sport"])("does not offer annual controls for %s", scenario => {
    mocks.periodAvailable = scenario !== "flag-off";
    render(<ActivityGrowthPanel activity={scenario === "unsupported-sport" ? { ...activity, type: "Yoga" } : activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    expect(screen.queryByRole("button", { name: "연도", exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "관측 연도" })).not.toBeInTheDocument();
    expect(screen.queryByText(/종목 필터 전 최대 200개 관측 범위/)).not.toBeInTheDocument();
  });
  it("disables the empty YTD at exact KST New Year without a future endpoint", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00+09:00"));
    try {
      mocks.periodAvailable = true;
      render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
      fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
      fireEvent.click(screen.getByRole("button", { name: "연도", exact: true }));
      expect(screen.getByRole("button", { name: "연도 적용" })).toBeDisabled();
      expect(screen.getByText(/새해 정각에는 올해 관측 기간이 아직 비어/)).toBeInTheDocument();
      expect(mocks.periods.mock.lastCall?.[1]).toBeNull();
      fireEvent.change(screen.getByRole("combobox", { name: "관측 연도" }), { target: { value: "2024" } });
      expect(screen.getByRole("button", { name: "연도 적용" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "연도 적용" }));
      expect(mocks.periods.mock.lastCall?.[1].request.periods[0].toExclusive).toBe(Date.now());
    } finally { vi.useRealTimers(); }
  });
  it("does not route an applied annual range to legacy history when support turns off", () => {
    mocks.periodAvailable = true;
    const view = render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    fireEvent.click(screen.getByRole("button", { name: "연도", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "연도 적용" }));
    mocks.periodAvailable = false;
    view.rerender(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    expect(screen.queryByRole("button", { name: "연도", exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이번 달" })).toHaveAttribute("aria-pressed", "true");
    expect(mocks.periods).toHaveBeenLastCalledWith("owner", null, false);
    expect(mocks.history.mock.lastCall?.[2]).toBe(false);
    expect(mocks.history.mock.lastCall?.[3].fromInclusive).toBeGreaterThan(Date.parse(`${new Date().getFullYear() - 1}-01-01T00:00:00+09:00`));
    fireEvent.click(screen.getByRole("button", { name: "이번 달" }));
    expect(mocks.history.mock.lastCall?.[2]).toBe(true);
  });
  it("does not request on draft changes and applies two periods in one existing request", () => {
    mocks.periodAvailable = true;
    const request = vi.fn();
    mocks.periods.mockImplementation(function useMockPeriods(_uid, selection, enabled) {
      useEffect(() => { if (enabled && selection) request(selection.request); }, [selection, enabled]);
      return { state: "idle", response: null, retry: vi.fn() };
    });
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.lastCall?.[0].includeExpandedRunDistances).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "연도", exact: true }));
    const select = screen.getByRole("combobox", { name: "관측 연도" });
    const year = Number((select as HTMLSelectElement).value);
    fireEvent.change(select, { target: { value: String(year - 1) } });
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/KST 선택 연도 전체/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "연도 적용" }));
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.lastCall?.[0].periods).toEqual([
      { fromInclusive: Date.parse(`${year - 1}-01-01T00:00:00+09:00`), toExclusive: Date.parse(`${year}-01-01T00:00:00+09:00`) },
      { fromInclusive: Date.parse(`${year - 2}-01-01T00:00:00+09:00`), toExclusive: Date.parse(`${year - 1}-01-01T00:00:00+09:00`) },
    ]);
    expect(screen.getByText(/KST 선택 연도 전체/)).toBeInTheDocument();
    fireEvent.change(select, { target: { value: String(year) } });
    expect(request).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "연도 적용" }));
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.lastCall?.[0].periods).toHaveLength(2);
    expect(screen.getByText(/KST 올해 누적/)).toBeInTheDocument();
    expect(mocks.history.mock.calls.filter(call => call[0] === "statistics").every(call => call[2] === false)).toBe(true);
  });
});

it("mounts manual distance inspection for owner run only independently of metric records", () => {
  const view = render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
  expect(screen.getByTestId("manual-distance-panel")).toBeInTheDocument();
  view.rerender(<ActivityGrowthPanel activity={{ ...activity, type: "Ride" }} metrics={null} isOwner />);
  expect(screen.queryByTestId("manual-distance-panel")).not.toBeInTheDocument();
  view.rerender(<ActivityGrowthPanel activity={activity} metrics={null} isOwner={false} />);
  expect(screen.queryByTestId("manual-distance-panel")).not.toBeInTheDocument();
});

it("mounts manual BIKE13 inspection only for the owner bike without enabling history or period requests", () => {
  const view = render(<ActivityGrowthPanel activity={{ ...activity, type: "Ride" }} metrics={null} isOwner />);
  expect(screen.getByTestId("manual-bike-distance-panel")).toBeInTheDocument();
  expect(screen.queryByTestId("manual-distance-panel")).not.toBeInTheDocument();
  expect(mocks.history.mock.calls.every(call => call[2] === false)).toBe(true);
  expect(mocks.periods.mock.calls.every(call => call[1] === null)).toBe(true);
  view.rerender(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
  expect(screen.queryByTestId("manual-bike-distance-panel")).not.toBeInTheDocument();
  expect(screen.getByTestId("manual-distance-panel")).toBeInTheDocument();
  view.rerender(<ActivityGrowthPanel activity={{ ...activity, type: "Ride" }} metrics={null} isOwner={false} />);
  expect(screen.queryByTestId("manual-bike-distance-panel")).not.toBeInTheDocument();
});

it("adds cycling history only to owner BIKE statistics with the existing applied range",()=>{
 mocks.periodAvailable=true;const bike={...activity,type:"Ride"};const view=render(<ActivityGrowthPanel activity={bike} metrics={null} isOwner/>);expect(mocks.cyclingHistory).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"활동 통계"}));expect(mocks.cyclingHistory.mock.lastCall?.[0].activity).toEqual(bike);const selected=mocks.cyclingHistory.mock.lastCall?.[0].selection;expect(selected).toMatchObject({mode:"cycling_distance_history_page",discipline:"bike",rangeBasis:"explicit_range"});expect(selected.range.fromInclusive).toBeLessThan(selected.range.toExclusive);
 view.rerender(<ActivityGrowthPanel activity={activity} metrics={null} isOwner/>);fireEvent.click(screen.getByRole("button",{name:"활동 통계"}));expect(screen.queryByTestId("cycling-history-panel")).not.toBeInTheDocument();
 view.rerender(<ActivityGrowthPanel activity={bike} metrics={null} isOwner={false}/>);expect(screen.queryByTestId("cycling-history-panel")).not.toBeInTheDocument();
});

it("keeps the cycling annual history binding on the applied year while a new year is only drafted",()=>{
 mocks.periodAvailable=true;render(<ActivityGrowthPanel activity={{...activity,type:"Ride"}} metrics={null} isOwner/>);fireEvent.click(screen.getByRole("button",{name:"활동 통계"}));fireEvent.click(screen.getByRole("button",{name:ko.observedYears.mode}));expect(screen.queryByTestId("cycling-history-panel")).not.toBeInTheDocument();
 const select=screen.getByRole("combobox",{name:ko.observedYears.select}),year=Number((select as HTMLSelectElement).value);fireEvent.change(select,{target:{value:String(year-1)}});fireEvent.click(screen.getByRole("button",{name:ko.observedYears.apply}));
 expect(mocks.cyclingHistory.mock.lastCall?.[0].selection).toEqual({mode:"cycling_distance_history_page",discipline:"bike",calendarBasis:"Asia/Seoul",rangeBasis:"calendar_year",year:year-1});fireEvent.change(select,{target:{value:String(year)}});expect(mocks.cyclingHistory.mock.lastCall?.[0].selection.year).toBe(year-1);
});

it("offers thin route candidate history only for the owner run/bike without opening previous activity queries", () => {
  const view = render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
  expect(screen.getByTestId("route-index-history-panel")).toBeInTheDocument();
  expect(mocks.history).not.toHaveBeenCalled(); expect(mocks.periods).not.toHaveBeenCalled();
  expect(mocks.routeIndex).toHaveBeenLastCalledWith({ activity, observedMetricsIdentity: JSON.stringify([undefined, undefined, undefined, undefined, undefined, undefined]) });
  view.rerender(<ActivityGrowthPanel activity={{ ...activity, type: "Ride" }} metrics={null} isOwner />);
  expect(screen.getByTestId("route-index-history-panel")).toBeInTheDocument();
  view.rerender(<ActivityGrowthPanel activity={{ ...activity, type: "Swim" }} metrics={null} isOwner />);
  expect(screen.queryByTestId("route-index-history-panel")).not.toBeInTheDocument();
  view.rerender(<ActivityGrowthPanel activity={activity} metrics={null} isOwner={false} />);
  expect(screen.queryByTestId("route-index-history-panel")).not.toBeInTheDocument();
});

describe("owner comparison readable moving time", () => {
  it.each([
    [5936, 5263, "1:38:56", "1:27:43", "+11:13"],
    [0, 0, "0:00", "0:00", "0:00"],
    [null, 60, "—", "1:00", null],
  ] as const)("presents %s versus %s without changing raw seconds or delta", (currentSeconds, previousSeconds, currentClock, previousClock, deltaClock) => {
    const currentMetrics = { movingTimeSec: currentSeconds }, previousMetrics = { movingTimeSec: previousSeconds };
    mocks.metrics.mockReturnValue({ status: "ready", metrics: previousMetrics });
    render(<ActivityGrowthPanel activity={activity} metrics={currentMetrics} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    chooseComparison("previous");
    const row = screen.getByRole("rowheader", { name: "이동시간" }).closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    expect(cells[0]!.querySelector(".ds-text")?.textContent).toBe(currentClock);
    expect(cells[1]).toHaveTextContent(previousClock);
    expect(row).not.toHaveTextContent("이동시간 · s");
    if (currentSeconds !== null && Number.isFinite(currentSeconds)) expect(within(cells[0]!).getAllByTitle(`${currentSeconds} s`).map(node => node.textContent)).toContain(currentClock);
    if (previousSeconds !== null && Number.isFinite(previousSeconds)) expect(within(cells[1]!).getByTitle(`${previousSeconds} s`)).toHaveTextContent(previousClock);
    if (deltaClock !== null) {
      expect(cells[0]).toHaveTextContent(`변화 ${deltaClock}`);
      expect(within(cells[0]!).getAllByTitle(`${currentSeconds! - previousSeconds!} s`).map(node => node.textContent)).toContain(deltaClock);
    } else expect(cells[0]).not.toHaveTextContent("변화");
    expect(currentMetrics.movingTimeSec).toBe(currentSeconds); expect(previousMetrics.movingTimeSec).toBe(previousSeconds);
    expect(mocks.metrics).toHaveBeenLastCalledWith("previous");
  });
  it.each(["ko"])("distinguishes same-day options and headers by KST start time in %s without changing IDs", language => {
    mocks.language = language;
    const current = { ...activity, startTime: Date.UTC(2026, 9, 6, 17, 30) }, first = { ...previous, startTime: Date.UTC(2026, 9, 6, 17, 10), description: "Ride" }, second = { ...previous, id: "second", startTime: Date.UTC(2026, 9, 6, 17, 20), description: "Ride" };
    mocks.history.mockReturnValue({ activities: [first, second], sourceActivities: [], coverage: "ready", loading: false, error: false, hasMore: false });
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { movingTimeSec: 60 } });
    render(<ActivityGrowthPanel activity={current} metrics={{ movingTimeSec: 120 }} isOwner />);
    expect(mocks.history).not.toHaveBeenCalled(); expect(mocks.metrics).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: language === "ko" ? ko.growth.compare : en.growth.compare }));
    openComparisonOptions();
    expect(screen.getByRole("option", { name: /02:10:00.*Ride/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /02:20:00.*Ride/ })).toBeInTheDocument();
    chooseComparison("previous");
    const header = screen.getByRole("columnheader", { name: /02:10:00/ });
    expect(header).toHaveTextContent(language === "ko" ? "26. 10. 7." : "10/7/26");
    expect(header).toHaveAttribute("title", expect.stringContaining("02:10:00"));
    expect(header).toHaveClass("activity-comparison-date");
    expect(mocks.metrics).toHaveBeenLastCalledWith("previous"); expect(mocks.route).toHaveBeenLastCalledWith({ current, previous: first }); expect(mocks.periods).not.toHaveBeenCalled();
  });
});

it("mounts the current bike power tool only in opened statistics without changing period request flags", () => {
  const bike = { ...activity, type: "Ride" };
  const view = render(<ActivityGrowthPanel activity={bike} metrics={null} isOwner />);
  expect(mocks.powerDuration).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
  expect(mocks.powerDuration).toHaveBeenLastCalledWith(expect.objectContaining({ activity: bike, scopeKey: expect.any(String) }));
  view.rerender(<ActivityGrowthPanel activity={{ ...bike, type: "Run" }} metrics={null} isOwner />);
  expect(screen.queryByTestId("manual-whole-activity-power")).not.toBeInTheDocument();
});

it("passes only applied bike period bounds to the independent manual power history tool", () => {
  const bike = { ...activity, type: "Ride" };
  render(<ActivityGrowthPanel activity={bike} metrics={null} isOwner />);
  expect(mocks.powerHistory).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
  expect(mocks.powerHistory).toHaveBeenLastCalledWith(expect.objectContaining({ ownerUid: "owner", periods: expect.any(Array) }));
  const periods = mocks.powerHistory.mock.lastCall?.[0].periods; expect(periods).toHaveLength(2);
});
