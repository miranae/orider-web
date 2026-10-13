import { onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { CustomProvider } from "firebase/app-check";
import { STAGE_QA_APP_CHECK_APP_ID, STAGE_QA_APP_CHECK_ENDPOINT, STAGE_QA_APP_CHECK_ORIGIN, STAGE_QA_APP_CHECK_SESSION_MS, STAGE_QA_APP_CHECK_TOKEN_MS, type StageDelegatedQaAppCheckResponse } from "@shared/types/stage-delegated-qa-appcheck";
import { getRuntimeConfig } from "./runtimeConfig";
const PARAM = "stageQaAppCheckGrant";
let requested = false;
let handle: string | null = null;
let session: ReturnType<typeof createStageQaAppCheckSession> | null = null;
const denied = (): never => { throw new Error("stage-qa/session-denied"); };
export function extractStageQaGrant(url: URL): { requested: boolean; handle: string | null; url: string } {
  const parts = url.hash.slice(1).split("&");
  const matches = parts.filter(part => new URLSearchParams(part).has(PARAM));
  const query = url.searchParams.has(PARAM);
  const value = matches.length === 1 ? new URLSearchParams(matches[0]).get(PARAM) : null;
  const candidate = !query && typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
  if (matches.length) url.hash = parts.filter(part => !new URLSearchParams(part).has(PARAM)).join("&");
  url.searchParams.delete(PARAM);
  return { requested: query || matches.length > 0, handle: candidate, url: url.toString() };
}
/** tracker 설치 전에 fragment만 제거한다. grant/token을 저장소·window에 노출하지 않는다. */
export function stashStageQaAppCheckGrant(): void {
  if (typeof window === "undefined") return;
  const result = extractStageQaGrant(new URL(window.location.href));
  if (!result.requested) return;
  requested = true; handle = result.handle;
  window.history.replaceState(window.history.state, "", result.url);
}
export function hasStageQaAppCheckGrant(): boolean { return requested; }
export function assertStageQaConfig(): void {
  const config = getRuntimeConfig();
  if (typeof window === "undefined" || window.location.origin !== STAGE_QA_APP_CHECK_ORIGIN || config.appEnvironment !== "stage"
    || config.firebaseProjectId !== "miranae-orider-g1" || config.firebaseAppId !== STAGE_QA_APP_CHECK_APP_ID
    || config.firebaseFunctionsBase !== "https://asia-northeast3-orider-dev.cloudfunctions.net") denied();
}
export function createStageQaAppCheckSession(auth: Auth, opaqueHandle: string, transport: typeof fetch = fetch, now: () => number = Date.now) {
  let boundUser: User | null = null, authTime: unknown, delegatedBy: string | null = null;
  let invalid = false, expiresAt = now() + STAGE_QA_APP_CHECK_SESSION_MS;
  let receipt: StageDelegatedQaAppCheckResponse | null = null;
  let flight: Promise<{ token: string; expireTimeMillis: number }> | null = null;
  let firstToken = true;
  async function validate() {
    try {
    if (invalid || now() >= expiresAt) denied();
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user || user.isAnonymous || boundUser && user !== boundUser) denied();
    if (!boundUser) {
      boundUser = user;
      let firstEvent = true;
      onAuthStateChanged(auth, current => {
        if (current !== boundUser || !firstEvent) invalid = true;
        firstEvent = false;
      });
    }
    const identity = await user!.getIdTokenResult();
    if (invalid || auth.currentUser !== boundUser || now() >= expiresAt || identity.claims.impersonated !== true
      || typeof identity.claims.impersonatedBy !== "string" || !identity.claims.impersonatedBy
      || (identity.claims.firebase as { tenant?: unknown } | undefined)?.tenant !== undefined || identity.claims.tenant_id !== undefined
      || !Number.isSafeInteger(identity.claims.auth_time)
      || delegatedBy !== null && (identity.claims.impersonatedBy !== delegatedBy || identity.claims.auth_time !== authTime)) denied();
    delegatedBy ??= identity.claims.impersonatedBy as string; authTime ??= identity.claims.auth_time;
    return { user: user!, identity };
    } catch { invalid = true; return denied(); }
  }
  async function obtain() {
    const before = await validate();
    if (!receipt) {
      const response = await transport(STAGE_QA_APP_CHECK_ENDPOINT, { method: "POST", mode: "cors", credentials: "omit", cache: "no-store", redirect: "error",
        headers: { Authorization: `Bearer ${before.identity.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ handle: opaqueHandle }) });
      opaqueHandle = ""; // 일회용 실패도 자동 재소비하지 않는다.
      if (!response.ok) denied();
      const value: StageDelegatedQaAppCheckResponse = await response.json();
      if (!value || Object.keys(value).sort().join() !== ["version", "token", "targetUid", "delegatedBy", "sessionExpiresAtMillis", "tokenExpiresAtMillis"].sort().join()
        || value.version !== 1 || value.targetUid !== before.user.uid || value.delegatedBy !== delegatedBy
        || typeof value.token !== "string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value.token) || value.token.length > 8192
        || !Number.isSafeInteger(value.sessionExpiresAtMillis) || !Number.isSafeInteger(value.tokenExpiresAtMillis)
        || value.sessionExpiresAtMillis <= now() || value.sessionExpiresAtMillis > now() + STAGE_QA_APP_CHECK_SESSION_MS
        || value.tokenExpiresAtMillis <= value.sessionExpiresAtMillis || value.tokenExpiresAtMillis > now() + STAGE_QA_APP_CHECK_TOKEN_MS) denied();
      expiresAt = value.sessionExpiresAtMillis; receipt = value;
    }
    await validate();
    return { token: receipt!.token, expireTimeMillis: expiresAt };
  }
  return {
    validate,
    forceInitialRefresh() { const force = firstToken; firstToken = false; return force; },
    // SDK는 자체 IndexedDB 캐시를 쓴다. 이 세션 게이트는 JWT의 30분 수명을 취소하지 못한다.
    provider: new CustomProvider({ getToken: () => {
      flight ??= obtain().catch(() => { invalid = true; return denied(); });
      return flight.then(async value => { await validate(); return value; });
    } }),
  };
}
export function getStageQaAppCheckSession(auth: Auth) {
  assertStageQaConfig();
  if (!handle || !/^[A-Za-z0-9_-]{43}$/u.test(handle)) denied();
  return session ??= createStageQaAppCheckSession(auth, handle!);
}
