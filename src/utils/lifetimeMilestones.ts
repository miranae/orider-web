import type { Activity } from "@shared/types";

/**
 * 누적 거리 합계 · 최장 라이드 · (플래그 꺼짐일 때의) 클라 누적 배지 판정.
 *
 * 마일스톤 달성 판정의 정본은 서버(`users/{uid}/milestones`, personal-records 트리거)지만,
 * 그 서버 누적 원장은 **러닝 전용**(`run_lifetime`)이라 자전거 사용자의 누적 거리를 아직
 * 판정하지 못한다. 서버 문서가 없다고 잠금 배지를 그리면 "모름"이 "미달성"으로 둔갑한다
 * (#2237). 그래서 `canonicalConsumerEnabled("milestones")` 가 켜지기 전까지는 여기 있는
 * 클라 판정을 그대로 쓴다 — 입력이 활동 컬렉션이므로 멱등하게 재계산된다.
 *
 * 누적 합계·최장 라이드는 서버에 대응 필드가 아예 없어 플래그와 무관하게 화면 집계를 쓴다.
 */

export type LifetimeMilestoneKm = 100 | 500 | 1000 | 5000 | 10000;

/** 표시 순서 — 짧은 순. */
export const LIFETIME_MILESTONE_KM: readonly LifetimeMilestoneKm[] = [100, 500, 1000, 5000, 10000];

export interface LifetimeMilestoneStatus {
  km: LifetimeMilestoneKm;
  achieved: boolean;
  /** 누적 거리가 이 임계값을 처음 넘긴 활동의 startTime(ms). 미달성이면 null. */
  achievedAt: number | null;
}

export interface LongestRideRecord {
  activityId: string;
  distanceMeters: number;
  startTime: number;
  type: string;
}

export interface LifetimeMilestonesSummary {
  totalDistanceMeters: number;
  milestones: LifetimeMilestoneStatus[];
  longestRide: LongestRideRecord | null;
}

export interface LifetimeTotals {
  totalDistanceMeters: number;
  longestRide: LongestRideRecord | null;
}

function hasValidDistance(activity: Activity): boolean {
  return activity?.summary != null
    && Number.isFinite(activity.summary.distance)
    && activity.summary.distance > 0
    && Number.isFinite(activity.startTime);
}

/** 활동 목록(순서 무관, 아무 종목)에서 누적 거리 합계와 최장 라이드를 계산한다. */
export function computeLifetimeTotals(activities: Activity[]): LifetimeTotals {
  const valid = (activities ?? []).filter(hasValidDistance);

  const totalDistanceMeters = valid.reduce((sum, a) => sum + a.summary.distance, 0);

  let longestRide: LongestRideRecord | null = null;
  for (const a of valid) {
    if (longestRide == null || a.summary.distance > longestRide.distanceMeters) {
      longestRide = {
        activityId: a.id,
        distanceMeters: a.summary.distance,
        startTime: a.startTime,
        type: a.type,
      };
    }
  }

  return { totalDistanceMeters, longestRide };
}

/**
 * 활동 목록(순서 무관, 아무 종목)에서 누적 거리 마일스톤 달성 여부·최장 라이드를 계산한다.
 * 임계값 도달 시점은 startTime 오름차순으로 순회하며 처음 넘긴 활동의 startTime 을 기록한다
 * (동시각 활동은 activityId 로 타이브레이크해 결정적 순서를 보장).
 */
export function computeLifetimeMilestones(activities: Activity[]): LifetimeMilestonesSummary {
  const { totalDistanceMeters, longestRide } = computeLifetimeTotals(activities);
  const valid = (activities ?? []).filter(hasValidDistance);

  const chronological = [...valid].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
  const achievedAtByKm = new Map<LifetimeMilestoneKm, number>();
  let running = 0;
  for (const a of chronological) {
    running += a.summary.distance;
    for (const km of LIFETIME_MILESTONE_KM) {
      if (achievedAtByKm.has(km)) continue;
      if (running >= km * 1000) achievedAtByKm.set(km, a.startTime);
    }
  }

  const milestones: LifetimeMilestoneStatus[] = LIFETIME_MILESTONE_KM.map((km) => ({
    km,
    achieved: achievedAtByKm.has(km),
    achievedAt: achievedAtByKm.get(km) ?? null,
  }));

  return { totalDistanceMeters, milestones, longestRide };
}
