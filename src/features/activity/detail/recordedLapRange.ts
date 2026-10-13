import type { LapData } from "@shared/types";
import { detectConsistentTimestampUnit } from "../../../utils/timestampUnit";
import { elapsedRangeRouteBounds, validElapsedRange, type ElapsedRange } from "./activityRangeSelection";

export type RecordedLap = Partial<LapData>;
export interface RecordedLapContext {
  source: string | undefined;
  activityStartMs: number;
  durationSec: number;
}

/** 저장된 같은 랩의 명시 epoch 경계만 사용한다. 거리/이동시간으로 위치를 만들지 않는다. */
export function recordedLapElapsedRange(lap: RecordedLap, context: RecordedLapContext, rawLaps?: readonly RecordedLap[]): ElapsedRange | null {
  if (context.source !== "orider" || !Number.isSafeInteger(context.activityStartMs) || context.activityStartMs <= 0) return null;
  let boundary = lap;
  // 과거 분석 요약은 경계를 제외했다. 같은 원본 행을 유일하게 대응할 수 있을 때만 보존된 경계를 읽는다.
  if (lap.startTimeMs === undefined && lap.endTimeMs === undefined && Array.isArray(rawLaps)) {
    if (!Number.isSafeInteger(lap.number) || !Number.isFinite(lap.durationMs) || !Number.isFinite(lap.distanceKm)) return null;
    const matching = rawLaps.filter(raw => raw && typeof raw === "object" && raw.number === lap.number && raw.durationMs === lap.durationMs && raw.distanceKm === lap.distanceKm);
    if (matching.length !== 1) return null;
    boundary = matching[0]!;
  }
  const start = boundary.startTimeMs, end = boundary.endTimeMs;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start! < context.activityStartMs || end! <= start!) return null;
  const range = { startOffsetSec: (start! - context.activityStartMs) / 1000, endOffsetSec: (end! - context.activityStartMs) / 1000 };
  return validElapsedRange(range, context.durationSec) ? range : null;
}

/** 같은 epoch-ms 표본 축을 확인한 뒤 기존 범위/지도/차트 resolver에 넘긴다. 상대 moving clock은 받지 않는다. */
export function resolveRecordedLapRange(lap: RecordedLap, context: RecordedLapContext, time: readonly number[] | undefined, rawLaps?: readonly RecordedLap[]): ElapsedRange | null {
  const range = recordedLapElapsedRange(lap, context, rawLaps);
  if (!range || !time || detectConsistentTimestampUnit(time) !== "epoch_ms") return null;
  const axis = Array.from(time, value => (value - context.activityStartMs) / 1000);
  if (axis.some((value, index) => !Object.prototype.hasOwnProperty.call(time, index) || !Number.isFinite(value)
    || value < 0 || value > context.durationSec || index > 0 && value <= axis[index - 1]!)) return null;
  const gaps = axis.slice(1).map((value, index) => value - axis[index]!).sort((a, b) => a - b);
  const gapLimit = (gaps[Math.floor(gaps.length / 2)] ?? 0) * 3;
  return elapsedRangeRouteBounds(axis, range, gapLimit) ? range : null;
}
