import type { TFunction } from "i18next";

export function toMillis(ts: unknown): number {
  if (ts == null) return NaN;
  if (typeof ts === "number") return ts < 1e12 ? ts * 1000 : ts;
  if (typeof ts === "string") return Date.parse(ts);
  if (typeof ts === "object") {
    const value = ts as { toMillis?: () => number; toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") {
      return value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000);
    }
  }
  return NaN;
}

/** 타임스탬프를 "방금/N분 전/N시간 전/어제/N일 전" 형식으로 변환. t 는 어느 네임스페이스든 가능 (common: 프리픽스 사용). */
export function timeAgo(ts: unknown, t: TFunction): string {
  const ms = toMillis(ts);
  if (!Number.isFinite(ms)) return "";
  const diff = Date.now() - ms;
  if (diff < 0) return t("common:time.justNow");
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("common:time.justNow");
  if (mins < 60) return t("common:time.minsAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("common:time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("common:time.yesterday");
  return t("common:time.daysAgo", { count: days });
}
