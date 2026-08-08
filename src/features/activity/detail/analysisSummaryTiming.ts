import type { ActivitySummary } from "@shared/types";

/** Merges server-derived moving/pause time only when the activity summary lacks it. */
export function resolveAnalysisSummaryTiming(
  summary: ActivitySummary,
  metrics: Pick<ActivitySummary, "movingTimeSec" | "pauseTimeSec"> | null | undefined,
): ActivitySummary {
  const movingTimeSec = summary.movingTimeSec ?? metrics?.movingTimeSec;
  const pauseTimeSec = summary.pauseTimeSec ?? metrics?.pauseTimeSec;
  if (movingTimeSec === summary.movingTimeSec && pauseTimeSec === summary.pauseTimeSec) return summary;
  return { ...summary, movingTimeSec, pauseTimeSec };
}
