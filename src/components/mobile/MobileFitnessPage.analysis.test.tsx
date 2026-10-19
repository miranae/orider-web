import RunRecordsBoard from "../fitness/RunRecordsBoard";
import RunRecordsSummary from "../../features/fitness/components/RunRecordsSummary";
import { sufficiencyBlock, sufficiencySet } from "../../features/sufficiency/__fixtures__";
import { mockCallableInvocations } from "../../__tests__/mocks/firebase";
import GlossaryProvider from "../common/GlossaryProvider";
import { fireEvent, screen, within } from "@testing-library/react";
import type { BikeThresholdDecisionV2 } from "@shared/types/threshold";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import FitnessCoachBriefing from "../../features/fitness/components/FitnessCoachBriefing";
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
  it("places the optional activity summary before detailed analysis without leaking it to embedded views", () => {
    const view = renderWithProviders(<MobileFitnessPage data={data} part="analysis" analysisSummarySlot={<div>monthly summary</div>} />);
    expect(screen.getByText("monthly summary").compareDocumentPosition(screen.getByTestId("K5-1-3")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    view.rerender(<MobileFitnessPage data={data} part="analysis" embedded analysisSummarySlot={<div>monthly summary</div>} />);
    expect(screen.queryByText("monthly summary")).not.toBeInTheDocument();
  });
  it("only exposes the condition supplement on the standalone condition surface", () => {
    const view = renderWithProviders(<MobileFitnessPage data={data} part="condition" conditionSupplementSlot={<div>cross-sport contribution</div>} />);
    expect(screen.getByText("cross-sport contribution")).toBeInTheDocument();
    view.rerender(<MobileFitnessPage data={data} part="analysis" conditionSupplementSlot={<div>cross-sport contribution</div>} />);
    expect(screen.queryByText("cross-sport contribution")).not.toBeInTheDocument();
  });
  it("mounts one condition story with its simulator before the mobile chart and activity evidence", () => {
    const { container } = renderWithProviders(<MobileFitnessPage data={data} part="condition" currentStatusSlot={<h2>outer status must not repeat</h2>} coachSlot={<FitnessCoachBriefing part="condition" mobilePriority impacts={[]} selectedActivityId={null} onSelectActivity={() => undefined} forecast={null} current={{ ctl: 40, atl: 45, tsb: -5 }} decisionSlot={null} locale="ko-KR" canonicalAvailable discipline="bike" statusSlot={<h2>canonical story status</h2>} />} />);
    expect(screen.getByRole("heading", { name: "canonical story status" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "outer status must not repeat" })).not.toBeInTheDocument();
    expect(container.querySelectorAll("#condition-current")).toHaveLength(1);
    expect(container.querySelectorAll("#condition-trend")).toHaveLength(1);
    expect(container.querySelectorAll("#condition-activities")).toHaveLength(1);
    const hero = container.querySelector(".fitness-coach__story-hero")!;
    expect(within(hero as HTMLElement).getAllByRole("radio")).toHaveLength(3);
    expect(hero.compareDocumentPosition(container.querySelector("#condition-trend")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("#condition-trend")!.compareDocumentPosition(container.querySelector("#condition-activities")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the same running pace curve even without a configured threshold pace", () => {
    renderWithProviders(<MobileFitnessPage data={{ ...data, discipline: "run", threshold: null }} part="condition" runPaceCurve={{
      recent28: [{ durationSec: 30, paceSecPerKm: 176 }, { durationSec: 1800, paceSecPerKm: 749 }],
      prev28: [{ durationSec: 30, paceSecPerKm: 180 }],
    }} />);
    const curve = screen.getByTestId("K5-2-3");
    expect(within(curve).getByRole("table")).toHaveTextContent("2:56 /km");
    expect(within(curve).getByRole("table")).toHaveTextContent("12:29 /km");
    const chart = within(curve).getByRole("img");
    fireEvent.focus(chart);
    fireEvent.keyDown(chart, { key: "Home" });
    const readout = within(curve).getByRole("status");
    expect(readout).toHaveTextContent("최근 28일");
    expect(readout).toHaveTextContent("2:56 /km");
    expect(readout).toHaveTextContent("이전 28일");
    expect(readout).toHaveTextContent("3:00 /km");
    fireEvent.pointerLeave(chart);
    fireEvent.blur(chart);
    expect(readout).toBeVisible();
    expect(readout).toHaveTextContent("2:56 /km");
  });
  it("distinguishes missing running curve evidence from the threshold setting", () => {
    renderWithProviders(<MobileFitnessPage data={{ ...data, discipline: "run", threshold: null }} part="condition" runPaceCurve={{ recent28: [], prev28: [] }} />);
    expect(screen.getByTestId("K5-2-3")).toHaveTextContent("역치 페이스 설정과는 별개입니다");
    expect(within(screen.getByTestId("K5-2-3")).queryByRole("img")).not.toBeInTheDocument();
  });
  it("keeps a pending condition status separate from confirmed insufficient data", () => {
    renderWithProviders(<MobileFitnessPage data={{ ...data, hasLoadData: false }} part="condition" sectionState={{ trend: "loading", derived: "loading" }} />);
    const current = document.getElementById("condition-current")!;
    expect(current).toHaveTextContent("피트니스 추이를 불러오는 중…");
    expect(current).not.toHaveTextContent("아직 계산할 기록이 없어요");
  });
  it.each(["bike", "run"] as const)("keeps cycling PDC requirements scoped on %s", discipline => {
    const pdcSufficiency = sufficiencySet([
      sufficiencyBlock(),
      sufficiencyBlock({ featureId: "power_model", viewId: "cp_w_prime" }),
      sufficiencyBlock({ featureId: "rider_profile", viewId: "profile" }),
      sufficiencyBlock({ featureId: "ftp_estimate", viewId: "current" }),
    ]);
    renderWithProviders(<MobileFitnessPage data={{ ...data, discipline, pdcSufficiency }} consistencyStreak={{ streakWeeks: 2, activeDays90d: 4, activeWeeks90d: 2, score90d: 10, thisWeekCount: 1, needsThisWeek: 0 }} part="condition" />);
    expect(screen.getByTestId("K1-4-2")).toHaveTextContent("전체 종목 운동 루틴");
    if (discipline === "bike") {
      expect(screen.getByTestId("K5-sufficiency-group-power_model-cp_w_prime")).toBeVisible();
      expect(screen.getByTestId("K5-sufficiency-group-ftp_estimate-current")).toBeVisible();
    } else {
      expect(screen.queryByTestId("K5-sufficiency-group")).not.toBeInTheDocument();
      expect(screen.getByTestId("K5-4")).toBeVisible();
    }
  });
  it("shows measured monthly VO2 trend and CP strength/weakness evidence", () => {
    renderWithProviders(<MobileFitnessPage data={data} part="analysis" />);
    expect(screen.getByTestId("K5-1-3")).toHaveTextContent("~52");
    expect(screen.getByTestId("K5-1-3")).toHaveTextContent("+3.0");
    expect(screen.getByTestId("K5-1-4")).toHaveTextContent("+13%");
    expect(screen.getByTestId("K5-1-4")).toHaveTextContent("-12%");
    const trend = screen.getByRole("group", { name: "PDC 기반 VO2max 추정" });
    expect(trend).toHaveAccessibleDescription(/2026-08.*2026-09/);
    fireEvent.focus(trend);
    fireEvent.keyDown(trend, { key: "Home" });
    const readout = within(screen.getByTestId("K5-1-3")).getByRole("status");
    expect(readout).toHaveTextContent("2026-08");
    expect(readout).toHaveTextContent("50 ml/kg/min");
    fireEvent.mouseLeave(trend);
    fireEvent.blur(trend);
    expect(readout).toBeVisible();
    expect(readout).toHaveTextContent("50 ml/kg/min");
  });
  it("keeps VO2max, strengths, power curve and zones visible on condition without switching tabs", () => {
    const zones = [{ name: "Endurance", pct: 75, color: "var(--zone-2)", rangeLabel: "140–180 W", percentLabel: "56–75%" }];
    const { container } = renderWithProviders(<MobileFitnessPage data={{ ...data, zones, zoneSource: "power", powerCurve: [{ durationSeconds: 60, maxPower: 500 }, { durationSeconds: 1200, maxPower: 250 }] }} part="condition" ridingEvidenceSlot={<p>페달링 실측 근거</p>} />);
    expect(screen.getByTestId("K5-1-3")).toHaveTextContent("~52");
    expect(screen.getByTestId("K5-1-4")).toHaveTextContent("+13%");
    expect(screen.getByTestId("K5-2-1")).toBeInTheDocument();
    expect(screen.getByTestId("K5-3-2")).toHaveTextContent("75%");
    expect(screen.getByTestId("K5-3-1")).toHaveTextContent("140–180 W");
    const curve = screen.getByRole("group", { name: "파워 커브" });
    fireEvent.focus(curve);
    fireEvent.keyDown(curve, { key: "Home" });
    const readout = within(screen.getByTestId("K5-2-1")).getByRole("status");
    expect(readout).toHaveTextContent("500 W");
    expect(readout).toHaveTextContent("1분");
    fireEvent.mouseLeave(curve);
    fireEvent.blur(curve);
    expect(readout).toBeVisible();
    expect(readout).toHaveTextContent("500 W");
    expect(screen.getAllByText("페달링 실측 근거")).toHaveLength(1);
    expect(container.querySelector(".mobile-fitness-riding-metrics details")).toBeNull();
    expect(screen.queryByRole("button", { name: "분석" })).not.toBeInTheDocument();
  });
  it.each([false, true])("opens condition period controls with enabled=%s while waiting for an explicit query", enabled => {
    const before = mockCallableInvocations.filter(call => call.name === "getPowerCurvePeriods").length;
    renderWithProviders(<MobileFitnessPage data={data} part="condition" powerCurvePeriodsOwnerUid="test-uid" powerCurvePeriodsEnabled={enabled} />, { authenticated: true });
    expect(screen.getByTestId("K5-5-1").tagName).toBe("SECTION");
    const load = screen.getByRole("button", { name: "기간 분석 불러오기" });
    expect(load).toBeVisible();
    expect(load).toHaveProperty("disabled", !enabled);
    expect(mockCallableInvocations.filter(call => call.name === "getPowerCurvePeriods")).toHaveLength(before);
  });

  it("keeps condition CP pacing and both sensor-zone distributions alongside current zone definitions", () => {
    const { container } = renderWithProviders(<MobileFitnessPage part="condition" data={{ ...data,
      weightKg: 70, thresholdDecision: { activeFtpW: 250, automaticCandidateW: 265, cpW: 270, recentTwentyMinuteW: 279, latestMonthlyEstimate: null, tteMin: 45, activityCount: 14 },
      zones: [{ name: "Endurance", pct: 75, color: "var(--zone-2)", rangeLabel: "140–180 W", percentLabel: "56–75%" }], zoneSource: "power",
      zoneEvidence: { windowDays: 30, startTime: 0, endTime: 86400000,
        hr: { counts: [10, 20, 30, 40, 50], total: 150, recordCount: 1, missingCount: 0, boundaries: null },
        power: { counts: [1, 2, 3, 4, 5, 6, 7], total: 28, recordCount: 1, missingCount: 0 } } }} />);
    expect(screen.getByTestId("K1-6-6")).toHaveTextContent("243–257 W");
    expect(screen.getByTestId("K1-6-6")).toHaveTextContent("3.47–3.67 W/kg");
    expect(container.querySelectorAll(".fitness-zone-evidence__card")).toHaveLength(2);
    expect(container.querySelectorAll(".fitness-zone-evidence__zones li")).toHaveLength(12);
    expect(screen.getByTestId("K5-3-1")).toHaveTextContent("140–180 W");
  });

  it("keeps qualified running records and the running evidence slot on condition", () => {
    renderWithProviders(<MobileFitnessPage part="condition" runningRecordsSlot={<p>달성한 러닝 마일스톤</p>} data={{ ...data, discipline: "run",
      runEvidence: { thresholdPaceSec: null, records: [{ distance: "5km", seconds: 1200, date: "2026-10-01", activityId: "activity", startTime: 1, qualification: "source_qualified", unit: "seconds" }] } }} />);
    expect(screen.getByTestId("K5-4")).toHaveTextContent("5km · 20:00");
    expect(within(screen.getByTestId("K5-4")).getByRole("link")).toHaveAttribute("href", "/ko/athlete/me/records?sport=run");
    expect(screen.getByText("달성한 러닝 마일스톤")).toBeVisible();
    expect(screen.getByTestId("K5-4").closest("#condition-metrics")).not.toBeNull();
    const load = document.getElementById("condition-load");
    expect(load?.compareDocumentPosition(screen.getByTestId("K5-4"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    for (const anchor of within(screen.getByRole("navigation", { name: "구간 바로가기" })).getAllByRole("link")) {
      expect(document.getElementById(anchor.getAttribute("href")!.slice(1))).not.toBeNull();
    }

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
  const decisionSection = document.getElementById("ftp-decision");
  expect(decisionSection?.tagName).toBe("SECTION");
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
  expect(document.getElementById("ftp-decision")?.tagName).toBe("SECTION");
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


it("groups missing running evidence and setup into one readiness card", () => {
  renderWithProviders(<MobileFitnessPage data={{ ...data, discipline: "run" }} part="analysis" />, { authenticated: true });
  expect(screen.getByRole("heading", { name: "러닝 분석 준비" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "러닝 훈련 기준 설정" })).toBeInTheDocument();
  expect(screen.queryByText(/심박 구간을 표시할 수/)).not.toBeInTheDocument();
});


it("condition cycling shows actual curve and zones before missing-evidence requirements", () => {
  const pdcSufficiency = sufficiencySet(["power_model", "vo2max", "ftp_estimate", "rider_profile"].map(featureId => sufficiencyBlock({ featureId })));
  renderWithProviders(<MobileFitnessPage data={{ ...data, pdcSufficiency, zoneEvidence: { windowDays: 30, startTime: 0, endTime: 86400000, hr: { counts: [1], total: 1, recordCount: 1, missingCount: 0, boundaries: null }, power: { counts: [1], total: 1, recordCount: 1, missingCount: 0 } } }} part="condition" powerCurveEvidenceSlot={<section aria-label="raw power evidence">264 W / 246 W</section>} />);
  const curve = screen.getByRole("region", { name: "raw power evidence" });
  const requirements = screen.getByTestId("K5-sufficiency-group");
  const zones = screen.getByRole("heading", { name: "심박 존 분포" });
  expect(curve.compareDocumentPosition(zones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(zones.compareDocumentPosition(requirements) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getAllByRole("region", { name: "raw power evidence" })).toHaveLength(1);
});

it("condition running shares one unknown-source warning and records link with its source board", () => {
  const runEvidence = { thresholdPaceSec: null, records: [], unverifiedRecords: [{ distance: "5km" as const, date: "2026-10-01", activityId: "run-1" }] };
  renderWithProviders(<MobileFitnessPage part="condition" data={{ ...data, discipline: "run", runEvidence, threshold: { label: "역치 페이스", value: "4:20", unit: "/km", sub: "설정 기준" } }} runningRecordsSlot={<RunRecordsBoard run={{ "5km": [{ value: 1200, date: "2026-10-01", activityId: "run-1" }] }} footer={<RunRecordsSummary evidence={runEvidence} sourceBoard />} />} />);
  expect(screen.getAllByText("종목과 시간 단위가 확인되지 않은 거리별 저장 기록은 시간과 페이스를 표시하지 않습니다. 시간별 페이스 분석과는 별개입니다.")).toHaveLength(1);
  expect(screen.getAllByTestId("K5-4-2")).toHaveLength(1);
  expect(screen.getAllByRole("heading", { name: "거리별 저장 기록" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: /2026.*10.*1/ })).toHaveAttribute("href", "/ko/activity/run-1");
});
