import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import type { LoadFocusResult } from "../../features/fitness/multisportPerformance";
import IntegratedLoadCard from "./IntegratedLoadCard";
import SportPerformanceCard from "./SportPerformanceCard";

const focus: LoadFocusResult = {
  windowDays: 28,
  totalLoad: 100,
  buckets: { baseAerobic: 40, highAerobic: 30, highIntensity: 20, unclassified: 10 },
  sourceLoad: { power: 60, heartRate: 30, unclassified: 10 },
  disciplineLoad: { bike: 60, run: 30, swim: 0, other: 10 },
  activityCount: 4,
  coveragePct: 90,
  confidence: "high",
  hasAnaerobicBikeDetail: true,
};

describe("IntegratedLoadCard", () => {
  it("keeps the combined status, normalized contribution and focus summaries visible", () => {
    renderWithProviders(<IntegratedLoadCard combined={{
      ctl: 42,
      atl: 38,
      tsb: 4,
      contributions: [
        { discipline: "bike", ctl: 30 },
        { discipline: "run", ctl: 10 },
        { discipline: "swim", ctl: 2 },
      ],
    }} focus={focus} />);

    expect(screen.getByRole("region", { name: /통합 멀티스포츠 훈련 상태/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "통합 멀티스포츠 상태" })).toBeInTheDocument();
    expect(screen.getByText("42.0")).toBeInTheDocument();
    expect(screen.getByText("+4.0")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /현재 체력 종목 기여도: 사이클 30.0, 71퍼센트/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /최근 28일 부하 포커스: 기초 유산소 40.0, 40퍼센트/ })).toBeInTheDocument();
    expect(screen.getByText("주요 부하 · 기초 유산소")).toBeInTheDocument();
    expect(screen.getByText("분류 커버리지 90% · 신뢰도 높음")).toBeInTheDocument();
    expect(screen.getByText(/파워 부하 60.0 · 심박 부하 30.0 · 미분류 10.0/)).not.toBeVisible();
  });

  it("keeps methodology closed until the accessible details control is opened", async () => {
    const user = userEvent.setup();
    renderWithProviders(<IntegratedLoadCard combined={{
      ctl: 42, atl: 38, tsb: 4, contributions: [],
    }} focus={focus} />);

    const toggle = screen.getByText("계산 방법과 해석 근거").closest("summary");
    expect(toggle).toBeInTheDocument();
    expect(screen.getByText(/파워 부하 60.0 · 심박 부하 30.0 · 미분류 10.0/)).not.toBeVisible();

    await user.click(toggle!);
    expect(screen.getByText(/파워 부하 60.0 · 심박 부하 30.0 · 미분류 10.0/)).toBeVisible();
    expect(screen.getByText(/서버에서 계산한 CTL/)).toBeVisible();
  });

  it("sanitizes missing, negative, and non-finite breakdown values", () => {
    renderWithProviders(<IntegratedLoadCard combined={{
      ctl: 0,
      atl: 0,
      tsb: 0,
      contributions: [
        { discipline: "bike", ctl: Number.NaN },
        { discipline: "run", ctl: -4 },
      ],
    }} focus={{
      ...focus,
      windowDays: Number.NaN,
      totalLoad: Number.NaN,
      buckets: { baseAerobic: Number.NaN, highAerobic: -5, highIntensity: 0, unclassified: 0 },
      sourceLoad: { power: Number.NaN, heartRate: -2, unclassified: 0 },
      coveragePct: Number.NaN,
      confidence: "none",
    }} />);

    expect(screen.getByRole("img", { name: /종목별 체력 기여 데이터 없음/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /최근 28일 부하 포커스: 분류된 부하 없음/ })).toBeInTheDocument();
    expect(screen.getByText("분류 0% · 없음")).toBeInTheDocument();
    expect(screen.getAllByText("CTL 0.0 · 0%")).toHaveLength(3);
    expect(screen.getAllByText("0.0 · 0%")).toHaveLength(4);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|-5\.0|-4\.0/);
  });

  it("does not render non-finite authoritative totals", () => {
    const { container } = renderWithProviders(<IntegratedLoadCard combined={{
      ctl: Number.NaN,
      atl: 38,
      tsb: 4,
      contributions: [],
    }} focus={focus} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("clamps authoritative CTL and ATL to zero while preserving signed TSB", () => {
    renderWithProviders(<IntegratedLoadCard combined={{
      ctl: -12,
      atl: -3,
      tsb: -9,
      contributions: [],
    }} focus={focus} />);

    expect(screen.getAllByText("0.0")).toHaveLength(2);
    expect(screen.getByText("-9.0")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("-12.0");
    expect(document.body.textContent).not.toContain("-3.0");
  });
});

describe("SportPerformanceCard", () => {
  it("renders partial cycling evidence without zero-filling missing axes", () => {
    renderWithProviders(<SportPerformanceCard
      discipline="bike"
      cycling={{
        windowDays: 90,
        activityCount: 3,
        confidence: "low",
        axes: [
          { key: "anaerobic", score: null, confidence: "none", evidence: [] },
          { key: "aerobic", score: 65, confidence: "low", evidence: [{ duration: "5m", watts: 320, wPerKg: 4.4, percentile: 65 }] },
          { key: "endurance", score: null, confidence: "none", evidence: [] },
        ],
      }}
      run={{ thresholdPaceSec: null, records: [] }}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }}
      distributions={{ aerobicAbility: {
        basis: "coggan_score_v1",
        domain: [0, 100],
        approximateSampleSize: 120,
        bins: [{ from: 0, to: 50, densityLevel: 2 }, { from: 50, to: 100, densityLevel: 5 }],
        privacy: { minimumCellSize: 5, exactCountsPublished: false, method: "adjacent_merge_relative_density_v1" },
        computedAt: Date.UTC(2026, 6, 14),
      } }}
      cohortComputedAt={Date.UTC(2026, 6, 14)}
    />);

    expect(screen.getAllByText("실측 근거 부족 · 점수 미산출")).toHaveLength(2);
    expect(screen.getByText(/5m 320W · 4.40W\/kg/)).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "유산소 역량 백분위 위치" })).toHaveAttribute("aria-valuenow", "65");
    expect(screen.getByRole("meter", { name: "유산소 역량 백분위 위치" })).toHaveAttribute("aria-valuetext", "백분위 65");
    expect(screen.getByText("백분위 65")).toBeInTheDocument();
    expect(document.querySelector('[data-percentile-visual="density"]')).toBeInTheDocument();
    expect(screen.getByText("O-Rider 전체 · 약 120명")).toBeInTheDocument();
    expect(screen.queryByText("상위 35%")).not.toBeInTheDocument();
    expect(screen.getByText(/백분위가 높을수록 기준 집단에서/)).toBeInTheDocument();
    expect(screen.getByText(/실제 O-Rider 비교 집단의 상대 밀도입니다/)).toBeInTheDocument();
    expect(screen.getByText("현재 가장 두드러진 능력은 유산소 역량입니다.")).toBeInTheDocument();
    expect(screen.getByText(/Garmin은 EPOC·Training Effect/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PDC와 3축 산출 근거 보기" })).toHaveAttribute("href", "/web-manual/ch06-advanced.html#s6-3");
  });

  it("omits the strongest-axis summary when the highest percentile is tied", () => {
    renderWithProviders(<SportPerformanceCard
      discipline="bike"
      cycling={{
        windowDays: 90,
        activityCount: 4,
        confidence: "medium",
        axes: [
          { key: "anaerobic", score: 70, confidence: "medium", evidence: [] },
          { key: "aerobic", score: 70, confidence: "medium", evidence: [] },
          { key: "endurance", score: 55, confidence: "low", evidence: [] },
        ],
      }}
      run={{ thresholdPaceSec: null, records: [] }}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }}
    />);

    expect(screen.queryByText(/현재 가장 두드러진 능력은/)).not.toBeInTheDocument();
  });

  it("shows only persisted running records and threshold evidence", () => {
    renderWithProviders(<SportPerformanceCard
      discipline="run"
      cycling={null}
      run={{ thresholdPaceSec: 285, records: [{ distance: "5km", seconds: 1250, date: "2026-07-10" }] }}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }}
    />);
    expect(screen.getByText("4:45/km")).toBeInTheDocument();
    expect(screen.getByText("20:50 · 2026-07-10")).toBeInTheDocument();
    expect(screen.queryByText(/curve/i)).not.toBeInTheDocument();
  });

  it("carries rounded seconds into the next minute and hour", () => {
    renderWithProviders(<SportPerformanceCard
      discipline="run"
      cycling={null}
      run={{ thresholdPaceSec: 359.6, records: [{ distance: "5km", seconds: 3599.6, date: "2026-07-10" }] }}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }}
    />);

    expect(screen.getByText("6:00/km")).toBeInTheDocument();
    expect(screen.getByText("1:00:00 · 2026-07-10")).toBeInTheDocument();
    expect(screen.queryByText(/:60/)).not.toBeInTheDocument();
  });

  it("states the explicit swim evidence period in the rendered contract", () => {
    renderWithProviders(<SportPerformanceCard
      discipline="swim"
      cycling={null}
      run={{ thresholdPaceSec: null, records: [] }}
      swim={{ windowDays: 90, cssSecPer100m: 95, swolfAvg: 40, distancePerStrokeM: 1.3, activityCount: 2 }}
    />);

    expect(screen.getByText(/최근 90일의 측정 수영 효율/)).toBeInTheDocument();
  });
});
