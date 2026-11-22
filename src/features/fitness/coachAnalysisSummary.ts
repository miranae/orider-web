import type { PowerCurvePeriodResult, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import type { PeriodHrZoneGroup, PeriodPowerZoneGroup, TrainingAnalysisPeriodResult, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";

/**
 * 코치 분석(최근 N일 ↔ 이전 N일) 요약. 서버 값을 고르고 두 기간 값을 나란히 견준다(변화율).
 * 존 비중처럼 서버 값을 합쳐 새 지표를 만드는 계산은 두지 않는다(P6).
 * 기간 순서는 서버 응답 그대로 [최근, 이전] 이다(trainingWindowPeriods).
 */

export type PowerUnit = "W" | "W/kg";
/** 요약 표에 두는 지속시간(초) — 5초·5분·20분·60분. */
export const ANALYSIS_TABLE_DURATIONS = [5, 300, 1200, 3600] as const;

export interface CurveRow { durationSeconds: number; recent: number | null; previous: number | null; changePct: number | null }
/** 서버가 낸 존 묶음 그대로(기준별 존 시간). 화면은 합치거나 다시 나누지 않는다. */
export type ZoneGroup = PeriodPowerZoneGroup | PeriodHrZoneGroup;
/** 서버 이동 시간(시간 단위로만 바꾼다). 기간 일부만 집계됐으면 partial. */
export interface MovingHours { hours: number; partial: boolean }
export interface CoachAnalysisSummary {
  /** 파워 기간 비교를 받았지만 두 기간을 견줄 수 없을 때만 값이 있다. */
  insufficient: { powerActivityCount: number } | null;
  fiveMinPct: number | null;
  sixtyMinPct: number | null;
  /** 두 기간 중 하나라도 일부 기록만 집계됐는지(파워 비교). */
  powerPartial: boolean;
  rows: CurveRow[];
  recentZones: ZoneGroup[];
  previousZones: ZoneGroup[];
  recentHours: MovingHours | null;
  previousHours: MovingHours | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** 한 기간의 지속시간별 최고 파워. 체중 기준이면 체중 기준 값만 쓴다(없으면 null). */
export function periodPower(period: PowerCurvePeriodResult | undefined, durationSeconds: number, unit: PowerUnit = "W"): number | null {
  if (!period) return null;
  if (unit === "W/kg") {
    const point = period.weightNormalized?.points.find(item => item.durationSeconds === durationSeconds);
    return point && point.wattsPerKg > 0 ? point.wattsPerKg : null;
  }
  const point = period.points.find(item => item.durationSeconds === durationSeconds);
  return point && point.watts > 0 ? point.watts : null;
}

/** 변화율(%). 어느 한쪽이 없거나 이전 값이 0 이하면 견줄 수 없다. */
export function changePct(recent: number | null, previous: number | null): number | null {
  if (recent == null || previous == null || !Number.isFinite(recent) || !Number.isFinite(previous) || previous <= 0) return null;
  return round1((recent - previous) / previous * 100);
}

/**
 * 한 기간의 존 묶음 — 파워 존이 기록돼 있으면 파워, 없으면 심박. 서버 값을 고르기만 하고 계산하지 않는다(P6).
 * 존 비중·고강도 비율 같은 파생 값은 서버가 내려줄 때까지 두지 않는다.
 */
export function zoneGroups(period: TrainingAnalysisPeriodResult | undefined): ZoneGroup[] {
  if (!period) return [];
  const power = period.zones.power.groups.filter(group => group.observedSeconds > 0);
  if (power.length > 0) return power;
  return period.zones.heartRate.groups.filter(group => group.observedSeconds > 0);
}

/** 서버 이동 시간 합계. 전체 값(totalValue)이 없거나 기간이 일부만 집계됐으면 관측 값을 partial 로 표시한다. */
export function movingHours(period: TrainingAnalysisPeriodResult | undefined): MovingHours | null {
  if (!period) return null;
  const total = period.totals.movingTimeSec;
  const seconds = total.totalValue ?? total.observedValue;
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return { hours: seconds / 3600, partial: total.totalValue == null || period.status === "partial" || period.coverage.truncated };
}

export function summarizeCoachAnalysis({ power, training, unit = "W" }: { power: PowerCurvePeriodsResponse | null; training: TrainingAnalysisPeriodsResponse | null; unit?: PowerUnit }): CoachAnalysisSummary {
  const [recentPower, previousPower] = power?.periods ?? [];
  const comparable = !!recentPower && !!previousPower && recentPower.points.length > 0 && previousPower.points.length > 0;
  const insufficient = power && !comparable
    ? { powerActivityCount: (recentPower?.coverage.includedActivityCount ?? 0) + (previousPower?.coverage.includedActivityCount ?? 0) }
    : null;
  const pct = (seconds: number) => comparable ? changePct(periodPower(recentPower, seconds, "W"), periodPower(previousPower, seconds, "W")) : null;
  const rows: CurveRow[] = comparable ? ANALYSIS_TABLE_DURATIONS.map(durationSeconds => {
    const recent = periodPower(recentPower, durationSeconds, unit), previous = periodPower(previousPower, durationSeconds, unit);
    return { durationSeconds, recent, previous, changePct: changePct(recent, previous) };
  }).filter(row => row.recent != null || row.previous != null) : [];
  const [recentTraining, previousTraining] = training?.periods ?? [];
  return {
    insufficient,
    fiveMinPct: pct(300),
    sixtyMinPct: pct(3600),
    powerPartial: comparable && (recentPower.status === "partial" || previousPower.status === "partial"),
    rows,
    recentZones: zoneGroups(recentTraining),
    previousZones: zoneGroups(previousTraining),
    recentHours: movingHours(recentTraining),
    previousHours: movingHours(previousTraining),
  };
}

/** 부호를 붙인 변화 표기(+4.2 / −1.0). 0 은 부호 없이. */
export function signedChange(value: number): string {
  const text = Math.abs(value).toFixed(1);
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}
