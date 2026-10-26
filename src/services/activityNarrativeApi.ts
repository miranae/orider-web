import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";
import { logClientError } from "./errorLogger";
import { track } from "./analytics";
import { captureActivityNarrativeSession, type ActivityNarrativeServices } from "./activityNarrativeSession";
type NarrativeSession = ReturnType<typeof captureActivityNarrativeSession>;
import type { ActivityNarrative, ActivitySocialSummary, NarrativeLang } from "../hooks/useActivityNarrative";

export interface ActivityNarrativeGenerateRequest {
  activityId: string;
  lang: NarrativeLang;
  forceRefresh?: boolean;
  cacheOnly?: never;
}

export interface ActivityNarrativePeekRequest {
  activityId: string;
  lang: NarrativeLang;
  cacheOnly: true;
  socialSummaryOnly?: boolean;
  forceRefresh?: never;
}

export type ActivityNarrativeRequest =
  | ActivityNarrativeGenerateRequest
  | ActivityNarrativePeekRequest;

export type ActivityNarrativePeekResponse =
  | ({ hit: true } & ActivityNarrative)
  | { hit: false; stale?: boolean };

interface ActivityNarrativeErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

type ActivitySocialSummaryResponse = { socialSummary?: ActivitySocialSummary };
type ActivityNarrativeResponse = ActivityNarrative | ActivityNarrativePeekResponse | ActivitySocialSummaryResponse;
type CompatibilityFallbackReason =
  | "rest_not_configured"
  | "rest_route_unavailable"
  | "rest_network_unreachable"
  | "rest_network_cooldown"
  | "anonymous_peek";

/** 회선 순단 복구 전 대기. 짧은 순단이면 이 사이에 회복된다. */
const REST_NETWORK_RETRY_DELAY_MS = 400;
// 도달 불가한 REST 호스트를 매 화면에서 두 번씩 재시도하지 않는다. 만료 후 다시 탐색한다.
const REST_PEEK_NETWORK_COOLDOWN_MS = 60_000;
const peekNetworkCooldowns = new Map<string, number>();
const peekStates = new WeakMap<object, { viewer: typeof auth.currentUser | undefined; pending: Map<string, Promise<ActivityNarrativeResponse>> }>();
const APP_CHECK_THROTTLE_FALLBACK_MS = 5 * 60_000;
export const ACTIVITY_NARRATIVE_APP_CHECK_THROTTLE_RECOVERY_KEY = "activity-narrative-app-check-throttle-recovery";
const authReadyPromises = new WeakMap<object, Promise<void>>();

/** App Check가 403 뒤 토큰 발급을 멈춘 동안에는 재시도를 숨긴다. */
export function appCheckThrottleRetryAfterMs(error: unknown): number | null {
  const candidate = error instanceof Error
    ? `${error.name} ${error.message}`
    : typeof error === "object" && error !== null
      ? `${String((error as { code?: unknown }).code ?? "")} ${String((error as { message?: unknown }).message ?? "")}`
      : String(error);
  // 훅 경계에서는 FirebaseError의 code가 사라지고 message만 남을 수 있다.
  // SDK가 만드는 403 재시도 억제 문구도 함께 인식해 원문 오류를 노출하지 않는다.
  if (!/(?:app[- ]?check\/throttled|requests throttled due to previous \d{3} error)/i.test(candidate)) return null;

  const retryAfter = candidate.match(/attempts allowed again after\s+(?:(\d+)h:)?(?:(\d+)m:)?(?:(\d+)s)?/i);
  if (!retryAfter) return APP_CHECK_THROTTLE_FALLBACK_MS;

  const hours = Number(retryAfter[1] ?? 0);
  const minutes = Number(retryAfter[2] ?? 0);
  const seconds = Number(retryAfter[3] ?? 0);
  const milliseconds = (hours * 60 * 60 + minutes * 60 + seconds) * 1_000;
  return milliseconds > 0 ? milliseconds : APP_CHECK_THROTTLE_FALLBACK_MS;
}

