/**
 * 개인 기록 (Personal Records) — `users/{uid}/records/power` 단일 doc.
 *
 * Phase B — 2026-05-28 / v2 (run) — 2026-07
 *
 * bike: activity_metrics.mmp 누적 → duration 별 top-K power PR (value = W, 높을수록 우수).
 * run:  activity_metrics.runMetrics.distanceRecords(streams 기반) 에서 거리별 top-K time PR
 *       (value = sec, 낮을수록 우수). 서버 트리거 `onActivityMetricsRecords` 가 write.
 *
 * write 는 서버 전용(rules `if false`), 프론트는 본인 doc read-only 구독.
 * shared/types ↔ functions/src/analysis/personal-records.ts 미러 — 함께 갱신할 것.
 */

export type PowerDurationKey =
  | "1s" | "5s" | "10s" | "30s"
  | "1m" | "2m" | "5m" | "10m" | "20m" | "30m" | "1h";

export interface PrEntry {
  /** W (bike) — 값이 클수록 우수. run/swim 추가 시 sec/m 등 의미 분리. */
  value: number;
  activityId: string;
  /** YYYY-MM-DD (KST 또는 활동 startTime 기준 UTC date) */
  date: string;
  /** activity startTime epoch ms — 정렬·중복 검출 보조. */
  startTime: number;
  /** 선택: race/climb/interval/... 추후 분류 */
  context?: string;
}

export type BikePrTable = Partial<Record<PowerDurationKey, PrEntry[]>>;

/** Run per-distance PR — value = best contiguous 구간 시간 (sec, 낮을수록 우수).
 *  streams(distance/time) 기반 정밀 추출이라 1/5/10km + 하프(21.0975)/풀(42.195) 모두 지원. */
export type RunDistanceKey = "1km" | "5km" | "10km" | "half" | "full";
export type RunPrTable = Partial<Record<RunDistanceKey, PrEntry[]>>;

/** UI 표시·순회 순서 (짧은 거리 → 긴 거리). */
export const RUN_DISTANCES: RunDistanceKey[] = ["1km", "5km", "10km", "half", "full"];

/** RunDistanceKey → 누적 거리(m). 하프·풀은 공식 거리. */
export const RUN_DISTANCE_M: Record<RunDistanceKey, number> = {
  "1km": 1000,
  "5km": 5000,
  "10km": 10000,
  "half": 21097.5,
  "full": 42195,
};

export interface PersonalRecords {
  /** bike power MMP 별 top-K PR (W). value 높을수록 좋음. */
  bike: BikePrTable;
  /** run distance 별 top-K PR (sec). value 낮을수록 좋음. */
  run?: RunPrTable;
  swim?: Record<string, PrEntry[]>;  // 미구현 (swimMetrics 자체 부재)
  updatedAt: number;
  version: number;
}

/** v2: run PR(거리별 시간, 하프·풀 포함). 서버 미러(functions)와 동일해야 한다. */
export const PERSONAL_RECORDS_VERSION = 2;
/** duration/거리 별 PR 유지 개수. UI 가 top 3-5 표시 + LLM 컨텍스트 인용. */
export const PR_TOP_K = 5;
