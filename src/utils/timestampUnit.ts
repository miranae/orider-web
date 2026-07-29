export type TimestampUnit = "epoch_ms" | "epoch_sec" | "relative_sec";

// 1973-03 in milliseconds and 1973-03 in seconds. These deliberately sit well
// below every supported activity date while keeping ordinary relative ride axes
// unambiguous. The previous 1e12 millisecond boundary excluded dates before 2001.
export const MIN_EPOCH_MILLISECONDS = 100_000_000_000;
export const MIN_EPOCH_SECONDS = 100_000_000;

export function detectTimestampUnit(value: number): TimestampUnit {
  if (!Number.isFinite(value) || value < 0) return "relative_sec";
  if (value >= MIN_EPOCH_MILLISECONDS) return "epoch_ms";
  return value >= MIN_EPOCH_SECONDS ? "epoch_sec" : "relative_sec";
}

export function detectConsistentTimestampUnit(
  values: readonly number[],
): TimestampUnit | undefined {
  if (values.length === 0) return undefined;
  const unit = detectTimestampUnit(values[0]!);
  return values.every((value) => Number.isFinite(value)
    && value >= 0
    && detectTimestampUnit(value) === unit
    && (unit !== "epoch_ms" || Number.isSafeInteger(value))
    && (unit !== "epoch_sec" || Number.isSafeInteger(value * 1000)))
    ? unit
    : undefined;
}

export function timestampDivisor(unit: TimestampUnit): number {
  return unit === "epoch_ms" ? 1000 : 1;
}

export function normalizeEpochMilliseconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  const unit = detectTimestampUnit(value);
  if (unit === "relative_sec") return undefined;
  const epochMs = unit === "epoch_ms" ? value : value * 1000;
  return Number.isSafeInteger(epochMs) ? epochMs : undefined;
}
