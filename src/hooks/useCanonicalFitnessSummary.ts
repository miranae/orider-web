import { useEffect, useRef, useState } from "react";
import type { UserFitness } from "@shared/types";
import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import type { FitnessProjection } from "@shared/types/goal";
import type { TrainingSummary } from "@shared/types/training-summary";
import { canonicalConsumersEnabled, fetchCanonicalFitnessSummary } from "../services/canonicalApi";
import { logClientError } from "../services/errorLogger";

type Sport = "bike" | "run" | "swim";
export interface CanonicalFitnessBundle {
  current: UserFitness;
  timeseries: Record<Sport, FitnessTimeseriesDoc | null>;
  projections: Record<Sport, FitnessProjection | null>;
  summaries: Record<Sport, TrainingSummary | null>;
}
export type FitnessReadStatus = "loading" | "canonical" | "stale" | "failed" | "unavailable";

/** One accepted bundle supplies all charts and totals; never merge a partial update into it. */
export function useCanonicalFitnessSummary(uid: string | undefined, reloadKey = 0) {
  const enabled = canonicalConsumersEnabled() && Boolean(uid);
  const [state, setState] = useState<{
    uid: string | undefined; data: CanonicalFitnessBundle | null; status: FitnessReadStatus;
  }>({ uid, data: null, status: "loading" });
  const lastGood = useRef<{ uid: string | undefined; data: CanonicalFitnessBundle | null }>({ uid, data: null });
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    if (lastGood.current.uid !== uid || !enabled) {
      lastGood.current = { uid, data: null };
      setState({ uid, data: null, status: "loading" });
    }
    if (!enabled) return;
    const load = async () => {
      const request = ++generation.current;
      try {
        const envelope = await fetchCanonicalFitnessSummary(uid);
        if (!active || request !== generation.current) return;
        // Optional per-sport documents may be null; this is not an admission validator.
        const candidate = envelope.data as unknown as CanonicalFitnessBundle | null;
        const complete = candidate?.current && candidate.timeseries && candidate.projections && candidate.summaries;
        const accepted = envelope.status === "canonical" && complete;
        if (accepted) lastGood.current = { uid, data: candidate };
        const data = lastGood.current.data;
        setState({ uid, data, status: accepted ? "canonical" : data ? "stale"
          : envelope.status === "processing" ? "loading"
            : envelope.status === "unavailable" ? "unavailable" : "failed" });
      } catch (error) {
        if (!active || request !== generation.current) return;
        logClientError("useCanonicalFitnessSummary", error);
        setState({ uid, data: lastGood.current.data, status: lastGood.current.data ? "stale" : "failed" });
      }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") void load(); }, 30_000);
    return () => { active = false; generation.current += 1; window.clearInterval(timer); };
  }, [enabled, uid, reloadKey]);

  return { enabled, ...(state.uid === uid && enabled ? state : { uid, data: null, status: "loading" as const }) };
}
