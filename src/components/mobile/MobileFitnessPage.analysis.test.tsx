import GlossaryProvider from "../common/GlossaryProvider";
import { fireEvent, screen } from "@testing-library/react";
import type { BikeThresholdDecisionV2 } from "@shared/types/threshold";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobileFitnessPage, { type MobileFitnessData } from "./MobileFitnessPage";
vi.mock("./SportPerformanceCard", () => ({ default: () => null }));
const data: MobileFitnessData = {
  ctl: 40, atl: 45, tsb: -5, pmcHistory: [], weeklyTSS: [], thisWeekTSS: null, avgWeekTSS: null, restDays: null,
  threshold: null, hasLoadData: true, combinedLoad: null, loadFocus: null, cyclingAbility: null,
  runEvidence: { thresholdPaceSec: null, records: [] },
  swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
  zones: [], zoneSource: "none", discipline: "bike",
  pdcSummary: { riderType: null, abilityScore: null, vo2maxEst: 52, activityCount: 12, weightKgSnapshot: 70,
    version: 6, provenanceVersion: 2, measuredPower: true },
  monthlyVo2maxTrend: [{ period: "2026-08", v: 50 }, { period: "2026-09", v: 53 }],
  powerGaps: [{ durationSeconds: 60, peak: 510, expected: 450, gapPct: 13.3, label: "strength" },
    { durationSeconds: 1200, peak: 220, expected: 250, gapPct: -12, label: "weakness" }],
};
describe("mobile web analysis evidence", () => {
  it("shows measured monthly VO2 trend and CP strength/weakness evidence", () => {
    renderWithProviders(<MobileFitnessPage data={data} part="analysis" />);
    expect(screen.getByTestId("K5-1-3")).toHaveTextContent("~52");
    expect(screen.getByTestId("K5-1-3")).toHaveTextContent("+3.0");
    expect(screen.getByTestId("K5-1-4")).toHaveTextContent("+13%");
    expect(screen.getByTestId("K5-1-4")).toHaveTextContent("-12%");
    expect(screen.getByRole("img", { name: /2026-08.*2026-09/ })).toBeInTheDocument();
  });
  it("does not add the new evidence to legacy embedded all view", () => {
    renderWithProviders(<MobileFitnessPage data={data} embedded />);
    expect(screen.queryByTestId("K5-1-3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("K5-1-4")).not.toBeInTheDocument();
  });
  it("does not show a trend line for only one measured month or an empty gap card", () => {
    renderWithProviders(<MobileFitnessPage data={{ ...data, monthlyVo2maxTrend: [{ period: "2026-09", v: 53 }],
      powerGaps: [{ durationSeconds: 60, peak: 450, expected: 450, gapPct: 0, label: "on_par" }] }} part="analysis" />);
    expect(screen.queryByRole("img", { name: /2026-09/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("K5-1-4")).not.toBeInTheDocument();
  });
});

const pendingDecision: BikeThresholdDecisionV2 = {
  schemaVersion: 2 as const,
  decisionId: "bike-ftp-1234567890abcdef1234567890abcdef", status: "actionable" as const,
  candidate: { ftp: 265, currentFtp: 250, method: "pdc_cp_097" as const, deltaW: 15, deltaPct: 6 },
  evidence: { activityId: "activity-1", activityRevision: "activity-r1", powerSource: "measured" as const, pdcRevision: "pdc-r1" },
  expectedRevisions: { ftp: "ftp-r1", pdc: "pdc-r1", impactPreview: "impact-r1" },
  confidence: { level: "high" as const, score: 0.9, reasons: ["measured_power"] },
  impactPreview: { revision: "impact-r1", effectiveFrom: "next_ride" as const, workoutScalePct: 106 },
  createdAt: Date.now() - 1000, expiresAt: Date.now() + 86400000,
};
it("opens the mobile condition decision link with the existing accept action", async () => {
  const onAccept = vi.fn();
  renderWithProviders(<MobileFitnessPage data={data} part="condition" ftpDecision={pendingDecision} onAcceptDecision={onAccept} />, { authenticated: true, route: `/ko/coach/condition?decisionId=${pendingDecision.decisionId}` });
  const details = document.getElementById("ftp-decision") as HTMLDetailsElement;
  expect(details.open).toBe(true);
  const accept = screen.getByRole("button", { name: "이 FTP로 변경" });
  expect(accept).toBeVisible();
  fireEvent.click(accept);
  expect(onAccept).toHaveBeenCalledOnce();
});
it("excludes bike FTP decisions from other sports", () => {
  renderWithProviders(<MobileFitnessPage data={{ ...data, discipline: "run" }} part="condition" ftpDecision={pendingDecision} />, { authenticated: true, route: "/ko/coach/condition?sport=run#ftp-decision" });
  expect(document.getElementById("ftp-decision")).toBeNull();
  expect(screen.queryByRole("button", { name: "이 FTP로 변경" })).toBeNull();
});
it("renders the two-line running analysis summary outside the full records board", () => {
  renderWithProviders(<MobileFitnessPage data={{ ...data, discipline: "run", runEvidence: { thresholdPaceSec: null, records: [], unverifiedRecords: [{ distance: "5km", storedValue: 1200, date: "2026-10-01", activityId: "old", startTime: 1, qualification: "legacy_unverified", unit: "unverified" }] } }} part="analysis" />, { authenticated: true });
  expect(screen.getByTestId("K5-4")).toHaveTextContent("시간과 페이스를 표시하지 않습니다");
  expect(screen.getByRole("link", { name: "기록 전체 보기 →" }).getAttribute("href")).toContain("/athlete/me/records?sport=run");
});

it("keeps the mobile expired decision read-only", () => {
  renderWithProviders(<MobileFitnessPage data={data} part="condition" ftpDecision={{ ...pendingDecision, expiresAt: Date.now() - 1 }} />, { authenticated: true, route: "/ko/coach/condition#ftp-decision" });
  expect((document.getElementById("ftp-decision") as HTMLDetailsElement).open).toBe(true);
  expect(screen.queryByRole("button", { name: "이 FTP로 변경" })).toBeNull();
});


it('names the mobile coach analysis surface and explains repeated zone labels and FTP ranges', () => {
  const zones = [{ name: '회복', pct: 100, color: 'var(--aqua)', rangeLabel: '<55% FTP', percentLabel: '<55%' }];
  const { container } = renderWithProviders(<GlossaryProvider><MobileFitnessPage data={{ ...data, zones, zoneSource: 'power' }} part="analysis" /></GlossaryProvider>);
  expect(screen.getByRole('heading', { level: 1, name: '분석' })).toHaveAttribute('data-testid', 'K5-0-1');
  expect(container.querySelectorAll('[data-glossary-term="z1"] button').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByTestId('K5-3-1').querySelector('[data-glossary-term="ftp"] button')).not.toBeNull();
  expect(container.querySelector('button button, a button, svg button')).toBeNull();
});
