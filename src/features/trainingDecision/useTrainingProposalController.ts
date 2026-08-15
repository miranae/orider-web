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
  const createRequestId = useRef<{ decisionKey: string; value: string } | null>(null);
  const confirmRequestId = useRef<{ decisionKey: string; value: string } | null>(null);
  const prescriptionId = decision?.recommendationSource?.prescriptionId ?? null;
  const sourceRequestId = decision?.recommendationSource?.sourceRequestId ?? null;
  const decisionKey = decision ? `${decision.projectionId}:${prescriptionId ?? ""}:${sourceRequestId ?? ""}` : "unavailable";
  const activeDecisionKey = useRef(decisionKey);
  const hydrateGeneration = useRef(0);
  activeDecisionKey.current = decisionKey;
  const locallyEnabled = getRuntimeConfig().coachProgressPlannerEnabled === true;

  const hydrate = useCallback(async () => {
    if (activeDecisionKey.current !== decisionKey) return;
    const generation = ++hydrateGeneration.current;
    const isCurrent = () => activeDecisionKey.current === decisionKey && hydrateGeneration.current === generation;
    if (!locallyEnabled || !decision || !prescriptionId || !sourceRequestId) { setState("unavailable"); return; }
    setState("loading");
    try {
      const [capabilities, result] = await Promise.all([
        getCoachProgressPlannerCapabilities(), getCoachProgressProposalRecovery(prescriptionId, sourceRequestId),
      ]);
      if (!isCurrent()) return;
      if (result.status === "error") {
        logClientError("useTrainingProposalController.hydrate.response", new Error(result.error.code),
          { prescriptionId, code: result.error.code });
        setState(result.error.retryable ? "error" : "stale");
        return;
      }
      const value = result.data;
      setProposal(value.proposal); setReceipt(value.receipt); setNonce(value.confirmNonce); setRollbackRequestId(value.rollbackRequestId);
      const mapped = value.recoveryStatus === "not_found" ? "idle" : value.recoveryStatus === "pending" ? "pending"
        : value.recoveryStatus === "applied" ? "applied" : value.recoveryStatus === "reverted" ? "reverted"
          : value.reasonCode === "proposal_declined" ? "declined" : "stale";
      if ((mapped === "idle" || mapped === "pending") && !capabilities.progressPlanner.proposal.enabled) setState("unavailable");
      else setState(mapped);
    } catch (error) {
      if (!isCurrent()) return;
      logClientError("useTrainingProposalController.hydrate", error, { prescriptionId });
      setState("error");
    }
  }, [decision, decisionKey, locallyEnabled, prescriptionId, sourceRequestId]);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const create = useCallback(async () => {
    if (!decision || !sourceRequestId || state !== "idle") return;
    const operationDecisionKey = decisionKey;
    const isCurrent = () => activeDecisionKey.current === operationDecisionKey;
    const dates = decision.recommendedAdjustments.map((item) => item.recommendation.localDate);
    if (dates.length === 0) return;
    setState("busy");
    try {
      if (createRequestId.current?.decisionKey !== operationDecisionKey) {
        createRequestId.current = { decisionKey: operationDecisionKey, value: crypto.randomUUID() };
      }
      const requestId = createRequestId.current.value;
      const result = await createCoachProgressProposal({ requestId, checkInRequestId: sourceRequestId, localDates: dates });
      if (result.status === "error") {
        logClientError("useTrainingProposalController.create.response", new Error(result.error.code),
          { prescriptionId, requestId, code: result.error.code });
        if (isCurrent()) setState(result.error.retryable ? "error" : "stale");
        return;
      }
      if (!isCurrent()) return;
      await hydrate(); if (isCurrent()) onChanged();
    } catch (error) { logClientError("useTrainingProposalController.create", error, { prescriptionId }); if (isCurrent()) setState("error"); }
  }, [decision, decisionKey, hydrate, onChanged, prescriptionId, sourceRequestId, state]);

  const confirm = useCallback(async () => {
    if (!decision || !proposal || !nonce || state !== "pending") return;
    const operationDecisionKey = decisionKey;
    const isCurrent = () => activeDecisionKey.current === operationDecisionKey;
    setState("busy");
    try {
      if (confirmRequestId.current?.decisionKey !== operationDecisionKey) {
        confirmRequestId.current = { decisionKey: operationDecisionKey, value: crypto.randomUUID() };
      }
      const requestId = confirmRequestId.current.value;
      const result = await confirmCoachProgressProposal(proposal.proposalId, { requestId, nonce });
      if (result.status === "error") {
        logClientError("useTrainingProposalController.confirm.response", new Error(result.error.code),
          { prescriptionId, proposalId: proposal.proposalId, requestId, code: result.error.code });
        if (isCurrent()) setState(result.error.retryable ? "error" : "stale");
        return;
      }
      if (!isCurrent()) return;
      await hydrate(); if (isCurrent()) onChanged();
    } catch (error) { logClientError("useTrainingProposalController.confirm", error, { prescriptionId }); if (isCurrent()) setState("error"); }
  }, [decision, decisionKey, hydrate, nonce, onChanged, prescriptionId, proposal, state]);

  const rollback = useCallback(async () => {
    if (!decision || !proposal || !rollbackRequestId || state !== "applied") return;
    const operationDecisionKey = decisionKey;
    const isCurrent = () => activeDecisionKey.current === operationDecisionKey;
    setState("busy");
    try {
      const result = await rollbackCoachProgressProposal(proposal.proposalId, { requestId: rollbackRequestId });
      if (result.status === "error") {
        logClientError("useTrainingProposalController.rollback.response", new Error(result.error.code),
          { prescriptionId, proposalId: proposal.proposalId, requestId: rollbackRequestId, code: result.error.code });
        if (isCurrent()) setState(result.error.retryable ? "error" : "stale");
        return;
      }
      if (!isCurrent()) return;
      await hydrate(); if (isCurrent()) onChanged();
    } catch (error) { logClientError("useTrainingProposalController.rollback", error, { prescriptionId }); if (isCurrent()) setState("error"); }
  }, [decision, decisionKey, hydrate, onChanged, prescriptionId, proposal, rollbackRequestId, state]);

  const decline = useCallback(async () => {
    if (!decision || !proposal || state !== "pending") return;
    const operationDecisionKey = decisionKey;
    const isCurrent = () => activeDecisionKey.current === operationDecisionKey;
    setState("busy");
    try {
      const requestId = crypto.randomUUID();
      const result = await declineCoachProgressProposal(proposal.proposalId, { requestId, reasonCode: "keep_scheduled" });
      if (result.status === "error") {
        logClientError("useTrainingProposalController.decline.response", new Error(result.error.code),
          { prescriptionId, proposalId: proposal.proposalId, requestId, code: result.error.code });
        if (isCurrent()) setState(result.error.retryable ? "error" : "stale");
        return;
      }
      if (!isCurrent()) return;
      await hydrate(); if (isCurrent()) onChanged();
    } catch (error) { logClientError("useTrainingProposalController.decline", error, { prescriptionId }); if (isCurrent()) setState("error"); }
  }, [decision, decisionKey, hydrate, onChanged, prescriptionId, proposal, state]);

  return { state, proposal, receipt, create, confirm, decline, rollback, refresh: hydrate };
}
