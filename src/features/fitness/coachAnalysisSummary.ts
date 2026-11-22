import type { PowerCurvePeriodResult, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import type { PeriodHrZoneGroup, PeriodPowerZoneGroup, TrainingAnalysisPeriodResult, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";

/**
 * 코치 분석(최근 N일 ↔ 이전 N일) 요약. 서버 값을 고르기만 하고 두 기간 값을 나란히 둔다.
 * 변화율·존 비중처럼 서버 값으로 새 지표를 만드는 계산은 두지 않는다(P6) — 서버가 내려주면 그때 붙인다.
 * 기간 순서는 서버 응답 그대로 [최근, 이전] 이다(trainingWindowPeriods).
 */

export type PowerUnit = "W" | "W/kg";
/** 요약 표에 두는 지속시간(초) — 5초·5분·20분·60분. */
export const ANALYSIS_TABLE_DURATIONS = [5, 300, 1200, 3600] as const;

export interface CurveRow { durationSeconds: number; recent: number | null; previous: number | null }
/** 러닝 페이스 커브 한 점(서버 기간 통계 그대로). */
export interface PacePoint { durationSec: number; paceSecPerKm: number }
/** 서버가 낸 존 묶음 그대로(기준별 존 시간). 화면은 합치거나 다시 나누지 않는다. */
export type ZoneGroup = PeriodPowerZoneGroup | PeriodHrZoneGroup;
/** 서버 이동 시간(시간 단위로만 바꾼다). 기간 일부만 집계됐으면 partial. */
export interface MovingHours { hours: number; partial: boolean }
export interface CoachAnalysisSummary {
  /** 파워 기간 비교를 받았지만 두 기간을 견줄 수 없을 때만 값이 있다. */
  insufficient: { powerActivityCount: number } | null;
  /** 5분·60분 최고 파워(서버 값, 현재 단위). */
  fiveMin: CurveRow | null;
  sixtyMin: CurveRow | null;
  /** 두 기간 중 하나라도 일부 기록만 집계됐는지(파워 비교). */
  powerPartial: boolean;
  rows: CurveRow[];
  recentZones: ZoneGroup[];
  previousZones: ZoneGroup[];
  recentHours: MovingHours | null;
  previousHours: MovingHours | null;
  /** 서버 기간 통계의 러닝 페이스 커브(두 기간 같은 산출 기준). 없으면 null. */
  pace: { recent: PacePoint[]; previous: PacePoint[] } | null;
}

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

/**
 * 러닝 기간 페이스 커브 — 서버가 기간마다 낸 커브 중 두 기간에 같은 산출 기준(sourceBasis)이 있는 것을 고른다
 * (정본 페이스 우선). 기준이 다른 커브끼리는 견주지 않는다.
 */
export function periodPaceCurves(recent: TrainingAnalysisPeriodResult | undefined, previous: TrainingAnalysisPeriodResult | undefined): { recent: PacePoint[]; previous: PacePoint[] } | null {
  const curves = (period: TrainingAnalysisPeriodResult | undefined) => period?.running?.paceCurves ?? [];
  const pick = (period: TrainingAnalysisPeriodResult | undefined, basis: string) => (curves(period).find(curve => curve.sourceBasis === basis)?.points ?? [])
    .map(point => ({ durationSec: point.durationSeconds, paceSecPerKm: point.paceSecPerKm }));
  const bases = ["run_metrics_pace_curve", "speed_curve_kmh_converted"];
  const basis = bases.find(value => curves(recent).some(curve => curve.sourceBasis === value) && curves(previous).some(curve => curve.sourceBasis === value))
    ?? bases.find(value => curves(recent).some(curve => curve.sourceBasis === value) || curves(previous).some(curve => curve.sourceBasis === value));
  if (!basis) return null;
  const result = { recent: pick(recent, basis), previous: pick(previous, basis) };
  return result.recent.length || result.previous.length ? result : null;
}

export function summarizeCoachAnalysis({ power, training, unit = "W" }: { power: PowerCurvePeriodsResponse | null; training: TrainingAnalysisPeriodsResponse | null; unit?: PowerUnit }): CoachAnalysisSummary {
  const [recentPower, previousPower] = power?.periods ?? [];
  const comparable = !!recentPower && !!previousPower && recentPower.points.length > 0 && previousPower.points.length > 0;
  const insufficient = power && !comparable
    ? { powerActivityCount: (recentPower?.coverage.includedActivityCount ?? 0) + (previousPower?.coverage.includedActivityCount ?? 0) }
    : null;
  const row = (durationSeconds: number): CurveRow => ({ durationSeconds, recent: periodPower(recentPower, durationSeconds, unit), previous: periodPower(previousPower, durationSeconds, unit) });
  const rows: CurveRow[] = comparable ? ANALYSIS_TABLE_DURATIONS.map(row).filter(item => item.recent != null || item.previous != null) : [];
  const [recentTraining, previousTraining] = training?.periods ?? [];
  return {
    insufficient,
    fiveMin: comparable ? row(300) : null,
    sixtyMin: comparable ? row(3600) : null,
    powerPartial: comparable && (recentPower.status === "partial" || previousPower.status === "partial"),
    rows,
    recentZones: zoneGroups(recentTraining),
    previousZones: zoneGroups(previousTraining),
    recentHours: movingHours(recentTraining),
    previousHours: movingHours(previousTraining),
    pace: periodPaceCurves(recentTraining, previousTraining),
  };
}
