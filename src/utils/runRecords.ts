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
}

/** 표시 순서(짧은 거리 → 긴 거리)대로 각 거리의 현행 최고를 낸다. 없는 거리도 자리를 남긴다. */
export function distanceRecords(run: RunPrTable | undefined): DistanceRecord[] {
  return RUN_DISTANCES.map((distance) => {
    const entries = run?.[distance];
    // top-K 는 서버가 오름차순(빠른 순)으로 정렬해 저장하지만, 방어적으로 min 을 직접 고른다.
    const best =
      entries && entries.length > 0
        ? entries.reduce((a, b) => (b.value < a.value ? b : a))
        : null;
    return { distance, best };
  });
}

/**
 * 이 활동이 특정 거리의 현행 최고 기록을 세웠는가 — 활동 상세 배너용.
 *
 * 서버가 활동에 "PR 갱신" 플래그를 붙이지 않으므로, records 문서의 최고 기록 activityId 가
 * 이 활동과 같은지로 판정한다. 서버 확정 기록에만 의존하므로 클라이언트 근사가 없다.
 */
export interface NewRecordForActivity {
  distance: RunDistanceKey;
  timeSec: number;
  /** 직전 최고(있으면) 대비 단축된 초. 이 활동이 유일 기록이면 null. */
  improvedBySec: number | null;
}

export function newRecordsForActivity(
  run: RunPrTable | undefined,
  activityId: string,
): NewRecordForActivity[] {
  const out: NewRecordForActivity[] = [];
  for (const distance of RUN_DISTANCES) {
    const entries = run?.[distance];
    if (!entries || entries.length === 0) continue;
    // 동률일 때 정렬이 흔들리면 배너 노출 여부가 비결정적이 된다 — activityId 로 tie-break.
    const sorted = [...entries].sort((a, b) => a.value - b.value || a.activityId.localeCompare(b.activityId));
    const best = sorted[0]!;
    if (best.activityId !== activityId) continue; // 이 활동이 현행 최고가 아니면 배너 없음

    // 다른 활동 중 가장 빠른 것 = 직전 최고. 동률이면 기록을 "갱신"한 게 아니므로 배너를 띄우지 않는다
    // (더 빠르지 않은데 "신기록"이라 말하면 거짓말이다).
    const previous = sorted.find((e) => e.activityId !== activityId);
    if (previous && previous.value <= best.value) continue;
    // 스트림 보간으로 뽑은 값이라 소수일 수 있다. 반올림하지 않으면 공유 문구가
    // "41.29999999초 단축" 이 된다 — 카카오톡으로 그대로 나간다.
    // 반올림 결과가 0 이면(0.5초 미만 단축) 단축 문구 자체를 생략한다 — "0초 단축" 은 말이 안 된다.
    const improved = previous ? Math.round(previous.value - best.value) : 0;
    out.push({
      distance,
      timeSec: best.value,
      improvedBySec: improved > 0 ? improved : null,
    });
  }
  return out;
}
