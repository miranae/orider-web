import { PowerReadingControls } from "./PowerReadingControls";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import ActivityAnalysisBody from "./ActivityAnalysisBody";
import type { ActivityAnalysisSections } from "../../../components/AnalysisTab";

const fixture = vi.hoisted(() => ({ raw: {} as ActivityAnalysisSections, calls: vi.fn(), curve: vi.fn() }));
vi.mock("../../../components/AnalysisTab", () => ({ default: (props: { renderSections: (sections: ActivityAnalysisSections) => ReactNode }) => { fixture.calls(); return props.renderSections(fixture.raw); } }));
vi.mock("./ActivityOverviewCharts", async original => ({ ...await original<typeof import("./ActivityOverviewCharts")>(), OverviewPowerCurve: (props: unknown) => { fixture.curve(props); return <><PowerReadingControls /><div data-testid="power-curve" /></>; } }));
vi.mock("react-chartjs-2", () => ({ Line: () => <div data-testid="power-curve" /> }));

const rich: ActivityOverviewPresentation = {
  session: { discipline: "bike", character: "endurance", load: 42, normalizedPowerW: 175, intensityFactor: 0.8 },
  availability: { personal: "available", records: "evaluated", power: "available", heartRate: "available" },
  priorFitnessStatus: { ctl: 20, atl: 25, tsb: -5, formBand: "productive", asOf: "2026-10-17" },
  postFitnessStatus: { ctl: 21, atl: 28, tsb: -7, formBand: "productive", asOf: "2026-10-18" },
  zones: [{ kind: "power", seconds: [50, 40], currentPercentages: [55.6, 44.4], baselinePercentages: [50, 50], deltaPercentagePoints: [5.6, -5.6], priority: "primary", priorSampleCount: 3 }],
  powerFingerprint: [{ duration: "5m", watts: 240, allTimeBestWatts: 260, allTimeBestPct: 92.3, previousBestPct: 95, medianWatts: 230, deltaPct: 4.3, priorSampleCount: 3 }],
  thresholdWork: { matchesCount: 2, matchesTotalSec: 91, aboveFtpKj: 8 },
  recovery: { hours: 8, load: 42, ctl: 18 },
  energy: { totalKcal: 319, fatPct: 23.6, carbPct: 76.4, fatKcal: 75, carbKcal: 244, fatGrams: 8.3 },
  routeLoad: { climbCount: 1, maxGradePct: 9 },
  sportDetails: [{ label: "평균 파워", value: "170W", priority: "secondary" }, { label: "평균 케이던스", value: "80rpm", priority: "secondary" }, { label: "알 수 없는 근거", value: "서버 값", priority: "secondary" }],
};
const props = (presentation?: ActivityOverviewPresentation) => ({
  overview: { enabled: !!presentation, loading: false, error: false, retry: vi.fn(), response: presentation ? { status: "available", presentation, activityId: "fixture", version: "activity-overview-v1", inputDigest: "fixture" } : null } as Parameters<typeof ActivityAnalysisBody>[0]["overview"],
  analysisProps: {} as NonNullable<Parameters<typeof ActivityAnalysisBody>[0]["analysisProps"]>,
  isOwner: true, preview: false, ftpW: 220, totalCalories: 336, storedLoad: null,
  sharedStats: { averagePower: 170, averageCadence: 80, averageHeartRate: null, maxHeartRate: null },
  timeline: <p>record timeline</p>, provenance: <p>different load source</p>, benchmark: <><PowerReadingControls /><p>90-day reference</p></>, peakInspector: <p>peak locator</p>, sensorFallback: null,
});
const topic = (name: string) => screen.getByRole("heading", { name, level: 2 }).closest("section")!;
beforeEach(() => { fixture.raw = {}; fixture.calls.mockClear(); fixture.curve.mockClear(); });

