/**
 * Recommendation composer — facts (+ optional training summary) → fallback narrative.
 *
 * LLM 응답 전/실패 시 즉시 표시할 baseline. 수사 없이 데이터만 명확히 나열.
 * LLM 응답 도착하면 풍부한 산문으로 교체됨.
 */

import type { TFunction } from "i18next";
import type { RecommendationFacts } from "./todaysRecommendation";
import type { TrainingSummary } from "@shared/types/training-summary";

export function composeFallbackNarrative(
  facts: RecommendationFacts,
  summary: TrainingSummary | null | undefined,
  t: TFunction,
): string {
  const lines: string[] = [];

  // 1. 권장 세션 한 줄
  const [lo, hi] = facts.durationMin;
  const durLabel =
    lo === 0 && hi === 0 ? t("training:fallback.durRest")
    : lo === hi ? t("training:fallback.durFixed", { min: lo })
    : t("training:fallback.durRange", { lo, hi });
  lines.push(t("training:fallback.today", { sessionName: facts.sessionName, zone: facts.zone, dur: durLabel }));

  // 2. 현재 상태 (facts.inputSnapshot)
  const s = facts.inputSnapshot;
  const tsbStr = s.tsb >= 0 ? `+${s.tsb}` : `${s.tsb}`;
  lines.push(t("training:fallback.current", { ctl: s.ctl, atl: s.atl, tsb: tsbStr }));

  // 3. summary 가 있으면 윈도우별 데이터 한 줄씩
  if (summary) {
    lines.push(t("training:fallback.week", {
      count: summary.week.sessions,
      tss: summary.week.totalTss,
      rest: summary.week.restDays,
    }));
    lines.push(t("training:fallback.month", {
      count: summary.month.sessions,
      tss: summary.month.totalTss,
      avg: summary.month.avgWeekTss,
    }));
    if (summary.today.didTrain) {
      lines.push(t("training:fallback.todayRecord", { tss: summary.today.tss, min: summary.today.durationMin }));
    }
  }

  return lines.join("\n");
}
