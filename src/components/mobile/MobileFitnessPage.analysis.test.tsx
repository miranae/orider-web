import IntegratedLoadCard from "./IntegratedLoadCard";
import { screen, within } from "@testing-library/react";
import type { BikeThresholdDecisionV2 } from "@shared/types/threshold";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import FitnessCoachBriefing from "../../features/fitness/components/FitnessCoachBriefing";
import MobileFitnessPage, { type MobileFitnessData } from "./MobileFitnessPage";
vi.mock("./SportPerformanceCard", () => ({ default: () => null }));
// 레이스 예측은 스테이지 전용이라 여기서는 배치만 본다.
vi.mock("../../features/fitness/RunningRaceEstimatesPanel", () => ({ default: () => <div data-testid="K5-6" /> }));
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
  it("orders the phone condition as status, today plan, trend, recent activities and goal", () => {
    renderWithProviders(<MobileFitnessPage data={data} part="condition" pmcHistoryPoints={[]}
      conditionTodayPlan={{ label: "스윗스팟 75분", planHref: "/coach/plan?sport=bike" }}
      conditionRecentActivities={[{ id: "a1", label: "어제 · 남산 업힐", load: 96 }, { id: "a2", label: "11/19 · 한강", load: null }]}
      conditionGoal={{ name: "가을 그란폰도", daysLeft: 27, planHref: "/coach/plan?sport=bike" }} conditionPendingAggregate />);
    const current = document.getElementById("condition-current")!;
    expect(within(current).getByText("집계 대기")).toBeVisible();
    const plan = screen.getByTestId("K1-1-3");
    expect(plan).toHaveTextContent("오늘 계획스윗스팟 75분계획 보기 ›");
    expect(plan).toHaveAttribute("href", expect.stringContaining("/coach/plan?sport=bike"));
    const recent = screen.getByTestId("K1-3");
    expect(within(recent).getByRole("link", { name: "어제 · 남산 업힐부하 96" })).toHaveAttribute("href", expect.stringContaining("/activity/a1"));
    expect(within(recent).getByRole("link", { name: "11/19 · 한강" })).toBeVisible();
    expect(within(recent).getByRole("link", { name: "더보기" })).toHaveAttribute("href", expect.stringContaining("/athlete/me/activities"));
    expect(screen.getByTestId("K1-2-6")).toHaveTextContent("가을 그란폰도 · D-27계획 ›");
    // 브라우저 계산 변화값·보기 전환은 휴대폰 컨디션에 두지 않는다.
    expect(screen.queryByRole("group", { name: "차트 보기" })).not.toBeInTheDocument();
    expect(screen.queryByText(/CTL \+/)).not.toBeInTheDocument();
    const order = [current, plan, document.getElementById("condition-trend")!, recent, screen.getByTestId("K1-2-6")];
    order.slice(1).forEach((node, index) => expect(order[index]!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
  });
  it("keeps only the plan link when no cached plan is available", () => {
    renderWithProviders(<MobileFitnessPage data={data} part="condition" conditionTodayPlan={{ label: null, planHref: "/coach/plan?sport=bike" }} />);
    expect(screen.getByTestId("K1-1-3")).toHaveTextContent(/^계획 보기 ›$/);
    expect(screen.queryByTestId("K1-3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("K1-2-6")).not.toBeInTheDocument();
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

  it("keeps a pending condition status separate from confirmed insufficient data", () => {
    renderWithProviders(<MobileFitnessPage data={{ ...data, hasLoadData: false }} part="condition" sectionState={{ trend: "loading", derived: "loading" }} />);
    const current = document.getElementById("condition-current")!;
    expect(current).toHaveTextContent("피트니스 추이를 불러오는 중…");
    expect(current).not.toHaveTextContent("아직 계산할 기록이 없어요");
  });



  it("draws only the shared coach analysis body on the analysis surface", () => {
    renderWithProviders(<MobileFitnessPage data={data} part="analysis" analysisSlot={<section data-testid="shared-analysis" />} ftpDecision={pendingDecision} />, { authenticated: true });
    expect(screen.getByRole("heading", { level: 1, name: "분석" })).toHaveAttribute("data-testid", "K5-0-1");
    expect(screen.getByTestId("shared-analysis")).toBeInTheDocument();
    // 예전 분석 본문(요약 카드 중복·데이터 근거 묶음·존 정의·28일 커브)은 그리지 않는다.
    for (const id of ["K5-sufficiency-group", "analysis-readiness-summary", "K5-3-1", "K5-2-1", "K5-5-1"]) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    expect(document.getElementById("ftp-decision")).toBeNull();
  });
  it("does not add the new evidence to legacy embedded all view", () => {
    renderWithProviders(<MobileFitnessPage data={data} embedded />);
    expect(screen.queryByTestId("K5-1-3")).not.toBeInTheDocument();
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



it("keeps condition focused on current state and load without analysis and settings links", () => {
  renderWithProviders(<MobileFitnessPage data={data} part="condition" ridingEvidenceSlot={<p>activity details</p>} powerCurveEvidenceSlot={<p>comparison</p>} />);
  expect(document.getElementById("condition-current")).toBeVisible();
  expect(screen.queryByRole("navigation", { name: /컨디션/ })).not.toBeInTheDocument();
  // 휴대폰 컨디션은 주간 부하를 추이 카드의 한 줄로 접어 둔다.
  expect(document.getElementById("condition-load")).toBeNull();
  expect(screen.queryByText("activity details")).not.toBeInTheDocument();
  expect(screen.queryByText("comparison")).not.toBeInTheDocument();
  expect(screen.queryByTestId("K5-1-3")).not.toBeInTheDocument();
  expect(screen.queryByTestId("K5-5-1")).not.toBeInTheDocument();
  expect(screen.queryByTestId("K5-5-2")).not.toBeInTheDocument();
  expect(document.getElementById("ftp-decision")).toBeNull();
  expect(screen.queryByRole("link", { name: /수행 지표·기록 비교는 분석에서/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /훈련 기준 설정/ })).not.toBeInTheDocument();
});



// 러닝 역치 페이스·수영 CSS 가 없다는 문구를 누르면 그 칸으로 간다.
describe("missing run/swim threshold resolution", () => {
  it.each([
    ["run", "러닝 역치 페이스가 설정되지 않았어요. 설정한 페이스가 있을 때 표시합니다.", "/settings/training?sport=run&focus=threshold-pace"],
    ["swim", "수영 임계 속도(CSS)가 설정되지 않았어요. 설정한 속도가 있을 때 표시합니다.", "/settings/training?sport=swim&focus=css"],
  ] as const)("makes the %s missing-threshold notice itself open its field", (discipline, label, href) => {
    // 코치 분석은 기준값 카드를 두지 않는다 — 카드가 그려지는 임베드 컨디션 지표에서 본다.
    renderWithProviders(<MobileFitnessPage data={{ ...data, discipline, threshold: null }} part="condition" embedded />);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", expect.stringContaining(href));
  });
});