describe("activity analysis domain composition", () => {
  it("puts each topic in reading order without the former Summary and technical-card documents", () => {
    fixture.raw = { load: <p>stored TSS 43</p>, pedaling: <p>pedaling facts</p>, speedCurve: <p>speed curve</p>, metabolism: <p>FATMAX</p> };
    const { container } = renderWithProviders(<ActivityAnalysisBody {...props(rich)} />);
    expect(Array.from(container.querySelectorAll("[data-analysis-topic]")).map(node => node.getAttribute("data-analysis-topic"))).toEqual(["timeline", "training", "intensity", "records", "efficiency", "energy", "terrain"]);
    expect(screen.queryByRole("heading", { name: "활동 해석" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "상세 지표와 근거" })).not.toBeInTheDocument();
    expect(fixture.calls).toHaveBeenCalledTimes(1);
    expect(within(topic("훈련 부하와 체력")).getByText("stored TSS 43")).toBeInTheDocument();
    expect(screen.queryByText("90-day reference")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "최근 90일" }));
    expect(screen.queryByTestId("power-curve")).not.toBeInTheDocument();
    expect(within(topic("파워 기록과 최고 노력")).getByText("90-day reference")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "역대 기록" }));
    expect(screen.getByTestId("power-curve")).toBeVisible();
    expect(within(topic("파워 기록과 최고 노력")).getByText("peak locator")).toBeInTheDocument();
    expect(within(topic("회복·에너지")).getByText("FATMAX")).toBeInTheDocument();
  });

  it("keeps different calorie definitions, recovery model inputs and fuel facts together", () => {
    renderWithProviders(<ActivityAnalysisBody {...props(rich)} />);
    const energy = within(topic("회복·에너지"));
    expect(energy.getByText("336 kcal")).toBeInTheDocument();
    expect(energy.getByText("319 kcal")).toBeInTheDocument();
    expect(energy.getByText("8.3 g")).toBeInTheDocument();
    expect(energy.getByText("18")).toBeInTheDocument();
    expect(screen.getAllByText("319 kcal")).toHaveLength(1);
  });

  it("renders one power-duration curve and preserves comparison fields at that duration", () => {
    renderWithProviders(<ActivityAnalysisBody {...props(rich)} />);
    expect(screen.getAllByTestId("power-curve")).toHaveLength(1);
    const records = within(topic("파워 기록과 최고 노력"));
    expect(records.getByText("92.3%")).toBeInTheDocument();
    expect(records.getByText("95%")).toBeInTheDocument();
    expect(records.getByText("230 W")).toBeInTheDocument();
  });

  it("removes source-matched sport-detail copies and preserves unknown or differing values", () => {
    renderWithProviders(<ActivityAnalysisBody {...props(rich)} />);
    expect(screen.queryByText("170W")).not.toBeInTheDocument();
    expect(screen.queryByText("80rpm")).not.toBeInTheDocument();
    expect(screen.getByText("서버 값")).toBeInTheDocument();
  });

  it("keeps the same assembler for raw-only analysis without empty primary headings", () => {
    fixture.raw = { power: <p>measured power</p>, heartRate: <p>heart response</p> };
    renderWithProviders(<ActivityAnalysisBody {...props()} benchmark={null} peakInspector={null} provenance={null} totalCalories={null} />);
    expect(within(topic("파워 기록과 최고 노력")).getByText("measured power")).toBeInTheDocument();
    expect(within(topic("심박·페달링 효율")).getByText("heart response")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "훈련 부하와 체력" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "회복·에너지" })).not.toBeInTheDocument();
  });
});


it.each(["disabled", "loading"])("does not adopt cached canonical fields while overview is %s", mode => {
  const input = props(rich);
  input.overview.enabled = mode !== "disabled";
  input.overview.loading = mode === "loading";
  renderWithProviders(<ActivityAnalysisBody {...input} analysisProps={null} benchmark={null} peakInspector={null} provenance={null} totalCalories={null} />);
  expect(screen.queryByText("175")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "훈련 부하와 체력" })).not.toBeInTheDocument();
});

it("suppresses legacy recovery hours when sport-specific guidance supersedes the model", () => {
  renderWithProviders(<ActivityAnalysisBody {...props({ ...rich, recoveryGuidance: "sport_specific" })} />);
  expect(within(topic("회복·에너지")).queryByText("8시간")).not.toBeInTheDocument();
  expect(within(topic("회복·에너지")).getByText(/수면·피로감·통증/)).toBeInTheDocument();
});

it("keeps an unmatched known producer fact beside its own domain", () => {
  renderWithProviders(<ActivityAnalysisBody {...props({ ...rich, sportDetails: [{ label: "평균 케이던스", value: "81rpm", priority: "secondary" }] })} />);
  expect(within(topic("심박·페달링 효율")).getByText("81rpm")).toBeInTheDocument();
});

it("preserves both fuel model outputs without repeating the fuel chart", () => {
  fixture.raw = { context: { ftp: 220, weightKg: null, caloriesKcal: 336, substrate: { totalKcal: 320, fatPct: 0.25, fatKcal: 80, carbKcal: 240 }, zoneKj: undefined, workKj: null, maxHr: null, hrZones: null, powerZones: null, powerCurve: [] } as unknown as NonNullable<ActivityAnalysisSections["context"]> };
  renderWithProviders(<ActivityAnalysisBody {...props(rich)} />);
  const energy = within(topic("회복·에너지"));
  expect(energy.getByText("319 kcal")).toBeInTheDocument();
  expect(energy.getByText("320 kcal")).toBeInTheDocument();
  expect(energy.getByText("80 kcal")).toBeInTheDocument();
});


it("preserves partial fuel facts when the canonical split is incomplete", () => {
  renderWithProviders(<ActivityAnalysisBody {...props({ ...rich, energy: { totalKcal: 319, fatKcal: 75, carbKcal: 244, fatPct: 23.6 } })} />);
  const energy = within(topic("회복·에너지"));
  expect(energy.getByText("75 kcal")).toBeInTheDocument();
  expect(energy.getByText("244 kcal")).toBeInTheDocument();
  expect(energy.getByText("23.6%")).toBeInTheDocument();
});

