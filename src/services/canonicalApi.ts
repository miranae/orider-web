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

/**
 * 피트니스 요약(E)이 담는 값. CTL/ATL/TSB 세 숫자다.
 *
 * ## 이 모양은 클라이언트가 **선언한 기대**다
 *
 * `GET /api/v1/fitness/summary` 의 페이로드 스키마는 이 저장소 어디에도 고정돼 있지 않다
 * (`home/summary` 와 달리 서버 타입 사본이 없다). 그래서 필드 이름을 지어내 매핑하는 대신,
 * **여기 적힌 모양이 아니면 값이 없는 것으로 본다** — [parseCanonicalFitnessSummary] 가
 * null 을 돌려주고 화면은 숫자 대신 명시 상태를 그린다. 0 을 만들어 내는 경로는 없다.
 *
 * 서버와 실제로 맞춰 보기 전에는 이 면을 켜면 안 된다(기본 꺼짐). 모양이 다르면 여기와
 * 서버 중 어느 쪽을 고칠지 결정한 뒤 켠다.
 */
export interface CanonicalFitnessSummaryData {
  /** Chronic Training Load — 체력. */
  ctl: number;
  /** Acute Training Load — 피로. */
  atl: number;
  /** Training Stress Balance — 컨디션(= CTL − ATL). */
  tsb: number;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 봉투의 `data` → 세 숫자. 하나라도 숫자가 아니면 **전체가 null** 이다.
 * 일부만 그리면 나머지 칸이 0 으로 보인다 — 그게 이 에픽이 없애려는 결함이다.
 */
export function parseCanonicalFitnessSummary(value: unknown): CanonicalFitnessSummaryData | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const ctl = finiteNumber(record.ctl);
  const atl = finiteNumber(record.atl);
  const tsb = finiteNumber(record.tsb);
  if (ctl === null || atl === null || tsb === null) return null;
  return { ctl, atl, tsb };
}

export function fetchCanonicalFitnessSummary(): Promise<CanonicalEnvelope<Record<string, unknown>>> {
  return fetchCanonical<Record<string, unknown>>("/fitness/summary");
}
