import type { SensorRejectionReason } from "./activityDetailDerived";
import { normalizeEpochMilliseconds } from "../../../utils/timestampUnit";

/** Retained slots must describe this share of the axis span to stay trustworthy. */
export const EXPLICIT_SENSOR_MIN_AXIS_COVERAGE = 0.5;
/** Measured seconds required against the whole session before a channel is trusted. */
export const EXPLICIT_SENSOR_MIN_SESSION_COVERAGE = 0.5;
/** Maximum plausible delay before the first GPS fix in rewritten legacy uploads. */
export const LEGACY_GPS_START_REWRITE_MAX_OFFSET_SECONDS = 300;

/**
 * App uploads bind both values to session start, but legacy server enrichment
 * could later replace the parent start with the first GPS timestamp. Accept
 * that lifecycle only when the parent, route and first retained sensor all
 * correlate; otherwise the parent session start remains authoritative.
 */
export function explicitOriginRejectionReason(
  rawOrigin: number,
  firstSensorOffsetSec: number,
  activityStartTime: unknown,
  routeStart: unknown,
): SensorRejectionReason | null {
  const activityStartEpochMs = normalizeEpochMilliseconds(activityStartTime);
  const routeStartEpochMs = normalizeEpochMilliseconds(routeStart);
  const firstSensorEpochMs = rawOrigin + firstSensorOffsetSec * 1000;
  if (!Number.isSafeInteger(firstSensorEpochMs)) return "origin_mismatch";
  if (activityStartEpochMs != null) {
    if (Math.abs(rawOrigin - activityStartEpochMs) < 1000) return null;
    const matchesLegacyEnrichment = routeStartEpochMs != null
      // V1 `relative_seconds` slots are integer buckets. The caller validates
      // the full axis first; keep the helper fail-closed when called directly.
      && Number.isSafeInteger(firstSensorOffsetSec)
      && firstSensorOffsetSec >= 0
      && firstSensorOffsetSec <= LEGACY_GPS_START_REWRITE_MAX_OFFSET_SECONDS
      && Math.abs(activityStartEpochMs - routeStartEpochMs) <= 1000
      && Math.abs(firstSensorEpochMs - routeStartEpochMs) <= 1000;
    return matchesLegacyEnrichment ? null : "origin_mismatch";
  }
  if (routeStartEpochMs == null) return null;
  return Math.abs(firstSensorEpochMs - routeStartEpochMs) <= 1000
    ? null
    : "origin_mismatch";
}

export function hasDenseArraySlots(values: readonly unknown[]): boolean {
  for (let index = 0; index < values.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(values, index)) return false;
  }
  return true;
}

export function hasValidExplicitSensorChannelValues(values: readonly unknown[]): boolean {
  if (!hasDenseArraySlots(values)) return false;
  return values.every((value) => value === null
    || (typeof value === "number" && Number.isFinite(value) && value >= 0));
}

export function hasValidLegacySensorChannelValues(values: readonly unknown[]): boolean {
  if (!hasDenseArraySlots(values)) return false;
  return values.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
}

/**
 * How much of the session the channel actually measured.
 *
 * A second can be unmeasured two ways — the slot is absent from the axis, or the
 * slot is present with a null value — and both mean the same thing: the sensor
 * had nothing to report. Strap dropouts, a head unit that keeps logging after the
 * chest strap dies, and auto-pause all produce them, so neither is evidence that
 * the payload belongs to a different ride. Judge the channel on the seconds it
 * did measure against the session, and let the axis-shape and origin gates
 * (`explicitAxisRejectionReason`, `explicitOriginRejectionReason`) speak for
 * integrity. An all-null or truncated-to-nothing channel still fails here.
 *
 * 서버 미러(`orider-g1-web` `stream-track-points.ts` `selectSensorChannel`,
 * `SENSOR_MIN_SESSION_COVERAGE`)도 같은 기준으로 맞춰져 있다 (g1-web#2204) —
 * 상세 화면과 summary 의 평균 심박/파워가 갈리지 않도록 바꿀 땐 둘을 함께 바꾼다.
 */
export function hasExplicitSessionMeasurementCoverage(
  measuredSlots: number,
  resolutionSeconds: number,
  sessionDurationSec: number,
): boolean {
  if (!(measuredSlots > 0) || !Number.isFinite(resolutionSeconds) || resolutionSeconds <= 0) return false;
  if (!Number.isFinite(sessionDurationSec) || sessionDurationSec <= 0) return false;
  return measuredSlots * resolutionSeconds >= sessionDurationSec * EXPLICIT_SENSOR_MIN_SESSION_COVERAGE;
}

/**
 * A V1 axis is a list of recorded second slots, not a dense range: auto-pause,
 * sensor dropouts and the uploader's size-driven thinning all remove slots while
 * every retained timestamp stays exact. Require a strictly ascending integer axis
 * and reject only when the retained seconds no longer describe the span.
 *
 * The 0.5 floor is shared with the Cloud Functions summary pipeline
 * (`stream-track-points.ts` `SENSOR_MIN_AXIS_COVERAGE`) and the app uploader
 * (`shared` `SensorStreamAxisPolicy`) — change all three together.
 */
export function explicitAxisRejectionReason(
  time: readonly number[],
  channelLength: number,
  timeUnit: unknown,
  resolutionSeconds: unknown,
): SensorRejectionReason | null {
  if (channelLength === 0 || channelLength !== time.length) return "invalid_axis";
  if (timeUnit !== "relative_seconds" || resolutionSeconds !== 1 || !Number.isFinite(resolutionSeconds)) {
    return "invalid_axis";
  }
  for (let index = 0; index < time.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(time, index)) return "invalid_axis";
    const timestamp = time[index];
    if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || timestamp < 0) return "invalid_axis";
    if (index > 0 && timestamp - time[index - 1]! < resolutionSeconds) return "invalid_axis";
  }
  const spanSec = time[time.length - 1]! - time[0]! + resolutionSeconds;
  return time.length * resolutionSeconds >= spanSec * EXPLICIT_SENSOR_MIN_AXIS_COVERAGE
    ? null
    : "sparse_axis";
}
