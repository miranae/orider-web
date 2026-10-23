import { chooseDropdown } from "../fitnessControlTestUtils";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import { PowerSkillsObservedView } from "./PowerSkillsObservedView";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => `${key}${params ? ` ${Object.values(params).join(" ")}` : ""}` }) }));
const response = (): PowerCurvePeriodsResponse => {
  const cutoff = Date.UTC(2026,9,13);
  const periods: PowerCurvePeriodsResponse["periods"] = [cutoff-56*86400000,0].map(fromInclusive => ({ fromInclusive, toExclusive: cutoff, status: "partial", points: [], coverage: { scannedActivityCount: 1000, candidateActivityCount: 1000, candidateCountKnown: false, includedActivityCount: 1, pendingActivityCount: 0, missingActivityCount: 999, incompleteActivityCount: 0, ineligibleActivityCount: 0, skippedActivityCount: 0, truncated: true, scanLimit: 1000 }, powerDurationObservations: { algorithmVersion: "power-duration-grid-v1", gridVersion: 1, timingBasis: "sample_owned_elapsed", scope: "observed_power_candidates", fromInclusive, toExclusive: cutoff, partial: true, scanTruncated: true, inputCandidateCount: 1000, counts: { available: 1, missing: 999, pending: 0, incomplete: 0, malformed: 0, unavailable: 0 }, unavailableReasonCounts: { incomplete_input: 0, virtual_power: 0, unknown_provenance: 0, unaligned_elapsed_axis: 0, missing_power: 0, input_limit: 0 }, points: [{ durationSeconds: 300, maxAveragePowerW: 250.123, sourceActivityId: "ride/id", startTime: cutoff-86400000, parentRevision: "1:2", provenance: "direct_file", observedActivityCount: 1 }] } }));
  return { version: 1, discipline: "bike", unit: "W", asOf: cutoff+100, inputDigest: "a".repeat(64), periods };
};
describe("PowerSkillsObservedView", () => {
  it("shows source links, exact missing rows and partial observed coverage without a plot or growth ratio", () => {
    const view = render(<MemoryRouter><PowerSkillsObservedView response={response()} /></MemoryRouter>);
    expect(screen.getAllByText("250.1 W").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/ko/activity/ride%2Fid");
    expect(screen.getAllByText(/densePeriod.partial/)).toHaveLength(2);
    expect(view.container.querySelector(".dense-period-power > svg")).toBeNull();
    expect(view.container.querySelectorAll("tbody tr")).toHaveLength(12);
    chooseDropdown(screen.getByRole("combobox"), "duration.sec 15");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByText("powerSkills.missing_exact_duration").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("0.0 W")).not.toBeInTheDocument();
  });
  it("reports unavailable normalized weight without rendering watts as W/kg", () => {
    render(<MemoryRouter><PowerSkillsObservedView response={response()} unit="W/kg" /></MemoryRouter>);
    expect(screen.getAllByText("powerSkills.weight_unavailable").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("250.1 W/kg")).not.toBeInTheDocument();
  });
  it("keeps absent-channel counts unknown and technical epoch bounds in evidence only", () => {
    const data = response();
    data.periods.forEach(period => { delete period.powerDurationObservations; });
    const view = render(<MemoryRouter><PowerSkillsObservedView response={data} /></MemoryRouter>);
    expect(screen.getAllByText("powerSkills.scannedUnavailable 1000")).toHaveLength(2);
    expect(screen.queryByText(/powerSkills.scanned .*—/)).not.toBeInTheDocument();
    expect(screen.getByText("powerSkills.through 2026-10-12")).toBeInTheDocument();
    expect(screen.queryByText("1970-01-01 – 2026-10-12")).not.toBeInTheDocument();
    expect(screen.getByText("powerSkills.gridNote").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText(/periodCurve.exactBounds 1970-01-01/).closest("details")).not.toHaveAttribute("open");
    expect(view.container.querySelectorAll('tbody button[aria-label="powerSkills.channel_unavailable"]')).toHaveLength(24);
    expect(view.container.querySelectorAll("tbody tr")).toHaveLength(12);
    expect(screen.getByText("powerSkills.tableUnavailable")).toBeInTheDocument();
  });
});
