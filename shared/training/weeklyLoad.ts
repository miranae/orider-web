/**
 * 개인화 주간 권장부하 + Balance(TSB) 행동지침 — 클라/서버 공용 순수 모듈.
 *
 * 목적: "이번 주 목표 wTSS X, 현재 누적 Y → 남은 분배" + "Balance −10~−30 유지" 같은
 * 구체 수치 행동지침을 산출한다. 빌드기/레이스주/과피로에 따라 Balance 타깃을 차등.
 *
 * ── 주간 wTSS 산식 근거 ──────────────────────────────────────────────────────
 * CTL 은 지수이동평균(τ=42d)으로 "하루치 평균 부하" 단위다. 일일 TSS 가 CTL 과 같으면
 * 피트니스는 정체(ramp 0). 따라서 "유지" 주간부하 ≈ CTL × 7.
 * 점진 과부하(progressive overload)를 위해 주간 ramp 를 안전 범위에서 더한다.
 *   - CTL ramp rate(주당 CTL 증가) 권장 상한은 통상 3~7 TSS/week (TrainingPeaks/Coggan).
 *   - 이를 주간 wTSS 가산분으로 환산: 빌드기엔 CTL×7 의 약 +5~+15% 상향(상한 가드).
 * 과도한 ramp(부상/번아웃) 방지를 위해 주간 상한을 CTL×7×RAMP_CAP 로 클램프한다.
 *
 * ── Balance(TSB) 가이드 ──────────────────────────────────────────────────────
 * TSB = CTL − ATL (전일). 음수면 피로 누적(자극↑), 양수면 신선(레이스 준비/과회복).
 *   - 빌드기:   TSB −10 ~ −30  (적절한 자극·과부하, 흡수 가능 범위)
 *   - 유지기:   TSB −5  ~ −15  (가벼운 자극, 컨디션 유지)
 *   - 테이퍼:   TSB +5  ~ +15  (레이스 D-7 이내, 신선도 확보)
 *   - 리커버리: TSB  0  ~ +10  (과피로 TSB<−30, 회복 우선)
 */

/** 주간 유지 부하 계수 — CTL×7 = ramp 0 (정체) 기준. */
export const MAINTAIN_FACTOR = 1.0;
/** 빌드기 주간 부하 하한/상한 계수 (CTL×7 대비). +5~+15% 점진 과부하. */
export const BUILD_LO_FACTOR = 1.05;
export const BUILD_HI_FACTOR = 1.15;
/** 주간 부하 안전 상한 계수 — 어떤 phase 든 CTL×7×RAMP_CAP 초과 금지(부상 가드). */
export const RAMP_CAP_FACTOR = 1.2;
/** 테이퍼 주간 부하 계수 — 볼륨을 크게 줄여 신선도 확보. */
export const TAPER_LO_FACTOR = 0.4;
export const TAPER_HI_FACTOR = 0.6;
/** 리커버리(과피로) 주간 부하 계수 — 회복 우선, 볼륨 최소. */
export const RECOVERY_LO_FACTOR = 0.3;
export const RECOVERY_HI_FACTOR = 0.5;

/** 레이스 D-day 임계 — 이 일수 이내면 테이퍼. */
export const TAPER_DAYS_THRESHOLD = 7;
/** 과피로 TSB 임계 — 이보다 낮으면 리커버리 강제. */
export const OVERFATIGUE_TSB = -30;

/** Balance(TSB) phase 별 목표 범위. */
export const BALANCE_RANGE: Record<
  "build" | "maintain" | "taper" | "recovery",
  { lo: number; hi: number; note: string }
> = {
  build: { lo: -30, hi: -10, note: "빌드기 — 자극을 흡수하며 피로를 −10~−30 범위로 유지하세요." },
  maintain: { lo: -15, hi: -5, note: "유지기 — 가벼운 자극으로 컨디션을 −5~−15 범위로 유지하세요." },
  taper: { lo: 5, hi: 15, note: "레이스 주간 — 볼륨을 줄여 Balance 를 +5~+15 로 끌어올리세요." },
  recovery: { lo: 0, hi: 10, note: "과피로 — 회복 우선. Balance 를 0~+10 으로 되돌리세요." },
};

/** 직업부하 → 주간 가용부하 보정 계수. 높을수록 회복 여력↓ → 상한 하향. */
export const OCCUPATION_FACTOR: Record<"low" | "mid" | "high", number> = {
  low: 1.0,
  mid: 0.92,
  high: 0.82,
};

/**
 * 주당 가용 시간 → 대략 흡수 가능한 주간 TSS 상한.
 * 보수적으로 시간당 ~55 TSS(중강도 1h ≈ 55~70 TSS) 기준.
 */
export const TSS_PER_AVAILABLE_HOUR = 55;