/** 같은 세션에서 자동 복구 새로고침은 한 번만 허용해 반복 새로고침을 막는다. */
export function claimActivityNarrativeAppCheckThrottleRecovery(storage: Pick<Storage, "getItem" | "setItem">): boolean {
  try {
    if (storage.getItem(ACTIVITY_NARRATIVE_APP_CHECK_THROTTLE_RECOVERY_KEY)) return false;
    storage.setItem(ACTIVITY_NARRATIVE_APP_CHECK_THROTTLE_RECOVERY_KEY, "1");
    return true;
  } catch {
    // 세션 저장소를 쓸 수 없으면 루프 위험이 있으므로 자동 새로고침을 하지 않는다.
    return false;
  }
}

export class ActivityNarrativeRestError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, options?: { code?: string; status?: number; details?: unknown }) {
    super(message);
    this.name = "ActivityNarrativeRestError";
    this.code = options?.code;
    this.status = options?.status;
    this.details = options?.details;
  }
}

function configuredBaseUrl(): string | null {
  const base = getRuntimeConfig().aiApiBase?.trim().replace(/\/+$/, "");
  return base || null;
}

export function activityNarrativeApiEnabled(): boolean {
  return configuredBaseUrl() !== null;
}

function endpoint(path: string): string {
  const base = configuredBaseUrl();
  if (!base) {
    throw new ActivityNarrativeRestError("AI API base URL is not configured.", {
      code: "rest-not-configured",
    });
  }
  return `${base}${path}`;
}

function waitForNarrativeAuthReady(currentAuth = auth): Promise<void> {
  if (currentAuth?.currentUser) return Promise.resolve();
  const existing = authReadyPromises.get(currentAuth);
  if (existing) return existing;

  const pending = new Promise<void>((resolve, reject) => {
    const subscription: { unsubscribe?: () => void } = {};
    const release = () => {
      resolve();
      // Firebase는 비동기 통지하지만 테스트 mock은 동기 통지할 수 있어 할당 뒤 해제한다.
      queueMicrotask(() => subscription.unsubscribe?.());
    };
    subscription.unsubscribe = onAuthStateChanged(currentAuth, release, reject);
  }).catch((error) => {
    authReadyPromises.delete(currentAuth);
    throw error;
  });
  authReadyPromises.set(currentAuth, pending);
  return pending;
}

function operation(request: ActivityNarrativeRequest): "peek" | "generate" {
  return request.cacheOnly === true ? "peek" : "generate";
}

function observeTransport(
  request: ActivityNarrativeRequest,
  transport: "rest" | "callable",
  outcome: "success" | "error",
  fallbackReason?: CompatibilityFallbackReason,
): void {
  track("activity_narrative_transport", {
    operation: operation(request),
    transport,
    outcome,
    lang: request.lang,
    ...(fallbackReason ? { fallbackReason } : {}),
  });
}

export async function fetchActivityNarrativeRest<T extends ActivityNarrativeResponse>(
  request: ActivityNarrativeRequest,
  session?: NarrativeSession,
): Promise<T> {
  // 구형 Hosting 산출물처럼 runtime-config에 AI base가 없으면 인증/App Check 작업 전에
  // 명시적인 compatibility fallback으로 분기할 수 있어야 한다.
  const url = endpoint("/v1/activity-narrative");
  await waitForNarrativeAuthReady(session?.services.auth);
  session ??= captureActivityNarrativeSession();
  session.assertCurrent();
  const user = session.services.auth?.currentUser;
  if (!user) {
    throw new ActivityNarrativeRestError("Firebase user is not signed in.", {
      code: "rest-unauthenticated",
    });
  }

  const [idToken, appCheckToken] = await Promise.all([
    user.getIdToken(),
    session.services.getAppCheckToken(),
  ]);

  session.assertCurrent();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw new ActivityNarrativeRestError(
      error instanceof Error ? error.message : "AI API network request failed.",
      { code: "rest-network" },
    );
  }

  session.assertCurrent();
  if (!response.ok) {
    let payload: ActivityNarrativeErrorPayload | null = null;
    try {
      payload = await response.json() as ActivityNarrativeErrorPayload;
    } catch {
      payload = null;
    }
    const code = payload?.error?.code;
    const message = code === "unauthenticated"
      ? "Unauthenticated"
      : payload?.error?.message ?? `AI API request failed with HTTP ${response.status}.`;
    throw new ActivityNarrativeRestError(
      message,
      {
        code,
        status: response.status,
        details: payload?.error?.details,
      },
    );
  }

  const payload = await response.json() as T;
  session.assertCurrent();
  return payload;
}

