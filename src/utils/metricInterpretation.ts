/**
 * 지표 개인화 해석 — 지표값 + 사용자 임계값 → i18n 키와 보간값.
 *
 * 이 파일은 문장을 만들지 않는다. **어떤 문장을 쓸지(key)와 무엇을 채워 넣을지(values)** 만 정한다.
 * 실제 문장은 `public/locales/{lng}/metricGlossary.json` 이 소유한다(en 은 번역이 아니라 별도 집필).
 *
 * 원칙(설계 문서 §1, §7):
 * - 개인 임계값이 없으면 해석을 생략한다 — 근거 없는 개인화 문장을 지어내지 않는다(null 반환).
 * - 숫자보다 변화를 먼저 말한다. 페이스는 **낮을수록 좋으므로** 개선은 "단축(faster)"으로 표현한다.
 */

import { trainingStatusLabel } from "./trainingStatusLabel";

/** 해설 시트가 다루는 지표 식별자 — i18n `metricGlossary:{metric}.*` 와 1:1. */
export type MetricKey =
  | "pace"
  | "gap"
  | "cadence"
  | "rtss"
  | "thresholdPace"
  | "ctl"
  | "atl"
  | "tsb"
  | "criticalPace";

export interface MetricInterpretation {
  /** `metricGlossary:{metric}.interp.{variant}` 로 조회할 variant 이름. */
  variant: string;
  /** i18n 보간값. */
  values: Record<string, string | number>;
}

/** 해석에 필요한 사용자·활동 컨텍스트. 없는 값은 undefined 로 두면 해석이 생략된다. */
export interface InterpretationContext {
  /** 활동 평균 페이스 (sec/km). */
  paceSecPerKm?: number | null;
  /** 활동 GAP (경사 보정 페이스, sec/km). */
  gapSecPerKm?: number | null;
  /** 최근 4주 평균 페이스 (sec/km) — 변화 문장의 기준선. */
  baselinePaceSecPerKm?: number | null;
  /** 활동 평균 케이던스 (spm). */
  cadenceSpm?: number | null;
  /** 활동 rTSS. */
  rtss?: number | null;
  /** 사용자 확정 임계 페이스 (sec/km). */
  thresholdPaceSecPerKm?: number | null;
  ctl?: number | null;
  atl?: number | null;
  tsb?: number | null;
  ctlRampPerWeek?: number | null;
}

/** GAP 과 실제 페이스 차이가 이 값(초) 미만이면 "평지에 가깝다"로 본다. */
const GAP_FLAT_THRESHOLD_SEC = 5;
/** 페이스 변화가 이 값(초) 미만이면 "비슷하다"로 본다. */
const PACE_CHANGE_THRESHOLD_SEC = 3;
/** 러닝 케이던스 권장 하한 (spm) — 이보다 낮으면 보폭 과다 경향. */
const CADENCE_LOW_SPM = 170;
const CADENCE_HIGH_SPM = 185;
/** IF 구간 — 회복 소요 안내 분기. */
const IF_EASY_BELOW = 0.85;
const IF_HARD_ABOVE = 1.0;

const round = (n: number) => Math.round(n);

/**
 * 지표별 개인화 해석. 근거가 부족하면 null (호출부는 정의 단락만 노출).
 */
export function interpretMetric(
  metric: MetricKey,
  ctx: InterpretationContext,
): MetricInterpretation | null {
  switch (metric) {
    case "gap":
      return interpretGap(ctx);
    case "pace":
      return interpretPace(ctx);
    case "cadence":
      return interpretCadence(ctx);
    case "rtss":
      return interpretRtss(ctx);
    case "tsb":
      return interpretTsb(ctx);
    case "ctl":
      return interpretCtl(ctx);
    case "atl":
      return interpretAtl(ctx);
    case "thresholdPace":
      return interpretThresholdPace(ctx);
    case "criticalPace":
      return null; // 곡선 자체가 해석 — 별도 문장 없음
    default:
      return null;
  }
}

/** GAP: 실제 페이스보다 빠르면 오르막이 많았다는 뜻. */
function interpretGap(ctx: InterpretationContext): MetricInterpretation | null {
  const { gapSecPerKm, paceSecPerKm } = ctx;
  if (!gapSecPerKm || !paceSecPerKm) return null;
  const diffSec = paceSecPerKm - gapSecPerKm; // 양수 = GAP 이 더 빠름 = 오르막
  if (Math.abs(diffSec) < GAP_FLAT_THRESHOLD_SEC) {
    return { variant: "flat", values: {} };
  }
  return diffSec > 0
    ? { variant: "uphill", values: { diffSec: round(diffSec) } }
    : { variant: "downhill", values: { diffSec: round(-diffSec) } };
}

