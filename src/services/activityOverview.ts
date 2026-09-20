import { httpsCallable } from "firebase/functions";
import type { ActivityOverviewResponse } from "@shared/types/activity-overview";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "./errorLogger";

const requests = new WeakMap<FirebaseServices, Map<string, { expires: number; promise: Promise<ActivityOverviewResponse> }>>();

/**
 * App Check 가 간헐적으로 거부하는 호출인가.
 *
 * 서버는 같은 토큰으로 다른 callable 은 통과시키면서 이 호출만 `UNAUTHENTICATED` 로 막는
 * 일이 있다(2026-09-20 운영 관측 — 같은 페이지에서 getActivityNarrative 는 200, 개요만 401,
 * 새로고침하면 정상). 토큰을 다시 확보하고 한 번 더 부르면 풀린다.
 *
 * 로그인 자체가 필요해서 나는 거부와 구분할 필요는 없다 — 개요는 비로그인도 부르는
 * 호출이라 `unauthenticated` 는 언제나 App Check 쪽 사정이다.
 */
function isAppCheckRejection(error: unknown): boolean {
  const code = typeof error === "object" && error !== null
    ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /unauthenticated/i.test(code) || /unauthenticated|app[- ]?check/i.test(message);
}

/**
 * 읽기만 수행한다. 게시·분석 생성 요청과 연결하지 않는다.
 *
 * `uid` 는 **요청을 낸 계정**이다(비로그인은 null). 응답을 쓰기 전과 후에 지금 로그인한 계정과
 * 같은지 확인해 계정이 바뀐 사이에 도착한 응답을 버린다 — 로그아웃도 계정 변경이다.
 *
 * App Check 거부는 **한 번 다시 부른다**. 남의 활동에서는 개요가 없을 때 카드를 조용히
 * 숨기므로, 이 실패를 그대로 두면 사용자에게 "개요가 그냥 없는 것" 으로 보이고 원인도 남지
 * 않는다. 재시도까지 실패하면 표준 로거에 남긴다.
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
    const call = async (): Promise<ActivityOverviewResponse> => {
      await services.ensureAppCheckReady();
      if (signedInUid() !== uid) throw new Error("account_changed");
      const result = await httpsCallable<{ activityId: string; lang: "ko" | "en" }, ActivityOverviewResponse>(services.functions, "getActivityOverview")({ activityId, lang });
      if (signedInUid() !== uid || result.data.activityId !== activityId) throw new Error("input_changed");
      return result.data;
    };
    try {
      return await call();
    } catch (error) {
      if (!isAppCheckRejection(error)) throw error;
      try {
        return await call();
      } catch (retryError) {
        logClientError("loadActivityOverview.appCheckRejected", retryError, { activityId, lang });
        throw retryError;
      }
    }
  })();
  cache.set(key, { expires: Date.now() + 30_000, promise });
  void promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key); });
  for (const [oldKey, entry] of cache) if (entry.expires <= Date.now()) cache.delete(oldKey);
  return promise;
}
