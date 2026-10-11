import type { ActivityRouteIndexPageResponse } from "@shared/activity-route-index-page";
import { formatPace, formatSpeed, type Units } from "../../../utils/units";
export type RouteIndexCandidate = ActivityRouteIndexPageResponse["candidates"][number];
/** 후보는 활동 DTO가 아니다. 확정 평균과 실제 활동 날짜만 표시한다. */
export function routeIndexAverage(row: RouteIndexCandidate, discipline: "bike" | "run", units: Units, locale = "en") {
  const average = row.canonicalAverage;
  if (average.state !== "available" || average.discipline !== discipline || average.startTime !== row.startTime || average.avgSpeedKph === null) return { value: null, formatted: "—" };
  const speed = average.avgSpeedKph;
  if (!Number.isFinite(speed) || speed < 0) return { value: null, formatted: "—" };
  const scientific = (value: number) => new Intl.NumberFormat(locale, { notation: "scientific", maximumSignificantDigits: 3 }).format(value);
  if (discipline === "run") {
    const pace = speed > 0 ? 3600 / speed : null, value = pace === null ? null : pace * (units === "imperial" ? 1.609344 : 1);
    if (pace === null || value === null || !Number.isFinite(value) || !Number.isFinite(Math.floor(value / 60) * 60) || value <= 0) return { value: null, formatted: "—" };
    return { value, formatted: value < 0.5 ? `${scientific(value)}s/${units === "imperial" ? "mi" : "km"}` : formatPace(pace, units) };
  }
  const value = speed / (units === "imperial" ? 1.609344 : 1), metersPerSecond = speed / 3.6;
  if (!Number.isFinite(value) || !Number.isFinite(metersPerSecond * (units === "imperial" ? 3600 : 3.6)) || speed > 0 && (value === 0 || metersPerSecond === 0)) return { value: null, formatted: "—" };
  return { value, formatted: value > 0 && value < 0.05 ? `${scientific(value)}${units === "imperial" ? "mph" : "km/h"}` : formatSpeed(metersPerSecond, units, "bike") };
}
export function routeIndexHistory(pages: readonly ActivityRouteIndexPageResponse[], discipline: "bike" | "run", units: Units, year: number | null, locale = "en") {
  const all = pages.flatMap(page => page.candidates);
  const rows = all.filter(row => year === null || new Date(row.startTime + 32400000).getUTCFullYear() === year)
    .sort((a, b) => a.startTime - b.startTime || (a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0));
  const points = rows.map(row => ({ row, ...routeIndexAverage(row, discipline, units, locale) }));
  const known = points.filter(point => point.value !== null), minimum = known.length ? Math.min(...known.map(point => point.value!)) : null, maximum = known.length ? Math.max(...known.map(point => point.value!)) : null;
  const start = rows[0]?.startTime, end = rows[rows.length - 1]?.startTime;
  return { rows, allCount: all.length, years: [...new Set(all.map(row => new Date(row.startTime + 32400000).getUTCFullYear()))].sort((a, b) => b - a),
    scanned: pages.reduce((sum, page) => sum + page.pageScannedCount, 0), prefiltered: pages.reduce((sum, page) => sum + page.geometryPrefilteredCount, 0), validated: pages.reduce((sum, page) => sum + page.sourceValidatedCount, 0),
    omitted: pages.reduce((sum, page) => sum + page.omitted.length, 0), known: known.length,
    points: points.map(point => ({ ...point, x: start !== undefined && end !== undefined && end > start ? 20 + (point.row.startTime - start) / (end - start) * 320 : 180,
      y: point.value === null || minimum === null || maximum === null ? null : maximum > minimum ? discipline === "run" ? 25 + (point.value - minimum) / (maximum - minimum) * 100 : 125 - (point.value - minimum) / (maximum - minimum) * 100 : 75 })) };
}
