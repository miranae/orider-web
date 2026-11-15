import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import i18n from "../../../i18n";
import type { BikeThresholdDecisionV2 } from "@shared/types/threshold";
import { FirebaseServicesProvider, type FirebaseServices } from "../../../contexts/FirebaseServicesContext";
import type { CanonicalFitnessSummaryState } from "../../../hooks/useCanonicalFitnessSummary";
import type { TrainingDecisionEnvelope } from "../../../services/trainingDecisionCanonicalContract";
import TrainingStatusCard from "../../../components/fitness/TrainingStatusCard";
import CyclingAbilityCard from "../../../components/fitness/CyclingAbilityCard";
import SportPerformanceCard from "../../../components/mobile/SportPerformanceCard";
import CriticalPaceCurve from "../../../components/charts/CriticalPaceCurve";
import CSSCurve from "../../../components/charts/CSSCurve";
import PlanGoalLoadSummary from "../../training/plan/PlanGoalLoadSummary";
import BikeFtpDecisionActionPanel from "./BikeFtpDecisionActionPanel";
import CanonicalFitnessNotice from "./CanonicalFitnessNotice";
import { FitnessZoneDistributions, type FitnessZoneEvidence } from "./FitnessZoneDistributions";
import RunRecordsSummary from "./RunRecordsSummary";

/**
 * 경고·알림 → 해결 연결(2차, 체력·코치·훈련): 이미 보이는 경고 문구 자체를 누르면 해소하는 곳으로 간다.
 * 새 버튼은 생기지 않고, 앱 임베드에서는 웹 설정 화면으로 보내지 않는다.
 */
const embedded = { scope: "embedded" } as unknown as FirebaseServices;
const web = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const inApp = (ui: ReactElement) => render(<MemoryRouter><FirebaseServicesProvider services={embedded}>{ui}</FirebaseServicesProvider></MemoryRouter>);
const hrefOf = (text: string | RegExp) => screen.getByText(text).closest("a")?.getAttribute("href") ?? null;
const buttonCount = () => document.querySelectorAll("button").length;

beforeEach(async () => { await i18n.changeLanguage("ko"); });

const ftpDecision: BikeThresholdDecisionV2 = {
  schemaVersion: 2,
  decisionId: "bike-ftp-1234567890abcdef1234567890abcdef",
  status: "blocked",
  blockReason: "increase_over_15_percent",
  candidate: { ftp: 300, currentFtp: 250, method: "pdc_cp_097", deltaW: 50, deltaPct: 20 },
  evidence: { activityId: "activity-1", activityRevision: "activity-r1", powerSource: "measured", pdcRevision: "pdc-r1" },
  expectedRevisions: { ftp: "ftp-r1", pdc: "pdc-r1", impactPreview: "impact-r1" },
  confidence: { level: "high", score: 0.9, reasons: ["measured_power"] },
  impactPreview: { revision: "impact-r1", effectiveFrom: "next_ride", workoutScalePct: 120 },
  createdAt: Date.now() - 1_000,
  expiresAt: Date.now() + 86_400_000,
} as BikeThresholdDecisionV2;

