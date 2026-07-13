import type { Activity, UserFitness } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import type { PdcDoc } from "@shared/types/pdc";
import type { RunDistanceKey, RunPrTable } from "@shared/types/personal-records";
import { estimateLoad, isSaneTss } from "@shared/training/activityLoad";
import { STALE_THRESHOLD_MS } from "@shared/training/staleness";

export const LOAD_FOCUS_WINDOW_DAYS = 28;
export const MIN_ZONE_COVERAGE = 0.5;

export type PerformanceDiscipline = "bike" | "run" | "swim" | "other";
export type LoadFocusBucket = "baseAerobic" | "highAerobic" | "highIntensity" | "unclassified";
export type EvidenceConfidence = "high" | "medium" | "low" | "none";

export interface LoadFocusResult {
  windowDays: number;
  totalLoad: number;
  buckets: Record<LoadFocusBucket, number>;
  sourceLoad: { power: number; heartRate: number; unclassified: number };
  disciplineLoad: Record<PerformanceDiscipline, number>;
  activityCount: number;
  coveragePct: number;
  confidence: EvidenceConfidence;
  hasAnaerobicBikeDetail: boolean;
}

export interface CyclingAbilityAxis {
  key: "anaerobic" | "aerobic" | "endurance";
  score: number | null;
  confidence: EvidenceConfidence;
  evidence: Array<{ duration: string; watts: number | null; wPerKg: number | null; percentile: number | null }>;
}

export interface CyclingAbilityResult {
  windowDays: 90;
  axes: CyclingAbilityAxis[];
  confidence: EvidenceConfidence;
  activityCount: number;
}

export interface RunEvidence {
  thresholdPaceSec: number | null;
  records: Array<{ distance: RunDistanceKey; seconds: number; date: string }>;
}

