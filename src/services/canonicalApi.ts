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

/**
 * 홈 요약 합계. **서버가 내려주는 이름·단위 그대로**다 — 거리는 미터, 이동시간은 밀리초다.
 *
 * @sync-with orider-g1-web/functions/src/api/routes/home-summary-aggregate.ts#HomeSummaryTotals
 *
 * 이전에는 이 저장소가 `{ rideCount, distanceKm, movingSec }` 로 선언하고 화면에서 ×1000 을
 * 했다 (#884 / PR #891). 서버는 그 이름을 내려준 적이 없어 실제 응답에서는 세 필드가 전부
 * `undefined` 였고 거리·시간은 `NaN` 이 되었다 — 소비처가 없어 아무도 밟지 않았을 뿐이다
 * (#2237 리뷰). 단위 변환은 화면 끝(`canonicalWeekTotals` → formatter)에서만 한다.
 */
export interface CanonicalHomeTotals {
  activityCount: number;
  distanceMeters: number;
  movingMillis: number;
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

/**
 * 합계 하나 → 네 숫자. **하나라도 유한한 숫자가 아니면 전체가 null** 이다.
 * 일부만 그리면 나머지 칸이 0 이나 NaN 으로 보인다 — 그게 이 에픽이 없애려는 결함이다.
 * 그래서 옛 웹 필드명(`rideCount`/`distanceKm`/`movingSec`)만 담긴 페이로드도 null 이다.
 */
export function parseCanonicalHomeTotals(value: unknown): CanonicalHomeTotals | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const activityCount = finiteNumber(record.activityCount);
  const distanceMeters = finiteNumber(record.distanceMeters);
  const movingMillis = finiteNumber(record.movingMillis);
  const elevationGainMeters = finiteNumber(record.elevationGainMeters);
  if (
    activityCount === null || distanceMeters === null
    || movingMillis === null || elevationGainMeters === null
  ) return null;
  return { activityCount, distanceMeters, movingMillis, elevationGainMeters };
}

/** 봉투 `data` → 최근 7일 합계. 모양이 다르면 null 이다(숫자를 만들어 내지 않는다). */
export function parseCanonicalHomeRolling7d(value: unknown): CanonicalHomeTotals | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const rolling = (value as Record<string, unknown>).rolling7d;
  if (rolling == null || typeof rolling !== "object" || Array.isArray(rolling)) return null;
  return parseCanonicalHomeTotals((rolling as Record<string, unknown>).totals);
}

export function fetchCanonicalHomeSummary(): Promise<CanonicalEnvelope<CanonicalHomeSummaryData>> {
  return fetchCanonical<CanonicalHomeSummaryData>("/home/summary");
}

/**
 * 피트니스 요약(E)이 담는 값. 통합 CTL/ATL/TSB 세 숫자다.
 *
 * ## 서버 계약 (2026-09-08 대조 완료)
 *
 * `GET /api/v1/fitness/summary` 의 봉투 `data` 는
 * `{ current, projection, summaries, projections, pdc, timeseries }` 이고,
 * 통합 3값은 **`data.current` 안에 `totalCTL` / `totalATL` / `totalTSB`** 로 들어 있다
 * (종목별은 `current.breakdown[discipline].{ctl,atl,tsb}`).
 * 원본: `orider-g1-web:functions/src/api/routes/fitness.ts` (라우트),
 * `orider-g1-web:functions/src/training/projection-update.ts` `writeCurrentFitness` (문서 쓰기).
 *
 * 모양이 다르면 [parseCanonicalFitnessSummary] 가 null 을 돌려주고 화면은 숫자 대신 명시
 * 상태를 그린다 — 0 을 만들어 내는 경로는 없다. 서버가 키를 바꾸면 값이 사라지되 틀린
 * 숫자가 뜨지는 않는다.
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
  const current = (value as Record<string, unknown>).current;
  if (current == null || typeof current !== "object" || Array.isArray(current)) return null;
  const record = current as Record<string, unknown>;
  const ctl = finiteNumber(record.totalCTL);
  const atl = finiteNumber(record.totalATL);
  const tsb = finiteNumber(record.totalTSB);
  if (ctl === null || atl === null || tsb === null) return null;
  return { ctl, atl, tsb };
}

export function fetchCanonicalFitnessSummary(): Promise<CanonicalEnvelope<Record<string, unknown>>> {
  return fetchCanonical<Record<string, unknown>>("/fitness/summary");
}
