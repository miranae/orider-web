import { invalidatePlanSnapshot, planSnapshotKey } from "./planSnapshotCache";

export const PLAN_GOAL_CHANGED = "orider:plan-goal-changed";
export function notifyPlanGoalChanged(uid: string, sport: string, locale: string) {
  invalidatePlanSnapshot(planSnapshotKey(uid, sport, locale));
  window.dispatchEvent(new CustomEvent(PLAN_GOAL_CHANGED, { detail: { uid, sport } }));
}
