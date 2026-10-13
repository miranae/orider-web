import { validateRangeResponse } from "../../../services/activityRangeAnalysis";
import { deriveHrZoneBoundaries } from "@shared/training/hrZoneTable";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRangeAnalysisResponse } from "@shared/types/activity-range-analysis";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import type { ActivityRangeSelectionModel } from "../../../hooks/useActivityRangeSelection";
import type { useActivityRangeAnalysis } from "../../../hooks/useActivityRangeAnalysis";
import Panel, { ActivityRangeControls, ActivityRangeAnalysisReading } from "./ActivityRangeAnalysisPanel";

const mocks = vi.hoisted(() => ({ hook: vi.fn(), units: "metric" as "metric" | "imperial" }));
vi.mock("../../../hooks/useActivityRangeAnalysis", () => ({ useActivityRangeAnalysis: mocks.hook }));
vi.mock("../../../contexts/LocaleContext", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../contexts/LocaleContext")>();
  return { ...actual, useLocale: () => ({ ...actual.useLocale(), units: mocks.units }) };
});
const revision = "a".repeat(64);
const selection = { identity: "input-1", ownerUid: "owner", enabled: true, selection: { startOffsetSec: 1200, endOffsetSec: 1500, requestId: "1" },
  axis: [0, 1800], sampledAxis: [0, 1800], durationSec: 1800, xAxis: "distance", rawSource: { time: [0, 1] }, sourceLoading: false, sourceLocked: false, lockSource: vi.fn(), reloadSource: vi.fn(async () => {}), select: vi.fn(), clear: vi.fn(), toggle: vi.fn(), setXAxis: vi.fn() } as unknown as ActivityRangeSelectionModel;
