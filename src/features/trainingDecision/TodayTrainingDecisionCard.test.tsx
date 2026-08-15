import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../services/trainingDecisionContract.test";
import TodayTrainingDecisionCard from "./TodayTrainingDecisionCard";

const mocks = vi.hoisted(() => ({ hook: vi.fn(), coach: vi.fn(() => <button>코치 분석</button>) }));
vi.mock("../../hooks/useTodayTrainingDecision", () => ({ useTodayTrainingDecision: mocks.hook }));
vi.mock("../coach/CoachQuestionLauncher", () => ({ CoachQuestionLauncher: mocks.coach }));
vi.mock("./useTrainingProposalController", () => ({ useTrainingProposalController: () => ({ state: "unavailable", proposal: null }) }));

const user = { uid: "owner" } as never;

describe("TodayTrainingDecisionCard", () => {
  beforeEach(() => vi.clearAllMocks());
  it("separates the scheduled and recommended sessions from one projection", () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" /></MemoryRouter>);
    expect(screen.getByText("원래 계획")).toBeInTheDocument();
    expect(screen.getByText("조정 권고")).toBeInTheDocument();
    expect(screen.queryByText("계획 유지")).not.toBeInTheDocument();
    expect(screen.getByText("회복 권장")).toBeInTheDocument();
    expect(screen.getByText("최근 부하가 높은 상태예요")).toBeInTheDocument();
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

  it("does not offer proposal review when there are no actual adjustments", () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      recommendedAdjustments: [], loadAdjustment: { prescriptionStatus: "ready", classification: "normal",
        reasonCodes: [], recommendations: [] },
    }));
    mocks.hook.mockReturnValue({ decision, loading: false, scheduledOnly: false, unavailable: false, refresh: vi.fn() });
    render(<MemoryRouter><TodayTrainingDecisionCard user={user} discipline="bike" surface="plan" /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "변경안 만들기" })).not.toBeInTheDocument();
  });
});