describe("BikeFtpDecisionActionPanel", () => {
  it("차단 문구를 누르면 FTP 테스트 칸으로 간다", () => {
    web(<BikeFtpDecisionActionPanel decision={ftpDecision} onAccept={vi.fn()} />);
    expect(hrefOf(/15%를 초과해 자동 변경을 중지했습니다/)).toContain("/settings/training?sport=bike&focus=ftp-test");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("앱 임베드에서는 글자 그대로 둔다", () => {
    inApp(<BikeFtpDecisionActionPanel decision={ftpDecision} onAccept={vi.fn()} />);
    expect(hrefOf(/15%를 초과해 자동 변경을 중지했습니다/)).toBeNull();
  });
});

function canonicalState(patch: Partial<CanonicalFitnessSummaryState>): CanonicalFitnessSummaryState {
  return { enabled: true, display: "empty", status: "unavailable", showingLastGood: false, retry: vi.fn(), ...patch } as unknown as CanonicalFitnessSummaryState;
}

describe("CanonicalFitnessNotice", () => {
  const t = ((key: string) => i18n.t(`fitness:${key}`)) as never;
  it("「계산할 데이터 없음」을 누르면 연결 화면으로 간다", () => {
    web(<CanonicalFitnessNotice state={canonicalState({ status: "unavailable" })} t={t} />);
    expect(hrefOf("계산할 데이터 없음")).toContain("/settings/connections");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("「갱신 대기」를 누르면 다시 확인한다(버튼은 늘지 않는다)", () => {
    const retry = vi.fn();
    web(<CanonicalFitnessNotice state={canonicalState({ status: "stale", retry })} t={t} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map(button => button.textContent)).toEqual(["갱신 대기"]);
    fireEvent.click(buttons[0]!);
    expect(retry).toHaveBeenCalledOnce();
  });
});

function emptyEnvelope(status: TrainingDecisionEnvelope["status"]): TrainingDecisionEnvelope {
  return { schemaVersion: 1, algorithmVersion: "training-decision@1", status, computedAt: null, inputRevision: "r1", inputDigest: "d1",
    period: null, data: null, error: status === "failed" ? { code: "call_failed", retryable: true } : null } as TrainingDecisionEnvelope;
}

describe("TrainingStatusCard", () => {
  it("불러오기 실패 문구를 누르면 다시 불러온다", () => {
    const onRetry = vi.fn();
    web(<TrainingStatusCard embedded tsb={-5} decision={emptyEnvelope("failed")} decisionDisplay="error" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "훈련 상태를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요." }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("활동이 없다는 문구를 누르면 연결 화면으로, 앱 임베드에서는 글자 그대로", () => {
    const { unmount } = web(<TrainingStatusCard embedded tsb={-5} decision={emptyEnvelope("unavailable")} decisionDisplay="empty" />);
    expect(hrefOf("훈련 상태를 계산할 활동이 아직 없습니다.")).toContain("/settings/connections");
    unmount();
    inApp(<TrainingStatusCard embedded tsb={-5} decision={emptyEnvelope("unavailable")} decisionDisplay="empty" />);
    expect(hrefOf("훈련 상태를 계산할 활동이 아직 없습니다.")).toBeNull();
  });
});

const zoneEvidence: FitnessZoneEvidence = {
  windowDays: 30, startTime: Date.UTC(2026, 8, 19), endTime: Date.UTC(2026, 9, 19),
  hr: { counts: null, total: 0, recordCount: 0, missingCount: 2, boundaries: null },
  power: { counts: null, total: 0, recordCount: 0, missingCount: 2 },
};

describe("FitnessZoneDistributions", () => {
  it("존 기록이 없다는 문구를 누르면 심박은 그 종목 LTHR 칸, 파워는 FTP 칸으로 간다", () => {
    web(<FitnessZoneDistributions evidence={zoneEvidence} discipline="run" />);
    const links = screen.getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(["확인 가능한 존 기록이 없습니다.", "확인 가능한 존 기록이 없습니다."]);
    expect(links[0]).toHaveAttribute("href", expect.stringContaining("/settings/training?sport=run&focus=lthr"));
    expect(links[1]).toHaveAttribute("href", expect.stringContaining("/settings/training?sport=bike&focus=ftp"));
  });

  it("종목을 모르면(남의 화면·임베드) 글자 그대로", () => {
    web(<FitnessZoneDistributions evidence={zoneEvidence} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("기록·근거 없음 문구", () => {
  const run = { thresholdPaceSec: null, records: [], unverifiedRecords: [] };
  it("러닝 분석 준비 문구를 누르면 연결 화면으로 간다", () => {
    web(<RunRecordsSummary evidence={run} readiness />);
    expect(hrefOf(/기록을 연결하고 훈련 기준을 설정해 주세요/)).toContain("/settings/connections");
  });

  it("사이클 실측 근거 없음 문구를 누르면 연결 화면으로 간다", () => {
    web(<CyclingAbilityCard compact cycling={null} />);
    expect(hrefOf("측정된 구간 근거 없음")).toContain("/settings/connections");
  });

  it("러닝 거리 기록 없음은 역치 페이스 칸, 수영 근거 부족은 CSS 칸으로 간다", () => {
    const swim = { windowDays: 28, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 };
    const { unmount } = web(<SportPerformanceCard discipline="run" cycling={null} run={run} swim={swim} />);
    expect(hrefOf("원본 적격성이 확인된 거리 기록이 없습니다.")).toContain("/settings/training?sport=run&focus=threshold-pace");
    unmount();
    web(<SportPerformanceCard discipline="swim" cycling={null} run={run} swim={swim} />);
    expect(hrefOf("실측 근거 부족 · 점수 미산출")).toContain("/settings/training?sport=swim&focus=css");
  });

  it("빈 페이스·CSS 곡선 문구를 누르면 연결 화면으로 간다", () => {
    const { unmount } = web(<CriticalPaceCurve />);
    expect(hrefOf("아직 표시할 데이터가 없어요")).toContain("/settings/connections");
    unmount();
    web(<CSSCurve />);
    expect(hrefOf("아직 표시할 데이터가 없어요")).toContain("/settings/connections");
  });

  it("앱 임베드에서는 연결 화면으로 보내지 않는다", () => {
    inApp(<CriticalPaceCurve />);
    expect(hrefOf("아직 표시할 데이터가 없어요")).toBeNull();
  });
});

describe("PlanGoalLoadSummary", () => {
  const scope = { range: { start: "2026-11-01", end: "2026-12-01" }, valid: true, goalDate: new Date("2026-12-01"), expired: false, remainingWeeks: 3 };
  const load = { state: "ready", summary: { plannedDayCount: 3, plannedTss: 200, actualTss: null, ratioPct: null, deltaTss: null, estimated: false, unknownCount: 2 }, retry: vi.fn() } as never;
  const wrap = (children: ReactNode) => <>{children}</>;
  it("부하 미확인 문구를 누르면 종목의 부하 기준값 칸으로 간다", () => {
    const before = buttonCount();
    web(wrap(<PlanGoalLoadSummary scope={scope} load={load} discipline="run" />));
    expect(hrefOf(/TSS가 미확인인 활동 2건/)).toContain("/settings/training?sport=run&focus=threshold-pace");
    expect(buttonCount()).toBe(before);
  });
});
