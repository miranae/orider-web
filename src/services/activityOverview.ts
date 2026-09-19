import { httpsCallable } from "firebase/functions";
import type { ActivityOverviewResponse } from "@shared/types/activity-overview";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";

const requests = new WeakMap<FirebaseServices, Map<string, { expires: number; promise: Promise<ActivityOverviewResponse> }>>();

/**
 * 읽기만 수행한다. 게시·분석 생성 요청과 연결하지 않는다.
 *
 * `uid` 는 **요청을 낸 계정**이다(비로그인은 null). 응답을 쓰기 전과 후에 지금 로그인한 계정과
 * 같은지 확인해 계정이 바뀐 사이에 도착한 응답을 버린다 — 로그아웃도 계정 변경이다.
 */
export function loadActivityOverview(services: FirebaseServices, uid: string | null, activityId: string, lang: "ko" | "en", revision: string, refresh = false): Promise<ActivityOverviewResponse> {
  const signedInUid = () => services.auth.currentUser?.uid ?? null;
  if (signedInUid() !== uid) return Promise.reject(new Error("account_changed"));
  let cache = requests.get(services);
  if (!cache) { cache = new Map(); requests.set(services, cache); }
  const key = JSON.stringify([uid, activityId, lang, revision]);
  const prior = cache.get(key);
  if (!refresh && prior && prior.expires > Date.now()) return prior.promise;
  const promise = (async () => {
    await services.ensureAppCheckReady();
    if (signedInUid() !== uid) throw new Error("account_changed");
    const result = await httpsCallable<{ activityId: string; lang: "ko" | "en" }, ActivityOverviewResponse>(services.functions, "getActivityOverview")({ activityId, lang });
    if (signedInUid() !== uid || result.data.activityId !== activityId) throw new Error("input_changed");
    return result.data;
  })();
  cache.set(key, { expires: Date.now() + 30_000, promise });
  void promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key); });
  for (const [oldKey, entry] of cache) if (entry.expires <= Date.now()) cache.delete(oldKey);
  return promise;
}
