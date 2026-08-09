/**
 * Sentry 래퍼 — `@sentry/react` 를 동적 import 로 분리.
 *
 * 목적: vendor-sentry (85KB gz) 가 entry chunk 의존성에서 제외되어 modulepreload 안 됨.
 * Sentry 자체는 초기 로딩 대역에서는 받지 않고, 첫 에러 발생 시 load + init.
 *
 * 동작:
 *   - `loadSentry()`: 모듈 import + init 수행. 한 번만 실행 (idempotent).
 *   - `captureError(err)`: load 완료면 즉시 전송, 미완료면 큐에 저장하고 lazy-load → load 시 flush.
 *
 * 사용:
 *   - 어디서든 captureError(err) 호출 — 타이밍 무관
 */
import { getRuntimeConfig } from "./runtimeConfig";

type SentryModule = typeof import("@sentry/react");

let sentry: SentryModule | null = null;
let loadingPromise: Promise<SentryModule> | null = null;
let lastLoadFailureAt = 0;
const pendingErrors: Array<{ error: unknown; tags?: Record<string, string>; extra?: Record<string, unknown> }> = [];
const MAX_PENDING_ERRORS = 20;
const LOAD_RETRY_DELAY_MS = 30_000;

/**
 * 위임 로그인 토큰은 URL 쿼리로 전달되는 실제 자격증명(TTL 1시간)이다. browserTracing·
 * replay 가 URL 을 그대로 실어 보내므로, 전송 직전에 값만 지운다. 토큰은 sign-in 직후
 * URL 에서 제거되지만 그 사이에 발생한 이벤트는 값을 물고 있다.
 */
export function scrubUrlCredentials(value: string): string {
  return value.replace(
    /([?&#](?:impersonateToken|handoff|token|access_token|id_token|refresh_token)=)[^&#\s]+/gi,
    "$1[redacted]",
  );
}

interface ScrubbableEvent {
  transaction?: string;
  request?: { url?: string };
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
  spans?: Array<{ description?: string; data?: Record<string, unknown> }>;
}

/** error·transaction 양쪽에서 URL 이 실리는 자리를 모두 정화한다. */
function scrubEventUrls<T extends ScrubbableEvent>(event: T): T {
  if (event.transaction) event.transaction = scrubUrlCredentials(event.transaction);
  if (event.request?.url) event.request.url = scrubUrlCredentials(event.request.url);
  for (const crumb of event.breadcrumbs ?? []) {
    const url = crumb.data?.url;
    if (typeof url === "string") crumb.data!.url = scrubUrlCredentials(url);
  }
  for (const span of event.spans ?? []) {
    if (span.description) span.description = scrubUrlCredentials(span.description);
    for (const key of ["url", "http.url"]) {
      const value = span.data?.[key];
      if (typeof value === "string") span.data![key] = scrubUrlCredentials(value);
    }
  }
  return event;
}

function getInitOptions(Sentry: SentryModule) {
  const config = getRuntimeConfig();
  return {
    dsn: config.sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: config.appEnvironment,
    enabled: !!config.sentryDsn,
    beforeSend<T extends ScrubbableEvent>(event: T): T {
      return scrubEventUrls(event);
    },
    // transaction 은 beforeSend 를 타지 않는다 — browserTracing 이 pageload/navigation
    // transaction 이름과 span 에 URL 을 그대로 싣기 때문에 별도로 정화한다.
    beforeSendTransaction<T extends ScrubbableEvent>(event: T): T {
      return scrubEventUrls(event);
    },
  };
}

/**
 * Sentry 모듈을 lazy import + init. 한 번만 수행 (재호출 시 기존 promise 재사용).
 */
export function loadSentry(): Promise<SentryModule> {
  if (loadingPromise) return loadingPromise;
  loadingPromise = import("@sentry/react").then((S) => {
    S.init(getInitOptions(S));
    sentry = S;
    // load 전 큐에 쌓인 에러 flush
    for (const { error, tags, extra } of pendingErrors) {
      S.captureException(error, { tags, extra });
    }
    pendingErrors.length = 0;
    return S;
  }).catch((err) => {
    console.warn("[sentry] load failed:", err);
    lastLoadFailureAt = Date.now();
    loadingPromise = null;
    throw err;
  });
  return loadingPromise;
}

/**
 * 에러 캡처. Sentry 가 아직 load 안 됐어도 큐에 쌓여 나중에 전송됨.
 */
export function captureError(
  error: unknown,
  options?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
) {
  if (sentry) {
    sentry.captureException(error, options);
  } else {
    if (pendingErrors.length >= MAX_PENDING_ERRORS) pendingErrors.shift();
    pendingErrors.push({ error, tags: options?.tags, extra: options?.extra });
    if (Date.now() - lastLoadFailureAt < LOAD_RETRY_DELAY_MS) return;
    void loadSentry().catch(() => {
      // loadSentry 에서 이미 경고를 남긴다. 다음 에러에서 재시도.
    });
  }
}
