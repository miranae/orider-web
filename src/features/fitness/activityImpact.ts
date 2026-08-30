import type { Activity } from "@shared/types";
import {
  ATL_DAYS,
  CTL_DAYS,
  type FitnessPoint,
} from "../../utils/fitnessMetrics";
import {
  dedupeSamePhysicalRides,
  groupSamePhysicalRides,
  pickPhysicalRideRepresentative,
} from "../../utils/samePhysicalRide";

export type ActivityImpactConfidence = "canonical-single" | "estimated-allocation";

export interface FitnessStateDelta {
  ctl: number;
  atl: number;
  tsb: number;
}

export interface ActivityImpactEntry {
  activity: Activity;
  /** The UTC calendar day whose canonical aggregate load backs this entry. */
  date: string;
  /** Canonical daily load, or a conservative allocation of it on multi-activity days. */
  attributedLoad: number;
  canonicalDailyLoad: number;
  confidence: ActivityImpactConfidence;
  /** Load-only EMA contribution. This is not an instantaneous before/after state. */
  marginalImpact: FitnessStateDelta;
  /** End-of-day state change versus the preceding UTC calendar day's canonical point. */
  actualDayChange: FitnessStateDelta | null;
  daysSince: number;
  /** Portion of this activity's marginal EMA contribution remaining after daysSince. */
  remainingContribution: FitnessStateDelta;
}

export interface DeriveActivityImpactOptions {
  /** UTC day (YYYY-MM-DD) used for recency and contribution decay. Defaults to the latest point. */
  asOfDate?: string;
  /** Maximum number of activity entries after deterministic newest-first sorting. */
  limit?: number;
}

export interface FitnessForecastPoint extends FitnessPoint {
  hoursAhead: 24 | 48;
}

export interface Fitness48HourForecast {
  /** No training load on either projected day. */
  rest: [FitnessForecastPoint, FitnessForecastPoint];
  /** Optional easy load on the first day, followed by a zero-load day. */
  easy?: [FitnessForecastPoint, FitnessForecastPoint];
}

type ActivityWithTopLevelTss = Activity & { tss?: number | null };
type ActivitySummaryWithLegacyMovingTime = Activity["summary"] & { movingTimeMillis?: number | null };

const DAY_MS = 86_400_000;

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isUtcDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && utcDayFromMillis(Date.parse(`${value}T00:00:00.000Z`)) === value;
}

function utcDayFromMillis(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function previousUtcDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - DAY_MS).toISOString().slice(0, 10);
}

function daysBetweenUtcDays(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);
}

function candidateTss(activity: Activity): number | null {
  const topLevel = (activity as ActivityWithTopLevelTss).tss;
  if (isFinitePositive(topLevel)) return topLevel;
  return isFinitePositive(activity.summary?.tss) ? activity.summary.tss : null;
}

function positiveNumber(value: unknown): number | null {
  return isFinitePositive(value) ? value : null;
}

function physicalRideIdentity(activity: Activity) {
  const summary = activity.summary as ActivitySummaryWithLegacyMovingTime;
  const legacyMovingMillis = positiveNumber(summary.movingTimeMillis);
  const ridingMillis = positiveNumber(summary.ridingTimeMillis);
  const elapsedMillis = positiveNumber(summary.elapsedTimeMillis);
  const movingSec = positiveNumber(summary.movingTimeSec)
    ?? (legacyMovingMillis != null ? Math.round(legacyMovingMillis / 1_000) : null)
    ?? (ridingMillis != null ? Math.round(ridingMillis / 1_000) : null)
    ?? (elapsedMillis != null ? Math.round(elapsedMillis / 1_000) : null);
  const distanceMeters = positiveNumber(activity.summary?.distance);
  return {
    activity,
    id: activity.id,
    source: activity.source ?? null,
    startTime: activity.startTime,
    distanceKm: distanceMeters != null ? distanceMeters / 1_000 : null,
    movingSec,
    // 서버 extractActivityTss는 명시 TSS가 없어도 지원 시간 필드가 있으면 시간 부하로 폴백한다.
    // 비례 배분의 candidateTss는 그대로 유지하고, 대표 선택 힌트만 서버 의미에 맞춘다.
    hasLoad: candidateTss(activity) != null || movingSec != null,
  };
}

/** Activity ids whose physical-ride representative is present in the rendered impacts. */
export function activityIdsCoveredByImpacts(
  activities: readonly Activity[],
  impacts: readonly ActivityImpactEntry[],
): ReadonlySet<string> {
  const impactIds = new Set(impacts.map((entry) => entry.activity.id));
  const coveredIds = new Set<string>();
  for (const group of groupSamePhysicalRides(activities.map(physicalRideIdentity))) {
    if (!impactIds.has(pickPhysicalRideRepresentative(group).id)) continue;
    group.forEach((row) => coveredIds.add(row.id));
  }
  return coveredIds;
}

function marginalImpact(load: number): FitnessStateDelta {
  const ctl = load / CTL_DAYS;
  const atl = load / ATL_DAYS;
  return { ctl, atl, tsb: ctl - atl };
}

function remainingContribution(load: number, daysSince: number): FitnessStateDelta {
  const ctl = (load / CTL_DAYS) * Math.pow(1 - 1 / CTL_DAYS, daysSince);
  const atl = (load / ATL_DAYS) * Math.pow(1 - 1 / ATL_DAYS, daysSince);
  return { ctl, atl, tsb: ctl - atl };
}

