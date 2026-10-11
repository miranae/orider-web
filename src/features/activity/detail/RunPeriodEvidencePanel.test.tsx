import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { runningPeriodFixture } from "../../../services/trainingAnalysisPeriods.fixture";
import { LocaleProvider } from "../../../contexts/LocaleContext";
import RunPeriodEvidencePanel from "./RunPeriodEvidencePanel";

const sourceReads = vi.hoisted(() => ({ firestore: vi.fn(), callable: vi.fn() }));
vi.mock("firebase/firestore", async original => ({ ...await original<typeof import("firebase/firestore")>(), getDoc: sourceReads.firestore, getDocs: sourceReads.firestore }));
vi.mock("../../../services/trainingAnalysisPeriods", () => ({ loadTrainingAnalysisPeriods: sourceReads.callable }));
function evidenceFixture() {
  const response = runningPeriodFixture();
  response.periods.forEach((period, index) => {
    const running = period.running!;
    const curve = running.paceCurves[0]!;
    curve.observedStatistics = [{ durationSeconds: 300, observedBestPaceSecPerKm: 750 + index * 30, observedMedianPaceSecPerKm: 780 + index * 30, contributingActivityCount: 2 }];
    running.evidence = { version: 1, scope: "observed_representatives", timingBasis: "elapsed_including_stops", activities: [0, 1].map(position => ({ activityId: `evidence-${index}-${position}`, startTime: period.fromInclusive + position * 86400000, metricsRevision: `test-revision-${index}-${position}`, distanceRecords: [], paceCurve: { sourceBasis: "run_metrics_pace_curve", unit: "sec_per_km", points: [{ durationSeconds: 300, paceSecPerKm: 750 + index * 30 + position * 60, speedKph: null }] } })) };
  });
  return response;
}
describe("observed running period evidence", () => {
  it("uses supplied best/median/N and date links without recalculating or reading data", () => {
    renderWithProviders(<RunPeriodEvidencePanel response={evidenceFixture()} />);
    expect(screen.getByText("관측 활동의 최고 페이스: 12:30/km")).toBeInTheDocument();
    expect(screen.getByText("관측 활동의 중앙값: 13:00/km")).toBeInTheDocument();
    expect(screen.getAllByText("이 시간의 관측 활동 수: 2")).toHaveLength(2);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveAttribute("href", "/ko/activity/evidence-0-0");
    expect(screen.queryByText(/test-revision/)).not.toBeInTheDocument();
    expect(links[0]!.parentElement).toHaveAttribute("data-metrics-revision", "test-revision-0-0");
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(sourceReads.firestore).not.toHaveBeenCalled(); expect(sourceReads.callable).not.toHaveBeenCalled();
  });
  it("keeps legacy values separate and switches only through provided recording basis", () => {
    const response = evidenceFixture();
    const running = response.periods[0]!.running!;
    running.paceCurves.push({ ...running.paceCurves[0]!, sourceBasis: "speed_curve_kmh_converted", observedStatistics: [{ durationSeconds: 180, observedBestPaceSecPerKm: 300, observedMedianPaceSecPerKm: 360, contributingActivityCount: 1 }] });
    running.evidence!.activities.push({ ...running.evidence!.activities[0]!, activityId: "legacy-evidence", paceCurve: { sourceBasis: "speed_curve_kmh_converted", unit: "sec_per_km", points: [{ durationSeconds: 180, paceSecPerKm: 300, speedKph: 12 }] } });
    renderWithProviders(<RunPeriodEvidencePanel response={response} />);
    expect(screen.queryByText("관측 활동의 최고 페이스: 5:00/km")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "분포 기록 기준" }), { target: { value: "speed_curve_kmh_converted" } });
    expect(screen.getByRole("combobox", { name: "관측 시간 선택" })).toHaveValue("180");
    expect(screen.getByText("관측 활동의 최고 페이스: 5:00/km")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText(/이전 최고 평균 속도 커브를 페이스로 환산/)).toBeInTheDocument();
  });
  it("preserves observed partial values and distinguishes missing evidence and truncated inputs", () => {
    const response = evidenceFixture();
    response.periods[0]!.status = "partial";
    response.periods[0]!.running!.paceCurves[0]!.coverage.truncated = true;
    response.periods[1]!.running!.paceCurves[0]!.observedStatistics = [];
    delete response.periods[1]!.running!.evidence;
    renderWithProviders(<RunPeriodEvidencePanel response={response} />);
    expect(screen.getByText(/전체 기간을 대표하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/조회 한도로 일부/)).toBeInTheDocument();
    expect(screen.getByText("관측 활동의 최고 페이스: 12:30/km")).toBeInTheDocument();
    expect(screen.getByText("관측 활동의 최고 페이스: —")).toBeInTheDocument();
    expect(screen.getByText("활동별 근거가 아직 제공되지 않았습니다.")).toBeInTheDocument();
  });
  it("converts canonical 750sec/km to20:07/mi with same duration and counts", () => {
    renderWithProviders(<LocaleProvider userId={null} profile={{ units: "imperial" }}><RunPeriodEvidencePanel response={evidenceFixture()} /></LocaleProvider>);
    expect(screen.getByText("관측 활동의 최고 페이스: 20:07/mi")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "관측 시간 선택" })).toHaveValue("300");
  });
  it("hides additive absence and gives a short no-curve state for distance-only evidence", () => {
    const response = runningPeriodFixture();
    const { rerender } = renderWithProviders(<RunPeriodEvidencePanel response={response} />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    response.periods[0]!.running!.evidence = { version: 1, scope: "observed_representatives", timingBasis: "elapsed_including_stops", activities: [] };
    rerender(<RunPeriodEvidencePanel response={response} />);
    expect(screen.getByText(/활동별 페이스 근거가 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("does not replace canonical emptiness or invalid activity durations with legacy evidence", () => {
    const response = evidenceFixture();
    response.periods.forEach(period => {
      period.running!.paceCurves[0]!.observedStatistics = [];
      period.running!.evidence!.activities.forEach(activity => { activity.paceCurve!.points = [{ durationSeconds: 47, paceSecPerKm: 750, speedKph: null }]; });
    });
    renderWithProviders(<RunPeriodEvidencePanel response={response} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getAllByText("이 시간의 관측 활동 수: —")).toHaveLength(2);
  });
  it("bounds evidence lists at200 per period and reports that restriction", () => {
    const response = evidenceFixture();
    const evidence = response.periods[0]!.running!.evidence!;
    evidence.activities = Array.from({ length: 201 }, (_, i) => ({ ...evidence.activities[0]!, activityId: `bounded-${i}` }));
    renderWithProviders(<RunPeriodEvidencePanel response={response} />);
    expect(screen.getAllByRole("link")).toHaveLength(202);
    expect(screen.getByText(/조회 한도로 일부/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "bounded-200" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region")).getAllByRole("combobox")).toHaveLength(2);
  });
});

describe("observed distance record mode", () => {
  function distances() {
    const response = evidenceFixture();
    response.periods.forEach((period, index) => {
      const best = period.running!.bestDistances;
      best.observedStatistics = [{ distance: "5km", bestTimeSeconds: 1200 + index * 60, medianTimeSeconds: 1250 + index * 60, contributingActivityCount: 2 }];
      period.running!.evidence!.activities.forEach((activity, position) => { activity.distanceRecords = [{ distance: "5km", elapsedSec: 1200 + index * 60 + position * 100 }]; });
    });
    return response;
  }
  const selectDistanceMode = () => fireEvent.change(screen.getByRole("combobox", { name: "확인할 기록" }), { target: { value: "distance" } });
  it("shows supplied time best/median/N, official categories and chronologically ordered links without reads", () => {
    renderWithProviders(<RunPeriodEvidencePanel response={distances()} />);
    expect(screen.getByText("관측 활동의 최고 페이스: 12:30/km")).toBeInTheDocument();
    selectDistanceMode();
    expect(screen.getByText("관측 활동의 최고 기록: 20:00")).toBeInTheDocument();
    expect(screen.getByText("관측 기록의 중앙값: 20:50")).toBeInTheDocument();
    expect(screen.getAllByText("이 거리의 관측 활동 수: 2")).toHaveLength(2);
    expect(screen.getByRole("combobox", { name: "관측 거리 선택" })).toHaveValue("5km");
    expect(within(screen.getByRole("combobox", { name: "관측 거리 선택" })).getAllByRole("option").map(option => option.getAttribute("value"))).toEqual(["1km", "5km", "10km", "half", "full"]);
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/ko/activity/evidence-1-0");
    expect(screen.getByText(/정지 시간을 포함한 경과시간/)).toBeInTheDocument();
    expect(screen.queryByText(/test-revision/)).not.toBeInTheDocument();
    expect(sourceReads.firestore).not.toHaveBeenCalled(); expect(sourceReads.callable).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: "확인할 기록" }), { target: { value: "pace" } });
    expect(screen.getByText("관측 활동의 최고 페이스: 12:30/km")).toBeInTheDocument();
  });
  it("keeps missing categories missing and observed partial/truncated scope explicit", () => {
    const response = distances(); response.periods[0]!.running!.bestDistances.status = "partial"; response.periods[0]!.running!.bestDistances.coverage.truncated = true;
    renderWithProviders(<RunPeriodEvidencePanel response={response} />); selectDistanceMode();
    expect(screen.getByText(/전체 기간을 대표하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/조회 한도로 일부/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "관측 거리 선택" }), { target: { value: "full" } });
    expect(screen.getAllByText("관측 활동의 최고 기록: —")).toHaveLength(2);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/이 거리에 표시할 수 있는/)).toBeInTheDocument();
  });
  it("does not expose a distance mode to old responses and preserves imperial pace conversion", () => {
    renderWithProviders(<LocaleProvider userId={null} profile={{ units: "imperial" }}><RunPeriodEvidencePanel response={evidenceFixture()} /></LocaleProvider>);
    expect(screen.queryByRole("combobox", { name: "확인할 기록" })).not.toBeInTheDocument();
    expect(screen.getByText("관측 활동의 최고 페이스: 20:07/mi")).toBeInTheDocument();
  });
  it("supports distance-only new responses without fabricating a pace basis or replacing empty statistics", () => {
    const response = distances(); response.periods.forEach(period => { period.running!.paceCurves = []; period.running!.evidence!.activities.forEach(activity => { activity.paceCurve = null; }); });
    const { rerender } = renderWithProviders(<RunPeriodEvidencePanel response={response} />);
    expect(screen.getByRole("combobox", { name: "확인할 기록" })).toHaveValue("distance");
    expect(screen.queryByRole("combobox", { name: "분포 기록 기준" })).not.toBeInTheDocument();
    response.periods.forEach(period => { period.running!.bestDistances.observedStatistics = []; });
    rerender(<RunPeriodEvidencePanel response={response} />);
    expect(screen.getAllByText("관측 활동의 최고 기록: —")).toHaveLength(2);
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });
});
