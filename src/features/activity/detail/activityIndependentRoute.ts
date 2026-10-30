import type { ActivityStreams } from "@shared/types";
/** A separate verified route can be drawn, but its indices are not sensor indices. */
export function activityIndependentRoute(streams: ActivityStreams | null | undefined): [number, number][] | null {
  const geometry = streams?.activityRouteGeometryV1;
  if (!geometry || geometry.version !== 1 || geometry.timingBasis !== "elapsed" || !["activity_start", "relative_to_first_gps_observation"].includes(geometry.timeOrigin)
    || geometry.originEpochMs !== null && (!Number.isFinite(geometry.originEpochMs) || geometry.originEpochMs <= 0) || !/^[a-f0-9]{64}$/.test(geometry.routeInputRevision)
    || !Array.isArray(geometry.time) || !Array.isArray(geometry.latlng) || geometry.time.length !== geometry.latlng.length
    || geometry.time.length < 2 || geometry.time.length > 100000) return null;
  for (let i = 0; i < geometry.time.length; i++) {
    const time = geometry.time[i]!, point = geometry.latlng[i];
    if (!Number.isFinite(time) || time < 0 || i > 0 && time <= geometry.time[i - 1]!
      || !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)
      || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) return null;
  }
  return geometry.latlng;
}