function actualDayChange(
  point: FitnessPoint,
  pointsByDate: ReadonlyMap<string, FitnessPoint>,
): FitnessStateDelta | null {
  const previous = pointsByDate.get(previousUtcDay(point.date));
  if (!previous) return null;
  if (![point.ctl, point.atl, point.tsb, previous.ctl, previous.atl, previous.tsb].every(Number.isFinite)) {
    return null;
  }
  return {
    ctl: point.ctl - previous.ctl,
    atl: point.atl - previous.atl,
    tsb: point.tsb - previous.tsb,
  };
}

/**
 * Derives activity-attributed effects exclusively from canonical daily FitnessPoints.
 *
 * A single physical activity receives that day's canonical `dailyLoad`. Cross-provider
 * duplicates are collapsed with the same representative rule as the backend. On a day
 * with several distinct activities, allocation is emitted only when every representative
 * has a safe positive TSS candidate; this avoids assigning unknown load or overstating precision.
 */
export function deriveActivityImpacts(
  fitnessPoints: readonly FitnessPoint[],
  activities: readonly Activity[],
  options: DeriveActivityImpactOptions = {},
): ActivityImpactEntry[] {
  const pointsByDate = new Map(
    fitnessPoints
      .filter((point) => isUtcDay(point.date))
      .map((point) => [point.date, point] as const),
  );
  const sortedPointDates = [...pointsByDate.keys()].sort();
  const latestDate = sortedPointDates[sortedPointDates.length - 1];
  const asOfDate = options.asOfDate && isUtcDay(options.asOfDate) ? options.asOfDate : latestDate;
  if (!asOfDate) return [];

  const activitiesByDate = new Map<string, Activity[]>();
  const eligibleActivities = activities.filter((activity) => {
    const date = utcDayFromMillis(activity.startTime);
    return date != null && date <= asOfDate;
  });
  const physicalActivities = dedupeSamePhysicalRides(eligibleActivities.map(physicalRideIdentity));
  for (const { activity } of physicalActivities) {
    const date = utcDayFromMillis(activity.startTime)!;
    const sameDay = activitiesByDate.get(date) ?? [];
    sameDay.push(activity);
    activitiesByDate.set(date, sameDay);
  }

  const entries: ActivityImpactEntry[] = [];
  for (const [date, sameDayActivities] of activitiesByDate) {
    const point = pointsByDate.get(date);
    if (!point || !isFinitePositive(point.dailyLoad)) continue;

    const allocations = new Map<Activity, number>();
    let confidence: ActivityImpactConfidence;
    if (sameDayActivities.length === 1) {
      allocations.set(sameDayActivities[0]!, point.dailyLoad);
      confidence = "canonical-single";
    } else {
      const candidates = sameDayActivities.map(candidateTss);
      if (candidates.some((value) => value === null)) continue;
      const candidateTotal = candidates.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      if (!isFinitePositive(candidateTotal)) continue;
      sameDayActivities.forEach((activity, index) => {
        allocations.set(activity, point.dailyLoad * (candidates[index]! / candidateTotal));
      });
      confidence = "estimated-allocation";
    }

    const elapsedDays = daysBetweenUtcDays(date, asOfDate);
    if (elapsedDays < 0) continue;
    const dayChange = actualDayChange(point, pointsByDate);
    for (const activity of sameDayActivities) {
      const attributedLoad = allocations.get(activity);
      if (attributedLoad === undefined) continue;
      entries.push({
        activity,
        date,
        attributedLoad,
        canonicalDailyLoad: point.dailyLoad,
        confidence,
        marginalImpact: marginalImpact(attributedLoad),
        actualDayChange: dayChange,
        daysSince: elapsedDays,
        remainingContribution: remainingContribution(attributedLoad, elapsedDays),
      });
    }
  }

  entries.sort((a, b) => b.activity.startTime - a.activity.startTime || a.activity.id.localeCompare(b.activity.id));
  const limit = options.limit;
  return typeof limit === "number" && Number.isFinite(limit) && limit >= 0
    ? entries.slice(0, Math.floor(limit))
    : entries;
}

function projectTwoDays(current: FitnessPoint, firstDayLoad: number): [FitnessForecastPoint, FitnessForecastPoint] {
  let ctl = current.ctl;
  let atl = current.atl;
  const result: FitnessForecastPoint[] = [];
  for (const [index, dailyLoad] of [firstDayLoad, 0].entries()) {
    ctl = ctl * (1 - 1 / CTL_DAYS) + dailyLoad / CTL_DAYS;
    atl = atl * (1 - 1 / ATL_DAYS) + dailyLoad / ATL_DAYS;
    const date = new Date(Date.parse(`${current.date}T00:00:00.000Z`) + (index + 1) * DAY_MS).toISOString().slice(0, 10);
    result.push({ date, ctl, atl, tsb: ctl - atl, dailyLoad, hoursAhead: index === 0 ? 24 : 48 });
  }
  return result as [FitnessForecastPoint, FitnessForecastPoint];
}

/** Projects natural recovery and, optionally, one easy-load day without mutating canonical history. */
export function forecastFitness48Hours(
  current: FitnessPoint,
  easyLoad?: number | null,
): Fitness48HourForecast {
  const forecast: Fitness48HourForecast = { rest: projectTwoDays(current, 0) };
  if (isFinitePositive(easyLoad)) forecast.easy = projectTwoDays(current, easyLoad);
  return forecast;
}
