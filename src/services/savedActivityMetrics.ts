import type { ActivitySummary } from "@shared/types";
import type { ActivityMetricsDoc } from "../hooks/useActivityMetrics";
/** Only the producer's saved-coverage witness distinguishes a preserved result from new incomplete inputs. */
export function savedActivityMetrics(value: Record<string, unknown>): { metrics: ActivityMetricsDoc | null; retained: boolean } {
  const envelope = "schemaVersion" in value || "status" in value;
  if (envelope && (value.status !== "final" || !value.metrics || typeof value.metrics !== "object" || Array.isArray(value.metrics))) return { metrics: null, retained: false };
  const raw = envelope ? value.metrics as Record<string, unknown> : value;
  const retained = !envelope && raw.inputPending === true && (raw.savedInputCoverage === "complete" || raw.savedInputCoverage === "partial_terminal");
  return { metrics: (retained ? { ...raw, inputCoverage: raw.savedInputCoverage, inputPending: false } : raw) as unknown as ActivityMetricsDoc, retained };
}

/** A historical result cannot borrow averages or timing from the current activity projection. */
export function savedActivitySummary(metrics: ActivityMetricsDoc): ActivitySummary {
  const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
  const scaled = (value: unknown, factor: number) => { const n = finite(value); return n === null ? null : n * factor; };
  // Legacy ActivitySummary types require some numbers; missing historical observations remain null at runtime.
  return {
    distance: metrics.distanceSource === null ? null : scaled(metrics.distanceKm, 1000),
    ridingTimeMillis: scaled(metrics.durationSec, 1000), elapsedTimeMillis: scaled(metrics.durationSec, 1000),
    movingTimeSec: finite(metrics.movingTimeSec), pauseTimeSec: finite(metrics.pauseTimeSec),
    averageSpeed: finite(metrics.avgSpeedKph), maxSpeed: finite(metrics.maxSpeedKph),
    averageCadence: finite(metrics.avgCadence), maxCadence: finite(metrics.maxCadence),
    averageHeartRate: finite(metrics.avgHr), maxHeartRate: finite(metrics.maxHr),
    averagePower: finite(metrics.avgPower), maxPower: finite(metrics.maxPower), normalizedPower: finite(metrics.np),
    elevationGain: finite(metrics.elevationGainM), calories: finite(metrics.caloriesKcal),
    relativeEffort: finite(metrics.trimp), tss: finite(metrics.tss), streamTrimpTss: finite(metrics.streamTrimpTss),
    swolf: finite(metrics.swimMetrics?.swolfAvg),
    ...metrics.analysisSummary?.correctedAverages,
  } as unknown as ActivitySummary;
}
