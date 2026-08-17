import { useCallback, useEffect, useRef, useState } from "react";
import { getTodayTrainingDecision } from "../services/trainingDecisionClient";
import { currentTrainingRecommendation, type TodayTrainingDecisionProjection } from "../services/trainingDecisionContract";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { logClientError } from "../services/errorLogger";

interface State {
  decision: TodayTrainingDecisionProjection | null;
  loading: boolean;
  scheduledOnly: boolean;
  unavailable: boolean;
  /** 왜 없는지 — 롤아웃 미적용(disabled)과 실제 조회 실패(error)를 화면이 구분해야 한다. */
  unavailableReason: "disabled" | "error" | null;
  refresh: () => void;
}

export function nextTrainingDecisionExpiry(decision: TodayTrainingDecisionProjection, now = Date.now()): number {
  const pendingProposalExpiry = decision.proposal?.status === "pending" ? decision.proposalExpiresAt : null;
  const candidates = [decision.scheduledProjectionValidUntil, decision.recommendationValidUntil, pendingProposalExpiry]
    .filter((value): value is number => value !== null && value > now);
  return Math.min(...candidates);
}

export function useTodayTrainingDecision(uid: string | null | undefined,
  discipline: "bike" | "run" | "swim"): State {
  const generation = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<Omit<State, "refresh">>({
    decision: null, loading: Boolean(uid), scheduledOnly: true, unavailable: false, unavailableReason: null,
  });

  useEffect(() => {
    const currentGeneration = ++generation.current;
    const enabled = getRuntimeConfig().trainingDecisionEnabled === true;
    if (!uid || !enabled) {
      const disabled = Boolean(uid && !enabled);
      setState({ decision: null, loading: false, scheduledOnly: true, unavailable: disabled,
        unavailableReason: disabled ? "disabled" : null });
      return;
    }
    const controller = new AbortController();
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    setState((current) => ({ ...current, decision: null, loading: true, scheduledOnly: true, unavailable: false,
      unavailableReason: null }));
    void getTodayTrainingDecision(discipline, controller.signal).then((decision) => {
      if (generation.current !== currentGeneration || controller.signal.aborted) return;
      const now = Date.now();
      if (decision.scheduledProjectionValidUntil <= now) throw new Error("training decision scheduled projection expired");
      if (decision.proposal?.status === "pending" && decision.proposalExpiresAt !== null && decision.proposalExpiresAt <= now) {
        throw new Error("training decision pending proposal expired");
      }
      const scheduledOnly = !currentTrainingRecommendation(decision);
      setState({ decision, loading: false, scheduledOnly, unavailable: false, unavailableReason: null });
      const expiresAt = nextTrainingDecisionExpiry(decision, now);
      expiryTimer = setTimeout(() => {
        if (generation.current === currentGeneration && !controller.signal.aborted) {
          setRefreshKey((value) => value + 1);
        }
      }, Math.min(expiresAt - now + 25, 2_147_483_647));
    }).catch((error) => {
      if (generation.current !== currentGeneration || controller.signal.aborted) return;
      logClientError("useTodayTrainingDecision.load", error, { discipline });
      setState({ decision: null, loading: false, scheduledOnly: true, unavailable: true, unavailableReason: "error" });
    });
    return () => {
      controller.abort();
      if (expiryTimer !== null) clearTimeout(expiryTimer);
    };
  }, [uid, discipline, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  return { ...state, refresh };
}