/** 페이스: 최근 4주 평균 대비 변화. 낮을수록 좋으므로 감소가 "단축". */
function interpretPace(ctx: InterpretationContext): MetricInterpretation | null {
  const { paceSecPerKm, baselinePaceSecPerKm } = ctx;
  if (!paceSecPerKm || !baselinePaceSecPerKm) return null;
  const diffSec = baselinePaceSecPerKm - paceSecPerKm; // 양수 = 이번이 더 빠름
  if (Math.abs(diffSec) < PACE_CHANGE_THRESHOLD_SEC) {
    return { variant: "steady", values: {} };
  }
  return diffSec > 0
    ? { variant: "faster", values: { diffSec: round(diffSec) } }
    : { variant: "slower", values: { diffSec: round(-diffSec) } };
}

/** 케이던스: 170~185 spm 권장 대역. */
function interpretCadence(ctx: InterpretationContext): MetricInterpretation | null {
  const { cadenceSpm } = ctx;
  if (!cadenceSpm || cadenceSpm <= 0) return null;
  if (cadenceSpm < CADENCE_LOW_SPM) {
    return { variant: "low", values: { cadence: round(cadenceSpm), target: CADENCE_LOW_SPM } };
  }
  if (cadenceSpm > CADENCE_HIGH_SPM) {
    return { variant: "high", values: { cadence: round(cadenceSpm) } };
  }
  return { variant: "optimal", values: { cadence: round(cadenceSpm) } };
}

/**
 * rTSS: 강도(IF)로 회복 소요를 말해 준다.
 * IF = thresholdPace / avgPace — `estimateTSS.ts` 와 동일 정의(>1 이면 임계 초과).
 * 이 회복 문장이 가민(숫자만)·런나(러닝 전용)와 갈리는 지점이다.
 */
function interpretRtss(ctx: InterpretationContext): MetricInterpretation | null {
  const { rtss, thresholdPaceSecPerKm, paceSecPerKm } = ctx;
  if (rtss == null || rtss <= 0) return null;
  if (!thresholdPaceSecPerKm || !paceSecPerKm) return null;
  const intensityFactor = thresholdPaceSecPerKm / paceSecPerKm;
  const ifStr = intensityFactor.toFixed(2);
  if (intensityFactor >= IF_HARD_ABOVE) {
    return { variant: "hard", values: { rtss: round(rtss), if: ifStr } };
  }
  if (intensityFactor < IF_EASY_BELOW) {
    return { variant: "easy", values: { rtss: round(rtss), if: ifStr } };
  }
  return { variant: "moderate", values: { rtss: round(rtss), if: ifStr } };
}

/** TSB: 훈련 상태 라벨과 같은 판정을 재사용해 화면 간 문구가 어긋나지 않게 한다. */
function interpretTsb(ctx: InterpretationContext): MetricInterpretation | null {
  const { tsb, ctlRampPerWeek } = ctx;
  if (tsb == null) return null;
  const status = trainingStatusLabel({ tsb, ctlRampPerWeek });
  return { variant: status.key, values: { tsb: tsb.toFixed(1) } };
}

/** CTL: 체력. ATL 과 함께 있어야 의미가 살아난다. */
function interpretCtl(ctx: InterpretationContext): MetricInterpretation | null {
  const { ctl, ctlRampPerWeek } = ctx;
  if (ctl == null || ctl <= 0) return null;
  if (ctlRampPerWeek == null) return { variant: "plain", values: { ctl: round(ctl) } };
  if (ctlRampPerWeek > 0) {
    return { variant: "rising", values: { ctl: round(ctl), ramp: ctlRampPerWeek.toFixed(1) } };
  }
  return { variant: "falling", values: { ctl: round(ctl), ramp: Math.abs(ctlRampPerWeek).toFixed(1) } };
}

/** ATL: 피로. CTL 대비 비율로 말한다. */
function interpretAtl(ctx: InterpretationContext): MetricInterpretation | null {
  const { atl, ctl } = ctx;
  if (atl == null || atl <= 0) return null;
  if (!ctl || ctl <= 0) return { variant: "plain", values: { atl: round(atl) } };
  const ratio = atl / ctl;
  const variant = ratio > 1.15 ? "high" : ratio < 0.85 ? "low" : "balanced";
  return { variant, values: { atl: round(atl), ctl: round(ctl) } };
}

/** 임계 페이스: 설정되어 있으면 값을, 없으면 설정 유도. */
function interpretThresholdPace(ctx: InterpretationContext): MetricInterpretation | null {
  const { thresholdPaceSecPerKm } = ctx;
  if (!thresholdPaceSecPerKm || thresholdPaceSecPerKm <= 0) {
    return { variant: "unset", values: {} };
  }
  return { variant: "set", values: { thresholdPace: round(thresholdPaceSecPerKm) } };
}

/**
 * 활동 상세 최상단 "쉬운 말 요약" — GAP 해석 + 페이스 변화를 한 덩어리로 묶는다.
 * 두 근거가 모두 없으면 null (요약 카드를 렌더하지 않음).
 */
export interface ActivitySummaryInterpretation {
  gap: MetricInterpretation | null;
  pace: MetricInterpretation | null;
}

export function interpretActivitySummary(
  ctx: InterpretationContext,
): ActivitySummaryInterpretation | null {
  const gap = interpretGap(ctx);
  const pace = interpretPace(ctx);
  if (!gap && !pace) return null;
  return { gap, pace };
}
