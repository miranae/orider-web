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

/** Repairs only isolated equal timestamps from legacy recorders. */
export function normalizeIsolatedTimestampEqualities(
  values: readonly number[],
): number[] | undefined {
  const unit = detectConsistentTimestampUnit(values);
  if (unit == null) return undefined;
  const normalized = [...values];
  const minimumStep = unit === "epoch_ms" ? 1 : 0.001;
  let hasPositiveProgress = false;
  for (let index = 1; index < normalized.length; index++) {
    const previous = normalized[index - 1]!;
    const current = normalized[index]!;
    if (current < previous) return undefined;
    if (current > previous) {
      hasPositiveProgress = true;
      continue;
    }
    if (index === normalized.length - 1
      || (index > 1 && values[index - 1] === values[index - 2])
      || values[index + 1]! <= current) return undefined;
    const next = normalized[index + 1]!;
    if (next - current > minimumStep) {
      normalized[index] = current + minimumStep;
    } else {
      const beforePair = normalized[index - 2];
      if (beforePair == null || current - beforePair <= minimumStep) return undefined;
      normalized[index - 1] = current - minimumStep;
    }
    hasPositiveProgress = true;
  }
  return values.length <= 1 || hasPositiveProgress ? normalized : undefined;
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
