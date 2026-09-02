import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobileFitnessPage, { type MobileFitnessData } from "./MobileFitnessPage";

vi.mock("../training/TodaysWorkoutCard", () => ({ default: () => null }));
vi.mock("./SportPerformanceCard", () => ({ default: () => null }));

describe("MobileFitnessPage power curve", () => {
  it("does not render zero-valued trend sections before the timeseries settles", () => {
    const data = {
      ctl: 0, atl: 0, tsb: 0, pmcHistory: [], weeklyTSS: [0, 0, 0, 0],
      thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
      threshold: null, hasLoadData: false, combinedLoad: null,
      loadFocus: { windowDays: 28, totalLoad: 0, buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 }, sourceLoad: { power: 0, heartRate: 0, unclassified: 0 }, disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 }, activityCount: 0, coveragePct: 0, confidence: "none", hasAnaerobicBikeDetail: false },
      cyclingAbility: null, runEvidence: { thresholdPaceSec: null, records: [] },
      swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
      zones: [], zoneSource: "none", discipline: "bike",
    } satisfies MobileFitnessData;

    const { container } = renderWithProviders(
      <MobileFitnessPage
        data={data}
        embedded
        sectionState={{ trend: "loading", derived: "ready" }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("피트니스 추이를 불러오는 중");
    expect(container.querySelector("[data-pmc-chart]")).not.toBeInTheDocument();
    expect(screen.queryByText("주간 부하 · 최근 4주")).not.toBeInTheDocument();
    expect(screen.queryByText(/이번 주 0/)).not.toBeInTheDocument();
  });

  it("separates explanatory copy from an accessible non-scaling chart", async () => {
    const user = userEvent.setup();
    const data = {
      ctl: 10, atl: 8, tsb: 2, pmcHistory: [], weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
      threshold: null, hasLoadData: true, combinedLoad: null,
      loadFocus: { windowDays: 28, totalLoad: 0, buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 }, sourceLoad: { power: 0, heartRate: 0, unclassified: 0 }, disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 }, activityCount: 0, coveragePct: 0, confidence: "none", hasAnaerobicBikeDetail: false },
      cyclingAbility: null, runEvidence: { thresholdPaceSec: null, records: [] }, swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
      zones: [], zoneSource: "none", discipline: "bike",
      powerCurve: [
        { durationSeconds: 5, maxPower: 900 },
        { durationSeconds: 60, maxPower: 500 },
        { durationSeconds: 300, maxPower: 350 },
        { durationSeconds: 1200, maxPower: 270 },
        { durationSeconds: 3600, maxPower: 220 },
      ],
    } satisfies MobileFitnessData;

    const { container } = renderWithProviders(<MobileFitnessPage data={data} />);
    await user.click(screen.getByRole("tab", { name: "파워존" }));

    const copy = container.querySelector<HTMLElement>("[data-power-curve-copy]");
    const visual = container.querySelector<HTMLElement>("[data-power-curve-visual]");
    expect(copy).toHaveTextContent("파워 커브 · 최근 28일");
    expect(copy).toHaveStyle({ marginBottom: "var(--space-2)" });
    expect(visual).toHaveStyle({ margin: "0 -16px", overflow: "hidden" });
    expect(visual?.style.borderTop).toBe("");
    expect(visual?.style.padding).toBe("");
    const chart = screen.getByRole("img", { name: /파워 커브 · 최근 28일/ });
    expect(chart).toHaveAttribute("data-power-curve-chart");
    expect(chart).toHaveStyle({ maxWidth: "100%", overflow: "hidden" });
    expect(chart.querySelector("svg")).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    expect(chart.querySelector("svg text")).not.toBeInTheDocument();
    expect(chart.querySelector("[data-power-curve-axis-labels]")).toHaveTextContent("1h");
  });
});
