import { assertTodayTrainingDecisionIdentity, getTodayTrainingDecision } from "./trainingDecisionClient";
import type { TodayTrainingDecisionProjection } from "./trainingDecisionContract";
import { isCoachClientError } from "./coachClient";

export class TodayTrainingDecisionCooldownError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("today-training-decision/cooldown");
    this.name = "TodayTrainingDecisionCooldownError";
  }
}

interface LoadOptions {
  uid: string;
  discipline: "bike" | "run" | "swim";
  signal?: AbortSignal;
  manualRetry?: boolean;
}

interface CachedDecision {
  decision: TodayTrainingDecisionProjection;
  expiresAt: number;
}

interface FailureState {
  failures: number;
  retryAt: number;
}

const SUCCESS_CACHE_MS = 30_000;
const COOLDOWN_BASE_MS = 60_000;
const COOLDOWN_MAX_MS = 15 * 60_000;
const MANUAL_RETRY_MIN_INTERVAL_MS = 30_000;
const SUCCESS_REQUEST_MIN_INTERVAL_MS = 60_000;
const requestFlights = new Map<string, Promise<TodayTrainingDecisionProjection>>();
const requestCache = new Map<string, CachedDecision>();
const requestFailures = new Map<string, FailureState>();
const manualRetryAllowedAt = new Map<string, number>();
const automaticRequestAllowedAt = new Map<string, number>();

function requestKey(uid: string, discipline: LoadOptions["discipline"]): string {
  return `${uid}:${discipline}`;
}

function cacheExpiry(decision: TodayTrainingDecisionProjection, now: number): number {
  const pendingProposalExpiry = decision.proposal?.status === "pending" ? decision.proposalExpiresAt : null;
  const decisionExpiries = [
    decision.scheduledProjectionValidUntil,
    decision.recommendationValidUntil,
    pendingProposalExpiry,
  ].filter((value): value is number => value !== null && value > now);
  return Math.min(now + SUCCESS_CACHE_MS, ...decisionExpiries);
}

function validateDecisionFreshness(decision: TodayTrainingDecisionProjection, now: number): void {
  if (decision.scheduledProjectionValidUntil <= now) {
    throw new Error("training decision scheduled projection expired");
  }
  if (decision.proposal?.status === "pending"
      && decision.proposalExpiresAt !== null
      && decision.proposalExpiresAt <= now) {
    throw new Error("training decision pending proposal expired");
  }
}

function recordFailure(key: string): void {
  const failures = (requestFailures.get(key)?.failures ?? 0) + 1;
  const cooldownMs = Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * 2 ** (failures - 1));
  requestFailures.set(key, { failures, retryAt: Date.now() + cooldownMs });
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

function clearRequestState(key: string): void {
  requestFlights.delete(key);
  requestCache.delete(key);
  requestFailures.delete(key);
  manualRetryAllowedAt.delete(key);
  automaticRequestAllowedAt.delete(key);
}

function assertGuardIdentity(uid: string, key: string): void {
  try {
    assertTodayTrainingDecisionIdentity(uid);
  } catch (error) {
    clearRequestState(key);
    throw error;
  }
}

function followWithCallerAbort<T>(flight: Promise<T>, uid: string, key: string, signal?: AbortSignal): Promise<T> {
  try {
    assertGuardIdentity(uid, key);
  } catch (error) {
    return Promise.reject(error);
  }
  const identityCheckedFlight = flight.then((value) => {
    assertGuardIdentity(uid, key);
    return value;
  });
  if (!signal) return identityCheckedFlight;
  if (signal.aborted) return Promise.reject(abortError(signal));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    void identityCheckedFlight.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/**
 * Today Training 조회의 탭 단위 비용 안전 경계.
 *
 * 같은 사용자/종목 요청은 컴포넌트 재마운트와 무관하게 하나만 실행한다. 성공 결과는 결정의
 * 유효기간을 넘지 않는 선에서 짧게 재사용하고, 실패 후 자동 재조회는 지수 cooldown으로 막는다.
 * 수동 새로고침은 제한된 간격으로 캐시와 현재 cooldown을 우회하되 실패 횟수는 유지하며,
 * 이미 진행 중인 동일 요청은 그대로 공유한다.
 */
export function loadTodayTrainingDecision(options: LoadOptions): Promise<TodayTrainingDecisionProjection> {
  const key = requestKey(options.uid, options.discipline);
  try {
    assertGuardIdentity(options.uid, key);
  } catch (error) {
    return Promise.reject(error);
  }
  const existing = requestFlights.get(key);
  if (existing) return followWithCallerAbort(existing, options.uid, key, options.signal);

  if (options.manualRetry) {
    const allowedAt = manualRetryAllowedAt.get(key) ?? 0;
    if (allowedAt > Date.now()) {
      const cached = requestCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return followWithCallerAbort(Promise.resolve(cached.decision), options.uid, key, options.signal);
      }
      return followWithCallerAbort(
        Promise.reject(new TodayTrainingDecisionCooldownError(allowedAt - Date.now())),
        options.uid,
        key,
        options.signal,
      );
    }
    manualRetryAllowedAt.set(key, Date.now() + MANUAL_RETRY_MIN_INTERVAL_MS);
    requestCache.delete(key);
  } else {
    const cached = requestCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return followWithCallerAbort(Promise.resolve(cached.decision), options.uid, key, options.signal);
    }
    if (cached) requestCache.delete(key);

    const failure = requestFailures.get(key);
    const allowedAt = Math.max(failure?.retryAt ?? 0, automaticRequestAllowedAt.get(key) ?? 0);
    if (allowedAt > Date.now()) {
      return followWithCallerAbort(
        Promise.reject(new TodayTrainingDecisionCooldownError(allowedAt - Date.now())),
        options.uid,
        key,
        options.signal,
      );
    }
  }

  // 개별 컴포넌트의 cleanup으로 공유 요청을 취소하지 않는다. 호출자는 아래 wrapper에서만
  // 중단되며, 진행 중인 네트워크 요청은 다음 재마운트가 합류하거나 최대 15초 timeout으로 끝난다.
  const flight = getTodayTrainingDecision(options.uid, options.discipline)
    .then((decision) => {
      const now = Date.now();
      validateDecisionFreshness(decision, now);
      requestFailures.delete(key);
      automaticRequestAllowedAt.set(key, now + SUCCESS_REQUEST_MIN_INTERVAL_MS);
      requestCache.set(key, { decision, expiresAt: cacheExpiry(decision, now) });
      return decision;
    })
    .catch((error) => {
      // 로그인 전환/로그아웃은 유료 서버 실패가 아니며, 이전 identity의 cooldown을 남기면
      // 사용자가 돌아온 뒤에도 정상 요청을 불필요하게 막는다.
      if (isCoachClientError(error) && error.kind === "auth") clearRequestState(key);
      else recordFailure(key);
      throw error;
    })
    .finally(() => {
      if (requestFlights.get(key) === flight) requestFlights.delete(key);
    });
  requestFlights.set(key, flight);
  return followWithCallerAbort(flight, options.uid, key, options.signal);
}

export function resetTodayTrainingDecisionGuardForTests(): void {
  requestFlights.clear();
  requestCache.clear();
  requestFailures.clear();
  manualRetryAllowedAt.clear();
  automaticRequestAllowedAt.clear();
}
