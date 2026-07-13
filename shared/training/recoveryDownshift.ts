/**
 * 달력 회복 다운시프트 (#365) — 계획된 "하드데이"가 TSB(회복) 신호와 충돌하면
 * easy/rest 로 스왑을 제안하는 순수 판정 함수.
 *
 * 새 예측 모델을 만들지 않고, 이미 검증된 todaysRecommendation.ts 의 결정 트리 임계값을
 * 그대로 재사용한다(중복 튜닝 방지 — 같은 TSB 값이 "오늘 추천"과 "이번 주 캘린더 경고"에서
 * 다른 기준으로 판정되면 사용자가 혼란스럽다):
 *   - TSB < BURNOUT_TSB(-20)  : 번아웃 위험 임계(todaysRecommendation.ts 1번 규칙과 동일 스케일)
 *     → 완전 휴식(rest) 권장
 *   - TSB < RECOVERY_TSB(-5)  : 회복 필요 임계(todaysRecommendation.ts 2번 규칙과 동일)
 *     → 이지(easy) 스왑 권장
 *   - 그 외                    : 계획 유지
 *
 * "하드데이" 여부는 WorkoutKind 를 강도 기준으로 분류한다(HARD_WORKOUT_KINDS).
 * 회복/이지/휴식 세션은 애초에 다운시프트 대상이 아니므로 항상 false.
 */
import type { WorkoutKind } from "../types/goal";

/** 번아웃 위험 TSB 임계 — todaysRecommendation.ts 1번 규칙(atlOverCtl>1.4 && tsb<-20)과 동일 스케일. */
export const BURNOUT_TSB = -20;
/** 회복 필요 TSB 임계 — todaysRecommendation.ts 2번 규칙(tsb<-5)과 동일. */
export const RECOVERY_TSB = -5;

/** 강도 높은(하드) 워크아웃 종류 — 다운시프트 판정 대상. 회복/이지/휴식류는 제외. */
const HARD_WORKOUT_KINDS: ReadonlySet<WorkoutKind> = new Set<WorkoutKind>([
  "tempo", "ftp", "vo2", "hillRepeats",
  "tempoRun", "intervalRun", "threshRun", "raceRun", "progressRun",
  "intervalSwim", "cssSwim", "racepaceSwim", "sprintSwim",
]);

/**
 * 의도된 하드데이 — 레이스 당일(goal)·레이스 시뮬레이션(sim)은 피로해도 수행이 계획의
 * 본질이므로 다운시프트 제안 대상에서 제외한다 (UI 게이트와 기준이 흩어지지 않게 여기서 단일 관리).
 */
const INTENDED_HARD_KINDS: ReadonlySet<WorkoutKind> = new Set<WorkoutKind>(["sim", "goal"]);

/**
 * 판정 유효 지평(일) — TSB 는 일 단위로 변하는 신호라, 오늘의 TSB 로 먼 미래 하드데이를
 * 판정하면 사실과 다른 조언이 된다(휴식 며칠이면 회복). 오늘~+3일까지만 제안.
 */
export const DOWNSHIFT_HORIZON_DAYS = 3;

export type DownshiftSwap = "easy" | "rest" | null;

export interface RecoveryDownshiftInput {
  workoutKind: WorkoutKind;
  /** 현재(해당 날짜 기준) TSB. */
  tsb: number;
  /**
   * 오늘부터 해당 하드데이까지 남은 일수(0=오늘). 생략 시 0 으로 간주.
   * DOWNSHIFT_HORIZON_DAYS 초과 미래는 판정하지 않는다 — 오늘 TSB 의 유효 범위 밖.
   */
  daysUntil?: number;
}

export interface RecoveryDownshiftResult {
  /** 스왑을 제안해야 하는가. */
  shouldDownshift: boolean;
  /** 제안 강도 — "rest"(완전 휴식) > "easy"(가벼운 세션). 제안 없으면 null. */
  suggestedSwap: DownshiftSwap;
  /** 판정 사유 (UI 배너/마커에 노출할 짧은 사실 — 서식 없는 원시 값). */
  reasonTsb: number;
}

/** 계획된 하드데이 vs TSB 신호를 대조해 다운시프트 제안 여부를 판정한다. */
export function evaluateRecoveryDownshift(input: RecoveryDownshiftInput): RecoveryDownshiftResult {
  const isHardDay = HARD_WORKOUT_KINDS.has(input.workoutKind) && !INTENDED_HARD_KINDS.has(input.workoutKind);
  const withinHorizon = (input.daysUntil ?? 0) <= DOWNSHIFT_HORIZON_DAYS;
  if (!isHardDay || !withinHorizon) {
    return { shouldDownshift: false, suggestedSwap: null, reasonTsb: input.tsb };
  }
  if (input.tsb < BURNOUT_TSB) {
    return { shouldDownshift: true, suggestedSwap: "rest", reasonTsb: input.tsb };
  }
  if (input.tsb < RECOVERY_TSB) {
    return { shouldDownshift: true, suggestedSwap: "easy", reasonTsb: input.tsb };
  }
  return { shouldDownshift: false, suggestedSwap: null, reasonTsb: input.tsb };
}