/** fetch가 읽을 수 있는 HTTP 응답을 받지 못한 실패(회선·CORS 등). */
function isRestNetworkError(error: unknown): boolean {
  return error instanceof ActivityNarrativeRestError && error.code === "rest-network";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function restCompatibilityFallbackReason(
  error: unknown,
): CompatibilityFallbackReason | null {
  if (!(error instanceof ActivityNarrativeRestError)) return null;
  if (error.code === "rest-not-configured") return "rest_not_configured";
  // handler가 반환한 not-found(활동 없음)는 업무 오류이므로 우회하지 않는다.
  // 구조화된 error code 없는 404와 method/not-implemented만 구버전 route 미배포로 본다.
  if ((error.status === 404 && !error.code) || error.status === 405 || error.status === 501) {
    return "rest_route_unavailable";
  }
  return null;
}

async function callActivityNarrativeCallable<T extends ActivityNarrativeResponse>(
  request: ActivityNarrativeRequest,
  fallbackReason: CompatibilityFallbackReason,
  session: NarrativeSession,
): Promise<T> {
  // getActivityNarrative 는 enforceAppCheck 이라 App Check 초기화 전에 호출하면 SDK 가 토큰을
  // 아예 붙이지 않아 핸들러 진입 전 플랫폼이 영문 "Unauthenticated" 로 거부한다. main.tsx 의
  // warmup 은 LCP 보호를 위해 2.5s 지연되므로, 다른 callable 호출부와 동일하게 호출 직전에
  // 준비를 await 한다. (2026-08-05 익명 peek 오류: uid=null 방문자에게서만 재현)
  // 준비 실패는 원인 그대로 전파하고, 토큰 없는 네트워크 요청은 보내지 않는다.
  await session.services.ensureAppCheckReady().catch((error) => {
    logClientError("activityNarrativeApi.appCheckReady", error, {
      operation: operation(request),
      lang: request.lang,
      fallbackReason,
      signedIn: !!session.services.auth?.currentUser,
    });
    observeTransport(request, "callable", "error", fallbackReason);
    throw error;
  });
  session.assertCurrent();
  const fn = httpsCallable<ActivityNarrativeRequest, T>(session.services.functions, "getActivityNarrative");
  try {
    const response = await fn(request);
    session.assertCurrent();
    observeTransport(request, "callable", "success", fallbackReason);
    return response.data;
  } catch (error) {
    observeTransport(request, "callable", "error", fallbackReason);
    throw error;
  }
}

/**
 * 첫 generate 의 산출물이 이미 서버에 있는지 부작용 없이 확인한다. cacheOnly 조회는 LLM 을
 * 태우지 않는다. 실패하면 확인을 포기하고 null — 단, 인증·quota 같은 실패가 cache miss 로
 * 뭉개지지 않도록 사유는 남긴다.
 */
async function probeGeneratedNarrative(
  request: ActivityNarrativeGenerateRequest,
  session: NarrativeSession,
): Promise<ActivityNarrative | null> {
  try {
    const probe = await fetchActivityNarrativeRest<ActivityNarrativePeekResponse>({
      activityId: request.activityId,
      lang: request.lang,
      cacheOnly: true,
    }, session);
    if (probe.hit !== true) return null;
    const { hit: _hit, ...narrative } = probe;
    return narrative;
  } catch (probeError) {
    logClientError("activityNarrativeApi.restRecoveryProbeFailed", probeError, {
      operation: operation(request),
      lang: request.lang,
    });
    // 서버가 돌려준 구조화된 오류(인증·quota 등)는 사용자가 알아야 할 실패다. 오래된 회선
    // 오류로 뭉개면 무의미한 재시도를 유도하므로 그대로 올린다. 판단 근거가 없는 실패
    // (회선 순단·구버전 route 미배포)만 "확인 불가"로 보고 null.
    if (isRestNetworkError(probeError)) return null;
    if (restCompatibilityFallbackReason(probeError)) return null;
    throw probeError;
  }
}

/**
 * fetch 가 응답 자체를 못 받은 실패의 복구.
 *
 * 클라이언트는 "요청이 서버에 닿지 않았다"와 "닿았는데 응답만 유실됐다"를 구분할 수 없다.
 * 그래서 부작용 유무로 복구 범위를 가른다.
 *
 * - peek(cacheOnly): 순수 조회라 재전송이 안전하다. 재시도하고, 그래도 안 되면 호스트가 다른
 *   callable 로 우회한다.
 * - generate: 서버(activity-narrative)에 idempotency key 도 단일 실행 잠금도 없어서
 *   (2026-08-09 확인) 재전송하면 첫 요청이 처리 중이거나 응답만 유실된 경우 LLM 이 중복
 *   실행·과금된다. 그래서 **자동 재전송하지 않는다.** 응답만 유실된 경우를 건지는
 *   cacheOnly 조회까지만 하고, 산출물이 없으면 오류를 그대로 올려 UI 가 재시도를 노출하게 한다.
 *   (사용자가 명시한 forceRefresh 는 캐시로 대체할 수 없으므로 조회도 건너뛴다.)
 *
 * 조회가 인증·quota 같은 구조화된 서버 오류를 받으면 그 오류를 올린다 — 회선 오류로 뭉개면
 * 사용자가 무의미한 재시도를 반복하게 된다.
 */
async function recoverFromRestNetworkFailure<T extends ActivityNarrativeResponse>(
  request: ActivityNarrativeRequest,
  error: unknown,
  session: NarrativeSession,
): Promise<T> {
  // 생성 오류는 추적한다. 읽기 복구 성공은 transport 관측만 남기고 최종 실패는 호출부로 전파한다.
  if (request.cacheOnly !== true) logClientError("activityNarrativeApi.restNetworkRecovery", error, {
    operation: operation(request),
    lang: request.lang,
    forceRefresh: request.cacheOnly === true ? false : !!request.forceRefresh,
  });

  if (request.cacheOnly !== true) {
    // forceRefresh 는 캐시로 대체할 수 없어 복구할 게 없다. 대기 없이 바로 오류를 노출한다.
    if (request.forceRefresh) {
      observeTransport(request, "rest", "error");
      throw error;
    }
    await sleep(REST_NETWORK_RETRY_DELAY_MS);
    let generated: ActivityNarrative | null;
    try {
      generated = await probeGeneratedNarrative(request, session);
    } catch (probeError) {
      observeTransport(request, "rest", "error");
      throw probeError;
    }
    if (generated) {
      observeTransport(request, "rest", "success");
      return generated as unknown as T;
    }
    observeTransport(request, "rest", "error");
    throw error;
  }

  const failedBase = configuredBaseUrl();
  await sleep(REST_NETWORK_RETRY_DELAY_MS);
  try {
    const retried = await fetchActivityNarrativeRest<T>(request, session);
    observeTransport(request, "rest", "success");
    return retried;
  } catch (retryError) {
    if (!isRestNetworkError(retryError)) {
      const fallbackReason = restCompatibilityFallbackReason(retryError);
      if (!fallbackReason) {
        observeTransport(request, "rest", "error");
        throw retryError;
      }
      return callActivityNarrativeCallable<T>(request, fallbackReason, session);
    }
  }
  // base 별로만 격리하며 토큰·활동·사용자 식별자는 보관하거나 진단에 보내지 않는다.
  const base = failedBase;
  if (base) {
    for (const [key, until] of peekNetworkCooldowns) {
      if (until <= Date.now()) peekNetworkCooldowns.delete(key);
    }
    // 런타임 설정이 반복 변경되어도 메모리 사용량을 제한한다.
    if (!peekNetworkCooldowns.has(base) && peekNetworkCooldowns.size >= 8) {
      peekNetworkCooldowns.delete(peekNetworkCooldowns.keys().next().value!);
    }
    peekNetworkCooldowns.set(base, Date.now() + REST_PEEK_NETWORK_COOLDOWN_MS);
  }
  return callActivityNarrativeCallable<T>(request, "rest_network_unreachable", session);
}

async function requestActivityNarrative<T extends ActivityNarrativeResponse>(
  request: ActivityNarrativeRequest,
  services?: ActivityNarrativeServices,
): Promise<T> {
  if (activityNarrativeApiEnabled()) {
    await waitForNarrativeAuthReady(services?.auth);
  }
  const session = captureActivityNarrativeSession(services);
  // 비로그인 저장 결과 읽기는 현재 활동 ACL을 검사하는 callable을 사용한다.
  // 생성 요청은 이 읽기 전용 경로로 우회하지 않는다.
  if (!session.services.auth?.currentUser && request.cacheOnly === true) {
    return callActivityNarrativeCallable<T>(request, "anonymous_peek", session);
  }

  const base = configuredBaseUrl();
  if (request.cacheOnly === true && base && (peekNetworkCooldowns.get(base) ?? 0) > Date.now()) {
    return callActivityNarrativeCallable<T>(request, "rest_network_cooldown", session);
  }

  try {
    const response = await fetchActivityNarrativeRest<T>(request, session);
    observeTransport(request, "rest", "success");
    return response;
  } catch (error) {
    session.assertCurrent();
    if (isRestNetworkError(error)) return recoverFromRestNetworkFailure<T>(request, error, session);
    const fallbackReason = restCompatibilityFallbackReason(error);
    if (!fallbackReason) {
      observeTransport(request, "rest", "error");
      throw error;
    }
    return callActivityNarrativeCallable<T>(request, fallbackReason, session);
  }
}

export function generateActivityNarrative(
  request: ActivityNarrativeGenerateRequest,
  services?: ActivityNarrativeServices,
): Promise<ActivityNarrative> {
  return requestActivityNarrative<ActivityNarrative>(request, services);
}

export function peekActivityNarrative(
  request: ActivityNarrativePeekRequest,
  services?: ActivityNarrativeServices,
): Promise<ActivityNarrativePeekResponse> {
  return requestActivityNarrativePeek<ActivityNarrativePeekResponse>(request, services);
}

/** 진행 중인 읽기만 공유한다. 인증 객체가 바뀌면 이전 사용자의 요청과 즉시 분리한다. */
async function requestActivityNarrativePeek<T extends ActivityNarrativeResponse>(request: ActivityNarrativePeekRequest, services?: ActivityNarrativeServices): Promise<T> {
  if (activityNarrativeApiEnabled()) await waitForNarrativeAuthReady(services?.auth);
  const session = captureActivityNarrativeSession(services);
  session.assertCurrent();
  const currentAuth = session.services.auth, viewer = currentAuth?.currentUser;
  let state = peekStates.get(currentAuth);
  if (!state) {
    state = { viewer, pending: new Map() }; peekStates.set(currentAuth, state);
    const tracked = state;
    onAuthStateChanged(currentAuth, user => {
      if (tracked.viewer !== user) { tracked.viewer = user; tracked.pending.clear(); }
    });
  }
  if (state.viewer !== viewer) { state.viewer = viewer; state.pending.clear(); }
  const key = JSON.stringify([session.key, configuredBaseUrl(), request.activityId, request.lang, !!request.socialSummaryOnly]);
  const existing = state.pending.get(key);
  if (existing) return existing as Promise<T>;
  const pending = requestActivityNarrative<T>(request, services);
  state.pending.set(key, pending);
  try { return await pending; }
  finally { if (state.pending.get(key) === pending) state.pending.delete(key); }
}

/** AI를 재생성하지 않고 공유요약만 재조회한다. */
export function retryActivitySocialSummary(activityId: string, lang: NarrativeLang, services?: ActivityNarrativeServices): Promise<ActivitySocialSummaryResponse> {
  return requestActivityNarrativePeek<ActivitySocialSummaryResponse>({ activityId, lang, cacheOnly: true, socialSummaryOnly: true }, services);
}
