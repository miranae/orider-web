import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityOverviewResponse } from "@shared/types/activity-overview";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityOverview } from "../services/activityOverview";

/**
 * 활동 개요 reader.
 *
 * 개요를 볼 수 있는지는 **활동의 공개설정**이 정하고, 그 판정은 서버(`getActivityOverview`)에만
 * 있다 — 공개 활동이면 비로그인도 본다. 여기서 소유권으로 다시 막지 않는다.
 *
 * `ready` 는 **활동 문서가 도착해 이 경로의 활동임이 확인됐는가**다. 도착 전에 물으면 활동이
 * 로드되기 전에 요청이 한 번 나가고, revision 이 채워지면서 한 번 더 나간다.
 */
export function useActivityOverview(activityId: string | undefined, ready: boolean, revision: string) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const services = useFirebaseServices();
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "ko";
  const allowed = !!activityId && ready;
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
