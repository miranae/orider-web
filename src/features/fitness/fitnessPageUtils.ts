import type { PowerDurationKey } from "@shared/types/personal-records";

export type RangeOption = 30 | 90 | 180 | 365;
export type TFn = (key: string, options?: Record<string, unknown>) => string;

export interface PowerCurvePoint {
  durationSeconds: number;
  maxPower: number;
}

export function getRangeOptions(t: TFn): { value: RangeOption; label: string }[] {
  return [
    { value: 30, label: t("range.30") },
    { value: 90, label: t("range.90") },
    { value: 180, label: t("range.180") },
    { value: 365, label: t("range.365") },
  ];
}

export function tsbStatusLabel(tsb: number, t: TFn): string {
  if (tsb > 25) return t("status.overRecovery");
  if (tsb > 5) return t("status.racingPeak");
  if (tsb > -10) return t("status.optimalForm");
  if (tsb > -30) return t("status.fatigueBuild");
  return t("status.overtraining");
}

export function tsbStatusDesc(tsb: number, t: TFn): string {
  if (tsb > 5) return t("desc.recovery");
  if (tsb > -10) return t("desc.productive");
  return t("desc.rest");
}

export function formatKoreanDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatMonthDay(locale: string): string {
  const now = new Date();
  return now.toLocaleDateString(locale, { month: "long", day: "numeric" });
}

export function secToMmss(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export const POWER_DURATION_KEY_SEC: Record<PowerDurationKey, number> = {
  "1s": 1,
  "5s": 5,
  "10s": 10,
  "30s": 30,
  "1m": 60,
  "2m": 120,
  "5m": 300,
  "10m": 600,
  "20m": 1200,
  "30m": 1800,
  "1h": 3600,
};

export function makeDurationLabel(t: TFn) {
  return (sec: number): string => {
    if (sec < 60) return t("duration.sec", { n: sec });
    if (sec < 3600) return t("duration.min", { n: sec / 60 });
    return t("duration.hour", { n: sec / 3600 });
  };
}

/* ---------- 오늘의 결론 (#400) ----------
 * 경고/회복/주간해석/워크아웃 추천이 개별 카드로 흩어져 서로 모순처럼 읽히는 문제(#400 §2)를
 * 해소하기 위해, 회복 상태(TSB)·연속 휴식일·최근 주 부하 비율을 하나의 신호로 합성해
 * 모순 없는 단일 결론 케이스를 판정하는 순수 함수. 텍스트는 호출부에서 i18n 키로 매핑한다.
 */
export type TodayConclusionCase =
  | "fatiguedRest"          // 회복 부족 → 오늘은 가볍게/휴식
  | "recoveredLongRest"     // 장기 무부하 + 회복 완료 → 수행 권장 (연속휴식일 강조)
  | "recoveredLowRecentLoad" // 최근 주 부하가 평소 대비 낮음 + 회복 완료 → 수행 권장 (부하비율 강조)
  | "balancedFollowPlan";   // 특별한 신호 없음 → 계획대로 진행

export interface TodayConclusionInput {
  /** Training Stress Balance — 양수일수록 회복됨 */
  tsb: number;
  /** 오늘까지 연속으로 부하가 0이었던 일수 */
  restDays: number;
  /** 이번 주(최근 7일) 누적 TSS */
  thisWeekTSS: number;
  /** 최근 42일 평균 주간 TSS (0이면 비교 불가) */
  avgWeekTSS: number;
}

export interface TodayConclusion {
  case: TodayConclusionCase;
  restDays: number;
  /** 이번 주 부하 / 평소 주간 평균 부하, % (avgWeekTSS<=0 이면 null) */
  loadPct: number | null;
}

const TSB_FATIGUED = -20;
const TSB_RECOVERED = 5;
const LONG_REST_DAYS = 7;
const LOW_LOAD_PCT = 50;

export function buildTodayConclusion({
  tsb,
  restDays,
  thisWeekTSS,
  avgWeekTSS,
}: TodayConclusionInput): TodayConclusion {
  const loadPct = avgWeekTSS > 0 ? Math.round((thisWeekTSS / avgWeekTSS) * 100) : null;

  if (tsb <= TSB_FATIGUED) {
    return { case: "fatiguedRest", restDays, loadPct };
  }
  if (tsb >= TSB_RECOVERED && restDays >= LONG_REST_DAYS) {
    return { case: "recoveredLongRest", restDays, loadPct };
  }
  if (tsb >= TSB_RECOVERED && loadPct != null && loadPct < LOW_LOAD_PCT) {
    return { case: "recoveredLowRecentLoad", restDays, loadPct };
  }
  return { case: "balancedFollowPlan", restDays, loadPct };
}