const metrics: NonNullable<ActivityRangeAnalysisResponse["metrics"]> = {
  elapsedSec: 300, movingSec: 300, pauseSec: 0, distanceM: 2194.684, avgSpeedKph: 26.336, speedBasis: "moving_time", paceSecPerKm: 136.694,
  averagePowerW: null, normalizedPowerW: null, averageHr: 130.04, maxHr: 150, averageCadence: 73.263, hrZoneSec: null, powerZoneSec: null,
  averageBasis: "measured_elapsed", powerSource: null, isVirtualPower: false, context: { mode: "recorded", ftp: 182, maxHr: 191 },
  channels: { power: { measuredSec: 0, fraction: 0, reason: "missing" }, heartrate: { measuredSec: 300, fraction: 1, reason: null }, cadence: { measuredSec: 300, fraction: 1, reason: null }, speed: { measuredSec: 300, fraction: 1, reason: null } },
  diagnostics: { clippedBoundary: false, gaps: false, distanceReason: null, zonesReason: "range_moving_context_unavailable" },
};
const unavailable = { state: "unavailable", metrics: null, response: null, reason: "api_unavailable", retry: vi.fn() } as ReturnType<typeof useActivityRangeAnalysis>;
beforeEach(() => { mocks.units = "metric"; mocks.hook.mockReset().mockReturnValue(unavailable); selection.select = vi.fn(); });
describe("canonical elapsed range reading", () => {
  it("shows zone durations and percentages of observed zone time rather than selected elapsed time", () => {
    const result = { ...metrics, hrZoneSec: [20, 20, 0, 0, 0], powerZoneSec: null };
    const analysis = { ...unavailable, state: "available", metrics: result } as ReturnType<typeof useActivityRangeAnalysis>;
    renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="run" analysis={analysis} />);
    const region = screen.getByRole("region", { name: "심박 존 시간", hidden: true });
    expect(within(region).getAllByText(/50.0%/)).toHaveLength(2);
    expect(region).toHaveTextContent("0:20");
    expect(region).not.toHaveTextContent("6.7%");
  });
  it("labels the exact recorded LTHR boundaries even when a different maximum HR exists", () => {
    const bounds = deriveHrZoneBoundaries({ lthr: 170, maxHr: 191, sport: "run" });
    const result = { ...metrics, hrZoneSec: [20, 20, 0, 0, 0], context: { ...metrics.context, lthr: 170, hrZoneBoundaries: bounds } };
    renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="run" analysis={{ ...unavailable, state: "available", metrics: result }} />);
    const region = screen.getByRole("region", { name: "심박 존 시간", hidden: true });
    expect(region).toHaveTextContent("LTHR");
    expect(region).toHaveTextContent("170 bpm");
    expect(region).toHaveTextContent(`${bounds!.zones[0]!.minBpm}–<${bounds!.zones[0]!.maxBpmExclusive} bpm`);
  });
  it("distinguishes a confirmed zero observed subtotal from missing zones", () => {
    renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="run" analysis={{ ...unavailable, state: "available", metrics: { ...metrics, hrZoneSec: [0, 0, 0, 0, 0] } }} />);
    expect(screen.getByRole("region", { name: "심박 존 시간" })).toHaveTextContent("0초");
    expect(screen.queryByRole("region", { name: "파워 존 시간" })).not.toBeInTheDocument();
  });
  it("withholds zone displays for missing historical context or invalid arrays", () => {
    const result = { ...metrics, context: { mode: "unavailable", ftp: null, maxHr: null }, hrZoneSec: [20, 20, 0, 0, 0], powerZoneSec: null } as typeof metrics;
    const analysis = { ...unavailable, state: "available", metrics: result } as ReturnType<typeof useActivityRangeAnalysis>;
    const { rerender } = renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="run" analysis={analysis} />);
    expect(screen.queryByRole("region", { name: "심박 존 시간", hidden: true })).not.toBeInTheDocument();
    rerender(<ActivityRangeAnalysisReading selection={selection} sport="run" analysis={{ ...analysis, metrics: { ...metrics, hrZoneSec: [20, Number.NaN, 0, 0, 0] } }} />);
    expect(screen.queryByRole("region", { name: "심박 존 시간", hidden: true })).not.toBeInTheDocument();
  });

  it("keeps undeployed availability truthful and never passes an enable flag by default", () => {
    renderWithProviders(<Panel activityId="a" selection={selection} sport="bike" />);
    expect(mocks.hook).toHaveBeenLastCalledWith(expect.objectContaining({ callableEnabled: false, expectedInputRevision: undefined }));
    expect(screen.getByRole("status")).toHaveTextContent("구간 분석을 준비 중입니다. 선택 위치는 확인할 수 있습니다.");
    expect(screen.queryByText(/저장된 원본 입력을 기준으로 서버에서 분석한/)).toBeNull();
    expect(screen.queryByText("26.3")).toBeNull();
  });
  it.each(["loading", "pending", "unavailable", "changed_input"] as const)("does not describe %s as a completed server analysis", state => {
    renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="bike" previewActive analysis={{ ...unavailable, state, reason: null }} />);
    expect(screen.queryByText(/저장된 원본 입력|차트의 파워 미리보기와 별개로/)).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });
  it("shows canonical results and sensor nulls without invented power or zone duration", () => {
    renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="bike" analysis={{ ...unavailable, state: "available", reason: null, metrics }} />);
    expect(screen.getByText("26.3")).toBeTruthy(); expect(screen.getByText("2.19")).toBeTruthy();
    expect(screen.getByText("저장된 원본 입력을 기준으로 서버에서 분석한 구간입니다.")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText(/Z1/)).toBeNull();
    expect(screen.getByText(/^파워 · 관측 0.0초 · 0.0%$/)).toBeTruthy();
  });
  it("connects actualride category to optional input in the existing request and preservesRun absence", () => {
    const { rerender } = renderWithProviders(<Panel activityId="a" selection={selection} sport="ride" callableEnabled />);
    expect(mocks.hook.mock.lastCall?.[0].includePowerWindowInput).toBe(true);
    mocks.hook.mockReturnValue({ ...unavailable, state: "available", metrics, response: { state: "available", inputRevision: revision, powerWindowInput: { state: "unavailable", reason: "unknown_provenance", inputRevision: revision, algorithmVersion: "sample-time-weighted-v1", timingBasis: "elapsed", scope: "selected_range", rangeStartElapsedSec: 1200, rangeEndElapsedSec: 1500 } } });
    rerender(<Panel activityId="a" selection={selection} sport="ride" callableEnabled />);
    expect(screen.getByRole("region", { name: "선택 범위의 지속시간별 파워" })).toBeInTheDocument();
    rerender(<Panel activityId="a" selection={selection} sport="run" callableEnabled />);
    expect(mocks.hook.mock.lastCall?.[0].includePowerWindowInput).toBe(false);
    expect(screen.queryByRole("region", { name: "선택 범위의 지속시간별 파워" })).not.toBeInTheDocument();
  });
  it("pins a returned opaque revision only for the next user selection, and clears it when input changes", () => {
    const { rerender } = renderWithProviders(<Panel activityId="a" selection={selection} sport="bike" callableEnabled />);
    mocks.hook.mockReturnValue({ ...unavailable, state: "available", metrics, response: { inputRevision: revision, state: "available" } });
    rerender(<Panel activityId="a" selection={selection} sport="bike" callableEnabled />);
    expect(mocks.hook.mock.lastCall?.[0].expectedInputRevision).toBeUndefined();
    const next = { ...selection, selection: { ...selection.selection!, requestId: "2" } };
    rerender(<Panel activityId="a" selection={next} sport="bike" callableEnabled />);
    expect(mocks.hook.mock.lastCall?.[0].expectedInputRevision).toBe(revision);
    mocks.hook.mockReturnValue(unavailable);
    rerender(<Panel activityId="a" selection={{ ...next, identity: "input-2" }} sport="bike" callableEnabled />);
    expect(mocks.hook.mock.lastCall?.[0].expectedInputRevision).toBeUndefined();
    expect(screen.queryByText("26.3")).toBeNull();
  });
  it("locks changed-input responses across new selections and metrics-only identities until explicitly reloaded raw input arrives", () => {
    const changed = { ...unavailable, state: "changed_input", reason: "input_revision_changed", response: { state: "changed_input", inputRevision: revision } };
    mocks.hook.mockImplementation(options => options.selection ? changed : unavailable);
    const { rerender } = renderWithProviders(<Panel activityId="a" selection={selection} sport="bike" callableEnabled />);
    expect(selection.lockSource).toHaveBeenCalled();
    rerender(<Panel activityId="a" selection={{ ...selection, sourceLocked: true }} sport="bike" callableEnabled />);
    expect(mocks.hook.mock.lastCall?.[0].selection).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/입력이 변경/);
    const next = { ...selection, sourceLocked: true, identity: "metrics-updated-only", selection: { ...selection.selection!, requestId: "2" } };
    rerender(<Panel activityId="a" selection={next} sport="bike" callableEnabled />);
    expect(mocks.hook.mock.lastCall?.[0].selection).toBeNull();
    expect(screen.queryByText("26.3")).toBeNull();
    // 새 객체가 임의로 생긴 것만으로는 잠금을 풀지 않는다.
    const fresh = { ...next, rawSource: { time: [0, 1, 2] } } as ActivityRangeSelectionModel;
    rerender(<Panel activityId="a" selection={fresh} sport="bike" callableEnabled />);
    expect(mocks.hook.mock.lastCall?.[0].selection).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "활동 원본 새로고침" }));
    expect(selection.reloadSource).toHaveBeenCalled();
    mocks.hook.mockImplementation(options => options.selection ? { ...unavailable, state: "available", metrics, response: { inputRevision: revision, state: "available" } } : unavailable);
    rerender(<Panel activityId="a" selection={{ ...fresh, sourceLocked: false, rawSource: { time: [0, 1, 2, 3] } }} sport="bike" callableEnabled />);
    expect(mocks.hook.mock.lastCall?.[0].selection).toMatchObject({ requestId: "2" });
    expect(mocks.hook.mock.lastCall?.[0].expectedInputRevision).toBeUndefined();
    expect(screen.getByText("26.3")).toBeTruthy();
  });
  it("keeps unknown running cadence unchanged and shows the recorded basis independently of an active preview", () => {
    renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="run" previewActive analysis={{ ...unavailable, state: "available", metrics }} />);
    expect(screen.getByText("73")).toBeTruthy(); expect(screen.queryByText("rpm")).toBeNull();
    expect(screen.getByText(/러닝 케이던스 단위/)).toBeTruthy();
    expect(screen.getByText(/차트의 파워 미리보기와 별개로/)).toBeTruthy();
  });
  it("requires ordered elapsed input before applying, and hides controls for a non-owner", () => {
    const { rerender } = renderWithProviders(<ActivityRangeControls selection={selection} />);
    expect(screen.getByText("시작 20:00 / 끝 25:00")).toBeTruthy();
    const inputs = [screen.getByLabelText("시작 시간"), screen.getByLabelText("끝 시간")];
    fireEvent.change(inputs[0]!, { target: { value: "25:00" } });
    fireEvent.change(inputs[1]!, { target: { value: "20:00" } });
    expect(screen.getByRole("button", { name: /적용|apply/i }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(inputs[0]!, { target: { value: "20:00" } });
    fireEvent.change(inputs[1]!, { target: { value: "25:00" } });
    fireEvent.click(screen.getByRole("button", { name: /적용|apply/i }));
    expect(selection.select).toHaveBeenCalledWith({ startOffsetSec: 1200, endOffsetSec: 1500 });
    fireEvent.change(inputs[0]!, { target: { value: "invalid" } });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(inputs[0]!.getAttribute("aria-invalid")).toBe("true");
    expect(selection.select).toHaveBeenCalledTimes(1);
    rerender(<ActivityRangeControls selection={{ ...selection, ownerUid: null }} />);
    expect(screen.queryByLabelText("시작 시간")).toBeNull();
  });
});

