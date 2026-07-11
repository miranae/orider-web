/**
 * 훈련 상태 일상어 라벨 — TSB(Form) + CTL 램프율을 5단계 상태로 번역한다.
 *
 * 목적: "TSB -18" 같은 숫자를 그대로 던지지 않고 "순항 — 몸이 훈련을 잘 흡수하고 있어요"로
 * 먼저 말한다(이중 레이어 원칙: 쉬운 말 위, 디테일 아래).
 *
 * ## 기존 `tsbStatusLabel` 과의 관계 (중요)
 * `src/features/fitness/fitnessPageUtils.ts` 의 `tsbStatusLabel` 이 이미 5단계 TSB 밴드
 * (과회복 / 레이스 적기 / 최적 폼 / 피로 누적 / 과운동 위험)를 쓰고 있다. 이 파일은 그것을
 * **대체하지 않고 같은 경계값을 공유**한다 — 경계가 어긋나면 같은 화면에서 TSB -20 이
 * "피로 누적"이자 "순항"으로 동시에 표시되는 모순이 생긴다.
 *   - `tsbStatusLabel` = 짧은 전문 라벨 (KPI 스트립 = 디테일 레이어)
 *   - 이 파일        = 일상어 라벨 + 한 줄 조언 + 스펙트럼 위치 (요약 = 쉬운 레이어)
 *
 * ## 축(axis) 정의
 * 상태는 **TSB 오름차순(피로 → 신선)** 으로 단조 정렬된다. UI 의 스펙트럼 바가 축을 암시하므로
 * 비단조 순서로 배열하면 축의 반대편 두 상태가 같은 방향으로 읽히는 모순이 생긴다.
 *
 *   index 0 ─────────────────────────────────────────────► index 4
 *   과부하 주의  회복 필요   순항    회복 완료   과회복
 *   (TSB ≤ -30)                                  (TSB > 25)
 *
 * 양끝은 성격이 다르다: 왼쪽은 **위험**(부상·과훈련), 오른쪽은 단지 **비효율**(휴식 과다).
 * 그래서 경고색은 왼쪽 하나뿐이다.
 *
 * ## 램프 승격
 * CTL 램프율이 과도하면(주당 +8 초과) TSB 가 아직 -30 을 넘지 않았어도 과부하로 승격한다 —
 * 부하를 빠르게 올리는 중이면 TSB 가 바닥을 치기 전에 알려야 하기 때문.
 */

/** 상태 키 — i18n 키(`fitness:trainingStatus.*`)와 1:1. */
export type TrainingStatusKey =
  | "overload" // 과부하 주의   (기존 status.overtraining)
  | "needsRecovery" // 회복 필요     (기존 status.fatigueBuild)
  | "productive" // 순항         (기존 status.optimalForm)
  | "fresh" // 회복 완료     (기존 status.racingPeak)
  | "overRecovered"; // 과회복       (기존 status.overRecovery)

/** UI 스펙트럼 바의 좌→우 순서 (TSB 오름차순). */
export const TRAINING_STATUS_ORDER: readonly TrainingStatusKey[] = [
  "overload",
  "needsRecovery",
  "productive",
  "fresh",
  "overRecovered",
] as const;

/**
 * 시맨틱 톤 — accent(브랜드색)와 분리된 상태색.
 * 경고는 `과부하 주의` 하나뿐이다. `회복 필요`도 `과회복`도 정상 국면이지 위험 신호가 아니므로
 * 경고색을 쓰지 않는다(양끝을 모두 경고색으로 칠하면 두 상태가 동급 위험으로 읽힌다).
 */
export type TrainingStatusTone = "warning" | "accent" | "neutral";

export interface TrainingStatus {
  key: TrainingStatusKey;
  /** TRAINING_STATUS_ORDER 내 위치 (0~4) — 스펙트럼 바 강조 위치. */
  index: number;
  tone: TrainingStatusTone;
  /** 과부하 승격이 램프율 때문이었는지 — 조언 문구 분기에 사용. */
  drivenByRamp: boolean;
}

export interface TrainingStatusInput {
  /** Training Stress Balance (Form). CTL − ATL. */
  tsb: number;
  /** 주당 CTL 증가량. 미상이면 생략 — 램프 승격 규칙을 건너뛴다. */
  ctlRampPerWeek?: number | null;
}

/**
 * TSB 구간 경계 — `fitnessPageUtils.tsbStatusLabel` 과 **동일한 값**을 쓴다.
 * 한쪽만 바꾸면 두 라벨이 어긋나므로 반드시 함께 수정할 것.
 */
const TSB_OVER_RECOVERED_ABOVE = 25;
const TSB_FRESH_ABOVE = 5;
const TSB_PRODUCTIVE_ABOVE = -10;
const TSB_NEEDS_RECOVERY_ABOVE = -30;

/** 주당 CTL 증가가 이 값을 넘고 이미 피로하면(TSB ≤ -10) 과부하로 승격. */
const RAMP_OVERLOAD_PER_WEEK = 8;
const RAMP_ESCALATION_TSB_CEILING = -10;

const TONE_BY_KEY: Record<TrainingStatusKey, TrainingStatusTone> = {
  overload: "warning",
  needsRecovery: "neutral",
  productive: "accent",
  fresh: "neutral",
  overRecovered: "neutral",
};

function bandFromTsb(tsb: number): TrainingStatusKey {
  if (tsb > TSB_OVER_RECOVERED_ABOVE) return "overRecovered";
  if (tsb > TSB_FRESH_ABOVE) return "fresh";
  if (tsb > TSB_PRODUCTIVE_ABOVE) return "productive";
  if (tsb > TSB_NEEDS_RECOVERY_ABOVE) return "needsRecovery";
  return "overload";
}

/**
 * TSB·CTL 램프율 → 훈련 상태.
 *
 * 반환된 `key` 로 i18n `fitness:trainingStatus.{key}.label` / `.advice` 를 조회한다.
 * 램프 승격 시에는 `.adviceRamp` 를 우선 사용한다(부하 상승 속도가 원인임을 알려야 하므로).
 */
export function trainingStatusLabel(input: TrainingStatusInput): TrainingStatus {
  const { tsb, ctlRampPerWeek } = input;
  const base = bandFromTsb(tsb);

  const rampEscalates =
    base !== "overload" &&
    ctlRampPerWeek != null &&
    ctlRampPerWeek > RAMP_OVERLOAD_PER_WEEK &&
    tsb <= RAMP_ESCALATION_TSB_CEILING;

  const key: TrainingStatusKey = rampEscalates ? "overload" : base;
  return {
    key,
    index: TRAINING_STATUS_ORDER.indexOf(key),
    tone: TONE_BY_KEY[key],
    drivenByRamp: rampEscalates,
  };
}

/** i18n 조언 키 — 램프 승격 여부에 따라 분기. */
export function trainingStatusAdviceKey(status: TrainingStatus): string {
  return status.drivenByRamp
    ? `trainingStatus.${status.key}.adviceRamp`
    : `trainingStatus.${status.key}.advice`;
}
