import IntegratedLoadCard from "./IntegratedLoadCard";
import RunRecordsBoard from "../fitness/RunRecordsBoard";
import RunRecordsSummary from "../../features/fitness/components/RunRecordsSummary";
import { sufficiencyBlock, sufficiencySet } from "../../features/sufficiency/__fixtures__";
import { mockCallableInvocations } from "../../__tests__/mocks/firebase";
import GlossaryProvider from "../common/GlossaryProvider";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { BikeThresholdDecisionV2 } from "@shared/types/threshold";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import FitnessCoachBriefing from "../../features/fitness/components/FitnessCoachBriefing";
import MobileFitnessPage, { type MobileFitnessData } from "./MobileFitnessPage";
vi.mock("./SportPerformanceCard", () => ({ default: () => null }));
function expandDetails() {
  for (const details of document.querySelectorAll("details")) {
    details.open = true;
    fireEvent(details, new Event("toggle"));
  }
}
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
    renderWithProviders(<MobileFitnessPage data={{ ...data, discipline: "run", threshold: null }} part="analysis" runPaceCurve={{
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
    renderWithProviders(<MobileFitnessPage data={{ ...data, discipline: "run", threshold: null }} part="analysis" runPaceCurve={{ recent28: [], prev28: [] }} />);
    expect(screen.getByTestId("K5-2-3")).toHaveTextContent("역치 페이스 설정과는 별개입니다");
    expect(within(screen.getByTestId("K5-2-3")).queryByRole("img")).not.toBeInTheDocument();
  });
  it("keeps a pending condition status separate from confirmed insufficient data", () => {
    renderWithProviders(<MobileFitnessPage data={{ ...data, hasLoadData: false }} part="condition" sectionState={{ trend: "loading", derived: "loading" }} />);
    const current = document.getElementById("condition-current")!;
    expect(current).toHaveTextContent("피트니스 추이를 불러오는 중…");
    expect(current).not.toHaveTextContent("아직 계산할 기록이 없어요");
  });
  it("orders web analysis as performance change then training composition, without activity flow or interpretation", () => {
    const view = renderWithProviders(<MobileFitnessPage data={data} part="analysis" />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent);
    expect(headings.indexOf("수행 능력 변화")).toBeGreaterThanOrEqual(0);
    expect(headings.indexOf("수행 능력 변화")).toBeLessThan(headings.indexOf("기간별 훈련 구성"));
    expect(headings).not.toContain("해석과 근거");
    expect(screen.queryByText("활동량과 주간 흐름")).not.toBeInTheDocument();
    view.rerender(<MobileFitnessPage data={data} part="analysis" embedded />);
    expect(screen.queryByRole("heading", { name: "수행 능력 변화" })).not.toBeInTheDocument();
  });

  it("shows the period power comparison inline behind one shared load", async () => {
    const calls = () => mockCallableInvocations.filter(call => call.name === "getPowerCurvePeriods").length;
    const before = calls();
    const onPeriodLoad = vi.fn();
    const props = { data, part: "analysis" as const, powerCurvePeriodsOwnerUid: "test-uid", powerCurvePeriodsEnabled: true, periodWindowDays: 90, onPeriodLoad, powerCurveEvidenceSlot: <p>28-day curve</p> };
    const view = renderWithProviders(<MobileFitnessPage {...props} periodLoadSignal={0} />, { authenticated: true });
    // 두 패널의 자체 버튼은 숨기고 공용 버튼 하나만 둔다. 누르기 전에는 서버를 부르지 않는다.
    const load = screen.getByRole("button", { name: "기간 분석 불러오기" });
    expect(screen.getAllByRole("button", { name: "기간 분석 불러오기" })).toHaveLength(1);
    expect(screen.getByTestId("K5-5-1")).toBeVisible();
    expect(screen.queryByText("28-day curve")).not.toBeInTheDocument();
    expect(calls()).toBe(before);
    fireEvent.click(load);
    expect(onPeriodLoad).toHaveBeenCalledTimes(1);
    view.rerender(<MobileFitnessPage {...props} periodLoadSignal={1} />);
    await waitFor(() => expect(calls()).toBe(before + 1));
  });
  it("keeps the 28-day power curve when the period power comparison is not available", () => {
    renderWithProviders(<MobileFitnessPage data={data} part="analysis" powerCurvePeriodsOwnerUid="test-uid" powerCurvePeriodsEnabled={false} powerCurveEvidenceSlot={<p>28-day curve</p>} />, { authenticated: true });
    expect(screen.getByText("28-day curve")).toBeVisible();
    expect(screen.queryByTestId("K5-5-1")).not.toBeInTheDocument();
  });

  it.each(["bike", "run"] as const)("keeps cycling PDC requirements scoped on %s", discipline => {
    const pdcSufficiency = sufficiencySet([
      sufficiencyBlock(),
      sufficiencyBlock({ featureId: "power_model", viewId: "cp_w_prime" }),
      sufficiencyBlock({ featureId: "rider_profile", viewId: "profile" }),
      sufficiencyBlock({ featureId: "ftp_estimate", viewId: "current" }),
    ]);
    renderWithProviders(<MobileFitnessPage data={{ ...data, discipline, pdcSufficiency }} consistencyStreak={{ streakWeeks: 2, activeDays90d: 4, activeWeeks90d: 2, score90d: 10, thisWeekCount: 1, needsThisWeek: 0 }} part="analysis" />);
    // 분석은 "지표별 데이터 근거" 묶음을 두지 않는다(어느 종목이든).
    expect(screen.queryByTestId("K5-sufficiency-group")).not.toBeInTheDocument();
    if (discipline === "run") expect(screen.getByTestId("K5-4")).toBeVisible();
  });


  it("keeps the qualified record summary but drops the distance record source board in analysis", () => {
    renderWithProviders(<MobileFitnessPage part="analysis" runningRecordsSlot={<p>달성한 러닝 마일스톤</p>} data={{ ...data, discipline: "run",
      runEvidence: { thresholdPaceSec: null, records: [{ distance: "5km", seconds: 1200, date: "2026-10-01", activityId: "activity", startTime: 1, qualification: "source_qualified", unit: "seconds" }] } }} />);
    expect(screen.getByTestId("K5-4")).toHaveTextContent("5km · 20:00");
    expect(within(screen.getByTestId("K5-4")).getByRole("link")).toHaveAttribute("href", "/ko/athlete/me/records?sport=run");
    expect(screen.queryByRole("button", { name: /거리 기록·출처와 마일스톤/ })).not.toBeInTheDocument();
    expect(screen.queryByText("달성한 러닝 마일스톤")).not.toBeInTheDocument();
    // 상세 섹션 대신 기록 페이지로 바로 가는 길은 남긴다(P9).
    expect(screen.getByRole("link", { name: "거리 기록·출처와 마일스톤 보기 →" })).toHaveAttribute("href", "/ko/athlete/me/records?sport=run");
    expect(document.getElementById("condition-metrics")).toBeNull();

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





it("keeps the integrated contribution proportions when swimming controls are hidden", () => {
  renderWithProviders(<IntegratedLoadCard focus={null} combined={{ ctl: 100, atl: 110, tsb: -10, contributions: [
    { discipline: "bike", ctl: 30 }, { discipline: "run", ctl: 30 }, { discipline: "swim", ctl: 40 },
  ] }} />);
  const contribution = screen.getByRole("img", { name: /^현재 체력 종목 기여도:/ });
  const bike = within(contribution).getByRole("img", { name: "사이클 · CTL 30.0 · 30%" });
  const run = within(contribution).getByRole("img", { name: "러닝 · CTL 30.0 · 30%" });
  const remainder = within(contribution).getByRole("img", { name: "기타 · CTL 40.0 · 40%" });
  expect([bike, run, remainder].map(bucket => Number((bucket as HTMLElement).style.flexGrow))).toEqual([30, 30, 40]);
  expect(within(contribution).queryByRole("img", { name: /수영/ })).not.toBeInTheDocument();
});

it("hides the fixed 30-day zone cards when period zones come from the server period comparison", () => {
  const zoneEvidence = { windowDays: 30, startTime: 0, endTime: 1, hr: { counts: [10, 10, 10, 10, 10], total: 50, recordCount: 1, missingCount: 0, boundaries: null }, power: { counts: null, total: 0, recordCount: 0, missingCount: 0 } };
  const view = renderWithProviders(<MobileFitnessPage data={{ ...data, zoneEvidence }} part="analysis" />);
  expect(within(document.getElementById("analysis-periods")!).getAllByText(/30/).length).toBeGreaterThan(0);
  view.unmount();
  renderWithProviders(<MobileFitnessPage data={{ ...data, zoneEvidence }} part="analysis" periodZonesFromServer />);
  expect(within(document.getElementById("analysis-periods")!).queryByText(/30/)).not.toBeInTheDocument();
});

it("does not label the whole mobile analysis insufficient when a permitted recorded curve is visible", () => {
  renderWithProviders(<MobileFitnessPage data={{ ...data, powerCurve: [{ durationSeconds: 5, maxPower: 500 }, { durationSeconds: 1200, maxPower: 200 }] }} part="analysis" />);
  expect(screen.queryByText("분석할 데이터가 아직 충분하지 않아요.")).not.toBeInTheDocument();
});

it("retains the server power-curve lock even when raw points are present", () => {
  const block = sufficiencyBlock({ featureId: "power_curve", viewId: "mobile", state: "locked", nextAction: { code: "record_power_ride" },
    requirements: [{ requirementId: "power_curve_points", kind: "count", satisfaction: "not_met", guarantee: "minimum", target: { value: 2, unit: "point" }, current: { value: 1, unit: "point" } }] });
  const fixture = { ...data, powerCurve: [{ durationSeconds: 5, maxPower: 500 }, { durationSeconds: 1200, maxPower: 200 }], activityWindowSufficiency: sufficiencySet([block]) };
  renderWithProviders(<MobileFitnessPage data={fixture} part="analysis" />);
  expect(screen.queryByRole("img", { name: /파워 커브 · 최근 28일/ })).not.toBeInTheDocument();
  expect(screen.getByTestId("K5-2-1-sufficiency")).toBeVisible();
  expect(block.state).toBe("locked");
});


it("keeps condition focused on current state and load without analysis and settings links", () => {
  renderWithProviders(<MobileFitnessPage data={data} part="condition" ridingEvidenceSlot={<p>activity details</p>} powerCurveEvidenceSlot={<p>comparison</p>} />);
  expect(document.getElementById("condition-current")).toBeVisible();
  expect(screen.queryByRole("navigation", { name: /컨디션/ })).not.toBeInTheDocument();
  expect(document.getElementById("condition-load")).toBeVisible();
  expect(screen.queryByText("activity details")).not.toBeInTheDocument();
  expect(screen.queryByText("comparison")).not.toBeInTheDocument();
  expect(screen.queryByTestId("K5-1-3")).not.toBeInTheDocument();
  expect(screen.queryByTestId("K5-5-1")).not.toBeInTheDocument();
  expect(screen.queryByTestId("K5-5-2")).not.toBeInTheDocument();
  expect(document.getElementById("ftp-decision")).toBeNull();
  expect(screen.queryByRole("link", { name: /수행 지표·기록 비교는 분석에서/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /훈련 기준 설정/ })).not.toBeInTheDocument();
});


it("shows the running pace curve once without the source-only distance record list", () => {
  const view = renderWithProviders(<MobileFitnessPage part="analysis" data={{ ...data, discipline: "run" }} runPaceCurve={{ recent28: [{ durationSec: 60, paceSecPerKm: 300 }], prev28: [{ durationSec: 60, paceSecPerKm: 320 }] }} runningRecordsSlot={<p>Original distance sources</p>} />);
  expect(view.container.querySelectorAll('[data-testid="K5-2-3"]')).toHaveLength(1);
  expect(screen.queryByText("Original distance sources")).not.toBeInTheDocument();
});

it("keeps model, FTP and evidence sections out of analysis unless an FTP decision is requested", () => {
  const pdcSufficiency = sufficiencySet([
    sufficiencyBlock(),
    sufficiencyBlock({ featureId: "power_model", viewId: "cp_w_prime" }),
    sufficiencyBlock({ featureId: "rider_profile", viewId: "profile" }),
    sufficiencyBlock({ featureId: "ftp_estimate", viewId: "current" }),
  ]);
  const view = renderWithProviders(<MobileFitnessPage data={{ ...data, pdcSufficiency }} part="analysis" />);
  for (const title of [/추정 지표와 산출 근거/, /훈련 기준 — FTP 판단/, /지표별 데이터 근거/, /해석과 근거/]) expect(screen.queryByText(title)).not.toBeInTheDocument();
  expect(document.getElementById("analysis-interpretation")).toBeNull();
  view.unmount();
  // FTP 제안 링크(#ftp-decision)로 들어오면 결정 영역을 연다.
  renderWithProviders(<MobileFitnessPage data={{ ...data, pdcSufficiency }} part="analysis" />, { route: "/ko/coach/analysis?sport=bike#ftp-decision" });
  expect(screen.getAllByText(/훈련 기준 — FTP 판단/).length).toBeGreaterThan(0);
});
