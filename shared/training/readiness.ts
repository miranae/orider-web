/**
 * Readiness(준비도) 점수 추정 v1 — 아침 wellness 지표(HRV·안정시심박·수면)로 0~100 점수.
 *
 * **groundwork only (#466):** 본 모듈은 순수 계산부만 제공한다. 현재 앱 HealthKit/Health
 * Connect 모듈이 build-excluded(#246)라 HRV/RHR/수면 데이터가 실제로 유입되지 않으므로,
 * UI·트리거·데이터 배선은 아직 하지 않는다. 데이터가 유입되면 이 함수를 호출해 점수를 띄운다.
 *
 * 정확한 상용 readiness 공식(Garmin/Polar/Oura 등)은 비공개이므로, **개인 baseline 대비
 * 편차**를 투명하게 결합한 휴리스틱을 쓴다(intervals.icu 의 wellness 접근과 유사):
 *
 *   - HRV(rmssd): baseline 평균/표준편차 대비 z-score. 높을수록 좋음.
 *   - RHR: baseline 대비 낮을수록 좋음(상승 = 피로/스트레스 신호).
 *   - 수면: 8h 근처 최적, 멀어질수록 감점.
 *
 * 각 하위점수(0~100)를 가용 지표만으로 가중평균(HRV 0.5 · RHR 0.3 · 수면 0.2, 정규화).
 * 순수 함수 · IO 없음. **추정치**이며 상수는 튜닝 대상(v1).
 */
import { isPositiveFinite, clamp } from "./mathUtil";

export type ReadinessBand = "poor" | "fair" | "good" | "optimal";

export interface ReadinessFactors {
  /** HRV 하위점수(0~100). 입력 없으면 미포함. */
  hrv?: number;
  /** RHR 하위점수(0~100). */
  rhr?: number;
  /** 수면 하위점수(0~100). */
  sleep?: number;
}

export interface ReadinessEstimate {
  /** 종합 준비도(0~100, 반올림). */
  score: number;
  band: ReadinessBand;
  /** 하위점수 분해 — UI 설명/디버깅용. */
  factors: ReadinessFactors;
}

export interface ReadinessInput {
  /** 오늘 아침 HRV (rmssd, ms). */
  hrvRmssd?: number | null;
  /** 개인 HRV baseline 평균(ms) — 보통 최근 7~60일 rolling mean. */
  hrvBaselineMean?: number | null;
  /** 개인 HRV baseline 표준편차(ms). 없거나 0 이면 평균의 10% 로 가정. */
  hrvBaselineSd?: number | null;
  /** 오늘 아침 안정시심박(bpm). */
  restingHr?: number | null;
  /** 개인 RHR baseline 평균(bpm). */
  rhrBaselineMean?: number | null;
  /** 지난밤 수면시간(시간). */
  sleepHours?: number | null;
}

/** 점수 가중치 — 가용 지표만으로 정규화. */
const W_HRV = 0.5;
const W_RHR = 0.3;
const W_SLEEP = 0.2;

/** z-score 1.0 당 가감점(HRV). z=0 → 60(baseline=중립-양호). */
const HRV_PTS_PER_Z = 25;
const HRV_BASE = 60;
/** RHR baseline 대비 1bpm 낮을 때 가점. */
const RHR_PTS_PER_BPM = 4;
const RHR_BASE = 60;
/** 수면 최적 시간(시간)·1시간 이탈당 감점. */
const SLEEP_OPTIMAL_H = 8;
const SLEEP_PTS_PER_H = 15;
const SLEEP_BASE = 100;

function bandOf(score: number): ReadinessBand {
  if (score < 40) return "poor";
  if (score < 60) return "fair";
  if (score < 80) return "good";
  return "optimal";
}

/**
 * wellness 지표로 readiness 점수를 추정한다. 가용 지표가 하나도 없으면 null.
 */
export function estimateReadiness(input: ReadinessInput): ReadinessEstimate | null {
  const factors: ReadinessFactors = {};
  const parts: Array<{ w: number; v: number }> = [];

  // HRV — baseline 대비 z-score
  if (
    isPositiveFinite(input.hrvRmssd) &&
    isPositiveFinite(input.hrvBaselineMean)
  ) {
    const sd =
      isPositiveFinite(input.hrvBaselineSd) && input.hrvBaselineSd! > 0
        ? input.hrvBaselineSd!
        : input.hrvBaselineMean! * 0.1; // SD 미상 시 평균의 10%
    const z = (input.hrvRmssd! - input.hrvBaselineMean!) / sd;
    const sub = clamp(HRV_BASE + z * HRV_PTS_PER_Z, 0, 100);
    factors.hrv = Math.round(sub);
    parts.push({ w: W_HRV, v: sub });
  }

  // RHR — baseline 대비 낮을수록 좋음
  if (isPositiveFinite(input.restingHr) && isPositiveFinite(input.rhrBaselineMean)) {
    const delta = input.rhrBaselineMean! - input.restingHr!; // 양수 = baseline 보다 낮음(좋음)
    const sub = clamp(RHR_BASE + delta * RHR_PTS_PER_BPM, 0, 100);
    factors.rhr = Math.round(sub);
    parts.push({ w: W_RHR, v: sub });
  }

  // 수면 — 최적 8h 근처
  if (isPositiveFinite(input.sleepHours)) {
    const sub = clamp(SLEEP_BASE - Math.abs(input.sleepHours! - SLEEP_OPTIMAL_H) * SLEEP_PTS_PER_H, 0, 100);
    factors.sleep = Math.round(sub);
    parts.push({ w: W_SLEEP, v: sub });
  }

  if (parts.length === 0) return null;

  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const score = Math.round(parts.reduce((s, p) => s + p.w * p.v, 0) / totalW);

  return { score, band: bandOf(score), factors };
}
