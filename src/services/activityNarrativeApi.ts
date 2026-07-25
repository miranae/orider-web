import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { auth, functions, getAppCheckToken } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";
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
  | "anonymous_peek";
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
