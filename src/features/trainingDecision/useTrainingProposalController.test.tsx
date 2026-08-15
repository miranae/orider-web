import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../services/trainingDecisionContract.test";
import { useTrainingProposalController } from "./useTrainingProposalController";

const mocks = vi.hoisted(() => ({ capabilities: vi.fn(), recovery: vi.fn() }));
vi.mock("../../services/coachClient", () => ({
  getCoachProgressPlannerCapabilities: mocks.capabilities,
  getCoachProgressProposalRecovery: mocks.recovery,
  createCoachProgressProposal: vi.fn(), confirmCoachProgressProposal: vi.fn(),
  rollbackCoachProgressProposal: vi.fn(), declineCoachProgressProposal: vi.fn(),
}));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useTrainingProposalController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRuntimeConfigForTests({ coachProgressPlannerEnabled: true });
    mocks.capabilities.mockResolvedValue({ progressPlanner: { proposal: { enabled: true } } });
  });

  it("ignores a late recovery response from the previous decision", async () => {
    const oldRecovery = deferred<Record<string, unknown>>();
    const first = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    const second = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      projectionId: "today_eeeeeeeeeeeeeeeeeeeeeeee",
      recommendationSource: { ...trainingDecisionEnvelope().data.recommendationSource!,
        sourceRequestId: "018f47a2-3c4d-7abc-8def-000000000202", prescriptionId: "rx_222222222222222222222222" },
      sourceRefs: { ...trainingDecisionEnvelope().data.sourceRefs, prescriptionId: "rx_222222222222222222222222" },
    }));
    mocks.recovery.mockImplementation((prescriptionId: string) => prescriptionId === first.recommendationSource?.prescriptionId
      ? oldRecovery.promise : Promise.resolve({ status: "ok", data: { recoveryStatus: "not_found", reasonCode: null,
        proposal: null, receipt: null, confirmNonce: null, rollbackRequestId: null } }));

    const { result, rerender } = renderHook(({ decision }) => useTrainingProposalController(decision, vi.fn()), {
      initialProps: { decision: first },
    });
    rerender({ decision: second });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    await act(async () => { oldRecovery.resolve({ status: "ok", data: { recoveryStatus: "pending", reasonCode: null,
      proposal: { proposalId: "proposal_stale" }, receipt: null, confirmNonce: "n".repeat(32), rollbackRequestId: null } }); });
    expect(result.current.state).toBe("idle");
    expect(result.current.proposal).toBeNull();
  });
});
