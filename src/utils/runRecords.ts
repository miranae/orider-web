/**
 * 거리별 러닝 기록 파생 (설계 문서 §3.4a) — 순수 로직.
 *
 * 원천은 서버가 쓰는 `users/{uid}/records/power` 문서의 `run` 필드다(v2). 각 거리의
 * `PrEntry[]` 는 top-K, **value(초) 오름차순 = 빠른 순** 이므로 [0] 이 현행 최고 기록이다.
 * 프론트는 이 문서를 read-only 로 구독하고 계산하지 않는다 — 클라이언트 근사 기록은
 * 서버 확정값과 어긋나 "축하한 기록이 나중에 바뀌는" 신뢰 붕괴를 만든다(설계 문서 §3.4a).
 */
import type { PrEntry, RunDistanceKey, RunPrTable } from "@shared/types/personal-records";
import { RUN_DISTANCES } from "@shared/types/personal-records";

export interface DistanceRecord {
  distance: RunDistanceKey;
  /** 현행 최고 기록. 해당 거리 기록이 없으면 null. */
  best: PrEntry | null;
  /** 현재 저장된 상위 3개. 전체 이력이나 활동 당시 순위가 아니다. */
  top: PrEntry[];
}

/** 표시 순서(짧은 거리 → 긴 거리)대로 각 거리의 현행 최고를 낸다. 없는 거리도 자리를 남긴다. */
export function distanceRecords(run: RunPrTable | undefined): DistanceRecord[] {
  return RUN_DISTANCES.map((distance) => {
    const entries = run?.[distance];
    const sorted = Array.isArray(entries)
      ? entries.filter(entry => entry && Number.isFinite(entry.value) && entry.value > 0)
        .slice().sort((a, b) => a.value - b.value)
      : [];
    // 같은 원본 활동의 중복 항목은 가장 빠른 기록 하나만 표시한다.
    const seen = new Set<string>();
    const top = sorted.filter(entry => {
      if (!entry.activityId) return true;
      if (seen.has(entry.activityId)) return false;
      seen.add(entry.activityId);
      return true;
    }).slice(0, 3);
    return { distance, best: top[0] ?? null, top };
  });
}

/** 저장된 상위 목록에서 이 활동이 현재 최고 또는 공동 최고인지 표시한다.
 * 전체 이력이 아니므로 최초 기록·활동 당시 갱신·직전 최고 대비 단축을 판정하지 않는다. */
export interface StoredBestForActivity {
  distance: RunDistanceKey;
  timeSec: number;
  tied: boolean;
}
export function storedBestRecordsForActivity(run: RunPrTable | undefined, activityId: string): StoredBestForActivity[] {
  return RUN_DISTANCES.flatMap((distance) => {
    const entries = run?.[distance]?.filter(entry => Number.isFinite(entry.value) && entry.value > 0);
    if (!entries?.length) return [];
    const minimum = Math.min(...entries.map(entry => entry.value));
    const current = entries.find(entry => entry.activityId === activityId && entry.value === minimum);
    return current ? [{ distance, timeSec: minimum, tied: entries.some(entry => entry.activityId !== activityId && entry.value === minimum) }] : [];
  });
}
