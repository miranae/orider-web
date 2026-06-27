/**
 * activityTime — 활동 "시간" 표시 정책 (#236).
 *
 * orider 활동의 ridingTimeMillis 는 경과(elapsed) 시간이라 정지 구간을 포함한다.
 * 정지 시간이 큰 활동(예: 9h 57m / 3.3km)을 그대로 보여주면 "9시간 라이딩?" 오해.
 * activity_metrics 가 산출한 movingTimeSec/pauseTimeSec 가 있고 정지가 유의미(60s+)하면
 * 이동시간을 표시값으로, 아니면 경과시간을 쓴다. 상세(ActivityPage)·피드 카드
 * (ActivityCard/MobileFeedPage)가 이 단일 함수를 공유해 정책을 일원화한다.
 */

/** 60초 미만 정지는 표시 전환 트리거로 보지 않음 — 짧은 신호등 정차 등은 elapsed 와 사실상 동일. */
const PAUSE_THRESHOLD_MS = 60_000;

export interface ResolvedDuration {
  /** 표시할 시간 (ms) — usingMoving 이면 이동시간, 아니면 경과시간. */
  displayMs: number;
  /** 이동시간으로 전환됐는지 (정지 부연 표시 여부 판단용). */
  usingMoving: boolean;
  /** 경과(elapsed) 시간 ms. */
  elapsedMs: number;
  /** 이동(moving) 시간 ms — 데이터 없으면 null. */
  movingMs: number | null;
  /** 정지(pause) 시간 ms — 데이터 없으면 null. */
  pauseMs: number | null;
}

/**
 * @param src ridingTimeMillis(필수) + movingTimeSec/pauseTimeSec(선택, activity_metrics 비정규화).
 *   ActivitySummary 가 이 모양을 만족하므로 `resolveDuration(activity.summary)` 로 바로 호출 가능.
 *   ActivityPage 는 live metrics doc 값을 넣어 호출.
 */
export function resolveDuration(src: {
  ridingTimeMillis: number;
  movingTimeSec?: number | null;
  pauseTimeSec?: number | null;
}): ResolvedDuration {
  const elapsedMs = src.ridingTimeMillis;
  const movingMs = src.movingTimeSec != null && src.movingTimeSec > 0 ? src.movingTimeSec * 1000 : null;
  const pauseMs = src.pauseTimeSec != null && src.pauseTimeSec > 0 ? src.pauseTimeSec * 1000 : null;
  const usingMoving = movingMs != null && pauseMs != null && pauseMs >= PAUSE_THRESHOLD_MS;
  return {
    displayMs: usingMoving ? movingMs : elapsedMs,
    usingMoving,
    elapsedMs,
    movingMs,
    pauseMs,
  };
}

/**
 * 표시용 평균 속도(km/h) — 시간 표시 기준과 속도 기준을 일치시킨다 (#236 후속).
 * 이동시간으로 전환된(usingMoving) 활동만 거리/이동시간으로 재계산하고, 그 외엔 기존
 * averageSpeed(fallbackKph) 유지. orider 의 averageSpeed 는 거리/경과(정지 포함 → 낮음)이고
 * Strava 는 이미 이동 기준이므로, 전환 안 한 경우 fallback 이 올바른 값이다.
 *
 * @param distanceM 거리(m)
 * @param resolved resolveDuration 결과
 * @param fallbackKph 전환 안 했을 때 쓸 기존 평균 속도(km/h)
 */
export function resolveAvgSpeedKph(distanceM: number, resolved: ResolvedDuration, fallbackKph: number): number {
  if (resolved.usingMoving && resolved.movingMs != null && resolved.movingMs > 0 && distanceM > 0) {
    return (distanceM / 1000) / (resolved.movingMs / 3_600_000);
  }
  return fallbackKph;
}