it("retains the prior-only fitness timestamp and form without manufacturing a post state", () => {
  renderWithProviders(<ActivityAnalysisBody {...props({ ...rich, postFitnessStatus: undefined })} />);
  expect(topic("훈련 부하와 체력")).toHaveTextContent("2026-10-17");
  expect(topic("훈련 부하와 체력")).not.toHaveTextContent("2026-10-18");
});

it("preserves the complete highlighted peak scene even outside inspector durations", () => {
  renderWithProviders(<ActivityAnalysisBody {...props({ ...rich, peakMoment: { durationSec: 90, avgPowerW: 371, avgSpeedKmh: 51, maxHr: 191, fromKm: 2, toKm: 3 } })} peakInspector={null} />);
  const records = topic("파워 기록과 최고 노력");
  expect(records).toHaveTextContent("1분 30초");
  expect(records).toHaveTextContent("371 W");
  expect(records).toHaveTextContent("51 km/h");
  expect(records).toHaveTextContent("191 bpm");
});

it("keeps a legacy zone visual from its real seconds without inventing numeric percentages", () => {
  renderWithProviders(<ActivityAnalysisBody {...props({ ...rich, zones: [{ kind: "heartRate", seconds: [60, 30], priority: "primary" }] })} />);
  const intensity = topic("강도 분포와 고강도");
  expect(intensity).toHaveTextContent("1분");
  const fill = intensity.querySelector<HTMLElement>(".activity-analysis-zone-track > span")!;
  expect(Number.parseFloat(fill.style.width)).toBeCloseTo(66.67, 1);
  expect(within(intensity).queryByRole("columnheader", { name: "%" })).not.toBeInTheDocument();
  expect(within(intensity).queryByRole("columnheader", { name: "평소" })).not.toBeInTheDocument();
});

it("does not promote a two-sample median into the representative comparison curve", () => {
  renderWithProviders(<ActivityAnalysisBody {...props({ ...rich, comparisonMetadata: { windowDays: 90, character: "endurance", priorSampleCount: 2, historyCompleteness: "complete" }, powerFingerprint: [{ duration: "5m", watts: 240, medianWatts: 230, deltaPct: 4.3, priorSampleCount: 2 }] })} />);
  expect(fixture.curve.mock.lastCall?.[0]).toMatchObject({ comparableMedian: false });
  expect(within(topic("파워 기록과 최고 노력")).getByText("230 W")).toBeInTheDocument();
});

it("does not create data topics for basis-only raw context", () => {
  fixture.raw = { context: { ftp: 220, maxHr: 190, weightKg: null, caloriesKcal: null, substrate: undefined, zoneKj: undefined, workKj: null, hrZones: null, powerZones: null, powerCurve: [] } };
  renderWithProviders(<ActivityAnalysisBody {...props()} ftpW={220} benchmark={null} peakInspector={null} provenance={null} totalCalories={null} />);
  expect(screen.queryByRole("heading", { name: "훈련 부하와 체력" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "강도 분포와 고강도" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "파워 기록과 최고 노력" })).not.toBeInTheDocument();
});

it("keeps public loading diagnostics private and offers recovery for transient owner unavailability", () => {
  const input = props();
  input.overview.enabled = true;
  input.overview.loading = true;
  const { rerender } = renderWithProviders(<ActivityAnalysisBody {...input} isOwner={false} analysisProps={null} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  input.overview.loading = false;
  input.overview.response = { status: "unavailable", activityId: "fixture", reason: "metrics_unavailable" };
  rerender(<ActivityAnalysisBody {...input} isOwner analysisProps={null} />);
  expect(screen.getByRole("button", { name: "평가 근거 다시 불러오기" })).toBeInTheDocument();
  input.overview.response = { status: "unavailable", activityId: "fixture", reason: "rollout_disabled" };
  rerender(<ActivityAnalysisBody {...input} isOwner analysisProps={null} />);
  expect(screen.queryByRole("button", { name: "평가 근거 다시 불러오기" })).not.toBeInTheDocument();
});


it("shows the recorded zone distribution first and reveals exact comparison evidence on demand", () => {
  renderWithProviders(<ActivityAnalysisBody {...props(rich)} />);
  const power = within(screen.getByRole("heading", { name: "파워", level: 3 }).closest("section")!);
  expect(power.getByRole("group", { name: /55.6%/ })).toBeVisible();
  expect(power.getByText("시간·일량과 비교 근거").closest("details")).not.toHaveAttribute("open");
  fireEvent.click(power.getByText("시간·일량과 비교 근거"));
  expect(power.getByText("시간·일량과 비교 근거").closest("details")).toHaveAttribute("open");
  expect(power.getByText("+5.6%p")).toBeVisible();
});

it("keeps fitness scope available behind an initially closed explanation", () => {
  renderWithProviders(<ActivityAnalysisBody {...props({ ...rich, fitnessScope: "integrated" })} />);
  const explanation = screen.getByText(/체력·피로·폼은 기록된/);
  expect(explanation).not.toBeVisible();
  fireEvent.click(screen.getByText("체력 지표의 범위와 계산 기준"));
  expect(explanation).toBeVisible();
});
