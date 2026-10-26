import { chooseDropdown, chooseDate } from "../fitnessControlTestUtils";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import { PowerCurvePeriodsPanel, PowerCurvePeriodsView } from "./PowerCurvePeriodsPanel";
const mocks = vi.hoisted(() => ({ hook: vi.fn(), owner: "owner" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => `${key}${params ? ` ${Object.values(params).join(" ")}` : ""}` }) }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.owner, isAnonymous: false } }) }));
vi.mock("../../../hooks/usePowerCurvePeriods", () => ({ usePowerCurvePeriods: (...args: unknown[]) => mocks.hook(...args) }));
const period = (partial = false): PowerCurvePeriodsResponse["periods"][number] => ({ fromInclusive: Date.UTC(2025, 11, 31, 15), toExclusive: Date.UTC(2026, 8, 30, 15), status: partial ? "partial" : "complete", points: [{ durationSeconds: 1, watts: 750.321, sourceActivityId: "sprint", startTime: Date.UTC(2026, 1, 1), source: "strava_api", cohortEligible: false, metricsRevision: "1:2" }, { durationSeconds: 300, watts: 250.123, sourceActivityId: "long", startTime: Date.UTC(2026, 2, 1), source: "direct_file", cohortEligible: true, metricsRevision: "1:2" }], coverage: { scannedActivityCount: partial ? 1000 : 2, candidateActivityCount: partial ? 1000 : 2, candidateCountKnown: !partial, includedActivityCount: 2, pendingActivityCount: partial ? 998 : 0, missingActivityCount: 0, incompleteActivityCount: 0, ineligibleActivityCount: 0, skippedActivityCount: 0, truncated: partial, scanLimit: 1000 } });
const response = (): PowerCurvePeriodsResponse => ({ version: 1, discipline: "bike", unit: "W", asOf: Date.UTC(2026, 9, 10), inputDigest: "a".repeat(64), periods: [period(), { ...period(true), points: [period().points[1]!] }] });
beforeEach(() => { mocks.owner = "owner"; mocks.hook.mockReset().mockReturnValue({ state: "preparing", response: null }); });
describe("PowerCurvePeriodsPanel", () => {
  it("preserves exact W, paired missing values, localized source navigation and partial/truncated diagnostics", () => {
    const view = render(<MemoryRouter initialEntries={["/en/fitness"]}><Routes><Route path="/:lang/fitness" element={<PowerCurvePeriodsView response={response()} />} /></Routes></MemoryRouter>);
    expect(view.container.querySelector(".dense-period-power")).toBeNull();
    expect(screen.getAllByText("250.1")).toHaveLength(2);
    expect(screen.getAllByText("2026-01-01 – 2026-09-30").length).toBeGreaterThanOrEqual(4);
    const details = view.container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(view.container.querySelector("summary")!);
    expect(details).toHaveAttribute("open");
    expect(screen.getAllByText(/periodCurve.rawValue .*250\.123/u)).toHaveLength(2);
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/en/activity/long");
    expect(screen.getByText("periodCurve.partialNote")).toBeInTheDocument();
    expect(screen.getByText("periodCurve.truncated 1000")).toBeInTheDocument();
    chooseDropdown(screen.getByRole("combobox"), "duration.sec 1");
    expect(screen.getByText("750.3")).toBeInTheDocument();
    expect(screen.getByText(/periodCurve.rawValue .*750\.321/u)).toBeInTheDocument(); expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/en/activity/sprint");
    fireEvent.click(view.container.querySelector('[data-duration="300"]')!);
    expect(screen.getByRole("combobox")).toHaveTextContent("duration.min 5");
  });
  it("keeps API disabled by default and bounds comparison to two periods", () => {
    render(<PowerCurvePeriodsPanel ownerUid="owner" />);
    expect(mocks.hook).toHaveBeenLastCalledWith("owner", null, false);
    expect(screen.getByRole("button", { name: "periodCurve.load" })).toBeDisabled();
    fireEvent.click(screen.getByText("periodCurve.add")); expect(screen.getAllByRole("combobox")).toHaveLength(3);
    fireEvent.click(screen.getByText("periodCurve.remove")); expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });
  it("rejects reverse custom dates, submits KST periods, then clears previous selection when edited", () => {
    const view = render(<PowerCurvePeriodsPanel ownerUid="owner" callableEnabled />);
    chooseDropdown(screen.getByRole("combobox", { name: "periodCurve.period 1" }), "periodCurve.custom");
    const dates = [screen.getByLabelText("periodCurve.from"), screen.getByLabelText("periodCurve.through")];
    chooseDate(dates[0]!, "2026-02-02"); chooseDate(dates[1]!, "2026-02-01");
    fireEvent.click(screen.getByText("periodCurve.load")); expect(screen.getByRole("alert")).toHaveTextContent("periodCurve.invalid");
    chooseDate(dates[0]!, "2026-02-01"); fireEvent.click(screen.getByText("periodCurve.load"));
    expect(mocks.hook.mock.lastCall?.[1].request.periods).toEqual([{ fromInclusive: Date.UTC(2026, 0, 31, 15), toExclusive: Date.UTC(2026, 1, 1, 15) }]);
    chooseDropdown(screen.getByRole("combobox", { name: "periodCurve.period 1" }), "periodCurve.all"); expect(mocks.hook.mock.lastCall?.[1]).toBeNull();
  });
  it("keeps unit changes manual and omits opt-in on the default W request", () => {
    render(<PowerCurvePeriodsPanel ownerUid="owner" callableEnabled />);
    expect(mocks.hook.mock.lastCall?.[1]).toBeNull();
    chooseDropdown(screen.getByRole("combobox", { name: "periodCurve.unit" }), "W/kg");
    expect(mocks.hook.mock.lastCall?.[1]).toBeNull();
    fireEvent.click(screen.getByText("periodCurve.load"));
    expect(mocks.hook.mock.lastCall?.[1].request).toMatchObject({ unit: "W", includeWeightNormalized: true });
    chooseDropdown(screen.getByRole("combobox", { name: "periodCurve.unit" }), "W");
    expect(mocks.hook.mock.lastCall?.[1]).toBeNull();
    fireEvent.click(screen.getByText("periodCurve.load"));
    expect(Object.keys(mocks.hook.mock.lastCall?.[1].request).sort()).toEqual(["periods", "unit"]);
  });
  it("uses server normalized winners rather than the stronger W winner and reports missing weight", () => {
    const data = response(); data.periods = [data.periods[0]!];
    const period = data.periods[0]!;
    period.weightNormalized = { unit: "W/kg", basis: "calculation_profile_snapshot", status: "partial", coverage: { ...period.coverage, includedActivityCount: 1 },
      weightCounts: { includedActivityCount: 1, missingWeightActivityCount: 1, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 },
      points: [{ ...period.points[1]!, watts: 200, sourceActivityId: "normalized-winner", wattsPerKg: 4, weightKg: 50, weightRevision: "1:2" }] };
    const view = render(<MemoryRouter><PowerCurvePeriodsView response={data} unit="W/kg" /></MemoryRouter>);
    expect(screen.getByText("4.00")).toBeInTheDocument();
    expect(screen.queryByText("250.1")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/ko/activity/normalized-winner");
    expect(screen.getAllByText("periodCurve.weightWinner 200 50")).toHaveLength(2);
    expect(screen.getByText("periodCurve.weightCoverage 1 1 0 0")).toBeInTheDocument();
    expect(screen.getByText("periodCurve.weightBasis")).toBeInTheDocument();
    expect(view.container.querySelector("svg")?.textContent).toContain("W/kg");
  });
  it("does not call existing W records absent when all normalized weight is missing", () => {
    const data = response(); data.periods = [data.periods[0]!];
    const period = data.periods[0]!;
    period.weightNormalized = { unit: "W/kg", basis: "calculation_profile_snapshot", status: "partial", coverage: { ...period.coverage, includedActivityCount: 0 },
      weightCounts: { includedActivityCount: 0, missingWeightActivityCount: 2, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 }, points: [] };
    render(<MemoryRouter><PowerCurvePeriodsView response={data} unit="W/kg" /></MemoryRouter>);
    expect(screen.getByText("periodCurve.weightEmpty")).toBeInTheDocument();
    expect(screen.queryByText("periodCurve.empty")).not.toBeInTheDocument();
    expect(screen.getByText("periodCurve.weightCoverage 0 2 0 0")).toBeInTheDocument();
    expect(period.points).toHaveLength(2);
  });
  it("keeps a positive normalized value below display precision distinct from zero", () => {
    const data = response(); data.periods = [data.periods[0]!];
    const period = data.periods[0]!;
    period.weightNormalized = { unit: "W/kg", basis: "calculation_profile_snapshot", status: "partial", coverage: { ...period.coverage, includedActivityCount: 1 },
      weightCounts: { includedActivityCount: 1, missingWeightActivityCount: 1, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 },
      points: [{ ...period.points[1]!, watts: 0.2, wattsPerKg: 0.004, weightKg: 50, weightRevision: "1:2" }] };
    const view = render(<MemoryRouter><PowerCurvePeriodsView response={data} unit="W/kg" /></MemoryRouter>);
    expect(view.container.querySelector("svg")?.textContent).toContain("0.011");
    expect(screen.getByText("<0.01")).toBeInTheDocument();
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();
    expect(screen.getAllByText("periodCurve.weightWinner 0.2 50")).toHaveLength(2);
    expect(period.weightNormalized.points[0]!.wattsPerKg).toBe(0.004);
  });
  it("keeps an older response honestly unsupported in W/kg and does not reuse watts", () => {
    const view = render(<MemoryRouter><PowerCurvePeriodsView response={response()} unit="W/kg" /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent("periodCurve.weightUnsupported");
    expect(view.container.querySelector("svg")).toBeNull();
    expect(screen.queryByText("250.1")).not.toBeInTheDocument();
  });
  it("hides owner analysis for another account", () => { mocks.owner = "other"; const view = render(<PowerCurvePeriodsPanel ownerUid="owner" />); expect(view.container).toBeEmptyDOMElement(); expect(mocks.hook).not.toHaveBeenCalled(); });
  it("loads rolling56 and all observed only after an explicit load and keeps edits manual", () => {
    const cutoff = Date.UTC(2026, 9, 13, 3, 45, 12);
    const clock = vi.spyOn(Date, "now").mockReturnValue(cutoff);
    try {
      render(<PowerCurvePeriodsPanel ownerUid="owner" callableEnabled />);
      fireEvent.click(screen.getByText("powerSkills.preset"));
      expect(mocks.hook.mock.lastCall?.[1]).toBeNull();
      fireEvent.click(screen.getByText("periodCurve.load"));
      expect(mocks.hook.mock.lastCall?.[1].request.periods).toEqual([
        { fromInclusive: cutoff - 56 * 86400000, toExclusive: cutoff },
        { fromInclusive: 0, toExclusive: cutoff },
      ]);
      chooseDropdown(screen.getByRole("combobox", { name: "periodCurve.unit" }), "W/kg");
      expect(mocks.hook.mock.lastCall?.[1]).toBeNull();
      fireEvent.click(screen.getByText("powerSkills.freePeriods"));
      expect(mocks.hook.mock.lastCall?.[1]).toBeNull();
      expect(screen.getByRole("combobox", { name: "periodCurve.period 1" })).toBeInTheDocument();
    } finally { clock.mockRestore(); }
  });
  it("exposes selected manual preset without triggering an automatic request", () => {
    render(<PowerCurvePeriodsPanel ownerUid="owner" callableEnabled />);
    const preset = screen.getByRole("button", { name: "powerSkills.preset" });
    expect(preset).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(preset);
    expect(preset).toHaveAttribute("aria-pressed", "true");
    expect(mocks.hook.mock.lastCall?.[1]).toBeNull();
  });
  it("applies paired complete KST weeks only on explicit load", () => {
    const cutoff = Date.parse("2026-10-25T16:00:00Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(cutoff);
    try {
      render(<PowerCurvePeriodsPanel ownerUid="owner" callableEnabled />);
      fireEvent.click(screen.getByText("comparison.fourWeeks"));
      expect(mocks.hook.mock.lastCall?.[1]).toBeNull();
      fireEvent.click(screen.getByText("periodCurve.load"));
      const periods = mocks.hook.mock.lastCall?.[1].request.periods;
      expect(periods[0].toExclusive).toBe(Date.parse("2026-10-25T15:00:00Z"));
      expect(periods[0].fromInclusive).toBe(periods[1].toExclusive);
      expect(periods[0].toExclusive - periods[0].fromInclusive).toBe(28 * 86400000);
      fireEvent.click(screen.getByText("comparison.yearToDate"));
      expect(mocks.hook.mock.lastCall?.[1]).toBeNull();
    } finally { clock.mockRestore(); }
  });

});