function elevationResponse(change = 4, distance = 200): ActivityRangeAnalysisResponse {
  return { activityId: "activity/한글", state: "unavailable", selection: { startOffsetSec: 1200, endOffsetSec: 1500 }, inputRevision: revision,
    computedAt: 1, algorithmVersion: "activity-range-v1", sourceLayer: "raw_parts", inputCoverage: "complete", reason: "unaligned_or_missing_data", metrics: null,
    elevation: { scope: "selected_observed_range", quality: "unknown", timingBasis: "stored_explicit_activity_elapsed", originalClockVerified: false,
      declaredActivitySource: "strava", inputRevision: revision, requestedSelection: { startOffsetSec: 1200, endOffsetSec: 1500 }, state: "available", reason: null,
      sourceBasis: "stored_epoch_parts", observedSelection: { startOffsetSec: 1210, endOffsetSec: 1490 }, boundaryCoverage: "inside_samples",
      netElevationChangeM: change, distanceM: distance, netMeanGradePct: distance > 0 ? change / distance * 100 : null } };
}
describe("selected stored elevation reading", () => {
  it("requests elevation in the same existing range request without adding a control", () => {
    renderWithProviders(<Panel activityId="a" selection={selection} sport="bike" callableEnabled />);
    expect(mocks.hook.mock.lastCall?.[0]).toMatchObject({ includeElevation: true, includePowerWindowInput: true });
    expect(screen.queryByRole("button", { name: /고도/ })).toBeNull();
  });
  it("shows available elevation despite unavailable sensors with observed-inside boundaries and explicit clock/source disclosure", () => {
    renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="bike" analysis={{ ...unavailable, reason: null, response: elevationResponse() }} />);
    const evidence = screen.getByRole("region", { name: "선택 구간의 고도 근거" });
    expect(evidence).toHaveTextContent("+4.00"); expect(evidence).toHaveTextContent("0.20"); expect(evidence).toHaveTextContent("+2.00");
    expect(evidence).toHaveTextContent("20:10–24:50"); expect(evidence).toHaveTextContent("요청 경계 전체의 값은 아닙니다");
    expect(evidence).toHaveTextContent("Strava"); expect(evidence).toHaveTextContent("원본 시계와 고도 품질은 검증되지 않았습니다");
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(within(evidence).getByRole("link")).toHaveAttribute("href", "/ko/activity/activity%2F%ED%95%9C%EA%B8%80");
  });
  it.each([-4, 0])("preserves signed net%s without presenting cumulative ascent", value => {
    renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="bike" analysis={{ ...unavailable, response: elevationResponse(value) }} />);
    const evidence = screen.getByRole("region", { name: "선택 구간의 고도 근거" });
    expect(evidence).toHaveTextContent(value.toFixed(2)); expect(evidence).not.toHaveTextContent("VAM");
    expect(evidence).not.toHaveTextContent("PR");
  });
  it("zero recorded distance stays0 and mean grade stays unknown", () => {
    renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="bike" analysis={{ ...unavailable, response: elevationResponse(0, 0) }} />);
    const evidence = screen.getByRole("region", { name: "선택 구간의 고도 근거" });
    expect(within(evidence).getAllByText("0.00")).toHaveLength(2); expect(evidence).toHaveTextContent("—");
  });
  it("converts net elevation and counter distance dimensionally toft/mi", () => {
    mocks.units = "imperial";
    renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="bike" analysis={{ ...unavailable, response: elevationResponse(30.48, 1609.344) }} />);
    const evidence = screen.getByRole("region", { name: "선택 구간의 고도 근거" });
    expect(evidence).toHaveTextContent("+100.00"); expect(evidence).toHaveTextContent("ft"); expect(evidence).toHaveTextContent("1.00"); expect(evidence).toHaveTextContent("mi");
  });
  it("withholds only a unit-conversion overflow and keeps the other evidence fields", () => {
    mocks.units = "imperial";
    renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="bike" analysis={{ ...unavailable, response: elevationResponse(1e308, 1e308) }} />);
    const evidence = screen.getByRole("region", { name: "선택 구간의 고도 근거" });
    expect(evidence).toHaveTextContent("—"); expect(evidence).not.toHaveTextContent("Infinity"); expect(evidence).toHaveTextContent("+100.00");
  });
  it("absent elevation leaves existing sensor results visible and clears on selection removal", () => {
    const { rerender } = renderWithProviders(<ActivityRangeAnalysisReading selection={selection} sport="bike" analysis={{ ...unavailable, state: "available", metrics, response: { ...elevationResponse(), state: "available", metrics, elevation: undefined } }} />);
    expect(screen.getByText("26.3")).toBeInTheDocument(); expect(screen.getByText("이 선택 구간의 고도 근거를 확인할 수 없습니다.")).toBeInTheDocument();
    rerender(<ActivityRangeAnalysisReading selection={{ ...selection, selection: null }} sport="bike" analysis={{ ...unavailable, response: elevationResponse() }} />);
    expect(screen.queryByRole("region", { name: "선택 구간의 고도 근거" })).toBeNull();
  });
});

