import type { SensorRejectionReason } from "./activityDetailDerived";

/** Retained slots must describe this share of the axis span to stay trustworthy. */
export const EXPLICIT_SENSOR_MIN_AXIS_COVERAGE = 0.5;
/** Measured (non-null) share required among the slots an axis actually retained. */
export const EXPLICIT_SENSOR_MIN_MEASUREMENT_COVERAGE = 0.95;

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
 * Density of measurements *within the retained slots*. Whether the axis itself
 * covers the session is a separate gate (`explicitAxisRejectionReason`), so this
 * deliberately does not speak for the whole session.
 */
export function hasRetainedSlotMeasurementCoverage(measuredSlots: number, totalSlots: number): boolean {
  return totalSlots > 0
    && measuredSlots >= Math.ceil(totalSlots * EXPLICIT_SENSOR_MIN_MEASUREMENT_COVERAGE);
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
