import type { ClimbMetric } from "@shared/types/activity-metrics";
import type { ClimbSegment } from "./advancedMetrics";

export interface ClimbTableRow {
  startKm: number;
  lengthKm: number;
  elevationGain: number;
  avgGrade: number;
  category: ClimbMetric["category"];
  durationSec: number | null;
  vam: number | null;
  avgPower: number | null;
  wPerKg: number | null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveOrNull(value: unknown): number | null {
  return finite(value) && value > 0 ? value : null;
}

function nonNegativeOrNull(value: unknown): number | null {
  return finite(value) && value >= 0 ? value : null;
}

/** functions/src/utils/climb-category.ts 와 동일한 score/threshold 계약. */
function fallbackCategory(lengthKm: number, avgGrade: number): ClimbMetric["category"] {
  const score = lengthKm * 1000 * avgGrade;
  if (score >= 80_000) return "HC";
  if (score >= 64_000) return "Cat1";
  if (score >= 32_000) return "Cat2";
  if (score >= 16_000) return "Cat3";
  if (score >= 8_000) return "Cat4";
  return null;
}

function validCategory(value: unknown): value is ClimbMetric["category"] {
  return value === null || value === "HC" || value === "Cat1" || value === "Cat2"
    || value === "Cat3" || value === "Cat4";
}

function normalizeServerClimb(value: unknown): ClimbTableRow | null {
  if (!value || typeof value !== "object") return null;
  const climb = value as Partial<ClimbMetric>;
  if (
    !finite(climb.startKm) || climb.startKm < 0
    || !finite(climb.lengthKm) || climb.lengthKm <= 0
    || !finite(climb.elevationGainM) || climb.elevationGainM < 0
    || !finite(climb.avgGrade)
  ) return null;

  return {
    startKm: climb.startKm,
    lengthKm: climb.lengthKm,
    elevationGain: climb.elevationGainM,
    avgGrade: climb.avgGrade,
    category: validCategory(climb.category) ? climb.category : null,
    durationSec: positiveOrNull(climb.durationSec),
    vam: positiveOrNull(climb.vam),
    avgPower: nonNegativeOrNull(climb.avgPower),
    wPerKg: nonNegativeOrNull(climb.wPerKg),
  };
}

/**
 * 서버 문서에 climbs 배열이 있으면(빈 배열 포함) 그 결과를 정본으로 사용한다.
 * 구버전 문서처럼 배열 자체가 없을 때만 스트림 기반 클라이언트 탐지 결과로
 * 폴백한다. 서버 배열 안의 손상 행은 정상 행을 보존한 채 제외한다.
 */
export function buildClimbTableRows(
  serverClimbs: unknown,
  clientClimbs: ClimbSegment[],
): ClimbTableRow[] {
  if (Array.isArray(serverClimbs)) {
    // 배열은 서버 정본이다. 혼합 문서에서는 정상 행을 보존하고 손상 행만 제외한다.
    return serverClimbs
      .map(normalizeServerClimb)
      .filter((row): row is ClimbTableRow => row !== null);
  }

  return clientClimbs.map((climb) => ({
    ...climb,
    category: fallbackCategory(climb.lengthKm, climb.avgGrade),
    avgPower: null,
    wPerKg: null,
  }));
}
