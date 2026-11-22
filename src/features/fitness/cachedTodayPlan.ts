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
 * 오늘 계획 줄의 처방 이름 — 저장된 이름 → 알려진 운동 종류 라벨 순. 번역 키가 없는 값은
 * 키 문자열을 보이지 않고 null 을 돌려 「계획 보기」만 남긴다.
 */
export function todayPlanLabel(plan: CachedTodayPlan | null, t: (key: string, options?: Record<string, unknown>) => string, hasKey: (key: string) => boolean): string | null {
  if (!plan) return null;
  const name = plan.workoutName ?? (hasKey(`workouts.${plan.workout}`) ? t(`workouts.${plan.workout}`) : null);
  if (!name) return null;
  return plan.durationMin != null ? `${name} ${t("decision.duration", { value: plan.durationMin })}` : name;
}

/**
 * 계획 화면이 남긴 계획 스냅샷(캐시)에서 오늘 날짜의 처방만 읽는다.
 * 새 조회·계산은 하지 않는다 — 캐시가 없거나 신선하지 않으면 null 이고 화면은 「계획 보기」만 둔다.
 * 캐시 소유자 확인(prepareTrainingSurfaceCacheOwner)이 부작용이므로 렌더가 아니라 effect 에서 부른다.
 */
export function readCachedTodayPlan(uid: string | null | undefined, anonymous: boolean, sport: "bike" | "run" | "swim", locale: string, now = Date.now()): CachedTodayPlan | null {
  if (!uid || anonymous) return null;
  try {
    if (!prepareTrainingSurfaceCacheOwner(uid, false)) return null;
    const snapshot = readPlanSnapshot<PlanSnapshot>(planSnapshotKey(uid, sport, locale));
    // 3분 안에 저장됐고 무효화되지 않은 오늘 날짜 스냅샷만 쓴다 — 오래된 처방을 오늘 계획처럼 보이지 않는다.
    if (!snapshot?.fresh || !snapshot.data?.goal) return null;
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
