import type { CyclingClimbObservations, TrainingAnalysisPeriodResult } from "@shared/types/training-analysis-periods";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const same = (a: number, b: number, scale = 1) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Number.EPSILON * 16 * Math.max(scale, Math.abs(a), Math.abs(b));
/** 검증된 저장 관측만 전달한다. 활동 전체 고도 품질로 개별 클라임 품질을 추정하지 않는다. */
export function validCyclingClimbObservations(value: unknown, period: TrainingAnalysisPeriodResult): value is CyclingClimbObservations {
  if (!object(value) || !exact(value, ["version", "scope", "climbQuality", "candidateActivityCount", "supportedActivityCount", "observedActivityCount", "noObservedActivityCount", "unsupportedActivityCount", "unavailableActivityCount", "truncated", "sources"])) return false;
  const keys = ["candidateActivityCount", "supportedActivityCount", "observedActivityCount", "noObservedActivityCount", "unsupportedActivityCount", "unavailableActivityCount"] as const;
  if (value.version !== 1 || value.scope !== "observed_representatives" || value.climbQuality !== "unknown" || !keys.every(k => count(value[k]))
    || value.candidateActivityCount !== period.coverage.representativeActivityCount || value.truncated !== period.coverage.truncated) return false;
  const v = value as unknown as CyclingClimbObservations;
  if (v.supportedActivityCount + v.unsupportedActivityCount > period.coverage.includedActivityCount || v.supportedActivityCount !== v.observedActivityCount + v.noObservedActivityCount || v.candidateActivityCount !== v.supportedActivityCount + v.unsupportedActivityCount + v.unavailableActivityCount
    || !Array.isArray(v.sources) || v.sources.length !== Math.min(v.observedActivityCount, 5)) return false;
  const seen = new Set<string>();
  for (let index = 0; index < v.sources.length; index++) {
    const s = v.sources[index], previous = v.sources[index - 1];
    if (!Object.prototype.hasOwnProperty.call(v.sources, index) || !object(s) || !exact(s, ["sourceActivityId", "startTime", "metricsRevision", "contributingActivityCount", "startKm", "endKm", "lengthKm", "elevationGainM", "avgGrade", "durationSec", "vam", "timingBasis", "wholeActivityElevationQuality", "sourceLayer"])) return false;
    const activity = period.activities.find(a => a.activityId === s.sourceActivityId);
    if (typeof s.sourceActivityId !== "string" || !s.sourceActivityId || s.sourceActivityId.length > 512 || s.sourceActivityId.includes("/") || seen.has(s.sourceActivityId)
      || !activity || !count(s.startTime) || s.startTime !== activity.startTime || s.startTime < period.fromInclusive || s.startTime >= period.toExclusive
      || typeof s.metricsRevision !== "string" || s.metricsRevision.length > 256 || !/^\d+:\d+$/u.test(s.metricsRevision) || s.contributingActivityCount !== 1
      || !finite(s.startKm) || s.startKm < 0 || !finite(s.endKm) || s.endKm <= s.startKm || !finite(s.lengthKm) || s.lengthKm <= 0
      || !same(s.lengthKm, s.endKm - s.startKm, Math.max(1, s.startKm, s.endKm))
      || activity.sourceBasis.distanceM === "canonical_metrics" && finite(activity.distanceM) && s.endKm > activity.distanceM / 1000 && !same(s.endKm, activity.distanceM / 1000)
      || !finite(s.elevationGainM) || s.elevationGainM <= 0 || !finite(s.avgGrade) || s.avgGrade <= 0 || !same(s.avgGrade, s.elevationGainM / (s.lengthKm * 1000) * 100)
      || s.timingBasis !== "stored_detector_time_unverified" || s.wholeActivityElevationQuality !== "reliable" || !["raw_parts", "inline_streams", "unknown"].includes(s.sourceLayer as string)
      || s.durationSec !== null && (!finite(s.durationSec) || s.durationSec <= 0)
      || s.vam !== null && (!count(s.vam) || s.durationSec === null || s.vam !== Math.round(s.elevationGainM / (s.durationSec as number) * 3600))) return false;
    if (previous && (previous.elevationGainM < s.elevationGainM || previous.elevationGainM === s.elevationGainM && (previous.startTime < s.startTime || previous.startTime === s.startTime && previous.sourceActivityId.localeCompare(s.sourceActivityId) > 0))) return false;
    seen.add(s.sourceActivityId);
  }
  return true;
}
