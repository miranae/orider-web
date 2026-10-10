import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityRangeAnalysisResponse } from "@shared/types/activity-range-analysis";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityRangeAnalysis, validRangeRequest } from "../services/activityRangeAnalysis";

export interface ActivityRangeSelection {
  startOffsetSec: number;
  endOffsetSec: number;
  /** 사용자 선택마다 새 ID. 같은 범위를 다시 골라도 오래된 요청과 구분한다. */
  requestId: string;
}
export interface ActivityRangeAnalysisOptions {
  activityId: string | undefined;
  ownerUid: string | null | undefined;
  selection: ActivityRangeSelection | null;
  /** 활동·센서·개인정보 정본의 변경 식별자. 서버 opaque revision과 별개다. */
  inputIdentity: string;
  expectedInputRevision?: string;
  /** 배포 확인 전에는 false. 이 훅이 아직 없는 API를 available로 꾸미지 않는다. */
  callableEnabled?: boolean;
}

export function useActivityRangeAnalysis({ activityId, ownerUid, selection, inputIdentity, expectedInputRevision, callableEnabled = false }: ActivityRangeAnalysisOptions) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const uid = user?.uid;
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const startOffsetSec = selection?.startOffsetSec, endOffsetSec = selection?.endOffsetSec, requestId = selection?.requestId;
  const request = activityId && selection ? { activityId, startOffsetSec: selection.startOffsetSec,
    endOffsetSec: selection.endOffsetSec, ...(expectedInputRevision ? { expectedInputRevision } : {}) } : null;
  const owner = !!uid && !!ownerUid && uid === ownerUid && !user?.isAnonymous;
  const valid = !!request && !!selection?.requestId && validRangeRequest(request);
  const allowed = owner && valid && callableEnabled;
  const key = allowed ? JSON.stringify([uid, activityId, selection?.requestId, selection?.startOffsetSec,
    selection?.endOffsetSec, inputIdentity, expectedInputRevision, attempt]) : null;
  const generationRef = useRef(0);
  const identityRef = useRef({ key, services });
  if (identityRef.current.key !== key || identityRef.current.services !== services) {
    identityRef.current = { key, services };
    generationRef.current += 1;
  }
  const [result, setResult] = useState<{ generation: number; key: string; services: typeof services; response: ActivityRangeAnalysisResponse | null; reason: string | null } | null>(null);
  useEffect(() => {
    if (!key || !uid || !activityId || startOffsetSec == null || endOffsetSec == null) return;
    const generation = ++generationRef.current;
    let active = true;
    const payload = { activityId, startOffsetSec, endOffsetSec,
      ...(expectedInputRevision ? { expectedInputRevision } : {}) };
    void loadActivityRangeAnalysis(services, uid, payload)
      .then(response => { if (active && generationRef.current === generation) setResult({ generation, key, services, response, reason: null }); })
      .catch(error => { if (active && generationRef.current === generation) setResult({ generation, key, services, response: null,
        reason: typeof error === "object" && error !== null && "code" in error
          && /not-found|unimplemented/u.test(String(error.code)) ? "api_unavailable" : "request_failed" }); });
    return () => { active = false; generationRef.current += 1; };
  }, [key, services, uid, activityId, requestId, startOffsetSec, endOffsetSec, expectedInputRevision]);
  const current = key && result?.key === key && result.services === services && result.generation === generationRef.current ? result : null;
  const response = current?.response ?? null;
  const state = !owner || !selection ? "idle" : !valid || !callableEnabled ? "unavailable"
    : !current ? "loading" : response?.state ?? "unavailable";
  return { state, response, metrics: response?.state === "available" ? response.metrics : null,
    reason: !owner || !selection ? null : !valid ? "invalid_selection" : !callableEnabled ? "api_unavailable"
      : current?.reason ?? response?.reason ?? null, retry };
}
