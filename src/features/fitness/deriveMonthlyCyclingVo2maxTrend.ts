import type { PdcDoc } from "@shared/types/pdc";
import { estimateCyclingVo2max } from "@shared/training/vo2max";

type PdcHistory = PdcDoc["history"];

export interface MonthlyCyclingVo2maxPoint {
  period: string;
  v: number;
}

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * 월별 5분 실측 MMP만으로 VO2max 추이를 만든다.
 * 현재 CP나 다른 달의 값은 폴백하지 않으며, 같은 월은 마지막 유효 스냅샷을 사용한다.
 */
export function deriveMonthlyCyclingVo2maxTrend(
  history: PdcHistory | null | undefined,
  weightKg: number | null | undefined,
): MonthlyCyclingVo2maxPoint[] {
  if (!history?.length || weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return [];

  const measuredByPeriod = new Map<string, number>();
  for (const snapshot of history) {
    const power5minW = snapshot.mmp?.["5m"];
    if (!PERIOD_PATTERN.test(snapshot.period) || power5minW == null || !Number.isFinite(power5minW) || power5minW <= 0) continue;
    measuredByPeriod.set(snapshot.period, power5minW);
  }

  return [...measuredByPeriod.entries()]
    .sort(([periodA], [periodB]) => periodA.localeCompare(periodB))
    .flatMap(([period, power5minW]) => {
      const estimate = estimateCyclingVo2max({ power5minW, weightKg });
      return estimate == null ? [] : [{ period, v: estimate }];
    });
}
