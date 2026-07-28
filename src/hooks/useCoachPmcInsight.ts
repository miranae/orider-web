import { useEffect, useRef, useState } from "react";
import {
  getCoachPmcInsight, isCoachClientError, type CoachDiscipline,
} from "../services/coachClient";
import { logClientError } from "../services/errorLogger";
import type { CoachPmcInsight } from "../services/coachPmcInsightContract";

export interface CoachPmcInsightState {
  insight: CoachPmcInsight | null;
  loading: boolean;
  unavailable: boolean;
}

interface InternalState extends CoachPmcInsightState { key: string }

export function useCoachPmcInsight(
  uid: string | undefined,
  discipline: CoachDiscipline,
  enabled: boolean,
): CoachPmcInsightState {
  const key = `${uid ?? "signed-out"}:${discipline}:${enabled ? "on" : "off"}`;
  const generationRef = useRef(0);
  const [state, setState] = useState<InternalState>({ key, insight: null, loading: enabled && Boolean(uid), unavailable: false });

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!uid || !enabled) {
      setState({ key, insight: null, loading: false, unavailable: false });
      return undefined;
    }
    setState({ key, insight: null, loading: true, unavailable: false });
    void getCoachPmcInsight(discipline).then(
      (insight) => {
        if (generationRef.current !== generation) return;
        setState({ key, insight, loading: false, unavailable: false });
      },
      (error: unknown) => {
        if (generationRef.current !== generation) return;
        logClientError("useCoachPmcInsight.load", error, {
          phase: "load",
          code: isCoachClientError(error) ? error.code : "unknown",
          discipline,
        });
        const unsupported = isCoachClientError(error) && error.kind === "http"
          && ["pmc_insight_unsupported", "not-found", "HTTP_404"].includes(error.code);
        setState({ key, insight: null, loading: false, unavailable: !unsupported });
      },
    );
    return () => { if (generationRef.current === generation) generationRef.current += 1; };
  }, [discipline, enabled, key, uid]);

  if (state.key !== key) return { insight: null, loading: enabled && Boolean(uid), unavailable: false };
  return { insight: state.insight, loading: state.loading, unavailable: state.unavailable };
}
