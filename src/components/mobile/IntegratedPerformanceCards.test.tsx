import { screen } from "@testing-library/react";
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
  it("renders authoritative combined status, contribution and accessible focus bands", () => {
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
    expect(screen.getByText("42.0")).toBeInTheDocument();
    expect(screen.getByText("+4.0")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /기초 유산소: 부하 40.0, 40퍼센트/ })).toBeInTheDocument();
    expect(screen.getByText(/파워 부하 60.0 · 심박 부하 30.0 · 미분류 10.0/)).toBeInTheDocument();
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
    />);

    expect(screen.getAllByText("실측 근거 부족 · 점수 미산출")).toHaveLength(2);
    expect(screen.getByText(/5m 320W · 4.40W\/kg/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /유산소 역량: 근거 백분위 65/ })).toBeInTheDocument();
    expect(screen.getByText(/Garmin EPOC/)).toBeInTheDocument();
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
