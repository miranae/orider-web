import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobileFitnessPage, { type MobileFitnessData } from "./MobileFitnessPage";
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../services/trainingDecisionContract.test";
import type { TodayTrainingDecisionState } from "../../hooks/useTodayTrainingDecision";

const baseDecision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
const decisionState = (overrides: Partial<TodayTrainingDecisionState> = {}): TodayTrainingDecisionState => ({
  decision: baseDecision, loading: false, scheduledOnly: false, unavailable: false, unavailableReason: null, refresh: vi.fn(), ...overrides,
});
const previewData: MobileFitnessData = {
  ctl: 12, atl: 10, tsb: 2,
  pmcHistory: [{ date: "2026-07-13", ctl: 10, atl: 9, tsb: 1 }, { date: "2026-07-14", ctl: 12, atl: 10, tsb: 2 }],
  weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
  threshold: null, hasLoadData: true, combinedLoad: null, loadFocus: null, cyclingAbility: null,
  runEvidence: { thresholdPaceSec: null, records: [] },
  swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
  zones: [], zoneSource: "none", discipline: "run",
};

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

describe("MobileFitnessPage tri", () => {
  beforeEach(() => {
    sportPerformanceSpy.mockClear();
    integratedLoadSpy.mockClear();
  });

  it("keeps all four sports available at narrow widths while the analysis control stays separate", () => {
    const css = readFileSync(join(process.cwd(), "src/components/mobile/MobileFitnessPage.css"), "utf8");
    expect(css).toContain('.mobile-fitness-toolbar__sports > [role="group"] { overflow-x: auto;');
    expect(css).toContain('.mobile-fitness-toolbar__sports > [role="group"] > button { min-width: 3.75rem; white-space: nowrap; }');
    expect(css).toContain('.mobile-fitness-toolbar__sports > [role="group"] > button { min-width: 2.75rem; }');
    expect(css).toContain('.mobile-fitness-toolbar__sports > [role="group"] > button:not(:first-child) { font-size: 0 !important; }');
    const { container } = renderWithProviders(<MobileFitnessPage data={previewData} />);
    expect(container.querySelector(".mobile-fitness-toolbar__sports [role='group']")).toHaveAccessibleName("종목 선택");
    expect(container.querySelector(".mobile-fitness-toolbar__sports .mobile-fitness-mode-toggle")).toBeNull();
    expect(container.querySelector(".mobile-fitness-toolbar > .mobile-fitness-mode-toggle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "심박존" })).not.toHaveAttribute("aria-pressed");
  });

  it("shows current status and today's entry before PMC, then keeps the full coach action after the chart", () => {
    const data = {
      ctl: 12, atl: 10, tsb: 2,
      pmcHistory: [
        { date: "2026-07-13", ctl: 10, atl: 9, tsb: 1 },
        { date: "2026-07-14", ctl: 12, atl: 10, tsb: 2 },
      ],
      weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
      threshold: null, hasLoadData: true, combinedLoad: null,
      loadFocus: { windowDays: 28, totalLoad: 0, buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 }, sourceLoad: { power: 0, heartRate: 0, unclassified: 0 }, disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 }, activityCount: 0, coveragePct: 0, confidence: "none", hasAnaerobicBikeDetail: false },
      cyclingAbility: null, runEvidence: { thresholdPaceSec: null, records: [] }, swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
      zones: [], zoneSource: "none", discipline: "bike",
    } satisfies MobileFitnessData;

    const { container } = renderWithProviders(
      <MobileFitnessPage data={data} todayDecisionState={decisionState()} coachSlot={<div id="fitness-coach-today">활동 영향과 오늘 선택</div>} />,
    );

    expect(screen.getByText("활동 영향과 오늘 선택")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "피트니스" })).toHaveClass("sr-only");
    const status = container.querySelector("[data-mobile-fitness-status]");
    expect(screen.getByRole("region", { name: "현재 상태" })).toBeInTheDocument();
    expect(status).toHaveTextContent("TSB 상태체력이 피로보다 높아요2.0");
    expect(status).not.toHaveTextContent("CTL");
    expect(status).not.toHaveTextContent("ATL");
    const coach = container.querySelector("[data-mobile-fitness-coach]");
    const pmc = container.querySelector("[data-pmc-chart]");
    expect(status!.compareDocumentPosition(pmc!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(coach).not.toBeNull();
    expect(pmc).not.toBeNull();
    expect(pmc!.compareDocumentPosition(coach!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const today = container.querySelector<HTMLElement>("#fitness-coach-today")!;
    today.scrollIntoView = vi.fn();
    expect(container.querySelector("[data-mobile-fitness-decision]")).toHaveAttribute("data-mobile-fitness-decision", "recommendation-pending");
    expect(screen.getByText("현재 실행안: 템포 · 60분")).toBeInTheDocument();
    expect(screen.getByText("조정 권고: 회복 · 미적용")).toBeInTheDocument();
    const todayLink = screen.getByRole("button", { name: "오늘 결정·실행안 보기 ↓" });
    expect(todayLink).toHaveStyle({ minHeight: "44px" });
    fireEvent.click(todayLink);
    expect(today.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("does not present default zeroes as observed status while current fitness is unavailable", () => {
    const data: MobileFitnessData = {
      ctl: 0, atl: 0, tsb: 0, pmcHistory: [], weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
      threshold: null, hasLoadData: false, combinedLoad: null, loadFocus: null, cyclingAbility: null,
      runEvidence: { thresholdPaceSec: null, records: [] },
      swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
      zones: [], zoneSource: "none", discipline: "run",
    };
    const { container } = renderWithProviders(<MobileFitnessPage data={data} sectionState={{ trend: "loading", derived: "loading" }} />);
    expect(container.querySelector("[data-mobile-fitness-status]")).toHaveTextContent("TSB 상태아직 계산할 기록이 없어요—");
    expect(container.querySelector("[data-mobile-fitness-decision]")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("피트니스 추이를 불러오는 중");
    expect(screen.queryByRole("button", { name: /오늘은 어떻게 이어갈까요/ })).not.toBeInTheDocument();
  });

  it.each([
    [-9.4, "피로가 체력보다 높아요", "-9.4"],
    [0, "체력과 피로가 비슷해요", "0.0"],
    [-0.04, "체력과 피로가 비슷해요", "0.0"],
  ] as const)("interprets TSB %s from the displayed value without prescribing a workout", (tsb, meaning, displayed) => {
    const { container } = renderWithProviders(<MobileFitnessPage data={{ ...previewData, tsb }} />);
    const status = container.querySelector("[data-mobile-fitness-status]");
    expect(status).toHaveTextContent(`TSB 상태${meaning}${displayed}`);
    expect(status?.children).toHaveLength(2);
  });

  it("does not show a permanent decision loading state on the embedded surface without a shared decision source", () => {
    const { container } = renderWithProviders(<MobileFitnessPage data={previewData} embedded />);
    expect(container.querySelector("[data-mobile-fitness-status]")).toBeInTheDocument();
    expect(container.querySelector("[data-mobile-fitness-decision]")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "피트니스" })).not.toBeInTheDocument();
  });

  it.each([
    ["signed-out", false, decisionState({ decision: null }), "로그인하면 오늘 계획을 확인할 수 있어요"],
    ["loading", true, decisionState({ decision: null, loading: true }), "오늘 계획을 확인하는 중"],
    ["disabled", true, decisionState({ decision: null, unavailableReason: "disabled" }), "오늘의 계획 기능이 아직 켜지지 않았어요"],
    ["error", true, decisionState({ decision: null, unavailableReason: "error" }), "오늘 계획을 불러오지 못했습니다"],
    ["unavailable", true, decisionState({ decision: null }), "오늘 계획을 확인할 수 없습니다"],
    ["health-stop", true, decisionState({ decision: { ...baseDecision, healthGate: { ...baseDecision.healthGate, state: "stop" } } }), "운동 중단 사유를 먼저 확인하세요"],
    ["no-scheduled", true, decisionState({ decision: { ...baseDecision, scheduledSessions: [], effectiveSessions: [], representativeSessionId: null } }), "오늘 예정된 세션이 없습니다"],
    ["applied", true, decisionState({ decision: { ...baseDecision, receipt: { status: "applied" } as NonNullable<typeof baseDecision.receipt> } }), "변경 적용됨"],
  ] as const)("shows the authoritative %s today state in the first-fold preview", (stateKey, signedIn, state, copy) => {
    const { container } = renderWithProviders(<MobileFitnessPage data={previewData} todayDecisionSignedIn={signedIn} todayDecisionState={state} coachSlot={<div id="fitness-coach-today">상세 결정</div>} />);
    expect(container.querySelector("[data-mobile-fitness-decision]")).toHaveAttribute("data-mobile-fitness-decision", stateKey);
    expect(container.querySelector("[data-mobile-fitness-decision]")).toHaveTextContent(copy);
    if (stateKey === "disabled") {
      const deferred = container.querySelector(".mobile-fitness-deferred-decision");
      expect(deferred).toContainElement(container.querySelector("[data-mobile-fitness-decision]"));
      expect(container.querySelector("[data-pmc-chart]")?.compareDocumentPosition(deferred!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    if (stateKey === "health-stop") {
      expect(container.querySelector("[data-mobile-fitness-decision]")).not.toHaveTextContent("조정 권고");
      expect(screen.getByRole("button", { name: "중단 사유 자세히 보기 ↓" })).toHaveStyle({ minHeight: "44px" });
    }
    if (stateKey === "error") expect(screen.getByRole("button", { name: "새로 확인" })).toHaveStyle({ minHeight: "44px" });
  });

  it("keeps the original plan clearly separate when a recommendation is not ready", () => {
    const decision = { ...baseDecision, mode: "scheduled-only" as const, recommendedAdjustments: [],
      fallback: { active: true, reasonCode: "prescription_not_ready" } };
    const { container } = renderWithProviders(<MobileFitnessPage data={previewData} todayDecisionState={decisionState({ decision })} />);
    expect(container.querySelector("[data-mobile-fitness-decision]")).toHaveAttribute("data-mobile-fitness-decision", "scheduled");
    expect(container.querySelector("[data-mobile-fitness-decision]")).toHaveTextContent("현재 실행안: 템포 · 60분");
    expect(container.querySelector("[data-mobile-fitness-decision]")).toHaveTextContent("오늘 처방이 아직 준비되지 않았어요");
    expect(container.querySelector("[data-mobile-fitness-decision]")).not.toHaveTextContent("조정 권고:");
  });

  it.each([
    ["tri", "통합 체력 추이 · 2일", "모든 종목의 훈련 부하 합산", "총 CTL"],
    ["bike", "사이클 체력 추이 · 2일", "사이클 활동 부하만 계산", "사이클 CTL"],
    ["run", "러닝 체력 추이 · 2일", "러닝 활동 부하만 계산", "러닝 CTL"],
    ["swim", "수영 체력 추이 · 2일", "수영 활동 부하만 계산", "수영 CTL"],
  ] as const)("scopes PMC copy, legend, tooltip, and aria to %s", (discipline, title, sub, ctlLabel) => {
    const data = {
      ctl: 12, atl: 10, tsb: 2,
      pmcHistory: [
        { date: "2026-07-13", ctl: 10, atl: 9, tsb: 1 },
        { date: "2026-07-14", ctl: 12, atl: 10, tsb: 2 },
      ],
      weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
      threshold: null, hasLoadData: true, combinedLoad: null,
      loadFocus: { windowDays: 28, totalLoad: 0, buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 }, sourceLoad: { power: 0, heartRate: 0, unclassified: 0 }, disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 }, activityCount: 0, coveragePct: 0, confidence: "none", hasAnaerobicBikeDetail: false },
      cyclingAbility: null, runEvidence: { thresholdPaceSec: null, records: [] }, swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
      zones: [], zoneSource: "none", discipline,
    } satisfies MobileFitnessData;

    const { container } = renderWithProviders(<MobileFitnessPage data={data} />);

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(sub)).toBeInTheDocument();
    expect(screen.getByText(ctlLabel)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: `${title}. ${sub}` })).toBeInTheDocument();

    const chartSvg = container.querySelector<SVGSVGElement>("[data-pmc-chart] svg");
    expect(chartSvg).not.toBeNull();
    fireEvent.pointerDown(chartSvg!, { clientX: 0 });
    expect(screen.getByText(`${ctlLabel} 10`)).toBeInTheDocument();
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

    renderWithProviders(<MobileFitnessPage data={data} coachSlot={<div>잘못된 통합 추천</div>} />);

    expect(screen.queryByTestId("sport-performance-card")).not.toBeInTheDocument();
    expect(sportPerformanceSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "통합" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "개요" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수영" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /오늘은 어떻게 이어갈까요/ })).not.toBeInTheDocument();
    expect(screen.queryByText("잘못된 통합 추천")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "통합 멀티스포츠 상태" })).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "파워존" }));
    expect(screen.getByRole("button", { name: "개요" })).not.toHaveAttribute("aria-pressed");

    rerender(<MobileFitnessPage data={{ ...base, discipline: "tri" } satisfies MobileFitnessData} />);
    expect(screen.queryByRole("button", { name: "개요" })).not.toBeInTheDocument();

    rerender(<MobileFitnessPage data={{ ...base, discipline: "run" } satisfies MobileFitnessData} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "심박존" })).not.toHaveAttribute("aria-pressed");
    });
    expect(screen.getByRole("group", { name: "종목 선택" })).toBeInTheDocument();
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

    const { container } = renderWithProviders(<MobileFitnessPage
      data={data}
      pmcHistoryPoints={[
        { date: "2026-07-13", ctl: 9, atl: 8, tsb: 1, dailyLoad: 20 },
        { date: "2026-07-14", ctl: 10, atl: 8, tsb: 2, dailyLoad: 25 },
      ]}
    />);
    expect(screen.getAllByTestId("integrated-load-card")).toHaveLength(1);
    expect(integratedLoadSpy).toHaveBeenCalledTimes(1);
    const history = container.querySelector(".pmc-history");
    expect(history).not.toBeNull();
    expect(history!.compareDocumentPosition(screen.getByTestId("integrated-load-card")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("renders active FTP evidence without a direct PDC apply action", () => {
    const data = {
      ctl: 42.1, atl: 48.3, tsb: -6.2, pmcHistory: [], weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
      threshold: { label: "FTP", value: "250", unit: "W", sub: "" }, ftp: 250, weightKg: 70, hasLoadData: true, combinedLoad: null,
      loadFocus: { windowDays: 28, totalLoad: 0, buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 }, sourceLoad: { power: 0, heartRate: 0, unclassified: 0 }, disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 }, activityCount: 0, coveragePct: 0, confidence: "none", hasAnaerobicBikeDetail: false },
      cyclingAbility: null, runEvidence: { thresholdPaceSec: null, records: [] }, swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
      zones: [], zoneSource: "none", discipline: "bike",
      pdcSummary: { riderType: { type: "Climber", confidence: 0.8 }, abilityScore: 82, vo2maxEst: 58.4, activityCount: 14,
        weightKgSnapshot: 70, version: 5, provenanceVersion: 2, measuredPower: true },
      thresholdDecision: { activeFtpW: 250, automaticCandidateW: 265, cpW: 270, recentTwentyMinuteW: 279, latestMonthlyEstimate: { period: "2026-07", ftpW: 265 }, tteMin: 45, activityCount: 14 },
      ftpProgression: [{ period: "2026-06", ftpW: 255, source: "20m" }, { period: "2026-07", ftpW: 265, source: "20m" }],
    } satisfies MobileFitnessData;

    renderWithProviders(<MobileFitnessPage data={data} />);

    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("3.57 W/kg")).toBeInTheDocument();
    expect(screen.queryByText(/CTL 42.1 · ATL 48.3 · TSB -6.2/)).not.toBeInTheDocument();
    expect(screen.getByText(/실험실 측정치 아님/)).toBeInTheDocument();
    expect(screen.getByText(/현재 적용 FTP 250W/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 후보 적용" })).not.toBeInTheDocument();
  });
});