// Compiled synthetic wire ad3cbde2c17f7c150f482f42e830027858714192859e933851e94f9bb7491cde.
const compiledElevationWire: ActivityRangeAnalysisResponse = {
  "state": "available",
  "activityId": "ride",
  "selection": {
    "startOffsetSec": 5,
    "endOffsetSec": 35
  },
  "inputRevision": "c07775614db1c7259fb23e142a2790d27cbec7283d319f2e116dcc5d261be418",
  "computedAt": 1791731910501,
  "algorithmVersion": "activity-range-v1",
  "sourceLayer": "raw_parts",
  "inputCoverage": "complete",
  "reason": null,
  "metrics": {
    "elapsedSec": 30,
    "movingSec": null,
    "pauseSec": null,
    "distanceM": null,
    "avgSpeedKph": null,
    "speedBasis": null,
    "paceSecPerKm": null,
    "averagePowerW": 100,
    "normalizedPowerW": 100,
    "averageHr": null,
    "maxHr": null,
    "averageCadence": null,
    "hrZoneSec": null,
    "powerZoneSec": null,
    "averageBasis": "measured_elapsed",
    "channels": {
      "power": {
        "measuredSec": 30,
        "fraction": 1,
        "reason": null
      },
      "heartrate": {
        "measuredSec": 0,
        "fraction": 0,
        "reason": "missing"
      },
      "cadence": {
        "measuredSec": 0,
        "fraction": 0,
        "reason": "missing"
      },
      "speed": {
        "measuredSec": 0,
        "fraction": 0,
        "reason": "missing"
      }
    },
    "diagnostics": {
      "clippedBoundary": false,
      "gaps": false,
      "distanceReason": "unobserved_boundary_or_gap",
      "zonesReason": "heart_rate:recorded_hr_threshold_unavailable;power:recorded_ftp_unavailable"
    },
    "powerSource": "measured",
    "isVirtualPower": false,
    "context": {
      "mode": "unavailable",
      "ftp": null,
      "maxHr": null,
      "lthr": null,
      "hrZoneBoundaries": null
    }
  },
  "elevation": {
    "scope": "selected_observed_range",
    "quality": "unknown",
    "timingBasis": "stored_explicit_activity_elapsed",
    "originalClockVerified": false,
    "declaredActivitySource": "strava",
    "inputRevision": "c07775614db1c7259fb23e142a2790d27cbec7283d319f2e116dcc5d261be418",
    "requestedSelection": {
      "startOffsetSec": 5,
      "endOffsetSec": 35
    },
    "state": "available",
    "reason": null,
    "sourceBasis": "stored_epoch_parts",
    "observedSelection": {
      "startOffsetSec": 10,
      "endOffsetSec": 30
    },
    "boundaryCoverage": "inside_samples",
    "netElevationChangeM": 4,
    "distanceM": 200,
    "netMeanGradePct": 2
  }
};

