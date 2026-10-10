import { useEffect, useRef, useState } from "react";
import type { PowerCurvePeriodsRequest, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadPowerCurvePeriods, validPowerCurvePeriodsRequest } from "../services/powerCurvePeriods";
import { logClientError } from "../services/errorLogger";
export interface PowerCurvePeriodsSelection { request: PowerCurvePeriodsRequest; requestId: number }
export function usePowerCurvePeriods(ownerUid: string | null | undefined, selection: PowerCurvePeriodsSelection | null, callableEnabled = false) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const owner = !!user && !user.isAnonymous && user.uid === ownerUid;
  const valid = !!selection && validPowerCurvePeriodsRequest(selection.request);
  const key = owner && valid && callableEnabled ? JSON.stringify([ownerUid, selection]) : null;
  const generation = useRef(0);
  const identity = useRef({ key, services });
  if (identity.current.key !== key || identity.current.services !== services) {
    identity.current = { key, services }; generation.current++;
  }
  const [result, setResult] = useState<{ key: string; services: typeof services; generation: number; response: PowerCurvePeriodsResponse | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!key || !ownerUid || !selection) return;
    const current = ++generation.current;
    let active = true;
    void loadPowerCurvePeriods(services, ownerUid, selection.request)
      .then(response => { if (active && generation.current === current) setResult({ key, services, generation: current, response, error: false }); })
      .catch(error => { if (active && generation.current === current) { logClientError("powerCurvePeriods.request", error, { periodCount: selection.request.periods.length }); setResult({ key, services, generation: current, response: null, error: true }); } });
    return () => { active = false; generation.current++; };
  }, [key, ownerUid, services, selection]);
  const current = result && result.key === key && result.services === services && result.generation === generation.current ? result : null;
  return { state: !owner ? "idle" : !callableEnabled ? "preparing" : !selection ? "idle" : !valid ? "invalid" : !current ? "loading" : current.error ? "error" : "ready",
    response: current?.response ?? null };
}
