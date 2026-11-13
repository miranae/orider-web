import type { StravaSummaryV1 } from "./stravaRecord";

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
  stravaRecord?: StravaSummaryV1 | null;
  startTime?: number | null;
  endTime?: number | null;
  elapsedTimeMillis?: number | null;
  movingTimeSec?: number | null;
  pauseTimeSec?: number | null;
}): ResolvedDuration {
  if (src.stravaRecord) {
    const r = src.stravaRecord;
    const movingMs = r.moving_time == null ? null : r.moving_time * 1000;
    const elapsedMs = r.elapsed_time == null ? NaN : r.elapsed_time * 1000;
    return { displayMs: movingMs ?? elapsedMs, usingMoving: movingMs != null, movingMs, elapsedMs,
      pauseMs: movingMs != null && Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs - movingMs) : null };
  }
  const activitySpanMs = src.startTime != null && src.endTime != null && src.endTime > src.startTime
    ? src.endTime - src.startTime
    : null;
  const elapsedMs = src.elapsedTimeMillis != null && src.elapsedTimeMillis > 0
    ? src.elapsedTimeMillis
    : activitySpanMs ?? src.ridingTimeMillis;
  const movingMs = src.movingTimeSec != null && src.movingTimeSec > 0 ? src.movingTimeSec * 1000 : null;
  const explicitPauseMs = src.pauseTimeSec != null && src.pauseTimeSec >= 0 ? src.pauseTimeSec * 1000 : null;
  const pauseMs = explicitPauseMs ?? (movingMs != null && elapsedMs >= movingMs ? elapsedMs - movingMs : null);
  const usingMoving = movingMs != null && pauseMs != null && pauseMs >= PAUSE_THRESHOLD_MS;
  return {
    displayMs: usingMoving ? movingMs : elapsedMs,
    usingMoving,
    elapsedMs,
    movingMs,
    pauseMs,
  };
}
