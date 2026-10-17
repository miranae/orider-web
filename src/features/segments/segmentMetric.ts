/** Preserve unknown measurements instead of formatting them as zero or NaN. */
export function segmentMetric(value: number | null | undefined, digits = 0, divisor = 1): string {
  return typeof value === "number" && Number.isFinite(value) ? (value / divisor).toFixed(digits) : "—";
}
