import { chooseDropdown } from "../fitnessControlTestUtils";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import { PowerDurationPeriodsView } from "./PowerDurationPeriodsView";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => `${key}${params ? ` ${Object.values(params).join(" ")}` : ""}` }) }));
function fixture(): PowerCurvePeriodsResponse {
  const observation = { algorithmVersion: "power-duration-grid-v1" as const, gridVersion: 1 as const, timingBasis: "sample_owned_elapsed" as const, scope: "observed_power_candidates" as const, fromInclusive: 1000, toExclusive: 10000, partial: true, scanTruncated: false, inputCandidateCount: 2, counts: { available: 1, missing: 1, pending: 0, incomplete: 0, malformed: 0, unavailable: 0 }, unavailableReasonCounts: { incomplete_input: 0, virtual_power: 0, unknown_provenance: 0, unaligned_elapsed_axis: 0, missing_power: 0, input_limit: 0 }, points: [{ durationSeconds: 300, maxAveragePowerW: 0, sourceActivityId: "한글 활동", startTime: 2000, parentRevision: "SECRET-OPAQUE", provenance: "direct_file" as const, observedActivityCount: 1 }, { durationSeconds: 3600, maxAveragePowerW: 100, sourceActivityId: "long", startTime: 3000, parentRevision: "SECRET-OPAQUE", provenance: "direct_file" as const, observedActivityCount: 1 }] };
  const period = { fromInclusive: 1000, toExclusive: 10000, status: "partial" as const, points: [], coverage: { scannedActivityCount: 2, candidateActivityCount: 2, candidateCountKnown: true, includedActivityCount: 1, pendingActivityCount: 0, missingActivityCount: 1, incompleteActivityCount: 0, ineligibleActivityCount: 0, skippedActivityCount: 0, truncated: false, scanLimit: 1000 }, powerDurationObservations: observation };
  return { version: 1, discipline: "bike", unit: "W", asOf: 20000, inputDigest: "a".repeat(64), periods: [period, { ...period, powerDurationObservations: { ...observation, points: [{ ...observation.points[0]!, maxAveragePowerW: 50 }] } }] };
}
describe("fixed-duration period observations", () => {
  it("preserves zero W, count, source and partial comparison with positive power direction", () => {
    const view = render(<MemoryRouter><PowerDurationPeriodsView response={fixture()} /></MemoryRouter>);
    expect(screen.getByText("0 W · densePeriod.n 1")).toBeInTheDocument();
    expect(screen.getByText("densePeriod.difference -50")).toBeInTheDocument();
    expect(view.container.textContent).not.toContain("SECRET-OPAQUE");
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", `/ko/activity/${encodeURIComponent("한글 활동")}`);
    expect(screen.getAllByText("densePeriod.partial")).toHaveLength(2);
    chooseDropdown(screen.getByRole("combobox"), "densePeriod.hours 1");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/densePeriod.difference/)).not.toBeInTheDocument();
    expect(view.container.querySelectorAll("polyline")).toHaveLength(0);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const details = view.container.querySelector("details")!; details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
  it("keeps normalized dense winners, zero, snapshot kg and separate source table", () => {
    const data = fixture();
    data.periods.forEach((period, index) => {
      const original = period.powerDurationObservations!;
      period.weightNormalized = { unit: "W/kg", basis: "calculation_profile_snapshot", status: "partial", coverage: period.coverage,
        weightCounts: { includedActivityCount: 1, missingWeightActivityCount: 0, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 }, points: [],
        powerDurationObservations: { ...original, unit: "W/kg", basis: "calculation_profile_snapshot",
          weightCounts: { includedActivityCount: 1, missingWeightActivityCount: 0, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 },
          points: [{ ...original.points[0]!, sourceActivityId: "normalized-dense", maxAveragePowerW: index ? 100 : 0, maxAveragePowerWPerKg: index ? 2 : 0, weightKg: 50, weightRevision: "SECRET-OPAQUE" }] } };
    });
    const view = render(<MemoryRouter><PowerDurationPeriodsView response={data} unit="W/kg" /></MemoryRouter>);
    expect(screen.getByText("0.00 W/kg · densePeriod.n 1")).toBeInTheDocument();
    expect(screen.getByText("periodCurve.weightDifference -2.00")).toBeInTheDocument();
    expect(screen.getByText("periodCurve.weightWinner 0 50")).toBeInTheDocument();
    expect(view.container.textContent).not.toContain("SECRET-OPAQUE");
    const details = view.container.querySelector("details")!; details.open = true; fireEvent(details, new Event("toggle"));
    expect(screen.getByRole("table")).toHaveTextContent("0.00 W/kg");
    expect(screen.getByRole("table")).toHaveTextContent("periodCurve.weightWinner 100 50");
  });
  it("distinguishes a positive subprecision W/kg observation from a measured zero", () => {
    const data = fixture();
    data.periods.forEach((period, index) => {
      const original = period.powerDurationObservations!;
      period.weightNormalized = { unit: "W/kg", basis: "calculation_profile_snapshot", status: "partial", coverage: period.coverage,
        weightCounts: { includedActivityCount: 1, missingWeightActivityCount: 0, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 }, points: [],
        powerDurationObservations: { ...original, unit: "W/kg", basis: "calculation_profile_snapshot",
          weightCounts: { includedActivityCount: 1, missingWeightActivityCount: 0, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 },
          points: [{ ...original.points[0]!, maxAveragePowerW: index ? 0 : 0.2, maxAveragePowerWPerKg: index ? 0 : 0.004, weightKg: 50, weightRevision: "SECRET-OPAQUE" }] } };
    });
    const view = render(<MemoryRouter><PowerDurationPeriodsView response={data} unit="W/kg" /></MemoryRouter>);
    expect(view.container.querySelector("svg")?.textContent).toContain("0.005");
    expect(screen.getByText("<0.01 W/kg · densePeriod.n 1")).toBeInTheDocument();
    expect(screen.getByText("periodCurve.weightDifference <0.01")).toBeInTheDocument();
    expect(screen.getByText("0.00 W/kg · densePeriod.n 1")).toBeInTheDocument();
    expect(screen.getByText("periodCurve.weightWinner 0.2 50")).toBeInTheDocument();
  });
  it("uses weight-specific empty copy when W observations exist but calculation weight is missing", () => {
    const data = fixture(); data.periods = [data.periods[0]!];
    const period = data.periods[0]!, original = period.powerDurationObservations!;
    period.weightNormalized = { unit: "W/kg", basis: "calculation_profile_snapshot", status: "partial", coverage: { ...period.coverage, includedActivityCount: 0 },
      weightCounts: { includedActivityCount: 0, missingWeightActivityCount: 1, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 }, points: [],
      powerDurationObservations: { ...original, unit: "W/kg", basis: "calculation_profile_snapshot", counts: { ...original.counts, available: 0 },
        weightCounts: { includedActivityCount: 0, missingWeightActivityCount: 1, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 }, points: [] } };
    render(<MemoryRouter><PowerDurationPeriodsView response={data} unit="W/kg" /></MemoryRouter>);
    expect(screen.getByText("periodCurve.weightEmpty")).toBeInTheDocument();
    expect(screen.queryByText("densePeriod.empty")).not.toBeInTheDocument();
    expect(original.points).toHaveLength(2);
  });
  it("formats arbitrary fixed-grid integer seconds as exact hours minutes seconds", () => {
    const data = fixture(), observation = data.periods[0]!.powerDurationObservations!;
    observation.points = [68, 4685, 86400].map(durationSeconds => ({ ...observation.points[0]!, durationSeconds }));
    delete data.periods[1]!.powerDurationObservations;
    render(<MemoryRouter><PowerDurationPeriodsView response={data} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "densePeriod.minutes 1 densePeriod.seconds 8" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "densePeriod.hours 1 densePeriod.minutes 18 densePeriod.seconds 5" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "densePeriod.hours 24" })).toBeInTheDocument();
    expect(screen.getByRole("combobox").textContent).not.toMatch(/\d+\.\d+/);
  });
  it("keeps an absent period unknown and does not compare it with the old11", () => {
    const data = fixture(); delete data.periods[1]!.powerDurationObservations;
    render(<MemoryRouter><PowerDurationPeriodsView response={data} /></MemoryRouter>);
    expect(screen.getByText("densePeriod.unknown")).toBeInTheDocument();
    expect(screen.queryByText(/densePeriod.difference/)).not.toBeInTheDocument();
  });
});
