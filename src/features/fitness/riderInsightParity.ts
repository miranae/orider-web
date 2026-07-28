import type { PdcDoc, RiderType } from "@shared/types/pdc";
import { hasDefinitiveRiderProfile } from "@shared/training/pdcRiderGate";
import { RIDER_DURATIONS, type CoachRiderInsight, type RiderDuration } from "../../services/coachRiderInsightContract";
import type { CyclingAbilityResult } from "./multisportPerformance";

export interface CanonicalRiderFitnessView {
  sourceRevision: string;
  asOf: string;
  status: CoachRiderInsight["status"];
  profile: { type: Exclude<RiderType, "Unclassified">; axisX: number; axisY: number; confidence: number } | null;
  ability: CoachRiderInsight["ability"];
  mmpWatts: CoachRiderInsight["mmpWatts"];
  activityCount: number;
  weightKgSnapshot: number | null;
  vo2maxEst: number | null;
}

function expectedStatus(pdc: PdcDoc): CoachRiderInsight["status"] {
  if (pdc.weightKgSnapshot == null) return "missing_weight";
  if (pdc.activityCount < 5) return "insufficient_activity";
  if (!pdc.riderType || pdc.riderType.type === "Unclassified" || pdc.riderType.confidence < 0.75) return "low_confidence";
  return "ok";
}

function sameNumber(a: number | null | undefined, b: number | null | undefined, tolerance = 0): boolean {
  return a == null || b == null ? a == null && b == null : Math.abs(a - b) <= tolerance;
}

export function buildCanonicalRiderFitnessView(pdc: PdcDoc | null | undefined, insight: CoachRiderInsight | null | undefined): CanonicalRiderFitnessView | null {
  if (!pdc || !insight || insight.discipline !== "bike" || insight.asOf !== new Date(pdc.computedAt).toISOString()
      || insight.status !== expectedStatus(pdc) || insight.activityCount !== pdc.activityCount
      || !sameNumber(insight.weightKgSnapshot, pdc.weightKgSnapshot)) return null;
  for (const duration of RIDER_DURATIONS) {
    if (!sameNumber(insight.mmpWatts[duration], pdc.mmpAll[duration]?.value ?? null)) return null;
  }
  const definitive = hasDefinitiveRiderProfile(pdc);
  if (definitive !== (insight.status === "ok" && insight.profile !== null)) return null;
  if (definitive && insight.profile && (insight.profile.type !== pdc.riderType.type
      || !sameNumber(insight.profile.axisX, pdc.riderType.axisX) || !sameNumber(insight.profile.axisY, pdc.riderType.axisY)
      || !sameNumber(insight.profile.confidence, pdc.riderType.confidence))) return null;
  const pdcRows = pdc.ability?.byDuration ?? []; const insightRows = insight.ability?.byDuration ?? [];
  if (!sameNumber(insight.ability?.overallPercentile, pdc.ability?.overallPercentile)
      || pdcRows.length !== insightRows.length || pdcRows.some((row) => {
        const match = insightRows.find((item) => item.duration === row.duration);
        return !match || !sameNumber(match.wPerKg, row.wPerKg, 0.05) || !sameNumber(match.percentile, row.percentile);
      })) return null;
  return {
    sourceRevision: insight.sourceRevision, asOf: insight.asOf, status: insight.status,
    profile: insight.profile, ability: insight.ability, mmpWatts: insight.mmpWatts,
    activityCount: insight.activityCount, weightKgSnapshot: insight.weightKgSnapshot, vo2maxEst: pdc.vo2maxEst,
  };
}

export function cyclingAbilityFromCanonicalRider(view: CanonicalRiderFitnessView | null): CyclingAbilityResult | null {
  if (!view?.profile || view.status !== "ok") return null;
  const definitions: Array<{ key: CyclingAbilityResult["axes"][number]["key"]; durations: RiderDuration[] }> = [
    { key: "anaerobic", durations: ["5s", "1m"] }, { key: "aerobic", durations: ["5m"] }, { key: "endurance", durations: ["20m"] },
  ];
  return {
    windowDays: 90, activityCount: view.activityCount, confidence: "high", sourceRevision: view.sourceRevision, asOf: view.asOf,
    axes: definitions.map(({ key, durations }) => {
      const evidence = durations.flatMap((duration) => {
        const row = view.ability?.byDuration.find((item) => item.duration === duration);
        const watts = view.mmpWatts[duration];
        return row ? [{ duration, watts, wPerKg: row.wPerKg, percentile: row.percentile }] : [];
      });
      const scores = evidence.map((item) => item.percentile);
      return { key, score: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
        confidence: scores.length === durations.length ? "high" as const : scores.length ? "low" as const : "none" as const, evidence };
    }),
  };
}
