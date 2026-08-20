import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../services/trainingDecisionContract.test";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";
import TodayTrainingDecisionCard from "./TodayTrainingDecisionCard";

const mocks = vi.hoisted(() => ({ hook: vi.fn(), coach: vi.fn(() => <button>코치 분석</button>),
  execution: vi.fn(() => <div>실행 패널</div>),
  legacy: vi.fn(() => <div>기존 오늘 운동</div>),
  proposal: { state: "unavailable", proposal: null, create: vi.fn(), confirm: vi.fn(), decline: vi.fn(), rollback: vi.fn(), refresh: vi.fn() } }));
vi.mock("../../hooks/useTodayTrainingDecision", () => ({ useTodayTrainingDecision: mocks.hook }));
vi.mock("../coach/CoachQuestionLauncher", () => ({ CoachQuestionLauncher: mocks.coach }));
vi.mock("./useTrainingProposalController", () => ({ useTrainingProposalController: () => mocks.proposal }));
vi.mock("./TrainingExecutionPanel", () => ({ TrainingExecutionPanel: (props: unknown) => mocks.execution(props) }));
vi.mock("../../components/training/TodaysWorkoutCard", () => ({ default: () => mocks.legacy() }));

const user = { uid: "owner" } as never;
const appliedRevision = { goalId: "goal_123", goalHash: `doc_${"a".repeat(32)}`,
  planRevision: `plan_${"b".repeat(24)}`, weeks: [{ weekId: "week_01", hash: `doc_${"c".repeat(32)}` }] };
const appliedReceipt = { schemaVersion: "coach-change-receipt-v1" as const, proposalId: `proposal_${"d".repeat(24)}`,
  auditId: `audit_${"e".repeat(24)}`, status: "applied" as const, appliedAt: "2026-08-15T00:02:00.000Z",
  beforeRevision: appliedRevision, afterRevision: { ...appliedRevision, goalHash: `doc_${"f".repeat(32)}` },
  providerCalls: 0 as const, quotaConsumed: 0 as const };