export interface SwimEvidence {
  cssSecPer100m: number | null;
  swolfAvg: number | null;
  distancePerStrokeM: number | null;
  activityCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BIKE_TYPES = ["ride", "virtualride", "ebikeride", "gravelride", "mountainbikeride", "velolift", "cycling"];
const RUN_TYPES = ["run", "virtualrun", "trailrun", "walk", "hike", "running"];
const SWIM_TYPES = ["swim", "swimming"];

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function classifyPerformanceDiscipline(type?: string, metricsDiscipline?: ActivityMetrics["discipline"]): PerformanceDiscipline {
  const normalized = (type ?? "").toLowerCase();
  if (BIKE_TYPES.some((candidate) => normalized.includes(candidate))) return "bike";
  if (RUN_TYPES.some((candidate) => normalized.includes(candidate))) return "run";
  if (SWIM_TYPES.some((candidate) => normalized.includes(candidate))) return "swim";
  // raw type이 비어 있는 구형 문서에만 metrics discipline을 보조 근거로 쓴다.
  // 알려지지 않은 raw type을 bike로 기본 분류하면 기타 활동 부하가 사라진다.
  if (!normalized && (metricsDiscipline === "bike" || metricsDiscipline === "run" || metricsDiscipline === "swim")) return metricsDiscipline;
  return "other";
}

function activityLoad(activity: Activity, metrics?: ActivityMetrics): number {
  const candidates = [
    metrics?.tss,
    (activity as Activity & { tss?: number | null }).tss,
    activity.summary.tss,
  ];
  const authoritative = candidates.find(isSaneTss);
  const discipline = classifyPerformanceDiscipline(activity.type, metrics?.discipline);
  return estimateLoad({
    precomputedTss: authoritative,
    avgPower: metrics?.avgPower ?? activity.summary.averagePower,
    ftp: metrics?.contextSnapshot?.ftp ?? activity.ftp,
    relativeEffort: activity.summary.relativeEffort,
    durationMillis: activity.summary.ridingTimeMillis,
    discipline: discipline === "other" ? undefined : discipline,
  }).value;
}

function addAllocated(
  buckets: Record<LoadFocusBucket, number>,
  load: number,
  zones: readonly number[],
  groups: readonly LoadFocusBucket[],
  representativeIntensity: readonly number[],
): boolean {
  // 부하는 단순 체류시간이 아니라 대표 상대강도의 제곱(IF²)으로 가중한다.
  // 이 값은 활동의 정본 총부하를 버킷에 배분하는 비율일 뿐 총부하를 다시 계산하지 않는다.
  const valid = groups.map((_, index) => finitePositive(zones[index])
    ? zones[index]! * representativeIntensity[index]! ** 2
    : 0);
  const total = valid.reduce((sum, weightedSeconds) => sum + weightedSeconds, 0);
  if (total <= 0) return false;
  for (let index = 0; index < valid.length; index++) {
    buckets[groups[index]!] += load * valid[index]! / total;
  }
  return true;
}

function hasSufficientZoneCoverage(zones: readonly number[], zoneCount: number, durationSec: number): boolean {
  if (!finitePositive(durationSec)) return false;
  const measuredSec = zones.slice(0, zoneCount).reduce(
    (sum, value) => sum + (finitePositive(value) ? value : 0),
    0,
  );
  return measuredSec / durationSec >= MIN_ZONE_COVERAGE;
}

function confidenceFromCoverage(coveragePct: number): EvidenceConfidence {
  if (coveragePct >= 80) return "high";
  if (coveragePct >= 50) return "medium";
  if (coveragePct > 0) return "low";
  return "none";
}

/**
 * 최근 28일 각 활동의 정본 부하를 존 체류시간×대표 상대강도² 비율로 단 한 번 배분한다.
 * bike power Z1-7이 있으면 HR을 함께 세지 않고, 근거가 없거나 지원하지 않는 종목의
 * 부하는 unclassified에 남겨 총부하 보존을 보장한다.
 */
export function computeIntegratedLoadFocus(
  activities: ReadonlyArray<Activity>,
  metricsMap: ReadonlyMap<string, ActivityMetrics>,
  now: number,
  windowDays = LOAD_FOCUS_WINDOW_DAYS,
): LoadFocusResult {
  const cutoff = now - windowDays * DAY_MS;
  const buckets: Record<LoadFocusBucket, number> = { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 };
  const sourceLoad = { power: 0, heartRate: 0, unclassified: 0 };
  const disciplineLoad: Record<PerformanceDiscipline, number> = { bike: 0, run: 0, swim: 0, other: 0 };
  let activityCount = 0;
  let hasAnaerobicBikeDetail = false;

  for (const activity of activities) {
    if (activity.startTime < cutoff || activity.startTime > now) continue;
    const metrics = metricsMap.get(activity.id);
    const discipline = classifyPerformanceDiscipline(activity.type, metrics?.discipline);
    const load = activityLoad(activity, metrics);
    if (!finitePositive(load)) continue;
    activityCount++;
    disciplineLoad[discipline] += load;
    const durationSec = finitePositive(metrics?.durationSec)
      ? metrics.durationSec
      : Math.max(0, activity.summary.ridingTimeMillis) / 1000;

    const powerZones = metrics?.powerZoneSec ?? [];
    if (discipline === "bike" && hasSufficientZoneCoverage(powerZones, 7, durationSec) && addAllocated(buckets, load, powerZones, [
      "baseAerobic", "baseAerobic", "highAerobic", "highAerobic", "highAerobic", "highIntensity", "highIntensity",
    ], [0.45, 0.655, 0.83, 0.98, 1.13, 1.35, 1.6])) {
      sourceLoad.power += load;
      hasAnaerobicBikeDetail ||= finitePositive(powerZones[5]) || finitePositive(powerZones[6]);
      continue;
    }

    const hrZones = metrics?.hrZoneSec ?? [];
    if (discipline !== "other" && hasSufficientZoneCoverage(hrZones, 5, durationSec) && addAllocated(buckets, load, hrZones, [
      "baseAerobic", "baseAerobic", "highAerobic", "highAerobic", "highIntensity",
    ], [0.5, 0.65, 0.8, 0.95, 1.1])) {
      sourceLoad.heartRate += load;
      continue;
    }

    buckets.unclassified += load;
    sourceLoad.unclassified += load;
  }

  const totalLoad = Object.values(buckets).reduce((sum, value) => sum + value, 0);
  const classifiedLoad = sourceLoad.power + sourceLoad.heartRate;
  const coveragePct = totalLoad > 0 ? classifiedLoad / totalLoad * 100 : 0;
  // HR은 강도 근거이나 파워보다 정밀도가 낮다. 커버리지와 함께 신뢰도를 낮춰 표현한다.
  const weightedCoverage = totalLoad > 0 ? (sourceLoad.power + sourceLoad.heartRate * 0.65) / totalLoad * 100 : 0;

  return {
    windowDays,
    totalLoad,
    buckets,
    sourceLoad,
    disciplineLoad,
    activityCount,
    coveragePct,
    confidence: confidenceFromCoverage(weightedCoverage),
    hasAnaerobicBikeDetail,
  };
}

function axisConfidence(evidenceCount: number, expected: number, activityCount: number): EvidenceConfidence {
  const evidenceCoverage = evidenceCount / expected;
  const activityCoverage = Math.min(1, activityCount / 10);
  return confidenceFromCoverage(evidenceCoverage * activityCoverage * 100);
}

export function computeCyclingAbility(pdc: PdcDoc | null | undefined): CyclingAbilityResult | null {
  if (!pdc) return null;
  const mmpAll = pdc.mmpAll ?? {};
  const percentileByDuration = new Map(
    (pdc.ability?.byDuration ?? []).map((entry) => [entry.duration, entry.percentile]),
  );
  const definitions: Array<{ key: CyclingAbilityAxis["key"]; durations: Array<"5s" | "1m" | "5m" | "20m"> }> = [
    { key: "anaerobic", durations: ["5s", "1m"] },
    { key: "aerobic", durations: ["5m"] },
    { key: "endurance", durations: ["20m"] },
  ];
  const axes = definitions.map(({ key, durations }): CyclingAbilityAxis => {
    const evidence = durations.flatMap((duration) => {
      const watts = mmpAll[duration]?.value ?? null;
      const wPerKg = pdc.wPerKgAtKey?.[duration] ?? null;
      const percentile = percentileByDuration.get(duration) ?? null;
      if (watts == null && wPerKg == null && percentile == null) return [];
      return [{ duration, watts, wPerKg, percentile }];
    });
    const scores = evidence
      .map((item) => item.percentile)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return {
      key,
      score: scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
      confidence: axisConfidence(scores.length, durations.length, pdc.activityCount),
      evidence,
    };
  });
  const scoredAxes = axes.filter((axis) => axis.score != null);
  return {
    windowDays: 90,
    axes,
    confidence: axisConfidence(scoredAxes.length, axes.length, pdc.activityCount),
    activityCount: pdc.activityCount,
  };
}

export function buildRunEvidence(thresholdPaceSec: number | null | undefined, records: RunPrTable | undefined): RunEvidence {
  const order: RunDistanceKey[] = ["1km", "5km", "10km", "half", "full"];
  return {
    thresholdPaceSec: finitePositive(thresholdPaceSec) ? thresholdPaceSec : null,
    records: order.flatMap((distance) => {
      const best = records?.[distance]?.filter((entry) => finitePositive(entry.value)).sort((a, b) => a.value - b.value)[0];
      return best ? [{ distance, seconds: best.value, date: best.date }] : [];
    }),
  };
}

export function buildSwimEvidence(
  cssSecPer100m: number | null | undefined,
  activities: ReadonlyArray<Activity>,
  metricsMap: ReadonlyMap<string, ActivityMetrics>,
): SwimEvidence {
  const samples = activities.flatMap((activity) => {
    const metrics = metricsMap.get(activity.id);
    if (classifyPerformanceDiscipline(activity.type, metrics?.discipline) !== "swim") return [];
    const swolf = metrics?.swimMetrics?.swolfAvg ?? activity.summary.swolf;
    const distancePerStroke = metrics?.swimMetrics?.distancePerStroke;
    if (!finitePositive(swolf) && !finitePositive(distancePerStroke)) return [];
    return [{ swolf: finitePositive(swolf) ? swolf : null, distancePerStroke: finitePositive(distancePerStroke) ? distancePerStroke : null }];
  });
  const average = (values: number[]) => values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    cssSecPer100m: finitePositive(cssSecPer100m) ? cssSecPer100m : null,
    swolfAvg: average(samples.map((sample) => sample.swolf).filter((value): value is number => value != null)),
    distancePerStrokeM: average(samples.map((sample) => sample.distancePerStroke).filter((value): value is number => value != null)),
    activityCount: samples.length,
  };
}

export function authoritativeCombinedLoad(fitness: UserFitness | null | undefined, now = Date.now()) {
  if (!fitness) return null;
  const totals = [fitness.totalCTL, fitness.totalATL, fitness.totalTSB];
  if (!totals.every((value) => Number.isFinite(value))) return null;
  if (!Number.isFinite(fitness.updatedAt) || now - fitness.updatedAt > STALE_THRESHOLD_MS) return null;
  const disciplines = ["bike", "run", "swim"] as const;
  return {
    ctl: fitness.totalCTL,
    atl: fitness.totalATL,
    tsb: fitness.totalTSB,
    contributions: disciplines.flatMap((discipline) => {
      const breakdown = fitness.breakdown?.[discipline];
      return breakdown && Number.isFinite(breakdown.ctl) ? [{ discipline, ctl: breakdown.ctl }] : [];
    }),
  };
}