export interface WeeklyLoadInput {
  /** 현재 CTL (fitness, 종목별). */
  ctl: number;
  /** 현재 TSB (form = CTL − ATL). */
  tsb: number;
  /** FTP — 현재는 산식에 직접 쓰지 않으나(향후 절대부하 환산용) 시그니처 보존. */
  ftp?: number | null;
  /** 목표 레이스까지 남은 일수. null = 목표 없음. */
  daysUntilGoal?: number | null;
  /** 라이프스타일 — 가용시간/직업부하로 주간 상한 보정. */
  lifestyle?: {
    weeklyAvailableHours?: number;
    occupationLoad?: "low" | "mid" | "high";
  } | null;
}

export interface WeeklyLoadResult {
  /** 이번 주 목표 wTSS 범위 [lo, hi] (정수). */
  targetTss: [number, number];
  balanceGuide: {
    lo: number;
    hi: number;
    phase: "build" | "maintain" | "taper" | "recovery";
    /** 한국어 행동지침. */
    note: string;
  };
}

/**
 * phase 판정: 레이스 D-7 이내 → taper, 과피로 → recovery,
 * 그 외 빌드기(목표가 있거나 폼 여유) → build, 기본 → maintain.
 */
function decidePhase(
  tsb: number,
  daysUntilGoal: number | null | undefined,
): "build" | "maintain" | "taper" | "recovery" {
  if (daysUntilGoal != null && daysUntilGoal >= 0 && daysUntilGoal <= TAPER_DAYS_THRESHOLD) {
    return "taper";
  }
  if (tsb < OVERFATIGUE_TSB) return "recovery";
  // 목표를 향해 빌드 중(목표 존재) 이거나 폼에 여유가 있으면 빌드기.
  if ((daysUntilGoal != null && daysUntilGoal > TAPER_DAYS_THRESHOLD) || tsb > -10) {
    return "build";
  }
  return "maintain";
}

/**
 * 개인화 주간 권장부하 + Balance 가이드 산출.
 *
 * @example
 *   recommendWeeklyLoad({ ctl: 60, tsb: -12 })
 *   // → targetTss ≈ [441, 484] (60×7×1.05 ~ 60×7×1.15), phase "build"
 */
export function recommendWeeklyLoad(input: WeeklyLoadInput): WeeklyLoadResult {
  const ctl = Math.max(0, input.ctl);
  const tsb = input.tsb;
  const daysUntilGoal = input.daysUntilGoal ?? null;
  const phase = decidePhase(tsb, daysUntilGoal);

  const weeklyMaintain = ctl * 7 * MAINTAIN_FACTOR;

  let lo: number;
  let hi: number;
  switch (phase) {
    case "taper":
      lo = ctl * 7 * TAPER_LO_FACTOR;
      hi = ctl * 7 * TAPER_HI_FACTOR;
      break;
    case "recovery":
      lo = ctl * 7 * RECOVERY_LO_FACTOR;
      hi = ctl * 7 * RECOVERY_HI_FACTOR;
      break;
    case "build":
      lo = ctl * 7 * BUILD_LO_FACTOR;
      hi = ctl * 7 * BUILD_HI_FACTOR;
      break;
    case "maintain":
    default:
      lo = weeklyMaintain * 0.92;
      hi = weeklyMaintain * 1.02;
      break;
  }

  // 안전 상한: 어떤 phase 든 CTL×7×RAMP_CAP 초과 금지 (부상/번아웃 가드).
  const rampCap = ctl * 7 * RAMP_CAP_FACTOR;

  // 라이프스타일 상한 보정 — 가용시간/직업부하.
  const lifestyle = input.lifestyle ?? null;
  let lifestyleCap = Infinity;
  if (lifestyle?.weeklyAvailableHours != null && lifestyle.weeklyAvailableHours > 0) {
    lifestyleCap = lifestyle.weeklyAvailableHours * TSS_PER_AVAILABLE_HOUR;
  }
  const occFactor = lifestyle?.occupationLoad
    ? OCCUPATION_FACTOR[lifestyle.occupationLoad]
    : 1.0;

  // 직업부하는 lo/hi 양쪽을 같이 낮춘다(회복 여력 반영).
  lo *= occFactor;
  hi *= occFactor;

  // 상한들 적용: ramp cap + lifestyle cap.
  const cap = Math.min(rampCap * occFactor, lifestyleCap);
  hi = Math.min(hi, cap);
  lo = Math.min(lo, hi); // lo 가 hi 를 넘지 않도록.

  const balance = BALANCE_RANGE[phase];

  return {
    targetTss: [Math.round(lo), Math.round(hi)],
    balanceGuide: {
      lo: balance.lo,
      hi: balance.hi,
      phase,
      note: balance.note,
    },
  };
}
