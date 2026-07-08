import type { Activity } from "@shared/types";
import { getSportCategory } from "../features/activity/detail/activityDetailUtils";
import { decodeTrack } from "./polyline";

const MIN_CANDIDATE_DISTANCE_M = 1_000;
const MIN_CANDIDATE_DURATION_MS = 5 * 60_000;
const MIN_OVERLAP_MS = 5 * 60_000;
const MIN_SHORTER_OVERLAP_RATIO = 0.5;
const MAX_ROUTE_DISTANCE_M = 100;
const MIN_ROUTE_NEAR_RATIO = 0.2;
const MAX_ROUTE_SAMPLE_POINTS = 80;

function activityEndTime(activity: Activity): number | null {
  if (typeof activity.endTime === "number") return activity.endTime;
  if (typeof activity.startTime !== "number") return null;
  const duration = activity.summary?.ridingTimeMillis;
  return typeof duration === "number" && duration > 0 ? activity.startTime + duration : null;
}

function activityDurationMs(activity: Activity): number {
  const summaryDuration = activity.summary?.ridingTimeMillis;
  if (typeof summaryDuration === "number" && summaryDuration > 0) return summaryDuration;
  const end = activityEndTime(activity);
  if (typeof activity.startTime !== "number" || end == null) return 0;
  return Math.max(0, end - activity.startTime);
}

function overlapMs(a: Activity, b: Activity): number {
  const aEnd = activityEndTime(a);
  const bEnd = activityEndTime(b);
  if (typeof a.startTime !== "number" || typeof b.startTime !== "number" || aEnd == null || bEnd == null) return 0;
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(a.startTime, b.startTime));
}

function isVirtual(activity: Activity): boolean {
  const type = activity.type?.toLowerCase() ?? "";
  return type.includes("virtual") || type.includes("indoor");
}

function hasEnoughOverlap(base: Activity, candidate: Activity): boolean {
  const overlap = overlapMs(base, candidate);
  const shorterDuration = Math.min(activityDurationMs(base), activityDurationMs(candidate));
  if (shorterDuration <= 0) return false;
  return overlap >= Math.min(MIN_OVERLAP_MS, shorterDuration * MIN_SHORTER_OVERLAP_RATIO);
}

function samplePoints(points: [number, number][]): [number, number][] {
  if (points.length <= MAX_ROUTE_SAMPLE_POINTS) return points;
  const step = Math.ceil(points.length / MAX_ROUTE_SAMPLE_POINTS);
  return points.filter((_, index) => index % step === 0);
}

function safeDecodeTrack(track: string | null | undefined): [number, number][] {
  if (!track) return [];
  try {
    const points = decodeTrack(track);
    return points.filter(([lat, lng]) => (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ));
  } catch {
    return [];
  }
}

function distanceM(a: [number, number], b: [number, number]): number {
  const toRad = (value: number) => value * Math.PI / 180;
  const r = 6_371_000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function hasNearbyRouteOverlap(base: Activity, candidate: Activity): boolean {
  const basePoints = samplePoints(safeDecodeTrack(base.thumbnailTrack));
  const candidatePoints = samplePoints(safeDecodeTrack(candidate.thumbnailTrack));
  if (basePoints.length < 2 || candidatePoints.length < 2) return true;

  let near = 0;
  for (const point of candidatePoints) {
    let minDistance = Infinity;
    for (const basePoint of basePoints) {
      minDistance = Math.min(minDistance, distanceM(point, basePoint));
      if (minDistance <= MAX_ROUTE_DISTANCE_M) break;
    }
    if (minDistance <= MAX_ROUTE_DISTANCE_M) near += 1;
  }

  return near / candidatePoints.length >= MIN_ROUTE_NEAR_RATIO;
}

function coRiderRank(base: Activity, candidate: Activity): [number, number, number] {
  return [
    overlapMs(base, candidate),
    candidate.summary?.distance ?? 0,
    activityDurationMs(candidate),
  ];
}

function isBetterCoRider(base: Activity, next: Activity, current: Activity): boolean {
  const nextRank = coRiderRank(base, next);
  const currentRank = coRiderRank(base, current);
  if (nextRank[0] !== currentRank[0]) return nextRank[0] > currentRank[0];
  if (nextRank[1] !== currentRank[1]) return nextRank[1] > currentRank[1];
  if (nextRank[2] !== currentRank[2]) return nextRank[2] > currentRank[2];
  return next.id < current.id;
}

export function selectActualCoRiders(base: Activity, candidates: Activity[]): Activity[] {
  const baseSport = getSportCategory(base.type);
  const baseVirtual = isVirtual(base);
  const byUser = new Map<string, Activity>();

  for (const candidate of candidates) {
    if (candidate.id === base.id) continue;
    if (!candidate.summary) continue;
    if (candidate.userId === base.userId) continue;
    if (getSportCategory(candidate.type) !== baseSport) continue;
    if (isVirtual(candidate) !== baseVirtual) continue;
    if ((candidate.summary.distance ?? 0) < MIN_CANDIDATE_DISTANCE_M) continue;
    if (activityDurationMs(candidate) < MIN_CANDIDATE_DURATION_MS) continue;
    if (!hasEnoughOverlap(base, candidate)) continue;
    if (!hasNearbyRouteOverlap(base, candidate)) continue;

    const current = byUser.get(candidate.userId);
    if (!current || isBetterCoRider(base, candidate, current)) {
      byUser.set(candidate.userId, candidate);
    }
  }

  return [...byUser.values()].sort((a, b) => {
    const [aOverlap, aDistance] = coRiderRank(base, a);
    const [bOverlap, bDistance] = coRiderRank(base, b);
    if (aOverlap !== bOverlap) return bOverlap - aOverlap;
    if (aDistance !== bDistance) return bDistance - aDistance;
    return a.nickname.localeCompare(b.nickname);
  });
}