describe("bounded elevation number presentation", () => {
  it.each([1e308, -1e308, 2.4e-305, -2.4e-305])("preserves finite imperial evidence%s in a short nonzero representation through the production parser", change => {
    mocks.units = "imperial";
    const raw = structuredClone(compiledElevationWire);
    Object.assign(raw.elevation!, { netElevationChangeM: change, distanceM: 1e308, netMeanGradePct: change / 1e308 * 100 });
    const response = validateRangeResponse(raw, { activityId: "ride", startOffsetSec: 5, endOffsetSec: 35, includeElevation: true });
    const bound = { ...selection, selection: { startOffsetSec: 5, endOffsetSec: 35, requestId: "scientific" } };
    renderWithProviders(<ActivityRangeAnalysisReading selection={bound} sport="bike" analysis={{ ...unavailable, state: "available", metrics: response.metrics, response }} />);
    const region = screen.getByRole("region", { name: "선택 구간의 고도 근거" });
    const scientific = within(region).getAllByText(/E[-+]?\d+/);
    expect(scientific.length).toBeGreaterThan(0);
    for (const value of scientific) expect(value.textContent!.length).toBeLessThanOrEqual(12);
    expect(region).not.toHaveTextContent("Infinity"); expect(region).not.toHaveTextContent("NaN");
    if (Math.abs(change) < 1) expect(region).toHaveTextContent(change > 0 ? "+7.87E-305" : "-7.87E-305");
    expect(region).toHaveTextContent("mi"); expect(region).toHaveTextContent("ft");
  });
});

