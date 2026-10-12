/** 각 표본이 실제로 소유한 [start,end) 구간. 1Hz나 이동 시각을 추정하지 않는다. */
export interface StageMeasuredPowerInterval {
  startElapsedSec: number;
  endElapsedSec: number;
  powerW: number;
  /** 첫 표본은 true. 이어지는 true 경계도 넘어서 창을 만들지 않는다. */
  segmentStart: boolean;
}
export interface StageMeasuredPowerIntervals {
  version: 1;
  unit: "W";
  powerSource: "measured";
  virtualPower: false;
  state: "final";
  inputPending: false;
  timingBasis: "explicit_sample_owned_elapsed_intervals";
  activityElapsedSeconds: number;
  /** 정확한 연속 구간을 다시 계산한 뒤 Float64 표현이 이 선언과 일치하는지 검증한다. */
  longestContinuousSeconds: number;
  intervals: StageMeasuredPowerInterval[];
}
interface StagePowerDurationBasis {
  version: 1;
  scope: "whole_activity_observed_intervals";
  timingBasis: "explicit_sample_owned_elapsed_intervals" | "stored_native_one_second_slot_policy";
  sensorBucketOriginVerified?: false;
  originalClockVerified: false;
  quality: "unknown";
  collectionCompleteness: "unknown";
  unit: "W";
}
export type StagePowerDurationKernelResult = StagePowerDurationBasis & (
  { state: "available"; reason: null; requestedDurationSeconds: number; maxAveragePowerW: number;
    /** 내부 끝점/요청 길이는 정확한 이진 유리수다. 반환 앵커는 nearest-even Float64 표현이다. */
    windowStartElapsedSec: number; windowEndElapsedSec: number;
    observedSeconds: number; longestContinuousSeconds: number }
  | { state: "unavailable"; reason: "invalid_duration" | "invalid_input" | "unsupported_power" | "pending_input" | "duration_exceeds_continuous_input";
    requestedDurationSeconds: number | null; maxAveragePowerW: null; windowStartElapsedSec: null; windowEndElapsedSec: null;
    observedSeconds: number | null; longestContinuousSeconds: number | null }
);

/** 정수 ms 끝점을 seconds Float64로 바꾸기 전에 정확히 계산하는 저장 구간 분기. */
export interface StageStoredNativePowerIntervals {
  version: 1; unit: "W"; powerSource: "measured"; virtualPower: false;
  state: "final"; inputPending: false;
  timingBasis: "stored_native_one_second_slot_policy";
  timeUnit: "integer_milliseconds";
  sensorBucketOriginVerified: false;
  activityElapsedMilliseconds: number;
  longestContinuousMilliseconds: number;
  intervals: Array<{ startElapsedMs: number; endElapsedMs: number; powerW: number; segmentStart: boolean }>;
}
