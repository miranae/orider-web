/**
 * 개인 기록 (Personal Records) — `users/{uid}/records/power` 단일 doc.
 *
 * Phase B — 2026-05-28
 *
 * activity_metrics.mmp 누적 → duration 별 top 5 PR 시계열.
 * LLM 컨텍스트 강화 ("오늘의 5min 320W = 역대 3위") + 향후 PDC 모델 입력.
 *
 * Phase B v1: bike (power) 만. run (pace) / swim 은 후속.
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

/** Run per-distance PR — value = best contiguous N km 시간 (sec).
 *  v1: 1/5/10 km. HM(21.0975) / M(42.195) 은 splits 분수 km 라 정밀 추출에 streams
 *  레벨 분석 필요 — 후속. */
export type RunDistanceKey = "1km" | "5km" | "10km";
export type RunPrTable = Partial<Record<RunDistanceKey, PrEntry[]>>;

export interface PersonalRecords {
  /** bike power MMP 별 top-K PR (W). value 높을수록 좋음. */
  bike: BikePrTable;
  /** run distance 별 top-K PR (sec). value 낮을수록 좋음. */
  run?: RunPrTable;
  swim?: Record<string, PrEntry[]>;  // 미구현 (swimMetrics 자체 부재)
  updatedAt: number;
  version: number;
}

export const PERSONAL_RECORDS_VERSION = 1;
/** duration 별 PR 유지 개수. UI 가 top 3-5 표시 + LLM 컨텍스트 인용. */
export const PR_TOP_K = 5;
