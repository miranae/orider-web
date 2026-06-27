/**
 * Feasibility(목표 실현 가능성) 평가 공용 규칙 — pure, Firebase 무관.
 *
 * 웹 미리보기와 서버 createGoal이 동일한 결과를 내도록 단일 소스 유지.
 * Cloud Functions는 tsconfig include 제약으로 이 파일을 직접 import할 수 없어
 * `functions/src/training/feasibility-rules.ts` 가 본 파일의 미러로 유지됨.
 * **변경 시 두 파일을 모두 수정해야 한다.**
 */

import type { FeasibilityLabel } from '../types/goal';

// ── 피로도(TSB) 기반 sustainable W/kg 보정 임계값 ───────────────────────
//
// Coggan의 TSB 가이드라인 참고:
//   tsb ≤ -25 : 매우 피로(overreaching, 부상 위험) — ×0.82
//   tsb ≤ -15 : 피로 누적(productive training이지만 위험권 직전) — ×0.90
//   tsb ≥ +10 : 신선(테이퍼/peak 상태) — ×1.03
//   그 외     : 1.00 (정상 범위, 보정 없음)
//
// 보수적으로 설정 — 잘못된 sustainable 추정은 위험한 목표 승인으로 이어짐.
export const TSB_SEVERE_FATIGUE = -25;
export const TSB_FATIGUE = -15;
export const TSB_FRESH = 10;

export const FATIGUE_MULT_SEVERE = 0.82;
export const FATIGUE_MULT_TIRED = 0.90;
export const FATIGUE_MULT_FRESH = 1.03;

export function fatigueMultiplier(tsb: number | null | undefined): number {
  if (tsb == null || !Number.isFinite(tsb)) return 1;
  if (tsb <= TSB_SEVERE_FATIGUE) return FATIGUE_MULT_SEVERE;
  if (tsb <= TSB_FATIGUE) return FATIGUE_MULT_TIRED;
  if (tsb >= TSB_FRESH) return FATIGUE_MULT_FRESH;
  return 1;
}

// ── Feasibility label 기준 ──────────────────────────────────────────────
const GAP_EASY = -0.15;
const GAP_ON_TRACK = 0.10;
const GAP_STRETCH = 0.35;

export function labelFromGap(gapWkg: number): FeasibilityLabel {
  if (gapWkg <= GAP_EASY) return 'easy';
  if (gapWkg <= GAP_ON_TRACK) return 'on_track';
  if (gapWkg <= GAP_STRETCH) return 'stretch';
  return 'risky';
}

// ── 통합 calcFeasibility — 웹/서버 공용 ─────────────────────────────────

export interface FeasibilityInput {
  /** 코스 또는 이벤트 거리(km) / 누적 상승고도(m) */
  course: { dist: number; elev: number };
  /** 목표 — 완주(completion)이면 항상 on_track 반환 */
  target: { eventType: string; targetDurationMin?: number | null };
  /** 사용자 임계값 — ftpW, weightKg */
  snap: { ftp: number; weightKg: number };
  /** 현재 TSB. 없거나 finite 아니면 보정 안 함. */
  fitness?: { tsb: number | null | undefined } | null;
}

export interface FeasibilityResult {
  label: FeasibilityLabel;
  requiredWkg?: number;
  sustainableWkg?: number;
  gapWkg?: number;
  /** 피로도(TSB) 기반 sustainableWkg 보정율(%). fitness 미주입이면 undefined. */
  fatigueAdjustmentPct?: number;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

export function calcFeasibility(input: FeasibilityInput): FeasibilityResult {
  const { course, target, snap, fitness } = input;

  if (target.eventType === 'completion') {
    return { label: 'on_track' };
  }

  const dur = target.targetDurationMin ?? 0;
  if (dur <= 0) return { label: 'on_track' };

  // 입력 유한성·양수 가드(#539) — 거리 0/음수, 체중·FTP 0/누락이면 requiredWkg 가 비현실적으로
  // 낮거나 myWkg 가 NaN/Infinity 가 되어 risky 코스가 easy 로 오판되거나 전부 risky 로 떨어진다.
  // 판정 근거가 불충분하면 중립(on_track) 반환.
  if (!(course.dist > 0) || !(snap.weightKg > 0) || !(snap.ftp > 0)) {
    return { label: 'on_track' };
  }
  const elev = Number.isFinite(course.elev) && course.elev > 0 ? course.elev : 0;

  const targetH = dur / 60;
  const speed = course.dist / targetH;                    // km/h
  const climbMperH = elev / targetH;                      // m/h
  const requiredWkg = 0.12 * speed + 0.0035 * climbMperH * 3.6;
  const myWkg = snap.ftp / snap.weightKg;

  // 피로도 — fitness 인자 자체가 없거나 tsb가 null이면 보정 안 함 (Pct=undefined)
  let fatigueMult = 1;
  let fatigueAdjustmentPct: number | undefined;
  if (fitness != null && fitness.tsb != null && Number.isFinite(fitness.tsb)) {
    fatigueMult = fatigueMultiplier(fitness.tsb);
    fatigueAdjustmentPct = Math.round((fatigueMult - 1) * 100);
  }

  const sustainableWkg = myWkg * 0.72 * fatigueMult;
  const gap = requiredWkg - sustainableWkg;

  return {
    label: labelFromGap(gap),
    requiredWkg: round2(requiredWkg),
    sustainableWkg: round2(sustainableWkg),
    gapWkg: round2(gap),
    fatigueAdjustmentPct,
  };
}
