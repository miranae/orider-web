import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { matchesDiscipline } from "@shared/sport/discipline";
import type { Discipline } from "../../utils/disciplineFilter";
import type { LoadFocusBucket, LoadFocusResult, PerformanceDiscipline, SwimEvidence } from "./multisportPerformance";

export interface FitnessActivityWindowEntry {
  activityId: string;
  startTime: number;
  activityType: string;
  discipline: PerformanceDiscipline;
  hrZoneSec: number[] | null;
  powerZoneSec: number[] | null;
  loadFocus: {
    load: number;
    source: "power" | "heartRate" | "unclassified";
    allocations: number[];
    hasAnaerobicBikeDetail: boolean;
  };
  mmp: Record<string, number>;
  swolf: number | null;
  distancePerStroke: number | null;
}
export interface FitnessActivityWindowDocument {
  version: 1;
  windowDays: 90;
  maxEntries: 768;
  entries: FitnessActivityWindowEntry[];
  generation: number;
  updatedAt: number;
  truncated: boolean;
}
const DAY_MS = 86_400_000;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function parseFitnessActivityWindow(value: unknown): FitnessActivityWindowDocument {
  const document = value as FitnessActivityWindowDocument | null;
  if (!document || document.version !== 1 || document.windowDays !== 90 || document.maxEntries !== 768
    || !Array.isArray(document.entries) || document.entries.length > 768 || typeof document.truncated !== "boolean"
    || !nonnegative(document.generation) || !nonnegative(document.updatedAt)) throw new Error("Invalid fitness window");
  const ids = new Set<string>();
  for (const entry of document.entries) {
    const focus = entry?.loadFocus;
    if (!entry || typeof entry.activityId !== "string" || ids.has(entry.activityId) || !Number.isFinite(entry.startTime)
      || typeof entry.activityType !== "string" || !["bike", "run", "swim", "other"].includes(entry.discipline)
      || !focus || !nonnegative(focus.load) || !["power", "heartRate", "unclassified"].includes(focus.source)
      || !Array.isArray(focus.allocations) || focus.allocations.length !== (focus.source === "power" ? 7 : focus.source === "heartRate" ? 5 : 0)
      || !focus.allocations.every(nonnegative) || typeof focus.hasAnaerobicBikeDetail !== "boolean"
      || !entry.mmp || typeof entry.mmp !== "object" || Array.isArray(entry.mmp)
      || !Object.values(entry.mmp).every(positive)
      || (entry.swolf !== null && !Number.isFinite(entry.swolf)) || (entry.distancePerStroke !== null && !Number.isFinite(entry.distancePerStroke))) {
      throw new Error("Invalid fitness entry");
    }
    for (const [zones, length] of [[entry.hrZoneSec, 5], [entry.powerZoneSec, 7]] as const) {
      if (zones !== null && (!Array.isArray(zones) || zones.length !== length || !zones.every(nonnegative))) throw new Error("Invalid fitness zones");
    }
    ids.add(entry.activityId);
  }
  return document;
}

export function filterFitnessActivityWindowEntries(entries: readonly FitnessActivityWindowEntry[], discipline: Discipline, now: number) {
  return entries.filter(entry => entry.startTime >= now - 90 * DAY_MS && entry.startTime <= now
    && (discipline === "tri" || matchesDiscipline(entry.activityType, discipline)));
}

export function fitnessWindowMetrics(entries: readonly FitnessActivityWindowEntry[]) {
  return new Map(entries.map(entry => [entry.activityId, {
    discipline: entry.discipline === "other" ? undefined : entry.discipline,
    hrZoneSec: entry.hrZoneSec ?? undefined, powerZoneSec: entry.powerZoneSec ?? undefined,
    mmp: entry.mmp,
    swimMetrics: { swolfAvg: entry.swolf, distancePerStroke: entry.distancePerStroke },
  } as ActivityMetrics]));
}

export function computeWindowLoadFocus(entries: readonly FitnessActivityWindowEntry[], now: number): LoadFocusResult {
  const buckets: Record<LoadFocusBucket, number> = { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 };
  const sourceLoad = { power: 0, heartRate: 0, unclassified: 0 };
  const disciplineLoad = { bike: 0, run: 0, swim: 0, other: 0 };
  let activityCount = 0;
  let hasAnaerobicBikeDetail = false;
  for (const entry of entries) {
    if (entry.startTime < now - 28 * DAY_MS || entry.startTime > now || !positive(entry.loadFocus.load)) continue;
    const { load, source, allocations } = entry.loadFocus;
    activityCount++;
    disciplineLoad[entry.discipline] += load;
    sourceLoad[source] += load;
    if (source === "unclassified") buckets.unclassified += load;
    else {
      const groups: LoadFocusBucket[] = source === "power"
        ? ["baseAerobic", "baseAerobic", "highAerobic", "highAerobic", "highAerobic", "highIntensity", "highIntensity"]
        : ["baseAerobic", "baseAerobic", "highAerobic", "highAerobic", "highIntensity"];
      allocations.forEach((value, index) => { buckets[groups[index]!] += value; });
      hasAnaerobicBikeDetail ||= entry.loadFocus.hasAnaerobicBikeDetail;
    }
  }
  const totalLoad = Object.values(buckets).reduce((sum, load) => sum + load, 0);
  const coveragePct = totalLoad > 0 ? (sourceLoad.power + sourceLoad.heartRate) / totalLoad * 100 : 0;
  const weighted = totalLoad > 0 ? (sourceLoad.power + sourceLoad.heartRate * 0.65) / totalLoad * 100 : 0;
  return { windowDays: 28, totalLoad, buckets, sourceLoad, disciplineLoad, activityCount, coveragePct,
    confidence: weighted >= 80 ? "high" : weighted >= 50 ? "medium" : weighted > 0 ? "low" : "none", hasAnaerobicBikeDetail };
}

export function buildWindowSwimEvidence(css: number | null | undefined, entries: readonly FitnessActivityWindowEntry[], now: number): SwimEvidence {
  const samples = entries.filter(entry => entry.discipline === "swim" && entry.startTime >= now - 90 * DAY_MS
    && entry.startTime <= now && (positive(entry.swolf) || positive(entry.distancePerStroke)));
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return { windowDays: 90, cssSecPer100m: positive(css) ? css : null,
    swolfAvg: average(samples.map(entry => entry.swolf).filter(positive)),
    distancePerStrokeM: average(samples.map(entry => entry.distancePerStroke).filter(positive)), activityCount: samples.length };
}
