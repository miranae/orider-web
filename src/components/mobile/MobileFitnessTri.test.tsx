import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobileFitnessPage, { type MobileFitnessData } from "./MobileFitnessPage";

const sportPerformanceSpy = vi.hoisted(() => vi.fn());
const integratedLoadSpy = vi.hoisted(() => vi.fn());
vi.mock("./SportPerformanceCard", () => ({
  default: (props: unknown) => {
    sportPerformanceSpy(props);
    return <div data-testid="sport-performance-card" />;
  },
}));
vi.mock("./IntegratedLoadCard", () => ({
  default: (props: unknown) => {
    integratedLoadSpy(props);
    return <div data-testid="integrated-load-card" />;
  },
}));
vi.mock("../training/TodaysWorkoutCard", () => ({ default: () => null }));

describe("MobileFitnessPage tri", () => {
  beforeEach(() => {
    sportPerformanceSpy.mockClear();
    integratedLoadSpy.mockClear();
  });

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
    expect(screen.getByRole("button", { name: "통합" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "개요" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "수영" })).not.toBeInTheDocument();
  });

  it("resets the secondary tab after bike analysis to tri and then run", async () => {
    const user = userEvent.setup();
    const base = {
      ctl: 10, atl: 8, tsb: 2, pmcHistory: [], weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
      threshold: null, hasLoadData: true, combinedLoad: null,
      loadFocus: { windowDays: 28, totalLoad: 0, buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 }, sourceLoad: { power: 0, heartRate: 0, unclassified: 0 }, disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 }, activityCount: 0, coveragePct: 0, confidence: "none", hasAnaerobicBikeDetail: false },
      cyclingAbility: null, runEvidence: { thresholdPaceSec: null, records: [] }, swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
      zones: [], zoneSource: "none",
    } as const;
    const { rerender } = renderWithProviders(
      <MobileFitnessPage data={{ ...base, discipline: "bike" } satisfies MobileFitnessData} />,
    );

    await user.click(screen.getByRole("tab", { name: "파워존" }));
    expect(screen.getByRole("tab", { name: "파워존" })).toHaveAttribute("aria-selected", "true");

    rerender(<MobileFitnessPage data={{ ...base, discipline: "tri" } satisfies MobileFitnessData} />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    rerender(<MobileFitnessPage data={{ ...base, discipline: "run" } satisfies MobileFitnessData} />);
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
    });
    expect(screen.getByRole("tab", { name: "심박존" })).toHaveAttribute("aria-selected", "false");
  });

  it("renders authoritative integrated detail exactly once on tri", () => {
    const data = {
      ctl: 10, atl: 8, tsb: 2, pmcHistory: [], weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
      threshold: null, hasLoadData: true,
      combinedLoad: { ctl: 10, atl: 8, tsb: 2, contributions: [] },
      loadFocus: { windowDays: 28, totalLoad: 0, buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 }, sourceLoad: { power: 0, heartRate: 0, unclassified: 0 }, disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 }, activityCount: 0, coveragePct: 0, confidence: "none", hasAnaerobicBikeDetail: false },
      cyclingAbility: null, runEvidence: { thresholdPaceSec: null, records: [] }, swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
      zones: [], zoneSource: "none", discipline: "tri",
    } satisfies MobileFitnessData;

    renderWithProviders(<MobileFitnessPage data={data} />);
    expect(screen.getAllByTestId("integrated-load-card")).toHaveLength(1);
    expect(integratedLoadSpy).toHaveBeenCalledTimes(1);
  });

  it("does not render integrated detail on a single-sport tab", () => {
    const data = {
      ctl: 10, atl: 8, tsb: 2, pmcHistory: [], weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
      threshold: null, hasLoadData: true,
      combinedLoad: { ctl: 10, atl: 8, tsb: 2, contributions: [] },
      loadFocus: { windowDays: 28, totalLoad: 0, buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 }, sourceLoad: { power: 0, heartRate: 0, unclassified: 0 }, disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 }, activityCount: 0, coveragePct: 0, confidence: "none", hasAnaerobicBikeDetail: false },
      cyclingAbility: null, runEvidence: { thresholdPaceSec: null, records: [] }, swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
      zones: [], zoneSource: "none", discipline: "run",
    } satisfies MobileFitnessData;

    renderWithProviders(<MobileFitnessPage data={data} />);
    expect(screen.queryByTestId("integrated-load-card")).not.toBeInTheDocument();
    expect(integratedLoadSpy).not.toHaveBeenCalled();
  });

  it("renders active FTP evidence and keeps the PDC candidate opt-in", async () => {
    const user = userEvent.setup();
    const onApplyFtp = vi.fn();
    const data = {
      ctl: 42.1, atl: 48.3, tsb: -6.2, pmcHistory: [], weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
      threshold: { label: "FTP", value: "250", unit: "W", sub: "" }, ftp: 250, weightKg: 70, hasLoadData: true, combinedLoad: null,
      loadFocus: { windowDays: 28, totalLoad: 0, buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 }, sourceLoad: { power: 0, heartRate: 0, unclassified: 0 }, disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 }, activityCount: 0, coveragePct: 0, confidence: "none", hasAnaerobicBikeDetail: false },
      cyclingAbility: null, runEvidence: { thresholdPaceSec: null, records: [] }, swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
      zones: [], zoneSource: "none", discipline: "bike",
      pdcSummary: { riderType: { type: "Climber", confidence: 0.8 }, abilityPercentile: 82, vo2maxEst: 58.4, vo2maxPercentile: 75, cohortSampleSize: 120, activityCount: 14 },
      thresholdDecision: { activeFtpW: 250, automaticCandidateW: 265, cpW: 270, recentTwentyMinuteW: 279, latestMonthlyEstimate: { period: "2026-07", ftpW: 265 }, tteMin: 45, activityCount: 14 },
      ftpProgression: [{ period: "2026-06", ftpW: 255, source: "20m" }, { period: "2026-07", ftpW: 265, source: "20m" }],
    } satisfies MobileFitnessData;

    renderWithProviders(<MobileFitnessPage data={data} onApplyFtp={onApplyFtp} />);

    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("3.57 W/kg")).toBeInTheDocument();
    expect(screen.queryByText(/CTL 42.1 · ATL 48.3 · TSB -6.2/)).not.toBeInTheDocument();
    expect(screen.getByText(/실험실 측정치 아님/)).toBeInTheDocument();
    expect(screen.getByText(/현재 적용 FTP 250W/)).toBeInTheDocument();
    expect(onApplyFtp).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "이 후보 적용" }));
    expect(onApplyFtp).toHaveBeenCalledWith(265);
  });
});
