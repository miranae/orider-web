/**
 * PlanPage UI 산출 메트릭 — 완료 TSS / 진행률 / 남은 주수.
 *
 * web (PlanPage)와 verification fixtures(simulate)가 공통으로 사용한다.
 * 본 파일이 단일 소스 — UI에서 인라인 계산하지 말 것.
 *
 * Pure 함수: 입력 PlanWeek[] + todayMs → 결과 객체. Firebase/React 의존 없음.
 */

import type { PlanWeek, PlanDay } from "../types/goal";

export interface PlanProgressMetrics {
  /** 스킵 제외 현재 유효 처방 TSS 총합(조정값 우선) */
  totalTSS: number;
  /** 계획 가중 진행: 실제 TSS가 있으면 0도 보존, 없으면 유효 처방값. 실측 부하 총합이 아니다. */
  completedTSS: number;
  /** completedTSS/totalTSS × 100, 정수 반올림. totalTSS=0이면 0 */
  progressPct: number;
  /** 오늘+7일 이후가 startDate인 주의 개수 — UI "남은 N주" */
  weeksLeft: number;
}

function dayPlanned(d: PlanDay): number {
  return d.skipped ? 0 : (d.adjustedTSS ?? d.plannedTSS);
}

function dayCompleted(d: PlanDay): number {
  if (!d.completed || d.skipped) return 0;
  return d.actualTSS ?? dayPlanned(d);
}

export function computePlanProgress(weeks: PlanWeek[], todayMs: number): PlanProgressMetrics {
  let totalTSS = 0;
  let completedTSS = 0;
  for (const w of weeks) {
    for (const d of w.days) {
      totalTSS += dayPlanned(d);
      completedTSS += dayCompleted(d);
    }
  }
  const progressPct = totalTSS > 0 ? Math.round((completedTSS / totalTSS) * 100) : 0;
  const weeksLeft = weeks.filter((w) => w.startDate + 7 * 86400000 > todayMs).length;
  return { totalTSS, completedTSS, progressPct, weeksLeft };
}
