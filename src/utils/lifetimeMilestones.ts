import type { Activity } from "@shared/types";

/**
 * 킬로미터스톤 배지 — 누적 거리 이정표 + 최장 라이드 경신.
 *
 * `users/{uid}/milestones`(shared/types/milestone.ts)는 러닝 전용이고 서버(personal-records
 * 트리거)가 판정·write 하는데, 누적 거리·최장 라이드 배지는 lifetime 카운터 인프라가 아직
 * 없어 미구현 상태다(이슈 #360 코멘트 참조). 이 모듈은 그 백엔드를 기다리지 않고, 클라이언트가
 * 이미 들고 있는 활동 목록(YearRecapPage 가 로드하는 전체 활동)에서 종목 무관 누적 거리·최장
 * 라이드를 순수 함수로 다시 계산한다. 서버 영속이 필요 없는 이유: 입력이 활동 컬렉션 자체이므로
 * 동일 활동 목록에서 언제나 같은 결과가 재계산되고(멱등), 캐시가 없어도 매 렌더 비용이 활동 수에
 * 선형이라 클라 규모에서 감당 가능하다(YearRecapPage 는 이미 전체 활동을 1회 로드).
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

function hasValidDistance(activity: Activity): boolean {
  return activity?.summary != null
    && Number.isFinite(activity.summary.distance)
    && activity.summary.distance > 0
    && Number.isFinite(activity.startTime);
}

/**
 * 활동 목록(순서 무관, 아무 종목)에서 누적 거리 마일스톤 달성 여부·최장 라이드를 계산한다.
 * 임계값 도달 시점은 startTime 오름차순으로 순회하며 처음 넘긴 활동의 startTime 을 기록한다
 * (동시각 활동은 activityId 로 타이브레이크해 결정적 순서를 보장).
 */
export function computeLifetimeMilestones(activities: Activity[]): LifetimeMilestonesSummary {
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
