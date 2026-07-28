import { useEffect, useRef, useState } from "react";
import { getCoachRiderInsight, isCoachClientError } from "../services/coachClient";
import { logClientError } from "../services/errorLogger";
import type { CoachRiderInsight } from "../services/coachRiderInsightContract";

export interface CoachRiderInsightState {
  insight: CoachRiderInsight | null;
  loading: boolean;
  unavailable: boolean;
}

interface InternalState extends CoachRiderInsightState { key: string }

export function useCoachRiderInsight(uid: string | undefined, enabled: boolean): CoachRiderInsightState {
  const key = `${uid ?? "signed-out"}:${enabled ? "on" : "off"}`;
  const generationRef = useRef(0);
  const [state, setState] = useState<InternalState>({ key, insight: null, loading: enabled && Boolean(uid), unavailable: false });
  useEffect(() => {
    const generation = ++generationRef.current;
    if (!uid || !enabled) {
      setState({ key, insight: null, loading: false, unavailable: false });
      return undefined;
    }
    setState({ key, insight: null, loading: true, unavailable: false });
    void getCoachRiderInsight().then(
      (insight) => { if (generationRef.current === generation) setState({ key, insight, loading: false, unavailable: false }); },
      (error: unknown) => {
        if (generationRef.current !== generation) return;
        logClientError("useCoachRiderInsight.load", error, { uid });
        const hidden = isCoachClientError(error) && error.kind === "http"
          && ["rider_insight_unsupported", "not-found", "HTTP_404"].includes(error.code);
        setState({ key, insight: null, loading: false, unavailable: !hidden });
      },
    );
    return () => { if (generationRef.current === generation) generationRef.current += 1; };
  }, [enabled, key, uid]);
  if (state.key !== key) return { insight: null, loading: enabled && Boolean(uid), unavailable: false };
  return { insight: state.insight, loading: state.loading, unavailable: state.unavailable };
}
