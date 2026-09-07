import type { Activity } from "@shared/types";

/**
 * 누적 거리 합계 · 최장 라이드 — 화면 표시용 집계.
 *
 * 마일스톤 **달성 판정은 서버**(`users/{uid}/milestones`, personal-records 트리거)가 한다.
 * 예전에는 이 모듈이 100/500/1000km 달성을 클라에서 다시 판정해 서버 판정과 갈릴 수 있었다
 * (web.lifetime.milestones 중복, #2237). 그 계산은 삭제하고 `useMilestones` 구독으로 옮겼다.
 *
 * 여기 남은 두 값만 서버에 대응 필드가 없다 — lifetime 카운터 문서가 아직 없어서(#360)
 * 화면이 이미 로드한 활동 목록에서 계산한다. 서버 배지와 섞지 않고 별도 줄로 표시한다.
 */

export interface LongestRideRecord {
  activityId: string;
  distanceMeters: number;
  startTime: number;
  type: string;
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
