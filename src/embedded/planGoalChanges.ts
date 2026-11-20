import { invalidatePlanSnapshot, planSnapshotKey } from "./planSnapshotCache";
import { removeTrainingSurfaceCacheForSport } from "./trainingSurfaceCache";

export const PLAN_GOAL_CHANGED = "orider:plan-goal-changed";
const PLAN_SPORTS = ["bike", "run", "swim"] as const;

/**
 * 목표를 만들거나 포기·재계획한 뒤 계획 캐시를 버리고 열린 계획 화면에 다시 읽으라고 알린다.
 * 다른 종목 탭도 이 목표를 호환용으로 보여줄 수 있어(readPreferredActiveGoal) 모든 종목·언어의 캐시를 버린다.
 * 알리지 않으면 앱 임베드는 3분 신선 캐시와 유지 화면 때문에 앱을 다시 켤 때까지 이전 목표를 보여줬다.
 */
export function notifyPlanGoalChanged(uid: string, sport: string, locale: string) {
  for (const each of PLAN_SPORTS) removeTrainingSurfaceCacheForSport(uid, each);
  invalidatePlanSnapshot(planSnapshotKey(uid, sport, locale));
  window.dispatchEvent(new CustomEvent(PLAN_GOAL_CHANGED, { detail: { uid, sport } }));
}
