import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityOverviewResponse } from "@shared/types/activity-overview";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityOverview } from "../services/activityOverview";
import { canonicalRolloutAllows, useCanonicalRollout } from "./useCanonicalRollout";

/**
 * 활동 개요 reader.
 *
 * 개요를 볼 수 있는지는 **활동의 공개설정**이 정하고, 그 판정은 서버(`getActivityOverview`)에만
 * 있다 — 공개 활동이면 비로그인도 본다. 여기서 소유권으로 다시 막지 않는다.
 *
 * `isOwner` 가 `null` 이면 **아직 활동을 못 읽어 소유권을 모른다** — 그때는 묻지 않는다.
 * 모름을 "남의 활동" 으로 접으면 활동 문서가 도착하기 전에 요청이 한 번 더 나간다.
 *
 * rollout 판정만 소유자 화면에서 쓴다. 남의 활동 개요의 판정 주체는 **소유자**이고 그 코호트는
 * 클라이언트가 계산할 수 없다 — 뷰어 코호트로 판정하면 소유자에게 켜진 면이 보는 사람마다
 * 꺼진다. 뷰어 경로는 서버가 `rollout_disabled` 로 답하게 둔다.
 */
export function useActivityOverview(activityId: string | undefined, isOwner: boolean | null, revision: string) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const services = useFirebaseServices();
  const rollout = useCanonicalRollout();
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "ko";
  const ownerGateAllows = !!uid && canonicalRolloutAllows(rollout, "activityDetail") && !(rollout.gateEnabled && rollout.loading);
  const allowed = !!activityId && isOwner !== null && (!isOwner || ownerGateAllows);
  const key = allowed ? JSON.stringify([uid, activityId, lang, revision]) : null;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; services: typeof services; response?: ActivityOverviewResponse; error?: boolean } | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!key || !activityId) return;
    let active = true;
    setState(null);
    void loadActivityOverview(services, uid, activityId, lang, revision, attempt > 0)
      .then((response) => { if (active) setState({ key, services, response }); })
      .catch(() => { if (active) setState({ key, services, error: true }); });
    return () => { active = false; };
  }, [key, uid, activityId, lang, revision, services, attempt]);
  const current = state?.key === key && state?.services === services ? state : null;
  return { enabled: allowed, loading: allowed && !current, response: current?.response ?? null, error: current?.error === true, retry };
}
