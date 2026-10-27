import { useCallback, useEffect, useRef, useState } from "react";
import { startJourneyMeasurement, type JourneyEvent, type JourneySurface, type JourneyOperation, type JourneyOutcome } from "../services/journeyMeasurement";

/** scope/session stay in memory; only fixed dimensions reach the reporter. */
export function useJourneyReadiness(event: JourneyEvent, surface: JourneySurface, operation: JourneyOperation,
  enabled: boolean, scope: string, session: unknown, outcome: JourneyOutcome | null) {
  const [attempt, setAttempt] = useState(0);
  const active = useRef<ReturnType<typeof startJourneyMeasurement> | null>(null);
  const restart = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const finish = startJourneyMeasurement(event, surface, operation);
    active.current = finish;
    const hidden = () => { if (document.visibilityState === "hidden") { finish("cancelled"); active.current = null; } };
    document.addEventListener("visibilitychange", hidden); hidden();
    return () => { finish("cancelled"); if (active.current === finish) active.current = null; document.removeEventListener("visibilitychange", hidden); };
  }, [event, surface, operation, enabled, scope, session, attempt]);
  useEffect(() => {
    const finish = active.current;
    if (!finish || !outcome) return;
    let second = 0;
    // A committed result must survive one paint before being recorded as visible.
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => {
      if (active.current === finish && document.visibilityState !== "hidden") { finish(outcome); active.current = null; }
    }); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [event, surface, operation, outcome, enabled, scope, session, attempt]);
  return restart;
}

export function ownerAnalysisOutcome(input: {
  activityLoading: boolean; activityReady: boolean; error: boolean; processing: boolean;
  metricsStatus: string; inputPending?: boolean; inputCoverage?: string;
  overviewLoading: boolean; overviewStatus?: string; streamsLoading: boolean; streamsResolved: boolean;
  noSensor: boolean;
}): JourneyOutcome | null {
  if (input.error) return "error";
  if (input.activityLoading) return null;
  if (input.processing || input.inputPending || input.inputCoverage === "pending") return "pending";
  if (!input.activityReady) return null;
  if (input.metricsStatus === "loading" || input.overviewLoading || input.streamsLoading) return null;
  if (input.metricsStatus === "stale") return "stale";
  if (input.metricsStatus !== "ready" || input.overviewStatus !== "available") return "unavailable";
  if (!input.streamsResolved) return null;
  if (input.inputCoverage !== "complete") return "partial";
  return input.noSensor ? "no_sensor" : "success";
}
