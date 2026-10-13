import type { PowerCurvePeriodResult, PowerCurvePeriodsResponse, WeightNormalizedDurationPoint } from "@shared/types/power-curve-periods";
import type { ObservedPeriodPowerDurationPoint } from "@shared/types/power-duration-periods";

export const POWER_SKILLS_DURATIONS = [15, 30, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600] as const;
export type PowerSkillsCell = { state: "observed"; value: number; point: ObservedPeriodPowerDurationPoint | WeightNormalizedDurationPoint }
  | { state: "missing_exact_duration" | "channel_unavailable" | "qualification_unverified" | "weight_unavailable" };

/** 고정85 관측 계약만 사용한다. 기존11/임의 지속시간/가상 파워를 합치지 않는다. */
export function powerSkillsObservedCell(period: PowerCurvePeriodResult, duration: number, unit: "W" | "W/kg"): PowerSkillsCell {
  const original = period.powerDurationObservations;
  if (unit === "W/kg" && original && !original.points.some(candidate => candidate.durationSeconds === duration)) return { state: "missing_exact_duration" };
  const channel = unit === "W/kg" ? period.weightNormalized?.powerDurationObservations : original;
  if (!channel) return { state: unit === "W/kg" && original ? "weight_unavailable" : "channel_unavailable" };
  if (channel.algorithmVersion !== "power-duration-grid-v1" || channel.gridVersion !== 1 || channel.timingBasis !== "sample_owned_elapsed"
    || channel.scope !== "observed_power_candidates" || channel.fromInclusive !== period.fromInclusive || channel.toExclusive !== period.toExclusive)
    return { state: "qualification_unverified" };
  const point = channel.points.find(candidate => candidate.durationSeconds === duration);
  if (!point) return { state: unit === "W/kg" && original?.points.some(candidate => candidate.durationSeconds === duration) ? "weight_unavailable" : "missing_exact_duration" };
  if (!["strava_api", "direct_file", "orider_native"].includes(point.provenance) || !point.parentRevision || !point.sourceActivityId
    || !Number.isFinite(point.maxAveragePowerW) || point.maxAveragePowerW < 0 || !Number.isInteger(point.observedActivityCount) || point.observedActivityCount < 1)
    return { state: "qualification_unverified" };
  if (unit === "W/kg") {
    if (period.weightNormalized?.basis !== "calculation_profile_snapshot" || !("basis" in channel) || channel.basis !== "calculation_profile_snapshot") return { state: "weight_unavailable" };
    if (!("maxAveragePowerWPerKg" in point) || !("weightKg" in point) || !("weightRevision" in point)
      || typeof point.weightKg !== "number" || !Number.isFinite(point.weightKg) || point.weightKg <= 0 || !point.weightRevision
      || typeof point.maxAveragePowerWPerKg !== "number" || !Number.isFinite(point.maxAveragePowerWPerKg) || point.maxAveragePowerWPerKg < 0)
      return { state: "weight_unavailable" };
    return { state: "observed", value: point.maxAveragePowerWPerKg, point };
  }
  return { state: "observed", value: point.maxAveragePowerW, point };
}
export function powerSkillsObservedRows(response: PowerCurvePeriodsResponse, unit: "W" | "W/kg") {
  return POWER_SKILLS_DURATIONS.map(durationSeconds => ({ durationSeconds, cells: response.periods.map(period => powerSkillsObservedCell(period, durationSeconds, unit)) }));
}
export function powerSkillsDisplayValue(value: number, unit: "W" | "W/kg") {
  const quantum = unit === "W/kg" ? 0.01 : 0.1;
  return value > 0 && value < quantum ? `<${quantum}` : value.toFixed(unit === "W/kg" ? 2 : 1);
}
