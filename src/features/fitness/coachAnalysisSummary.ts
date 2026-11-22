import type { PowerCurvePeriodResult, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import type { TrainingAnalysisPeriodResult, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";

/**
 * 코치 분석(최근 N일 ↔ 이전 N일) 요약 계산. 화면에 그리는 숫자만 만들고 문구는 두지 않는다.
 * 기간 순서는 서버 응답 그대로 [최근, 이전] 이다(trainingWindowPeriods).
 */

export type PowerUnit = "W" | "W/kg";
/** 요약 표에 두는 지속시간(초) — 5초·5분·20분·60분. */
export const ANALYSIS_TABLE_DURATIONS = [5, 300, 1200, 3600] as const;

export interface ZoneShare { low: number; mid: number; high: number }
export interface CurveRow { durationSeconds: number; recent: number | null; previous: number | null; changePct: number | null }
export interface CoachAnalysisSummary {
  /** 파워 기간 비교를 받았지만 두 기간을 견줄 수 없을 때만 값이 있다. */
  insufficient: { powerActivityCount: number } | null;
  fiveMinPct: number | null;
  sixtyMinPct: number | null;
  /** Z4+ 비중 변화(%p). */
  highSharePp: number | null;
  rows: CurveRow[];
  recentZones: ZoneShare | null;
  previousZones: ZoneShare | null;
  recentWeeklyHours: number | null;
  previousWeeklyHours: number | null;
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
 * 존 시간을 Z1–2 / Z3 / Z4+ 비중으로 묶는다. 같은 채널의 여러 기준(FTP·LTHR) 묶음은 존 번호끼리 더한다.
 * 파워 존이 있으면 파워, 없으면 심박을 쓴다 — 두 기간이 같은 채널이어야 하므로 채널은 호출자가 고른다.
 */
export function zoneShare(period: TrainingAnalysisPeriodResult | undefined, channel: "power" | "heartRate"): ZoneShare | null {
  if (!period) return null;
  const groups = channel === "power" ? period.zones.power.groups : period.zones.heartRate.groups;
  const totals: number[] = [];
  for (const group of groups) group.seconds.forEach((seconds, index) => { totals[index] = (totals[index] ?? 0) + (Number.isFinite(seconds) && seconds > 0 ? seconds : 0); });
  const sum = totals.reduce((acc, value) => acc + (value ?? 0), 0);
  if (sum <= 0) return null;
  const part = (from: number, to: number) => totals.slice(from, to).reduce((acc, value) => acc + (value ?? 0), 0) / sum;
  return { low: part(0, 2), mid: part(2, 3), high: part(3, totals.length) };
}

function observedZoneSeconds(period: TrainingAnalysisPeriodResult | undefined, channel: "power" | "heartRate"): number {
  if (!period) return 0;
  const groups = channel === "power" ? period.zones.power.groups : period.zones.heartRate.groups;
  return groups.reduce((acc, group) => acc + group.seconds.reduce((sum, value) => sum + (value > 0 ? value : 0), 0), 0);
}

/** 두 기간 모두 파워 존이 있으면 파워, 아니면 심박(둘 다 없으면 null). */
export function zoneChannel(recent: TrainingAnalysisPeriodResult | undefined, previous: TrainingAnalysisPeriodResult | undefined): "power" | "heartRate" | null {
  if (observedZoneSeconds(recent, "power") > 0 && observedZoneSeconds(previous, "power") > 0) return "power";
  if (observedZoneSeconds(recent, "heartRate") > 0 || observedZoneSeconds(previous, "heartRate") > 0) return "heartRate";
  if (observedZoneSeconds(recent, "power") > 0 || observedZoneSeconds(previous, "power") > 0) return "power";
  return null;
}

/** 주당 이동 시간(시간). 관측 값이 없으면 null. */
export function weeklyHours(period: TrainingAnalysisPeriodResult | undefined): number | null {
  if (!period) return null;
  const seconds = period.totals.movingTimeSec.observedValue;
  const days = (period.toExclusive - period.fromInclusive) / 86_400_000;
  if (seconds == null || !Number.isFinite(seconds) || days <= 0) return null;
  return round1(seconds / 3600 / (days / 7));
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
  const channel = zoneChannel(recentTraining, previousTraining);
  const recentZones = channel ? zoneShare(recentTraining, channel) : null;
  const previousZones = channel ? zoneShare(previousTraining, channel) : null;
  return {
    insufficient,
    fiveMinPct: pct(300),
    sixtyMinPct: pct(3600),
    highSharePp: recentZones && previousZones ? round1((recentZones.high - previousZones.high) * 100) : null,
    rows,
    recentZones,
    previousZones,
    recentWeeklyHours: weeklyHours(recentTraining),
    previousWeeklyHours: weeklyHours(previousTraining),
  };
}

/** 부호를 붙인 변화 표기(+4.2 / −1.0). 0 은 부호 없이. */
export function signedChange(value: number): string {
  const text = Math.abs(value).toFixed(1);
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}
