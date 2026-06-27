/**
 * Sentry 래퍼 — `@sentry/react` 를 동적 import 로 분리.
 *
 * 목적: vendor-sentry (85KB gz) 가 entry chunk 의존성에서 제외되어 modulepreload 안 됨.
 * Sentry 자체는 첫 페인트 이후 idle 시점에 load + init.
 *
 * 동작:
 *   - `loadSentry()`: 모듈 import + init 수행. 한 번만 실행 (idempotent).
 *   - `captureError(err)`: load 완료면 즉시 전송, 미완료면 큐에 저장 → load 시 flush.
 *
 * 사용:
 *   - main.tsx 에서 requestIdleCallback 으로 loadSentry() 호출
 *   - 어디서든 captureError(err) 호출 — 타이밍 무관
 */

type SentryModule = typeof import("@sentry/react");

let sentry: SentryModule | null = null;
let loadingPromise: Promise<SentryModule> | null = null;
const pendingErrors: Array<{ error: unknown; tags?: Record<string, string>; extra?: Record<string, unknown> }> = [];

function getInitOptions(Sentry: SentryModule) {
  return {
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE,
    enabled: !!import.meta.env.VITE_SENTRY_DSN,
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
    pendingErrors.push({ error, tags: options?.tags, extra: options?.extra });
  }
}
