const validTimestamp = (value: unknown): value is { seconds: number; nanoseconds: number } => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const timestamp = value as Record<string, unknown>;
  return Number.isSafeInteger(timestamp.seconds) && (timestamp.seconds as number) >= 0
    && Number.isInteger(timestamp.nanoseconds) && (timestamp.nanoseconds as number) >= 0
    && (timestamp.nanoseconds as number) < 1_000_000_000;
};

/** 구조 근거는 unknown 부하를 허용한다. ready는 별도로 final 부하를 요구한다. */
export function validFitnessLoadSnapshotProof(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const load = value as Record<string, unknown>;
  const asOf = load.asOf;
  const points = load.points;
  const readTime = load.inputReadTime;
  if (typeof asOf !== "number" || !Array.isArray(points)) return false;
  const dateMillis = (value: unknown): number | null => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const millis = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value ? millis : null;
  };
  if (!Number.isSafeInteger(load.inputRevision) || (load.inputRevision as number) <= 0 || typeof load.inputDigest !== "string"
      || !/^[a-f0-9]{64}$/.test(load.inputDigest) || !Number.isSafeInteger(asOf) || asOf <= 0 || !Number.isFinite(new Date(asOf).getTime())
      || !validTimestamp(readTime) || Math.floor(readTime.seconds * 1000 + readTime.nanoseconds / 1_000_000) !== asOf) return false;
  const start = dateMillis(load.coverageStartDate);
  const end = dateMillis(load.coverageEndDate);
  if (start == null || end == null || end < start || load.coverageEndDate !== new Date(asOf).toISOString().slice(0, 10)
      || points.length === 0 || points.length !== (end - start) / 86_400_000 + 1) return false;
  for (let index = 0; index < points.length; index++) {
    const point = points[index] as Record<string, unknown>;
    if (!point || typeof point !== "object" || !["final", "unknown"].includes(point.status as string)
        || dateMillis(point.date) !== start + index * 86_400_000
        || typeof point.dailyLoad !== "number" || !Number.isFinite(point.dailyLoad) || point.dailyLoad < 0
        || !["precomputed", "estimated", "zero", "mixed"].includes(point.quality as string)) return false;
  }
  return true;
}

/** Fitness 완료 입력의 공용 순수 계약. pending/failed/unknown은 확정값으로 승격하지 않는다. */
export type CanonicalFitnessInputsLifecycle = "ready" | "pending" | "unavailable";

/** 기존 추천의 legacy 호환을 유지하되 새 소비자는 requireSnapshot으로 같은 완료 입력의 근거를 요구한다. */
export function canonicalFitnessInputsLifecycle(
  timeseriesValue: unknown,
  summaryValue: unknown,
  discipline: "bike" | "run" | "swim",
  options: { requireSnapshot?: boolean } = {},
): CanonicalFitnessInputsLifecycle {
  if (!timeseriesValue || typeof timeseriesValue !== "object"
      || !summaryValue || typeof summaryValue !== "object") return "unavailable";
  const timeseries = timeseriesValue as Record<string, unknown>;
  const summary = summaryValue as Record<string, unknown>;
  if (timeseries.discipline !== discipline || summary.discipline !== discipline) return "unavailable";

  const lifecycleShaped = "loadSnapshot" in timeseries || "pmc" in timeseries || "inputInvalidatedAt" in timeseries;
  if (!lifecycleShaped) return options.requireSnapshot ? "unavailable" : "ready";
  const load = timeseries.loadSnapshot as Record<string, unknown> | undefined;
  const pmc = timeseries.pmc as Record<string, unknown> | undefined;
  if (!load || !pmc || !Number.isSafeInteger(load.inputRevision) || (load.inputRevision as number) < 0
      || pmc.status !== "processed"
      || pmc.inputRevision !== load.inputRevision || pmc.processedInputRevision !== load.inputRevision) return "pending";
  const readTime = load.inputReadTime as { seconds?: unknown; nanoseconds?: unknown } | undefined;
  const invalidatedAt = timeseries.inputInvalidatedAt as { seconds?: unknown; nanoseconds?: unknown } | undefined;
  if (invalidatedAt) {
    if (!readTime || typeof invalidatedAt.seconds !== "number" || typeof invalidatedAt.nanoseconds !== "number"
        || typeof readTime.seconds !== "number" || typeof readTime.nanoseconds !== "number"
        || invalidatedAt.seconds > readTime.seconds
        || invalidatedAt.seconds === readTime.seconds && invalidatedAt.nanoseconds > readTime.nanoseconds) return "pending";
  }
  const points = load.points;
  if (!Array.isArray(points) || points.some((point) => !point || typeof point !== "object"
      || (point as Record<string, unknown>).status !== "final")) return "pending";
  const asOf = load.asOf;
  if (typeof asOf !== "number" || timeseries.computedAt !== asOf || summary.computedAt !== asOf) return "pending";
  if (!validFitnessLoadSnapshotProof(load) || invalidatedAt != null && !validTimestamp(invalidatedAt)) return "pending";
  return "ready";
}
