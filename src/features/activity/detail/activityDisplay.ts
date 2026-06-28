import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { Units } from "../../../utils/units";

const M_PER_MI = 1609.344;
const M_PER_FT = 0.3048;

export interface UploadedPhoto {
  id: string;
  url: string;
  storagePath: string;
  userId: string;
  createdAt: number;
  location?: [number, number] | null;
}

export function useTimeAgo() {
  const { t, i18n } = useTranslation("activity");
  return (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return t("card.timeAgo.justNow");
    if (hours < 24) return t("card.timeAgo.hoursAgo", { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t("card.timeAgo.daysAgo", { count: days });
    return new Date(timestamp).toLocaleDateString(i18n.language === "en" ? "en-US" : "ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };
}

export function useFormatFullDate() {
  const { i18n } = useTranslation();
  return (timestamp: number): string =>
    new Date(timestamp).toLocaleDateString(i18n.language === "en" ? "en-US" : "ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
}

export function useActivityUnitFormatters(units: Units) {
  return useMemo(() => ({
    distVal: (m: number) => units === "imperial" ? (m / M_PER_MI).toFixed(1) : (m / 1000).toFixed(1),
    distUnit: units === "imperial" ? "mi" : "km",
    speedVal: (kmh: number) => units === "imperial" ? (kmh * 1000 / M_PER_MI).toFixed(1) : kmh.toFixed(1),
    speedUnit: units === "imperial" ? "mph" : "km/h",
    elevVal: (m: number) => units === "imperial" ? Math.round(m / M_PER_FT) : Math.round(m),
    elevUnit: units === "imperial" ? "ft" : "m",
  }), [units]);
}
