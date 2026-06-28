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
