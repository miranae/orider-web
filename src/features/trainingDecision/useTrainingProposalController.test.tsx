import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../services/trainingDecisionContract.test";
import { useTrainingProposalController } from "./useTrainingProposalController";

const mocks = vi.hoisted(() => ({ capabilities: vi.fn(), recovery: vi.fn(), create: vi.fn(), confirm: vi.fn(), log: vi.fn() }));
vi.mock("../../services/coachClient", () => ({
  getCoachProgressPlannerCapabilities: mocks.capabilities,
  getCoachProgressProposalRecovery: mocks.recovery,
  createCoachProgressProposal: mocks.create, confirmCoachProgressProposal: mocks.confirm,
  rollbackCoachProgressProposal: vi.fn(), declineCoachProgressProposal: vi.fn(),
}));
vi.mock("../../services/errorLogger", () => ({ logClientError: mocks.log }));

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
    await waitFor(() => expect(result.current.state).toBe("loading"));
    rerender({ decision: second });
    expect(result.current.state).toBe("loading");
    expect(result.current.proposal).toBeNull();
    await act(async () => { await result.current.confirm(); });
    expect(mocks.confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toBe("idle"));
    await act(async () => { oldRecovery.resolve({ status: "ok", data: { recoveryStatus: "pending", reasonCode: null,
      proposal: { proposalId: "proposal_stale" }, receipt: null, confirmNonce: "n".repeat(32), rollbackRequestId: null } }); });
    expect(result.current.state).toBe("idle");
    expect(result.current.proposal).toBeNull();
  });

  it("uses a new create request ID and ignores an old decision's late mutation failure", async () => {
    const oldCreate = deferred<Record<string, unknown>>();
    const first = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    const second = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      projectionId: "today_eeeeeeeeeeeeeeeeeeeeeeee",
      recommendationSource: { ...trainingDecisionEnvelope().data.recommendationSource!,
        sourceRequestId: "018f47a2-3c4d-7abc-8def-000000000202", prescriptionId: "rx_222222222222222222222222" },
      sourceRefs: { ...trainingDecisionEnvelope().data.sourceRefs, prescriptionId: "rx_222222222222222222222222" },
    }));
    mocks.recovery.mockResolvedValue({ status: "ok", data: { recoveryStatus: "not_found", reasonCode: null,
      proposal: null, receipt: null, confirmNonce: null, rollbackRequestId: null } });
    mocks.create.mockImplementation((request: { checkInRequestId: string }) => request.checkInRequestId === first.recommendationSource?.sourceRequestId
      ? oldCreate.promise : Promise.resolve({ status: "ok", data: {} }));
    const onChanged = vi.fn();
    const { result, rerender } = renderHook(({ decision }) => useTrainingProposalController(decision, onChanged), {
      initialProps: { decision: first },
    });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    let firstMutation!: Promise<void>;
    act(() => { firstMutation = result.current.create(); });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    rerender({ decision: second });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    await act(async () => { await result.current.create(); });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(mocks.create.mock.calls[0]?.[0].requestId).not.toBe(mocks.create.mock.calls[1]?.[0].requestId);
    await act(async () => {
      oldCreate.resolve({ status: "error", error: { code: "temporarily_unavailable", retryable: true } });
      await firstMutation;
    });
    expect(result.current.state).toBe("idle");
    expect(mocks.log).toHaveBeenCalledWith("useTrainingProposalController.create.response", expect.any(Error),
      expect.objectContaining({ code: "temporarily_unavailable" }));
  });
});
