import { formatPace, formatSpeed, type Units } from "../../../utils/units";
import { similarRouteMetricValue } from "./similarRouteHistory";
import type { Activity } from "@shared/types";
import type { ActivityCanonicalAverage, ObservedRouteComparison } from "@shared/activity-route-comparison";
import { getDiscipline } from "../../../utils/disciplineFilter";
import { dedupeSamePhysicalRides, isSamePhysicalRide } from "../../../utils/samePhysicalRide";
export const OBSERVED_ROUTE_HISTORY_MAX_SELECTED = 3;
const known = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const validDate = (a: Activity) => Number.isSafeInteger(a.startTime) && a.startTime >= 0 && Number.isFinite(new Date(a.startTime).getTime());
const validId = (a: Activity) => typeof a.id === "string" && !!a.id.trim() && a.id.length <= 256 && !a.id.includes("/");
function identity(activity: Activity) {
  return { id: activity.id, source: activity.source, localSessionId: activity.localSessionId, stravaActivityId: activity.stravaActivityId,
    stravaTwinActivityId: activity.stravaTwinActivityId, startTime: activity.startTime, endTime: activity.endTime,
    sportFamily: getDiscipline(activity.type), movingSec: known(activity.summary?.movingTimeSec) ? activity.summary.movingTimeSec : null, activity };
}
/** 이미 불러온 소유자 활동만 사용한다. GPS 형태 안내로 같은 실주행을 합치지 않는다. */
export function observedRouteHistoryChoices(anchor: Activity, activities: readonly Activity[]) {
  if (!validDate(anchor) || !validId(anchor)) return [];
  const duplicateIds = new Set(activities.filter((a, index) => activities.findIndex(other => other.id === a.id) !== index).map(a => a.id));
  return dedupeSamePhysicalRides(activities.filter(a => validDate(a) && validId(a) && !duplicateIds.has(a.id) && a.userId === anchor.userId && a.deletedAt == null
    && getDiscipline(a.type) != null && getDiscipline(a.type) === getDiscipline(anchor.type) && !isSamePhysicalRide(identity(anchor), identity(a))).map(identity))
    .map(a => a.activity).sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
}
export function validObservedRouteHistorySelection(anchor: Activity, selected: readonly Activity[]) {
  return selected.length > 0 && selected.length <= OBSERVED_ROUTE_HISTORY_MAX_SELECTED
    && observedRouteHistoryChoices(anchor, selected).length === selected.length;
}
export function observedRouteHistoryPartial(result: ObservedRouteComparison | null) {
  return !!result && result.state !== "unavailable" && (result.limitations.includes("gaps") || result.limitations.includes("coverage_not_complete"));
}
/** 요약 경과/이동 시간이 둘 다 알려졌을 때만 요약 정지 시간을 표시한다. GPS 시간 축을 사용하지 않는다. */
export function observedRouteHistorySummary(activity: Activity) {
  const summary = activity.summary;
  const moving = known(summary?.movingTimeSec) ? summary.movingTimeSec : null;
  const elapsed = known(summary?.elapsedTimeMillis) ? summary.elapsedTimeMillis / 1000 : null;
  return { distanceM: known(summary?.distance) ? summary.distance : null, movingSec: moving,
    pauseSec: elapsed !== null && moving !== null && elapsed >= moving ? elapsed - moving : null };
}

const seoulYear = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric", calendar: "gregory" });
/** 표시 날짜와 같은 시간대에서 연도를 읽는다. 날짜 상한에 오프셋을 더하지 않는다. */
export function observedRouteHistoryYear(time: number): string | null {
  if (!Number.isSafeInteger(time) || time < 0 || !Number.isFinite(new Date(time).getTime())) return null;
  return seoulYear.formatToParts(time).find(part => part.type === "year")?.value ?? null;
}
export function observedRouteHistoryTrend(activities: readonly Activity[], metric: import("./similarRouteHistory").SimilarRouteMetric, units: import("../../../utils/units").Units) {
  const ordered = [...activities].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
  const first = ordered[0]?.startTime ?? 0, last = ordered[ordered.length - 1]?.startTime ?? first;
  return ordered.map(activity => {
    const summary = observedRouteHistorySummary(activity);
    const value = similarRouteMetricValue({ activity, distance: summary.distanceM, movingTime: summary.movingSec, pauseTime: summary.pauseSec }, metric, units);
    return { activity, value, x: last > first ? 65 + (activity.startTime - first) / (last - first) * 320 : 225 };
  });
}

/** 확정 평균 속도만 단위를 변환한다. 거리/시간 요약이나 GPS 시간축으로 대체하지 않는다. */
export function observedRouteAverage(average: ActivityCanonicalAverage | null | undefined, activity: Activity, units: Units) {
  const discipline = getDiscipline(activity.type);
  if (average?.state !== "available" || average.discipline !== discipline || average.startTime !== activity.startTime
    || average.avgSpeedKph === null || !known(average.avgSpeedKph)) return { value: null, formatted: "—" };
  const speed = average.avgSpeedKph;
  if (discipline === "run") {
    const pace = speed > 0 ? 3600 / speed : null;
    if (pace === null || !Number.isFinite(pace)) return { value: null, formatted: "—" };
    const value = pace * (units === "imperial" ? 1.609344 : 1);
    // 공용 formatter의 단위 변환·분/초 분해도 유한한 값일 때만 호출한다.
    if (!Number.isFinite(value) || !Number.isFinite(Math.floor(value / 60) * 60)) return { value: null, formatted: "—" };
    return { value, formatted: formatPace(pace, units) };
  }
  const value = speed / (units === "imperial" ? 1.609344 : 1), metersPerSecond = speed / 3.6;
  // formatSpeed는 imperial에서 m/s×3600을 먼저 계산하므로 중간 곱도 검사한다.
  if (!Number.isFinite(value) || !Number.isFinite(metersPerSecond * (units === "imperial" ? 3600 : 3.6))) return { value: null, formatted: "—" };
  return { value, formatted: formatSpeed(metersPerSecond, units, "bike") };
}
export function observedRouteAverageTrend(rows: readonly { activity: Activity; canonicalAverage?: ActivityCanonicalAverage | null }[], units: Units) {
  const byId = new Map(rows.map(row => [row.activity.id, row.canonicalAverage]));
  // 기존 함수의 날짜 배치만 재사용한다. 요약 값은 반환하거나 대체 수치로 쓰지 않는다.
  return observedRouteHistoryTrend(rows.map(row => row.activity), "distance", units).map(point => ({ activity: point.activity, x: point.x, ...observedRouteAverage(byId.get(point.activity.id), point.activity, units) }));
}
