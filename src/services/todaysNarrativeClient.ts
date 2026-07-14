import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, functions } from "./firebase";

export type NarrativeRequestErrorKind = "app-check" | "cooldown" | "request";

export class NarrativeRequestError extends Error {
  readonly kind: NarrativeRequestErrorKind;
  readonly retryAfterMs: number;

  constructor(kind: NarrativeRequestErrorKind, message: string, retryAfterMs = 0) {
    super(message);
    this.name = "NarrativeRequestError";
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

interface CallNarrativeOptions<TRequest> {
  requestKey: string;
  payload: TRequest;
  manualRetry?: boolean;
}

interface FailureState {
  failures: number;
  retryAt: number;
}

const RETRY_DELAY_MS = 750;
const COOLDOWN_BASE_MS = 30_000;
const COOLDOWN_MAX_MS = 5 * 60_000;
const requestFlights = new Map<string, Promise<unknown>>();
const requestFailures = new Map<string, FailureState>();

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { code?: unknown; message?: unknown };
  return `${String(candidate.code ?? "")} ${String(candidate.message ?? "")}`.toLowerCase();
}

function isAppCheckRetryable(error: unknown): boolean {
  const code = errorCode(error);
  return code.includes("app-check") ||
    code.includes("appcheck") ||
    code.includes("unauthenticated") ||
    code.includes("initial-throttle") ||
    code.includes("throttled");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function recordFailure(requestKey: string): number {
  const failures = (requestFailures.get(requestKey)?.failures ?? 0) + 1;
  const cooldownMs = Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * 2 ** (failures - 1));
  requestFailures.set(requestKey, { failures, retryAt: Date.now() + cooldownMs });
  return cooldownMs;
}

async function executeNarrativeRequest<TRequest, TResponse>(payload: TRequest): Promise<TResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await ensureAppCheckReady(attempt === 1);
      const callable = httpsCallable<TRequest, TResponse>(functions, "getTodaysRecommendationNarrative");
      const response = await callable(payload);
      return response.data;
    } catch (error) {
      lastError = error;
      if (attempt > 0 || !isAppCheckRetryable(error)) break;
      await wait(RETRY_DELAY_MS);
    }
  }

  const kind: NarrativeRequestErrorKind = isAppCheckRetryable(lastError) ? "app-check" : "request";
  throw new NarrativeRequestError(kind, `todays-narrative/${kind}`);
}

/**
 * 오늘의 narrative callable 공통 경계.
 *
 * 같은 semantic key는 탭 내 한 요청만 공유하고, 실패 뒤 자동 effect 재실행은 cooldown으로
 * 차단한다. App Check 계열 실패만 강제 token refresh 후 한 번 더 시도한다.
 */
export function callTodaysNarrative<TRequest, TResponse>(
  options: CallNarrativeOptions<TRequest>,
): Promise<TResponse> {
  const existing = requestFlights.get(options.requestKey) as Promise<TResponse> | undefined;
  if (existing) return existing;

  const failure = requestFailures.get(options.requestKey);
  if (!options.manualRetry && failure && failure.retryAt > Date.now()) {
    return Promise.reject(new NarrativeRequestError(
      "cooldown",
      "todays-narrative/cooldown",
      failure.retryAt - Date.now(),
    ));
  }
  if (options.manualRetry) requestFailures.delete(options.requestKey);

  const flight = executeNarrativeRequest<TRequest, TResponse>(options.payload)
    .then((result) => {
      requestFailures.delete(options.requestKey);
      return result;
    })
    .catch((error) => {
      const cooldownMs = recordFailure(options.requestKey);
      if (error instanceof NarrativeRequestError) {
        throw new NarrativeRequestError(error.kind, error.message, cooldownMs);
      }
      throw error;
    })
    .finally(() => {
      if (requestFlights.get(options.requestKey) === flight) requestFlights.delete(options.requestKey);
    });

  requestFlights.set(options.requestKey, flight);
  return flight;
}

export function clearTodaysNarrativeRequestState(prefix: string): void {
  for (const key of requestFailures.keys()) {
    if (key.startsWith(prefix)) requestFailures.delete(key);
  }
}
