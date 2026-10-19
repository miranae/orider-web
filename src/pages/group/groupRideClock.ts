import type { Activity, ActivityStreams } from "@shared/types";
import { detectConsistentTimestampUnit, normalizeEpochMilliseconds } from "../../utils/timestampUnit";

/** 출처가 확인된 시각만 비교한다. 기기 시계 오차를 보정하거나 이동시간을 역산하지 않는다. */
export function groupRideClock(activity: Pick<Activity, "source" | "startTime">, stream?: ActivityStreams): number[] | null {
  const time = stream?.time;
  if (!time?.length || stream?.distance && time.length !== stream.distance.length) return null;
  const start = normalizeEpochMilliseconds(activity.startTime);
  const unit = detectConsistentTimestampUnit(time);
  if (start == null || !unit || unit === "relative_sec" && activity.source !== "strava") return null;
  const axis = time.map(value => unit === "relative_sec" ? start + value * 1000 : normalizeEpochMilliseconds(value)!);
  return axis.every((value, index) => Number.isSafeInteger(value) && Number.isFinite(new Date(value).getTime())
    && (index === 0 || value > axis[index - 1]!)) ? axis : null;
}

/** 불규칙한 긴 공백을 채우지 않는다. 허용 오차는 평소 표본 간격의 3배, 최대 30초다. */
export function clockSampleTolerance(axis: readonly number[] | null | undefined): number {
  const steps = (axis ?? []).slice(1).map((value, position) => value - axis![position]!).sort((a, b) => a - b);
  const typicalStep = steps.length ? steps[Math.floor((steps.length - 1) / 2)]! : 0;
  return Math.min(30_000, typicalStep * 3);
}

export function nearestClockSample(axis: readonly number[] | null | undefined, target: number, tolerance = clockSampleTolerance(axis)): number {
  if (!axis?.length || target < axis[0]! || target > axis[axis.length - 1]!) return -1;
  let low = 0; let high = axis.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (axis[middle]! < target) low = middle + 1; else high = middle;
  }
  const index = low > 0 && Math.abs(axis[low - 1]! - target) <= Math.abs(axis[low]! - target) ? low - 1 : low;
  return Math.abs(axis[index]! - target) <= tolerance ? index : -1;
}
