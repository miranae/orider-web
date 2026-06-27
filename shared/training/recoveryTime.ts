/**
 * Recovery Time (회복시간) 추정 v1 — 단일 세션 훈련부하 대비 권장 회복시간.
 *
 * 라이덕 정의("라이딩 이전 상태로 돌아가기까지 걸리는 시간")의 근사. 정확한 공식은
 * 비공개이므로, **세션 부하(load)를 만성 체력(CTL)에 상대화**한 투명한 휴리스틱을 쓴다:
 *
 *   ratio = load / fitness            (이번 세션이 평소 일일 부하 대비 얼마나 컸나)
 *   hours = clamp(round(ratio × HOURS_PER_LOAD_RATIO), MIN, MAX)
 *
 * - `load` 는 파워 기반 TSS 우선, 없으면 HR 기반 TRIMP 로 폴백(스케일이 유사 — 둘 다
 *   임계 1시간 ≈ 100). 종목 무관 단일 지표로 사용.
 * - `ctl`(만성 부하, 일일 평균 TSS)이 주어지면 체력 보정 — 같은 부하라도 체력이 높을수록
 *   회복이 빠르다. 없으면 보수적 기본값 사용.
 * - 순수 함수. firebase/IO 없음 → 클라에서 직접 계산. **추정치**이며 상수는 튜닝 대상(v1).
 */
import { isPositiveFinite, clamp } from "./mathUtil";

/** 회복시간 하한/상한(시간). */
export const RECOVERY_MIN_HOURS = 6;
export const RECOVERY_MAX_HOURS = 72;

/** load/fitness 비율 1.0 당 회복시간(시간). ratio=2(평소의 2배 부하) → 24h. */
const HOURS_PER_LOAD_RATIO = 12;
/** CTL 미상 시 기본 체력(일일 평균 TSS 가정). */
const DEFAULT_CTL = 35;
/** 체력 하한 — 저CTL 사용자가 과대 회복시간을 받지 않도록 분모 바닥. */
const MIN_CTL = 10;

export type RecoveryBand = "light" | "moderate" | "high" | "very_high";

export interface RecoveryEstimate {
  /** 권장 회복시간(시간, 반올림·clamp). */
  hours: number;
  /** 강도 밴드 — UI 색/문구용. */
  band: RecoveryBand;
}

/**
 * 세션 부하·체력으로 권장 회복시간을 추정한다.
 * @param opts.load 세션 훈련부하 (TSS 우선, 없으면 TRIMP).
 * @param opts.ctl  만성 부하(CTL, 일일 평균 TSS). 선택 — 없으면 기본 체력.
 * @returns 추정치. load 가 유효하지 않으면 null.
 */
export function estimateRecoveryHours(opts: { load: number; ctl?: number }): RecoveryEstimate | null {
  const { load, ctl } = opts;
  if (!isPositiveFinite(load)) return null;
  const fitness = isPositiveFinite(ctl) ? Math.max(ctl, MIN_CTL) : DEFAULT_CTL;
  const ratio = load / fitness;
  const hours = clamp(Math.round(ratio * HOURS_PER_LOAD_RATIO), RECOVERY_MIN_HOURS, RECOVERY_MAX_HOURS);
  const band: RecoveryBand =
    hours < 12 ? "light" : hours < 24 ? "moderate" : hours < 48 ? "high" : "very_high";
  return { hours, band };
}
