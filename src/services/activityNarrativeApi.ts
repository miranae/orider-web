import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { auth, ensureAppCheckReady, functions, getAppCheckToken } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";
import { logClientError } from "./errorLogger";
import { track } from "./analytics";
import type { ActivityNarrative, NarrativeLang } from "../hooks/useActivityNarrative";

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

type ActivityNarrativeResponse = ActivityNarrative | ActivityNarrativePeekResponse;
type CompatibilityFallbackReason =
  | "rest_not_configured"
  | "rest_route_unavailable"
  | "rest_network_unreachable"
  | "anonymous_peek";

/** 회선 순단 복구 전 대기. 짧은 순단이면 이 사이에 회복된다. */
const REST_NETWORK_RETRY_DELAY_MS = 400;
let authReadyPromise: Promise<void> | null = null;

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

function waitForNarrativeAuthReady(): Promise<void> {
  if (auth?.currentUser) return Promise.resolve();
  if (authReadyPromise) return authReadyPromise;

  authReadyPromise = new Promise<void>((resolve, reject) => {
    const subscription: { unsubscribe?: () => void } = {};
    const release = () => {
      resolve();
      // Firebase는 비동기 통지하지만 테스트 mock은 동기 통지할 수 있어 할당 뒤 해제한다.
      queueMicrotask(() => subscription.unsubscribe?.());
    };
    subscription.unsubscribe = onAuthStateChanged(auth, release, reject);
  }).catch((error) => {
    authReadyPromise = null;
    throw error;
  });
  return authReadyPromise;
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
): Promise<T> {
  // 구형 Hosting 산출물처럼 runtime-config에 AI base가 없으면 인증/App Check 작업 전에
  // 명시적인 compatibility fallback으로 분기할 수 있어야 한다.
  const url = endpoint("/v1/activity-narrative");
  await waitForNarrativeAuthReady();
  const user = auth?.currentUser;
  if (!user) {
    throw new ActivityNarrativeRestError("Firebase user is not signed in.", {
      code: "rest-unauthenticated",
    });
  }

  const [idToken, appCheckToken] = await Promise.all([
    user.getIdToken(),
    getAppCheckToken(),
  ]);

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

  return response.json() as Promise<T>;
}

/** fetch 가 응답 자체를 못 받은 실패 — HTTP 상태가 없으므로 서버엔 아무 흔적도 남지 않는다. */
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
): Promise<T> {
  // getActivityNarrative 는 enforceAppCheck 이라 App Check 초기화 전에 호출하면 SDK 가 토큰을
  // 아예 붙이지 않아 핸들러 진입 전 플랫폼이 영문 "Unauthenticated" 로 거부한다. main.tsx 의
  // warmup 은 LCP 보호를 위해 2.5s 지연되므로, 다른 callable 호출부와 동일하게 호출 직전에
  // 준비를 await 한다. (2026-08-05 익명 peek 오류: uid=null 방문자에게서만 재현)
  // 준비 실패해도 호출 자체는 시도한다(다음 호출에서 warmup 재시도) — 대신 원인은 삼키지 않고
  // 표준 로거로 남긴다. callable 이 뒤이어 던지는 "Unauthenticated" 는 2차 증상일 뿐이라
  // App Check 실패 사유(site-key 누락·token-timeout 등)가 없으면 원인 추적이 불가능하다.
  await ensureAppCheckReady().catch((error) => {
    logClientError("activityNarrativeApi.appCheckReady", error, {
      operation: operation(request),
      lang: request.lang,
      fallbackReason,
      signedIn: !!auth?.currentUser,
    });
  });
  const fn = httpsCallable<ActivityNarrativeRequest, T>(functions, "getActivityNarrative");
  try {
    const response = await fn(request);
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
): Promise<ActivityNarrative | null> {
  try {
    const probe = await fetchActivityNarrativeRest<ActivityNarrativePeekResponse>({
      activityId: request.activityId,
      lang: request.lang,
      cacheOnly: true,
    });
    if (probe.hit !== true) return null;
    const { hit: _hit, ...narrative } = probe;
    return narrative;
  } catch (probeError) {
    logClientError("activityNarrativeApi.restRecoveryProbeFailed", probeError, {
      operation: operation(request),
      lang: request.lang,
    });
    return null;
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
 */
async function recoverFromRestNetworkFailure<T extends ActivityNarrativeResponse>(
  request: ActivityNarrativeRequest,
  error: unknown,
): Promise<T> {
  // 서버엔 요청 흔적이 남지 않는 실패라 이 클라 로그가 유일한 추적 수단이다.
  logClientError("activityNarrativeApi.restNetworkRecovery", error, {
    operation: operation(request),
    lang: request.lang,
    forceRefresh: request.cacheOnly === true ? false : !!request.forceRefresh,
  });

  await sleep(REST_NETWORK_RETRY_DELAY_MS);

  if (request.cacheOnly !== true) {
    const generated = request.forceRefresh ? null : await probeGeneratedNarrative(request);
    if (generated) {
      observeTransport(request, "rest", "success");
      return generated as unknown as T;
    }
    observeTransport(request, "rest", "error");
    throw error;
  }

  try {
    const retried = await fetchActivityNarrativeRest<T>(request);
    observeTransport(request, "rest", "success");
    return retried;
  } catch (retryError) {
    if (!isRestNetworkError(retryError)) {
      const fallbackReason = restCompatibilityFallbackReason(retryError);
      if (!fallbackReason) {
        observeTransport(request, "rest", "error");
        throw retryError;
      }
      return callActivityNarrativeCallable<T>(request, fallbackReason);
    }
  }
  // REST 호스트가 계속 안 닿는다 — 호스트가 다른 callable 로 우회한다.
  return callActivityNarrativeCallable<T>(request, "rest_network_unreachable");
}

async function requestActivityNarrative<T extends ActivityNarrativeResponse>(
  request: ActivityNarrativeRequest,
): Promise<T> {
  if (activityNarrativeApiEnabled()) {
    await waitForNarrativeAuthReady();
  }
  // #1636 완료 전 REST 인증기는 익명 요청을 받지 않는다. 공개 활동 cacheOnly의 기존
  // 익명 읽기 계약만 한 릴리스 호환 callable로 유지하고, 생성 요청은 우회하지 않는다.
  if (!auth?.currentUser && request.cacheOnly === true) {
    return callActivityNarrativeCallable<T>(request, "anonymous_peek");
  }

  try {
    const response = await fetchActivityNarrativeRest<T>(request);
    observeTransport(request, "rest", "success");
    return response;
  } catch (error) {
    if (isRestNetworkError(error)) return recoverFromRestNetworkFailure<T>(request, error);
    const fallbackReason = restCompatibilityFallbackReason(error);
    if (!fallbackReason) {
      observeTransport(request, "rest", "error");
      throw error;
    }
    return callActivityNarrativeCallable<T>(request, fallbackReason);
  }
}

export function generateActivityNarrative(
  request: ActivityNarrativeGenerateRequest,
): Promise<ActivityNarrative> {
  return requestActivityNarrative<ActivityNarrative>(request);
}

export function peekActivityNarrative(
  request: ActivityNarrativePeekRequest,
): Promise<ActivityNarrativePeekResponse> {
  return requestActivityNarrative<ActivityNarrativePeekResponse>(request);
}
