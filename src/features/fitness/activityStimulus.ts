import type { Activity } from "@shared/types";
import type { ActivityMetrics, WorkoutType } from "@shared/types/activity-metrics";

export type ActivityStimulusSource = "server-analysis" | "activity-summary" | "insufficient";

export interface ActivityStimulus {
  workoutType: WorkoutType | "unknown";
  confidence: number | null;
  source: ActivityStimulusSource;
  intensityFactor: number | null;
  durationSec: number | null;
  heartRateRecorded: boolean;
  ftp: number | null;
  decouplingPct: number | null;
}

type LegacySummary = Activity["summary"] & { movingTimeMillis?: number | null };

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function boundedConfidence(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : null;
}

function activityDurationSec(activity: Activity): number | null {
  const summary = activity.summary as LegacySummary;
  return finitePositive(summary.movingTimeSec)
    ?? (finitePositive(summary.movingTimeMillis) != null ? finitePositive(summary.movingTimeMillis)! / 1_000 : null)
    ?? (finitePositive(summary.ridingTimeMillis) != null ? finitePositive(summary.ridingTimeMillis)! / 1_000 : null)
    ?? (finitePositive(summary.elapsedTimeMillis) != null ? finitePositive(summary.elapsedTimeMillis)! / 1_000 : null);
}

function summaryIntensityFactor(activity: Activity): number | null {
  const explicit = finitePositive(activity.intensityFactor);
  if (explicit != null) return explicit;
  const normalizedPower = finitePositive(activity.summary.normalizedPower ?? activity.weightedAvgPower);
  const ftp = finitePositive(activity.ftp);
  return normalizedPower != null && ftp != null ? normalizedPower / ftp : null;
}

function conservativeWorkoutType(intensityFactor: number): WorkoutType {
  if (intensityFactor < 0.65) return "recovery";
  if (intensityFactor < 0.78) return "endurance";
  if (intensityFactor < 0.88) return "tempo";
  if (intensityFactor < 1.02) return "threshold";
  return "mixed";
}

/**
 * Describes the selected activity without inventing physiology from distance or duration.
 * Persisted server classification wins. A summary fallback is emitted only when an IF is
 * explicitly available or safely derivable from normalized power and the activity FTP.
 */
export function deriveActivityStimulus(
  activity: Activity,
  metrics?: ActivityMetrics | null,
): ActivityStimulus {
  const metricsIf = finitePositive(metrics?.if);
  const fallbackIf = summaryIntensityFactor(activity);
  const durationSec = finitePositive(metrics?.durationSec) ?? activityDurationSec(activity);
  const heartRateRecorded = finitePositive(metrics?.avgHr) != null
    || finitePositive(activity.summary.averageHeartRate) != null;

  if (metrics?.workoutType) {
    return {
      workoutType: metrics.workoutType,
      confidence: boundedConfidence(metrics.workoutTypeConfidence),
      source: "server-analysis",
      intensityFactor: metricsIf ?? fallbackIf,
      durationSec,
      heartRateRecorded,
      ftp: finitePositive(metrics.contextSnapshot?.ftp) ?? finitePositive(activity.ftp),
      decouplingPct: typeof metrics.decoupling?.decouplingPct === "number"
        && Number.isFinite(metrics.decoupling.decouplingPct)
        ? metrics.decoupling.decouplingPct
        : null,
    };
  }

  if (fallbackIf != null) {
    return {
      workoutType: conservativeWorkoutType(fallbackIf),
      confidence: null,
      source: "activity-summary",
      intensityFactor: fallbackIf,
      durationSec,
      heartRateRecorded,
      ftp: finitePositive(activity.ftp),
      decouplingPct: null,
    };
  }

  return {
    workoutType: "unknown",
    confidence: null,
    source: "insufficient",
    intensityFactor: null,
    durationSec,
    heartRateRecorded,
    ftp: finitePositive(activity.ftp),
    decouplingPct: null,
  };
}
