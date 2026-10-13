import type { ActivityMatchedRouteGroupMember, ActivityMatchedRouteGroupResponse } from "@shared/activity-matched-route-groups";
import { formatPace, formatSpeed, type Units } from "../../../utils/units";
/** 그룹의 확정 평균만 단위 변환한다. 저장 요약이나 거리/시간으로 보충하지 않는다. */
export function matchedRouteAverage(row: ActivityMatchedRouteGroupMember, discipline: "run" | "bike", units: Units, locale = "en") {
  const average = row.canonicalAverage;
  if (average.state !== "available" || average.discipline !== discipline || average.startTime !== row.startTime || average.avgSpeedKph === null) return { value: null, formatted: "—" };
  const speed = average.avgSpeedKph;
  if (!Number.isFinite(speed) || speed < 0) return { value: null, formatted: "—" };
  const scientific = (value: number) => new Intl.NumberFormat(locale, { notation: "scientific", maximumSignificantDigits: 3 }).format(value);
  if (discipline === "run") {
    const pace = speed > 0 ? 3600 / speed : null, value = pace === null ? null : pace * (units === "imperial" ? 1.609344 : 1);
    if (value === null || pace === null || !Number.isFinite(value) || value <= 0 || !Number.isFinite(Math.floor(value / 60) * 60)) return { value: null, formatted: "—" };
    const label = value < 0.5 || value > 360000 ? `${scientific(value)}s/${units === "imperial" ? "mi" : "km"}` : formatPace(pace, units);
    return { value, formatted: label };
  }
  const value = speed / (units === "imperial" ? 1.609344 : 1), mps = speed / 3.6;
  if (!Number.isFinite(value) || !Number.isFinite(mps * (units === "imperial" ? 3600 : 3.6)) || speed > 0 && (value === 0 || mps === 0)) return { value: null, formatted: "—" };
  return { value, formatted: value > 0 && (value < 0.05 || value > 100000) ? `${scientific(value)}${units === "imperial" ? "mph" : "km/h"}` : formatSpeed(mps, units, "bike") };
}
export function matchedRoutePresentation(pages: readonly ActivityMatchedRouteGroupResponse[], discipline: "run" | "bike", units: Units, year: number | null, locale = "en") {
  const all = pages.flatMap(page => page.members), rows = all.filter(row => year === null || row.year === year);
  const points = rows.map(row => ({ row, ...matchedRouteAverage(row, discipline, units, locale) }));
  const known = points.filter(point => point.value !== null), minimum = known.length ? Math.min(...known.map(point => point.value!)) : null, maximum = known.length ? Math.max(...known.map(point => point.value!)) : null;
  const start = rows[0]?.startTime, end = rows[rows.length - 1]?.startTime;
  return { rows, allCount: all.length, known: known.length, points: points.map(point => ({ ...point,
    x: start !== undefined && end !== undefined && end > start ? 20 + (point.row.startTime - start) / (end - start) * 320 : 180,
    y: point.value === null || minimum === null || maximum === null ? null : maximum > minimum ? discipline === "run" ? 25 + (point.value - minimum) / (maximum - minimum) * 100 : 125 - (point.value - minimum) / (maximum - minimum) * 100 : 75 })) };
}
