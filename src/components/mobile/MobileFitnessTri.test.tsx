import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobileFitnessPage, { type MobileFitnessData } from "./MobileFitnessPage";

const sportPerformanceSpy = vi.hoisted(() => vi.fn());
vi.mock("./SportPerformanceCard", () => ({
  default: (props: unknown) => {
    sportPerformanceSpy(props);
    return <div data-testid="sport-performance-card" />;
  },
}));
vi.mock("../training/TodaysWorkoutCard", () => ({ default: () => null }));

describe("MobileFitnessPage tri", () => {
  it("does not invoke or wrap the sport-specific card on the integrated tab", () => {
    const data: MobileFitnessData = {
      ctl: 10,
      atl: 8,
      tsb: 2,
      pmcHistory: [],
      weeklyTSS: [],
      thisWeekTSS: 0,
      avgWeekTSS: 0,
      restDays: 0,
      threshold: null,
      hasLoadData: true,
      combinedLoad: null,
      loadFocus: {
        windowDays: 28,
        totalLoad: 0,
        buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 },
        sourceLoad: { power: 0, heartRate: 0, unclassified: 0 },
        disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 },
        activityCount: 0,
        coveragePct: 0,
        confidence: "none",
        hasAnaerobicBikeDetail: false,
      },
      cyclingAbility: null,
      runEvidence: { thresholdPaceSec: null, records: [] },
      swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
      zones: [],
      zoneSource: "none",
      discipline: "tri",
    };

    renderWithProviders(<MobileFitnessPage data={data} />);

    expect(screen.queryByTestId("sport-performance-card")).not.toBeInTheDocument();
    expect(sportPerformanceSpy).not.toHaveBeenCalled();
  });
});
