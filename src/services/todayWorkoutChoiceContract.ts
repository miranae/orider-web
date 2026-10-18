/**
 * 사용자가 "오늘 무엇을 할까?"에서 직접 정한 오늘 운동.
 *
 * 서버(orider-g1-web `shared/types/today-workout-choice.ts`)가 `setTodayWorkoutChoice` 로만 쓰고
 * 클라이언트는 본인 문서 `users/{uid}/today_choices/{bike|run}` 만 읽는다. 문서의 `localDate`
 * (Asia/Seoul)가 오늘이 아니면 지난 선택이므로 표시하지 않는다.
 */
export type TodayWorkoutChoiceDiscipline = "bike" | "run";
export type TodayWorkoutChoiceType = "rest" | "recovery" | "endurance";

export const TODAY_WORKOUT_CHOICE_TSS: Record<TodayWorkoutChoiceType, 0 | 20 | 45> = { rest: 0, recovery: 20, endurance: 45 };

export interface TodayWorkoutChoice {
  discipline: TodayWorkoutChoiceDiscipline;
  localDate: string;
  workoutType: TodayWorkoutChoiceType;
  targetTss: 0 | 20 | 45;
  chosenAt: number;
}

const KST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

/** Asia/Seoul 기준 YYYY-MM-DD. 서버가 선택에 붙이는 날짜와 같은 기준이다. */
export function kstLocalDate(ms: number): string {
  return KST_DATE.format(new Date(ms));
}

function isWorkoutType(value: unknown): value is TodayWorkoutChoiceType {
  return value === "rest" || value === "recovery" || value === "endurance";
}

/** 알 수 없는 모양이나 다른 종목 문서는 null — 잘못된 값을 "정한 운동"으로 보여주지 않는다. */
export function parseTodayWorkoutChoice(value: unknown, discipline: TodayWorkoutChoiceDiscipline): TodayWorkoutChoice | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== "today-choice-v1" || data.discipline !== discipline || !isWorkoutType(data.workoutType)) return null;
  if (typeof data.localDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.localDate)) return null;
  if (typeof data.chosenAt !== "number" || !Number.isFinite(data.chosenAt)) return null;
  return {
    discipline,
    localDate: data.localDate,
    workoutType: data.workoutType,
    targetTss: TODAY_WORKOUT_CHOICE_TSS[data.workoutType],
    chosenAt: data.chosenAt,
  };
}

/** 오늘(KST) 선택만 유효하다. 어제 정한 운동이 오늘 홈에 남지 않게 한다. */
export function todayChoiceOrNull(choice: TodayWorkoutChoice | null, now: number): TodayWorkoutChoice | null {
  return choice && choice.localDate === kstLocalDate(now) ? choice : null;
}
