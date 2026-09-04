/**
 * canonical 정본 API consumer (#884 — 에픽 app#2237 의 I).
 *
 * `GET /api/v1/home/summary`(D) 와 `GET /api/v1/fitness/summary`(E) 를 읽어 canonical
 * 봉투를 돌려준다.
 *
 * ## 절대 던지지 않는다
 *
 * 이 계층이 예외를 던지면 호출부가 `catch` 에서 기본값 0 을 채우게 된다 — 그게 이
 * 에픽이 없애려는 결함이다. 모든 실패는 `status: "failed"` 봉투로 내려가고, 화면은
 * 그 상태에서 숫자 대신 안내를 그린다.
 *
 * ## 기본은 꺼짐
 *
 * [canonicalConsumersEnabled] 가 참일 때만 호출한다. 서버(D·E)가 배포되고 백필이 끝난
 * 뒤 켜는 것이 순서다 — 먼저 켜면 없는 API 를 부른다.
 */
import { auth } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";
import {
  CANONICAL_SCHEMA_VERSION,
  type CanonicalEnvelope,
  type CanonicalStatus,
} from "@shared/types/canonical";

/** 전환 스위치. 런타임 설정에 명시적으로 true 가 들어오기 전까지 꺼져 있다. */
export function canonicalConsumersEnabled(): boolean {
  return getRuntimeConfig().canonicalConsumersEnabled === true;
}

export interface CanonicalHomeTotals {
  rideCount: number;
  distanceKm: number;
  movingSec: number;
  elevationGainMeters: number;
}

export interface CanonicalHomeSummaryData {
  rolling7d: { period: unknown; totals: CanonicalHomeTotals };
  calendar: Record<string, { key: string; totals: CanonicalHomeTotals } | null>;
  timezone: string;
  rollingWindowMs: number;
}

/** 실패를 값이 아니라 **상태**로 만든다. `data` 는 언제나 null 이다. */
function failedEnvelope<T>(code: string, message: string): CanonicalEnvelope<T> {
  return {
    data: null,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    // 값이 없으므로 계산 로직도 없다. 서버 버전을 흉내 내지 않고 클라이언트 실패임을 밝힌다.
    algorithmVersion: "client_error",
    status: "failed" as CanonicalStatus,
    computedAt: null,
    inputRevision: null,
    inputDigest: null,
    period: null,
    error: { code, message, retryable: true },
  };
}

async function fetchCanonical<T>(path: string): Promise<CanonicalEnvelope<T>> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) {
    // 미로그인은 실패가 아니라 "줄 값이 없다" 다 — 재시도해도 달라지지 않는다.
    return {
      ...failedEnvelope<T>("unauthenticated", "로그인이 필요합니다"),
      status: "unavailable" as CanonicalStatus,
      error: { code: "unauthenticated", message: "로그인이 필요합니다", retryable: false },
    };
  }
  const apiBase = (getRuntimeConfig().personalApiBase || "").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return failedEnvelope<T>("network_failed", "네트워크에 연결할 수 없습니다");
  }
  if (!response.ok) {
    return failedEnvelope<T>(`http_${response.status}`, `서버 응답 ${response.status}`);
  }
  try {
    return (await response.json()) as CanonicalEnvelope<T>;
  } catch {
    return failedEnvelope<T>("parse_failed", "서버 응답을 읽을 수 없습니다");
  }
}

export function fetchCanonicalHomeSummary(): Promise<CanonicalEnvelope<CanonicalHomeSummaryData>> {
  return fetchCanonical<CanonicalHomeSummaryData>("/home/summary");
}

export function fetchCanonicalFitnessSummary(): Promise<CanonicalEnvelope<Record<string, unknown>>> {
  return fetchCanonical<Record<string, unknown>>("/fitness/summary");
}
