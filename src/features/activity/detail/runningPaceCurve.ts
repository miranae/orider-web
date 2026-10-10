import type { ActivityMetrics } from "@shared/types/activity-metrics";

const RUN_PACE_DURATIONS_SEC = [30, 60, 180, 300, 600, 1200, 1800, 3600, 7200] as const;
const LEGACY_SPEED_DURATIONS = [["30s", 30], ["1m", 60], ["5m", 300], ["10m", 600], ["20m", 1200], ["30m", 1800], ["1h", 3600]] as const;

export interface RunningPaceCurvePresentation {
  sourceBasis: "run_metrics_pace_curve" | "speed_curve_kmh_converted" | null;
  points: Array<{ durationSeconds: number; paceSecPerKm: number }>;
}

/** 서버 커브의 단위만 바꾼다. 명시된 정본이 비었거나 무효이면 이전 속도 커브로 대체하지 않는다. */
export function runningPaceCurve(metrics: Pick<ActivityMetrics, "runMetrics" | "speedCurve">): RunningPaceCurvePresentation {
  const canonical = metrics.runMetrics?.paceCurve;
  if (canonical !== undefined) {
    const result: RunningPaceCurvePresentation = { sourceBasis: "run_metrics_pace_curve", points: [] };
    if (!Array.isArray(canonical) || canonical.length > RUN_PACE_DURATIONS_SEC.length) return result;
    for (const point of canonical) {
      if (!point || !RUN_PACE_DURATIONS_SEC.some(seconds => seconds === point.durationSec)
        || !Number.isFinite(point.paceSecPerKm) || point.paceSecPerKm <= 0
        || result.points.some(previous => previous.durationSeconds === point.durationSec)) return { ...result, points: [] };
      result.points.push({ durationSeconds: point.durationSec, paceSecPerKm: point.paceSecPerKm });
    }
    result.points.sort((a, b) => a.durationSeconds - b.durationSeconds);
    return result;
  }
  const speed = metrics.speedCurve;
  if (!speed || typeof speed !== "object" || Array.isArray(speed)) return { sourceBasis: null, points: [] };
  const points = LEGACY_SPEED_DURATIONS.flatMap(([key, durationSeconds]) => {
    const speedKph = speed[key];
    // 이전 speedCurve producer는 라이딩 커브 계약을 재사용하여 5km/h 미만을 내보내지 않는다.
    // 이 하한은 정본 러닝 페이스 커브에는 적용하지 않는다.
    return typeof speedKph === "number" && Number.isFinite(speedKph) && speedKph >= 5
      ? [{ durationSeconds, paceSecPerKm: 3600 / speedKph }] : [];
  });
  return { sourceBasis: "speed_curve_kmh_converted", points };
}
