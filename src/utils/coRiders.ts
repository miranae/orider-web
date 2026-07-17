import type { Activity } from "@shared/types";
import { getSportCategory } from "../features/activity/detail/activityDetailUtils";

const MIN_CANDIDATE_DISTANCE_M = 1_000;
const MIN_CANDIDATE_DURATION_MS = 5 * 60_000;
const MIN_OVERLAP_MS = 5 * 60_000;
const MIN_SHORTER_OVERLAP_RATIO = 0.5;
const MIN_SYNCHRONIZED_MATCH_VERSION = 3;

function hasPersistedSynchronizedMatch(base: Activity, candidate: Activity): boolean {
  if (
    base.groupRideMatchState !== "confirmed" ||
    candidate.groupRideMatchState !== "confirmed" ||
    (base.groupRideMatchVersion ?? 0) < MIN_SYNCHRONIZED_MATCH_VERSION ||
    (candidate.groupRideMatchVersion ?? 0) < MIN_SYNCHRONIZED_MATCH_VERSION
  ) {
    return false;
  }

  return Boolean(
    base.groupRideConfirmedPeerUserIds?.includes(candidate.userId) &&
    candidate.groupRideConfirmedPeerUserIds?.includes(base.userId)
  );
}

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
    // 타인의 원본 스트림은 클라이언트에서 읽을 수 없다. 썸네일 경로와 활동 시간대를
    // 각각 비교해 동승을 추정하지 않고, 백엔드가 같은 시각의 GPS 근접성을 검증해
    // 양쪽 활동에 저장한 직접 peer 관계만 표시한다.
    if (!hasPersistedSynchronizedMatch(base, candidate)) continue;
    if (getSportCategory(candidate.type) !== baseSport) continue;
    if (isVirtual(candidate) !== baseVirtual) continue;
    if ((candidate.summary.distance ?? 0) < MIN_CANDIDATE_DISTANCE_M) continue;
    if (activityDurationMs(candidate) < MIN_CANDIDATE_DURATION_MS) continue;
    if (!hasEnoughOverlap(base, candidate)) continue;

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
