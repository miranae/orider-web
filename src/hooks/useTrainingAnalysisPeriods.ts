import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrainingAnalysisPeriodsRequest, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadTrainingAnalysisPeriods, validTrainingAnalysisPeriodsRequest, trainingAnalysisPeriodsAvailable } from "../services/trainingAnalysisPeriods";
import { logClientError } from "../services/errorLogger";
export interface TrainingAnalysisPeriodsSelection { request: TrainingAnalysisPeriodsRequest; requestId: number }
export function useTrainingAnalysisPeriods(ownerUid: string | null | undefined, selection: TrainingAnalysisPeriodsSelection | null, callableEnabled = false) {
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const services = useFirebaseServices();
  const owner = !!user && !user.isAnonymous && user.uid === ownerUid;
  const valid = !!selection && validTrainingAnalysisPeriodsRequest(selection.request);
  const enabled = callableEnabled && trainingAnalysisPeriodsAvailable();
  const key = owner && valid && enabled ? JSON.stringify([ownerUid, selection, attempt]) : null;
  const request = useMemo<TrainingAnalysisPeriodsRequest | null>(() => key ? JSON.parse(key)[1].request : null, [key]);
  const inflight = useRef<{ key: string; services: typeof services; promise: Promise<TrainingAnalysisPeriodsResponse> } | null>(null);
  const generation = useRef(0);
  const identity = useRef({ key, services });
  if (identity.current.key !== key || identity.current.services !== services) {
    identity.current = { key, services }; generation.current++;
    inflight.current = null;
  }
  const [result, setResult] = useState<{ key: string; services: typeof services; generation: number; response: TrainingAnalysisPeriodsResponse | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!key || !ownerUid || !request) return;
    const current = ++generation.current;
    let active = true;
    if (!inflight.current || inflight.current.key !== key || inflight.current.services !== services) {
      inflight.current = { key, services, promise: loadTrainingAnalysisPeriods(services, ownerUid, request) };
    }
    void inflight.current.promise
      .then(response => { if (active && generation.current === current) setResult({ key, services, generation: current, response, error: false }); })
      .catch(error => { if (active && generation.current === current) { logClientError("trainingAnalysisPeriods.request", error, { periodCount: request.periods.length }); setResult({ key, services, generation: current, response: null, error: true }); } });
    return () => { active = false; generation.current++; };
  }, [key, ownerUid, services, request]);
  const current = result && result.key === key && result.services === services && result.generation === generation.current ? result : null;
  return { state: !owner ? "idle" : !enabled ? "preparing" : !selection ? "idle" : !valid ? "invalid" : !current ? "loading" : current.error ? "error" : "ready",
    response: current?.response ?? null, retry };
}
