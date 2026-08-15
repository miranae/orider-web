import { useCallback, useEffect, useRef, useState } from "react";
import {
  confirmCoachProgressProposal, createCoachProgressProposal, getCoachProgressPlannerCapabilities,
  getCoachProgressProposalRecovery, rollbackCoachProgressProposal, declineCoachProgressProposal,
} from "../../services/coachClient";
import type { CoachChangeProposal, CoachChangeReceipt } from "../../services/coachProgressPlannerContract";
import type { TodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import { logClientError } from "../../services/errorLogger";

type State = "unavailable" | "loading" | "idle" | "pending" | "applied" | "reverted" | "declined" | "stale" | "busy" | "error";

export function useTrainingProposalController(decision: TodayTrainingDecisionProjection | null, onChanged: () => void) {
  const [state, setState] = useState<State>("loading");
  const [proposal, setProposal] = useState<CoachChangeProposal | null>(null);
  const [receipt, setReceipt] = useState<CoachChangeReceipt | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
  const [rollbackRequestId, setRollbackRequestId] = useState<string | null>(null);
  const createRequestId = useRef<string | null>(null);
  const confirmRequestId = useRef<string | null>(null);
  const prescriptionId = decision?.recommendationSource?.prescriptionId ?? null;
  const sourceRequestId = decision?.recommendationSource?.sourceRequestId ?? null;
  const locallyEnabled = getRuntimeConfig().coachProgressPlannerEnabled === true;

  const hydrate = useCallback(async () => {
    if (!locallyEnabled || !decision || !prescriptionId || !sourceRequestId) { setState("unavailable"); return; }
    setState("loading");
    try {
      const [capabilities, result] = await Promise.all([
        getCoachProgressPlannerCapabilities(), getCoachProgressProposalRecovery(prescriptionId, sourceRequestId),
      ]);
      if (result.status === "error") { setState(result.error.retryable ? "error" : "stale"); return; }
      const value = result.data;
      setProposal(value.proposal); setReceipt(value.receipt); setNonce(value.confirmNonce); setRollbackRequestId(value.rollbackRequestId);
      const mapped = value.recoveryStatus === "not_found" ? "idle" : value.recoveryStatus === "pending" ? "pending"
        : value.recoveryStatus === "applied" ? "applied" : value.recoveryStatus === "reverted" ? "reverted"
          : value.reasonCode === "proposal_declined" ? "declined" : "stale";
      if ((mapped === "idle" || mapped === "pending") && !capabilities.progressPlanner.proposal.enabled) setState("unavailable");
      else setState(mapped);
    } catch (error) {
      logClientError("useTrainingProposalController.hydrate", error, { prescriptionId });
      setState("error");
    }
  }, [decision, locallyEnabled, prescriptionId, sourceRequestId]);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const create = useCallback(async () => {
    if (!decision || !sourceRequestId || state !== "idle") return;
    const dates = decision.recommendedAdjustments.map((item) => item.recommendation.localDate);
    if (dates.length === 0) return;
    setState("busy");
    try {
      createRequestId.current ??= crypto.randomUUID();
      const result = await createCoachProgressProposal({ requestId: createRequestId.current, checkInRequestId: sourceRequestId, localDates: dates });
      if (result.status === "error") { setState(result.error.retryable ? "error" : "stale"); return; }
      await hydrate(); onChanged();
    } catch (error) { logClientError("useTrainingProposalController.create", error, { prescriptionId }); setState("error"); }
  }, [decision, hydrate, onChanged, sourceRequestId, state]);

  const confirm = useCallback(async () => {
    if (!decision || !proposal || !nonce || state !== "pending") return;
    setState("busy");
    try {
      confirmRequestId.current ??= crypto.randomUUID();
      const result = await confirmCoachProgressProposal(proposal.proposalId, { requestId: confirmRequestId.current, nonce });
      if (result.status === "error") { setState(result.error.retryable ? "error" : "stale"); return; }
      await hydrate(); onChanged();
    } catch (error) { logClientError("useTrainingProposalController.confirm", error, { prescriptionId }); setState("error"); }
  }, [decision, hydrate, nonce, onChanged, proposal, state]);

  const rollback = useCallback(async () => {
    if (!decision || !proposal || !rollbackRequestId || state !== "applied") return;
    setState("busy");
    try {
      const result = await rollbackCoachProgressProposal(proposal.proposalId, { requestId: rollbackRequestId });
      if (result.status === "error") { setState(result.error.retryable ? "error" : "stale"); return; }
      await hydrate(); onChanged();
    } catch (error) { logClientError("useTrainingProposalController.rollback", error, { prescriptionId }); setState("error"); }
  }, [decision, hydrate, onChanged, proposal, rollbackRequestId, state]);

  const decline = useCallback(async () => {
    if (!decision || !proposal || state !== "pending") return;
    setState("busy");
    try {
      const result = await declineCoachProgressProposal(proposal.proposalId,
        { requestId: crypto.randomUUID(), reasonCode: "keep_scheduled" });
      if (result.status === "error") { setState(result.error.retryable ? "error" : "stale"); return; }
      await hydrate(); onChanged();
    } catch (error) { logClientError("useTrainingProposalController.decline", error, { prescriptionId }); setState("error"); }
  }, [decision, hydrate, onChanged, prescriptionId, proposal, state]);

  return { state, proposal, receipt, create, confirm, decline, rollback, refresh: hydrate };
}
