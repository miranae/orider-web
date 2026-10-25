/** Whole-activity averages use a distance/time quotient; sampling density is irrelevant. */
export function averageActivitySpeedKph(distanceM: number | null | undefined, movingTimeSec: number | null | undefined): number | null {
  return typeof distanceM === "number" && Number.isFinite(distanceM) && distanceM >= 0
    && typeof movingTimeSec === "number" && Number.isFinite(movingTimeSec) && movingTimeSec > 0
    ? distanceM / movingTimeSec * 3.6 : null;
}

/** A maximum is an observed peak, not the best multi-second average. Reject gross speed glitches. */
export function observedMaxSpeedKph(values: readonly (number | null | undefined)[] | null | undefined): number | null {
  let peak = 0;
  for (const value of values ?? []) {
    if (typeof value === "number" && Number.isFinite(value) && value > peak && value <= 33) peak = value;
  }
  return peak > 0 ? peak * 3.6 : null;
}
