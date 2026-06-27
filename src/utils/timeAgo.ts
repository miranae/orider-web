import type { TFunction } from "i18next";

/** 타임스탬프를 "방금/N분 전/N시간 전/어제/N일 전" 형식으로 변환. t 는 어느 네임스페이스든 가능 (common: 프리픽스 사용). */
export function timeAgo(ts: number, t: TFunction): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("common:time.justNow");
  if (mins < 60) return t("common:time.minsAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("common:time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("common:time.yesterday");
  return t("common:time.daysAgo", { count: days });
}