it.each(["metric", "imperial"] as const)("preserves MIN distance as a conversion gap and genuine0 as zero in%s", units => {
  mocks.units = units;
  const raw = structuredClone(compiledElevationWire);
  Object.assign(raw.elevation!, { netElevationChangeM: 0, distanceM: Number.MIN_VALUE, netMeanGradePct: 0 });
  const response = validateRangeResponse(raw, { activityId: "ride", startOffsetSec: 5, endOffsetSec: 35, includeElevation: true });
  expect(response.elevation).toMatchObject({ state: "available", distanceM: Number.MIN_VALUE });
  const bound = { ...selection, selection: { startOffsetSec: 5, endOffsetSec: 35, requestId: "underflow" } };
  const analysis = { ...unavailable, state: "available" as const, metrics: response.metrics, response };
  const { rerender } = renderWithProviders(<ActivityRangeAnalysisReading selection={bound} sport="bike" analysis={analysis} />);
  const distanceCell = () => screen.getByText("관측 거리계 차이").closest(".ds-stat")!;
  expect(distanceCell()).toHaveTextContent("—"); expect(distanceCell()).not.toHaveTextContent("0.00");
  Object.assign(raw.elevation!, { distanceM: 0, netMeanGradePct: null });
  const zero = validateRangeResponse(raw, { activityId: "ride", startOffsetSec: 5, endOffsetSec: 35, includeElevation: true });
  rerender(<ActivityRangeAnalysisReading selection={bound} sport="bike" analysis={{ ...analysis, response: zero }} />);
  expect(distanceCell()).toHaveTextContent("0.00"); expect(distanceCell()).not.toHaveTextContent("—");
});
