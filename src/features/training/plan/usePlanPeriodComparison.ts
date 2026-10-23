import type { PlanWeek } from "@shared/types/goal";
import { planDayKey } from "@shared/training/planDate";
import { getPlanLoadRangeBounds, type PlanLoadRange } from "./planLoadComparison";
import { usePlanLoadComparison } from "./usePlanLoadComparison";

const DAY_MS = 86_400_000;
const EMPTY_WEEKS: PlanWeek[] = [];
const EMPTY_RANGE = { start: "", end: "" };
type Options = Parameters<typeof usePlanLoadComparison>[0];
function resolvedParent(result: ReturnType<typeof usePlanLoadComparison>) {
  return result.state === "ready" && result.summary.unknownCount === 0 && result.summary.plannedTss !== null;
}

/** 선택 기간이 잘라 놓은 실제 저장 주만 별도로 확인한다. 임의 기간은 상위 목표가 아니다. */
export function boundaryPlanWeeks(weeks: readonly PlanWeek[], range: PlanLoadRange) {
  if (!getPlanLoadRangeBounds(range)) return [];
  return weeks.flatMap(week => {
    if (!Number.isFinite(week.startDate) || !week.days?.length) return [];
    const start = planDayKey(week.startDate);
    const end = planDayKey(week.startDate + 6 * DAY_MS);
    if (!getPlanLoadRangeBounds({ start, end }) || week.days.some(day => !Number.isFinite(day.date)
      || planDayKey(day.date) < start || planDayKey(day.date) > end)) return [];
    return start <= range.end && end >= range.start && (start < range.start || end > range.end)
      ? [{ week, range: { start, end } }] : [];
  }).sort((a, b) => a.range.start.localeCompare(b.range.start));
}

/** 기간 합계와 상위 주의 조회·완전성은 독립적이다. 기존 소유자/정본/대표 규칙을 그대로 쓴다. */
export function usePlanPeriodComparison(options: Options) {
  const boundaries = boundaryPlanWeeks(options.weeks, options.range);
  // 정상 저장 주는 겹치지 않아 양 경계에 최대 두 개다. 모호한 주를 임의 선택하지 않는다.
  const ambiguous = boundaries.length > 2 || boundaries.length === 2 && boundaries[0]!.range.end >= boundaries[1]!.range.start;
  const first = ambiguous ? undefined : boundaries[0];
  const second = ambiguous ? undefined : boundaries[1];
  const firstResult = usePlanLoadComparison({ ...options, weeks: first ? [first.week] : EMPTY_WEEKS,
    range: first?.range ?? EMPTY_RANGE, enabled: options.enabled !== false && !!first });
  const secondResult = usePlanLoadComparison({ ...options, weeks: second ? [second.week] : EMPTY_WEEKS,
    range: second?.range ?? EMPTY_RANGE, enabled: options.enabled !== false && !!second });
  const result = usePlanLoadComparison(options);
  const boundaryResults = [{ boundary: first, result: firstResult }, { boundary: second, result: secondResult }];
  const parentWeeksPending = ambiguous || boundaryResults.some(item => item.boundary && !resolvedParent(item.result));
  const retryParentWeeks = () => { if (first) firstResult.retry(); if (second) secondResult.retry(); };
  return { ...result, parentWeeksPending, retryParentWeeks,
    days: result.days.map(row => {
      const boundary = boundaries.find(item => row.date >= item.range.start && row.date <= item.range.end);
      if (!boundary) return row;
      const evidence = boundaryResults.find(item => item.boundary === boundary)?.result;
      const ready = !ambiguous && result.state === "ready" && evidence && resolvedParent(evidence);
      return { ...row, fulfilledWeek: ready ? evidence.days.find(day => day.date === row.date)?.fulfilledWeek : undefined,
        parentWeekPending: !ready };
    }),
  };
}
