import type { PlanDay, WorkoutKind } from "@shared/types/goal";
import { planDayKey } from "@shared/training/planDate";
import { planSnapshotKey, readPlanSnapshot, type PlanSnapshot } from "../../embedded/planSnapshotCache";
import { prepareTrainingSurfaceCacheOwner } from "../../embedded/trainingSurfaceCache";
import { logClientError } from "../../services/errorLogger";

export interface CachedTodayPlan {
  workout: WorkoutKind;
  workoutName: string | null;
  durationMin: number | null;
}

/**
 * 계획 화면이 남긴 계획 스냅샷(캐시)에서 오늘 날짜의 처방만 읽는다.
 * 새 조회·계산은 하지 않는다 — 캐시가 없으면 null 이고 화면은 「계획 보기」만 둔다.
 */
export function readCachedTodayPlan(uid: string | null | undefined, anonymous: boolean, sport: "bike" | "run" | "swim", locale: string, now = Date.now()): CachedTodayPlan | null {
  if (!uid || anonymous) return null;
  try {
    if (!prepareTrainingSurfaceCacheOwner(uid, false)) return null;
    const snapshot = readPlanSnapshot<PlanSnapshot>(planSnapshotKey(uid, sport, locale));
    if (!snapshot?.data?.goal) return null;
    const today = planDayKey(now);
    const day = snapshot.data.weeks
      .flatMap(week => week.days as PlanDay[])
      .find(candidate => !candidate.calendarGap && !candidate.calendarHistoryOnly && planDayKey(candidate.date) === today);
    if (!day) return null;
    const workout = day.executionWorkoutOverride ?? day.workout;
    const minutes = day.adjustedDurationMin ?? day.plannedDurationMin;
    return {
      workout,
      workoutName: day.executionWorkoutOverride ? null : day.workoutName?.trim() || null,
      durationMin: workout !== "rest" && Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
    };
  } catch (error) {
    // 캐시 읽기 실패는 기록만 하고 「계획 보기」만 두는 쪽으로 물러선다.
    logClientError("cachedTodayPlan.read", error, { sport });
    return null;
  }
}
