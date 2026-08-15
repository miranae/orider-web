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

  it("keeps the original plan but hides and blocks a pending recommendation during a health stop", () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      healthGate: { state: "stop", reasonCodes: ["self_reported_pain_or_illness"], sourceFreshness: "current" },
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