describe("TodayTrainingDecisionCard", () => {
  beforeEach(() => { vi.clearAllMocks(); resetRuntimeConfigForTests({ trainingDecisionEnabled: true });
    mocks.proposal = { state: "unavailable", proposal: null, create: vi.fn(), confirm: vi.fn(),
    decline: vi.fn(), rollback: vi.fn(), refresh: vi.fn() }; });
  it("keeps the existing workout card when the decision rollout is disabled", () => {
    resetRuntimeConfigForTests({ trainingDecisionEnabled: false });
    mocks.hook.mockReturnValue({ decision: null, loading: false, scheduledOnly: true, unavailable: true, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="plan" /></MemoryRouter>);
    expect(screen.getByText("기존 오늘 운동")).toBeInTheDocument();
    expect(mocks.legacy).toHaveBeenCalled();
  });
  it("keeps the existing Plan workout card when the decision API is unavailable", () => {
    mocks.hook.mockReturnValue({ decision: null, loading: false, scheduledOnly: true, unavailable: true, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="plan" /></MemoryRouter>);
    expect(screen.getByText("기존 오늘 운동")).toBeInTheDocument();
  });
  it("keeps the workout card when the decision only repeats the scheduled session", () => {
    // 판정이 예정 세션만 되풀이하면(처방 대기 등) 워크아웃 카드를 유지한다 — 그 카드에는 시작
    // CTA·AI 분석·완료 후 활동 보기가 있고, 판정 카드의 버튼은 추천이 있을 때만 나온다.
    // 예전에는 "판정이 있으면 판정 카드" 라서, 장애를 고치자 오히려 쓸 수 있는 기능이 줄었다.
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    const availability = vi.fn();
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: true, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="plan"
      onAvailabilityChange={availability} /></MemoryRouter>);

    expect(screen.getByText("기존 오늘 운동")).toBeInTheDocument();
    // 워크아웃 카드를 그렸다면 "판정 사용 가능" 이라고 알려선 안 된다 — 계획 화면이 그 신호로
    // 자체 복구 힌트를 끈다.
    expect(availability).toHaveBeenCalledWith(false);
  });

  it("still shows the decision card while a proposal is open, even without a live recommendation", () => {
    // 워크아웃 카드로 내려가면 대기 중인 제안을 확인·거절할 방법이 사라진다.
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    mocks.proposal = { state: "pending", proposal: null, create: vi.fn(), confirm: vi.fn(),
      decline: vi.fn(), rollback: vi.fn(), refresh: vi.fn() };
    mocks.hook.mockReturnValue({ decision: { ...decision, proposal: { proposalId: `proposal_${"d".repeat(24)}`,
      status: "pending" as const, expiresAt: "2026-08-15T01:00:00.000Z", confirmNonce: null } },
    loading: false, scheduledOnly: true, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="plan" /></MemoryRouter>);

    expect(screen.queryByText("기존 오늘 운동")).not.toBeInTheDocument();
  });

  it("shows what is missing and offers the weekly check-in when the prescription is held", () => {
    // 처방이 needs_checkin 이면 카드가 "준비되지 않았어요" 만 말하고 끝나서, 사용자가 막힌 이유도
    // 푸는 방법도 알 수 없었다. 서버는 missingSignals 로 정확히 무엇이 없는지 알려준다.
    const base = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    const decision = { ...base, prescription: { ...base.prescription, status: "needs_checkin" as const,
      missingSignals: ["subjective_fatigue", "soreness", "pain_or_illness"] },
    capabilities: { ...base.capabilities, checkIn: "available" as const } };
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: true, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="fitness" /></MemoryRouter>);

    expect(screen.getByText("주간 체크인이 필요해요")).toBeInTheDocument();
    expect(screen.getByText("주관적 피로도")).toBeInTheDocument();
    expect(screen.getByText("근육통")).toBeInTheDocument();
    expect(screen.getByText("통증 · 질병 여부")).toBeInTheDocument();
    expect(mocks.coach).toHaveBeenCalled();
  });

  it("does not offer the check-in when the server says it is unavailable", () => {
    // 열 수 없는 길을 안내하면 안 된다.
    const base = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    const decision = { ...base, prescription: { ...base.prescription, status: "needs_checkin" as const,
      missingSignals: ["subjective_fatigue"] },
    capabilities: { ...base.capabilities, checkIn: "unavailable" as const } };
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: true, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="fitness" /></MemoryRouter>);

    expect(screen.queryByText("주간 체크인이 필요해요")).not.toBeInTheDocument();
  });

  it.each(["home", "fitness", "plan"] as const)(
    "shows a low-confidence readiness warning before sessions on the %s surface without removing actions",
    (surface) => {
      const base = trainingDecisionEnvelope();
      const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
        prescription: { ...base.data.prescription, confidence: "low",
          missingSignals: ["readiness", "readiness_rhr", "readiness_hrv", "readiness_sleep", "readiness_stale"] },
      }));
      mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
      mocks.proposal = { ...mocks.proposal, state: "idle" };
      const { container } = render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike"
        surface={surface} /></MemoryRouter>);

      const warning = screen.getByText("일부 회복 신호를 확인하지 못했어요").closest(".ds-alert");
      const firstSession = container.querySelector("[data-session-role]");
      expect(warning).not.toBeNull();
      expect(firstSession).not.toBeNull();
      expect(warning!.compareDocumentPosition(firstSession!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      expect(screen.getByText("회복 준비도")).toBeInTheDocument();
      expect(screen.getByText("안정 시 심박수")).toBeInTheDocument();
      expect(screen.getByText("심박변이도")).toBeInTheDocument();
      expect(screen.getByText("수면 시간")).toBeInTheDocument();
      expect(screen.getByText("최신 회복 상태")).toBeInTheDocument();

      if (surface === "home") expect(mocks.execution).toHaveBeenCalled();
      if (surface === "fitness") expect(mocks.coach).toHaveBeenCalled();
      if (surface === "plan") expect(screen.getByRole("button", { name: "변경안 만들기" })).toBeInTheDocument();
    },
  );

  it.each([
    ["high", ["readiness"], "ready"],
    ["medium", ["readiness"], "ready"],
    ["low", [], "ready"],
    ["low", ["readiness"], "needs_checkin"],
  ] as const)("does not show the confidence warning for confidence=%s, gaps=%s, status=%s",
    (confidence, missingSignals, status) => {
      const base = trainingDecisionEnvelope();
      const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
        prescription: { ...base.data.prescription, confidence, missingSignals: [...missingSignals], status },
      }));
      mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
      render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="fitness" /></MemoryRouter>);

      expect(screen.queryByText("일부 회복 신호를 확인하지 못했어요")).not.toBeInTheDocument();
    });

  it("separates the scheduled and recommended sessions from one projection", () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    const { container } = render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);
    expect(container.querySelector('[data-session-layout="comparison"]'))
      .toHaveClass("training-decision-card__sessions--comparison");
    expect(screen.getByText("변경 권고 · 아직 미적용")).toBeInTheDocument();
    expect(screen.getByText("현재 실행안 · 원래 계획 기준")).toBeInTheDocument();
    expect(screen.getByText("조정 권고 · 아직 미적용")).toBeInTheDocument();
    expect(screen.getByText("권고 변화 -20분 · -45 TSS")).toBeInTheDocument();
    expect(screen.queryByText("계획 유지")).not.toBeInTheDocument();
    expect(screen.getByText("회복")).toBeInTheDocument();
    expect(screen.getByText("최근 부하가 높은 상태예요")).toBeInTheDocument();
    expect(mocks.coach).not.toHaveBeenCalled();

    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="fitness" /></MemoryRouter>);
    expect(mocks.coach).toHaveBeenCalledWith(expect.objectContaining({ progressPlannerSelection: { context: {
      prescriptionId: "rx_111111111111111111111111", sourceRequestId: "018f47a2-3c4d-7abc-8def-000000000201" }, question: expect.any(String) } }), undefined);
  });

  it("shows only the scheduled plan when the canonical recommendation is unavailable", () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ recommendationSource: null,
      recommendedAdjustments: [], loadAdjustment: null, mode: "scheduled-only", recommendationValidUntil: null,
      sourceRefs: { factsId: null, prescriptionId: null, snapshotRevision: null, planRevision: "plan_123", rulesVersion: null, proposalId: null, receiptAuditId: null },
      fallback: { active: true, reasonCode: "dependency_unavailable" } }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: true, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);
    expect(screen.getByText("오늘 예정된 계획")).toBeInTheDocument();
    expect(screen.queryByText("조정 권고")).not.toBeInTheDocument();
    expect(mocks.coach).not.toHaveBeenCalled();
    expect(screen.getByText("필요한 데이터를 일시적으로 불러오지 못했어요"))
      .toHaveAttribute("data-fallback-reason", "dependency_unavailable");
  });

  it("keeps a Home card with a retry when the decision API is unavailable", async () => {
    const refresh = vi.fn();
    mocks.hook.mockReturnValue({ decision: null, loading: false, scheduledOnly: true, unavailable: true,
      unavailableReason: "error", refresh });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);
    const card = document.querySelector("[data-training-decision-fallback]");
    expect(card).toHaveAttribute("data-training-decision-fallback", "unavailable");
    expect(screen.getByText("오늘 계획을 불러오지 못했습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /오늘 계획 보기/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "새로 확인" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("stays quiet on Home while the decision rollout is off", () => {
    mocks.hook.mockReturnValue({ decision: null, loading: false, scheduledOnly: true, unavailable: true,
      unavailableReason: "disabled", refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);
    expect(document.querySelector("[data-training-decision-fallback]"))
      .toHaveAttribute("data-training-decision-fallback", "disabled");
    expect(screen.queryByText("오늘 계획을 불러오지 못했습니다")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새로 확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /오늘 계획 보기/ })).toBeInTheDocument();
  });

  it("stays quiet when the decision is absent without a failure", () => {
    mocks.hook.mockReturnValue({ decision: null, loading: false, scheduledOnly: true, unavailable: false,
      unavailableReason: null, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);
    expect(document.querySelector("[data-training-decision-fallback]"))
      .toHaveAttribute("data-training-decision-fallback", "empty");
    expect(screen.queryByRole("button", { name: "새로 확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /오늘 계획 보기/ })).toBeInTheDocument();
  });

  it("shows the recommended intensity zone carried by the decision contract", () => {
    const base = trainingDecisionEnvelope();
    const adjustment = base.data.recommendedAdjustments[0]!;
    const decision = parseTodayTrainingDecisionProjection({ ...base, data: { ...base.data,
      recommendedAdjustments: [{ ...adjustment, recommendation: { ...adjustment.recommendation,
        workout: { ...adjustment.recommendation.workout!, zone: "Z2" } } }] } });
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="plan" /></MemoryRouter>);
    const recommended = document.querySelector("[data-session-role=\"recommended\"]");
    expect(within(recommended as HTMLElement).getByText("Z2 존")).toBeInTheDocument();
  });

  it("renders an applied Home decision from the effective session and scheduled baseline", () => {
    const base = trainingDecisionEnvelope();
    const effective = { ...base.data.effectiveSessions[0]!, current: { workout: "recovery" as const,
      durationMin: 40, targetTss: 25, completed: false }, basis: "applied_proposal" as const,
      appliedProposalId: appliedReceipt.proposalId };
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ mode: "applied-plan",
      effectiveSessions: [effective], proposal: { proposalId: appliedReceipt.proposalId, status: "applied",
        expiresAt: "2096-08-15T00:00:00.000Z", confirmNonce: null }, receipt: appliedReceipt,
      sourceRefs: { ...base.data.sourceRefs, proposalId: appliedReceipt.proposalId, receiptAuditId: appliedReceipt.auditId } }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    const { container } = render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "변경 적용됨" })).toBeInTheDocument();
    expect(container.querySelector('[data-session-layout="single"]'))
      .toHaveClass("training-decision-card__sessions--single");
    expect(screen.getByText("적용됨")).toBeInTheDocument();
    expect(screen.getByText("현재 실행안")).toBeInTheDocument();
    expect(screen.getByText("회복")).toBeInTheDocument();
    expect(screen.getByText("40분")).toBeInTheDocument();
    expect(screen.getByText("25 TSS")).toBeInTheDocument();
    expect(screen.getByText("권고 변화 -20분 · -45 TSS")).toBeInTheDocument();
    expect(screen.queryByText(/아직 미적용/u)).not.toBeInTheDocument();
    expect(screen.queryByText("조정 권고")).not.toBeInTheDocument();
  });

  it("does not expose an applied rest session as executable", () => {
    const base = trainingDecisionEnvelope();
    const restAdjustment = { ...base.data.recommendedAdjustments[0]!, recommendation: {
      ...base.data.recommendedAdjustments[0]!.recommendation, action: "rest" as const,
      workout: { kind: "rest" as const, durationMin: 0, targetTss: 0 },
    } };
    const effective = { ...base.data.effectiveSessions[0]!, current: { workout: "rest" as const,
      durationMin: 0, targetTss: 0, completed: false }, basis: "applied_proposal" as const,
      appliedProposalId: appliedReceipt.proposalId };
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ mode: "applied-plan",
      recommendedAdjustments: [restAdjustment],
      loadAdjustment: { ...base.data.loadAdjustment!, recommendations: [restAdjustment] }, effectiveSessions: [effective],
      proposal: { proposalId: appliedReceipt.proposalId, status: "applied",
        expiresAt: "2096-08-15T00:00:00.000Z", confirmNonce: null }, receipt: appliedReceipt,
      sourceRefs: { ...base.data.sourceRefs, proposalId: appliedReceipt.proposalId, receiptAuditId: appliedReceipt.auditId } }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);
    expect(mocks.execution).toHaveBeenCalledWith(expect.objectContaining({ sessions: [] }));
  });

  it("marks an omitted recommended TSS as pending instead of copying the scheduled load", () => {
    const base = trainingDecisionEnvelope();
    const adjustment = { ...base.data.recommendedAdjustments[0]!, recommendation: {
      ...base.data.recommendedAdjustments[0]!.recommendation,
      workout: { kind: "recovery" as const, durationMin: 40, zone: "Z1" as const },
    } };
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      recommendedAdjustments: [adjustment],
      loadAdjustment: { ...base.data.loadAdjustment!, recommendations: [adjustment] },
    }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    const { container } = render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);
    const recommended = container.querySelector('[data-session-role="recommended"]')!;
    expect(within(recommended as HTMLElement).getByText("TSS 산정 전")).toBeInTheDocument();
    expect(within(recommended as HTMLElement).queryByText("70 TSS")).not.toBeInTheDocument();
    expect(screen.getByText("권고 변화 -20분 · TSS 산정 전")).toBeInTheDocument();
  });

  it("passes every effective Home session to the execution panel", () => {
    const base = trainingDecisionEnvelope();
    const secondScheduled = { ...base.data.scheduledSessions[0]!, sessionId: "ss_eeeeeeeeeeeeeeeeeeeeeeee",
      scheduledSessionId: "ss_eeeeeeeeeeeeeeeeeeeeeeee", scheduledSessionRevision: "ssr_ffffffffffffffffffffffff",
      sessionRevision: "ssr_ffffffffffffffffffffffff", planItemId: "item_456" };
    const second = { ...secondScheduled, basis: "scheduled" as const, appliedProposalId: null };
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      effectiveSessions: [...base.data.effectiveSessions, second],
      scheduledSessions: [...base.data.scheduledSessions, secondScheduled],
    }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);
    expect(mocks.execution).toHaveBeenCalledWith(expect.objectContaining({ sessions: decision.effectiveSessions }));
  });

  it("shows a reassessment recommendation without exposing the original session as executable", () => {
    const base = trainingDecisionEnvelope();
    const reassessment = { sessionId: base.data.representativeSessionId!, recommendation: {
      localDate: base.data.localDate, action: "reassess" as const, reasonCodes: ["form_gate_before_intensity"],
      evidenceIds: [], reassessBefore: [],
    } };
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      recommendedAdjustments: [reassessment],
      loadAdjustment: { ...base.data.loadAdjustment!, reasonCodes: ["form_gate_before_intensity"], recommendations: [reassessment] },
    }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "변경 권고 · 아직 미적용" })).toBeInTheDocument();
    expect(screen.getByText("상태 확인 필요")).toBeInTheDocument();
    expect(screen.getByText("강도 운동 전 폼 확인이 필요해요")).toBeInTheDocument();
    expect(mocks.execution).toHaveBeenCalledWith(expect.objectContaining({ sessions: [] }));
  });

  it("blocks only the session that has a rest or reassessment recommendation", () => {
    const base = trainingDecisionEnvelope();
    const secondScheduled = { ...base.data.scheduledSessions[0]!, sessionId: "ss_eeeeeeeeeeeeeeeeeeeeeeee",
      scheduledSessionId: "ss_eeeeeeeeeeeeeeeeeeeeeeee", scheduledSessionRevision: "ssr_ffffffffffffffffffffffff",
      sessionRevision: "ssr_ffffffffffffffffffffffff", planItemId: "item_456" };
    const second = { ...secondScheduled, basis: "scheduled" as const, appliedProposalId: null };
    const reassessment = { sessionId: second.sessionId, recommendation: { localDate: second.localDate,
      action: "reassess" as const, reasonCodes: ["form_gate_before_intensity"], evidenceIds: [], reassessBefore: [] } };
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledSessions: [...base.data.scheduledSessions, secondScheduled],
      effectiveSessions: [...base.data.effectiveSessions, second],
      recommendedAdjustments: [base.data.recommendedAdjustments[0]!, reassessment],
      loadAdjustment: { ...base.data.loadAdjustment!, recommendations: [base.data.recommendedAdjustments[0]!, reassessment] },
    }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);
    expect(mocks.execution).toHaveBeenCalledWith(expect.objectContaining({
      sessions: [expect.objectContaining({ sessionId: base.data.representativeSessionId })],
    }));
  });

  it("does not offer proposal review when there are no actual adjustments", () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      recommendedAdjustments: [], loadAdjustment: { prescriptionStatus: "ready", classification: "normal",
        reasonCodes: [], recommendations: [] },
    }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="plan" /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "변경안 만들기" })).not.toBeInTheDocument();
  });

  it("keeps pending proposal actions enabled in DOM and keyboard order", async () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    mocks.proposal = { ...mocks.proposal, state: "pending" };
    const { container } = render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="plan" /></MemoryRouter>);
    const actions = container.querySelector(".training-decision-proposal__actions")!;
    const buttons = within(actions).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["이 변경 적용", "원래 계획 유지"]);
    expect(buttons.map((button) => ({ disabled: button.hasAttribute("disabled"), tabIndex: button.tabIndex })))
      .toEqual([{ disabled: false, tabIndex: 0 }, { disabled: false, tabIndex: 0 }]);
    buttons[0]!.focus();
    expect(buttons[0]).toHaveFocus();
    await userEvent.tab();
    expect(buttons[1]).toHaveFocus();
  });

  it("does not show or apply an expired recommendation from a pending proposal", () => {
    const base = trainingDecisionEnvelope();
    const proposalId = `proposal_${"d".repeat(24)}`;
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      recommendationValidUntil: Date.now() - 1,
      proposal: { proposalId, status: "pending", expiresAt: "2096-08-15T00:00:00.000Z",
        confirmNonce: "n".repeat(32) },
      sourceRefs: { ...base.data.sourceRefs, proposalId },
    }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: true, unavailable: false, refresh: vi.fn() });
    mocks.proposal = { ...mocks.proposal, state: "pending", proposal: { changes: [{ weekId: "week_01", dayIndex: 2,
      localDate: "2026-08-15", before: { workout: { kind: "tempo", durationMin: 60 } },
      workout: { kind: "recovery", durationMin: 40 } }] } } as never;
    const { container } = render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="plan" /></MemoryRouter>);
    expect(container.querySelector(".training-decision-proposal__change")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 변경 적용" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "원래 계획 유지" })).toBeInTheDocument();
  });

  it("keeps the original plan but hides and blocks a pending recommendation during a health stop", () => {
    const base = trainingDecisionEnvelope();
    const proposalId = `proposal_${"d".repeat(24)}`;
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      healthGate: { state: "stop", reasonCodes: ["self_reported_pain_or_illness"], sourceFreshness: "current" },
      proposal: { proposalId, status: "pending", expiresAt: "2096-08-15T00:00:00.000Z",
        confirmNonce: "n".repeat(32) },
      sourceRefs: { ...base.data.sourceRefs, proposalId },
    }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    mocks.proposal = { ...mocks.proposal, state: "pending" };
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="plan" /></MemoryRouter>);
    expect(screen.getByText(/운동 중단 사유가 있습니다/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "오늘 예정된 계획" })).toBeInTheDocument();
    expect(screen.queryByText("조정 권고")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 변경 적용" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "원래 계획 유지" })).toBeInTheDocument();
    expect(mocks.proposal.confirm).not.toHaveBeenCalled();
  });

  it.each([
    ["pending", "승인 대기", "이 변경 적용"], ["applied", "적용됨", "원래 계획으로 되돌리기"],
    ["declined", "원래 계획 유지", "원래 계획을 유지했습니다."], ["stale", "새 검토 필요", "새로 확인"],
  ] as const)("announces and exposes only the %s proposal action", (state, announcement, action) => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ capabilities: {
      ...trainingDecisionEnvelope().data.capabilities, rollback: "available",
    } }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    mocks.proposal = { ...mocks.proposal, state };
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="plan" /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent(announcement);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status").querySelector("button, a, input, select")).toBeNull();
    expect(screen.getByText(action)).toBeInTheDocument();
    expect(document.querySelector("[data-proposal-state]" )).toHaveAttribute("data-proposal-state", state);
  });
});
