/**
 * 심박 존 — 설정 화면 미리보기용 어댑터.
 *
 * 경계 표·파생은 `@shared/training/hrZoneTable` 이 정본이다(서버 `activity_metrics.hrZoneBoundaries`
 * 와 같은 파일). 여기서는 UI 라벨·색만 덧붙인다. 활동 화면은 이 파일을 쓰지 않고 서버 결과를 읽는다 (#2437).
 */
import {
  deriveHrZoneBoundaries,
  isValidBpm,
  type HrZoneReference,
} from "@shared/training/hrZoneTable";

export type HrZoneSource = HrZoneReference;

export interface DerivedHrZone {
  name: string;
  label: string;
  minPct: number;
  maxPct: number | null;
  minBpm: number;
  /** 상한 배타적. 정수 표시 최대는 maxBpmExclusive - 1. */
  maxBpmExclusive: number | null;
  color: string;
}

export interface DerivedHrZones {
  source: HrZoneSource;
  referenceBpm: number;
  zones: DerivedHrZone[];
}

const COLORS = [
  "var(--zone-1)",
  "var(--zone-2)",
  "var(--zone-3)",
  "var(--zone-4)",
  "var(--zone-5)",
];
const LABELS = ["recovery", "endurance", "tempo", "threshold", "vo2"];

export const validBpm = isValidBpm;

/** 개별 값의 유효성은 필드 검증이 맡는다. 여기서는 둘의 관계만 본다. */
export function isValidHrThresholdRelationship(maxHr: unknown, lthr: unknown): boolean {
  return !validBpm(maxHr) || !validBpm(lthr) || lthr < maxHr;
}

export function deriveHrZones({ maxHr, lthr, sport = "run" }: { maxHr: unknown; lthr?: unknown; sport?: "run" | "bike" }): DerivedHrZones {
  const boundaries = deriveHrZoneBoundaries({ maxHr, lthr, sport });
  return {
    source: boundaries.reference,
    referenceBpm: boundaries.referenceBpm,
    zones: boundaries.zones.map((zone, index) => ({
      name: `Z${zone.zone}`,
      label: LABELS[index]!,
      minPct: zone.minPct,
      maxPct: zone.maxPct,
      minBpm: zone.minBpm,
      maxBpmExclusive: zone.maxBpmExclusive,
      color: COLORS[index]!,
    })),
  };
}
