import { detectConsistentTimestampUnit } from "../../../utils/timestampUnit";

export interface RouteElapsedAxisInput {
  time: readonly number[];
  activityStartEpochMs?: number;
  elapsedDurationSec: number;
  movingDurationSec: number | null;
  /** raw_parts 등에서 route time이 elapsed clock임을 확인했을 때만 true. */
  routeElapsedConfirmed?: boolean;
  relativeTimeUnit?: "seconds" | "milliseconds";
}

/** UI 위치만 대응한다. 평균·파워·이동시간 등 분석 수치는 여기서 계산하지 않는다. */
export function confirmedRouteElapsedAxis(input: RouteElapsedAxisInput): number[] | null {
  const { time, elapsedDurationSec, movingDurationSec, activityStartEpochMs } = input;
  const values = Array.from(time);
  const unit = detectConsistentTimestampUnit(values);
  if (!unit || values.length < 2 || !Number.isFinite(elapsedDurationSec) || elapsedDurationSec <= 0) return null;
  if (unit !== "relative_sec" && (!Number.isFinite(activityStartEpochMs) || activityStartEpochMs! <= 0)) return null;
  const divisor = unit === "epoch_ms" || unit === "relative_sec" && input.relativeTimeUnit === "milliseconds" ? 1000 : 1;
  const axis = values.map(value => unit === "epoch_ms" ? (value - activityStartEpochMs!) / 1000
    : unit === "epoch_sec" ? (value * 1000 - activityStartEpochMs!) / 1000 : value / divisor);
  if (axis.some((value, index) => !Number.isFinite(value) || value < 0 || value > elapsedDurationSec
    || index > 0 && value <= axis[index - 1]!)) return null;
  const legacyAligned = movingDurationSec !== null && Number.isFinite(movingDurationSec) && movingDurationSec > 0
    && (movingDurationSec >= elapsedDurationSec || axis[axis.length - 1]! > movingDurationSec);
  if (unit === "relative_sec" && !input.routeElapsedConfirmed && !legacyAligned) return null;
  return axis;
}

export interface ElapsedRange { startOffsetSec: number; endOffsetSec: number }
export function validElapsedRange(range: ElapsedRange, durationSec: number): boolean {
  return Number.isFinite(durationSec) && durationSec > 0 && Number.isFinite(range.startOffsetSec) && range.startOffsetSec >= 0
    && Number.isFinite(range.endOffsetSec) && range.endOffsetSec > range.startOffsetSec && range.endOffsetSec <= durationSec;
}

/** 시작 포함·끝 제외 경계. 마지막 관측을 연장하거나 보완하지 않는다. */
export function elapsedRangeRouteBounds(axis: readonly number[], range: ElapsedRange, maxInterpolationGapSec: number) {
  const values = Array.from(axis);
  if (!Number.isFinite(maxInterpolationGapSec) || maxInterpolationGapSec <= 0 || values.length < 2
    || values.some((value, index) => !Number.isFinite(value) || value < 0 || index > 0 && value <= values[index - 1]!)
    || !validElapsedRange(range, values[values.length - 1]!) || values[0]! > range.startOffsetSec) return null;
  let first = 0;
  while (first + 1 < values.length && values[first + 1]! <= range.startOffsetSec) first++;
  const last = values.findIndex((value, index) => index > first && value >= range.endOffsetSec);
  if (last < 0) return null;
  // 화면의 선도 미관측의 긴 공백을 이어 붙이지 않는다.
  for (let index = first; index < last; index++) if (values[index + 1]! - values[index]! > maxInterpolationGapSec) return null;
  return { startIndex: first, endIndex: last,
    clippedBoundary: values[first] !== range.startOffsetSec || values[last] !== range.endOffsetSec };
}

/** 정지 중에는 거리가 중복된다. 원시 인덱스가 없는 다운샘플을 거리로 역산하지 않는다. */
export function elapsedRangeFromChartSelection(axis: readonly number[], sourceIndices: readonly number[], selection: readonly [number, number]): ElapsedRange | null {
  const [first, last] = selection;
  if (Array.from(axis).some((value, index) => !Number.isFinite(value) || value < 0 || index > 0 && value <= axis[index - 1]!)
    || !Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last <= first || last >= sourceIndices.length
    || Array.from(sourceIndices).some((index, position) => !Number.isInteger(index) || index < 0 || index >= axis.length
      || position > 0 && index <= sourceIndices[position - 1]!)) return null;
  const range = { startOffsetSec: axis[sourceIndices[first]!]!, endOffsetSec: axis[sourceIndices[last]!]! };
  return validElapsedRange(range, axis[axis.length - 1]!) ? range : null;
}

/** 사용자 입력은 시계 표기, API 요청은 경과 초. 소수 경계도 숨기지 않는다. */
export function formatElapsedBoundary(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "";
  const normalized = Math.round(value * 1e6) / 1e6;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor(normalized / 60) % 60;
  const seconds = (normalized % 60).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  const secondText = Number(seconds) < 10 ? `0${seconds}` : seconds;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secondText}` : `${minutes}:${secondText}`;
}
export function parseElapsedBoundary(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,3}:\d{2}(?::\d{2})?(?:\.\d{1,6})?$/.test(text)) return null;
  const parts = text.split(":").map(Number);
  const seconds = parts[parts.length - 1]!;
  const minutes = parts.length === 3 ? parts[1]! : parts[0]!;
  if (seconds >= 60 || parts.length === 3 && minutes >= 60) return null;
  return (parts.length === 3 ? parts[0]! * 3600 : 0) + minutes * 60 + seconds;
}
