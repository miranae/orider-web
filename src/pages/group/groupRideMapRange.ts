import type { ActivityStreams } from "@shared/types";
import { clockSampleTolerance } from "./groupRideClock";
import type { RideRange } from "./groupRideRangeMetrics";

/** 실제로 연속한 GPS 표본만 잇는다. 범위 경계는 인접한 표본 사이에서만 자른다. */
export function groupRideMapRange(stream: Pick<ActivityStreams, "latlng" | "distance"> | undefined, clock?: readonly number[] | null, range?: RideRange): GeoJSON.Feature<GeoJSON.MultiLineString> {
  const coordinates: number[][][] = [];
  const result: GeoJSON.Feature<GeoJSON.MultiLineString> = { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates } };
  const positions = stream?.latlng;
  const axis = range?.axis === "time" ? clock : stream?.distance;
  if (!positions || range && (!axis || axis.length !== positions.length || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start)) return result;
  const hasClock = clock?.length === positions.length;
  const tolerance = hasClock ? clockSampleTolerance(clock) : 0;
  const validPosition = (point: readonly number[] | undefined): point is readonly [number, number] => Boolean(point && Number.isFinite(point[0]) && Math.abs(point[0]!) <= 90 && Number.isFinite(point[1]) && Math.abs(point[1]!) <= 180 && (point[0] !== 0 || point[1] !== 0));
  let line: number[][] | null = null;
  for (let index = 1; index < positions.length; index++) {
    const previous = positions[index - 1], current = positions[index];
    const from = axis?.[index - 1], to = axis?.[index];
    const elapsed = hasClock ? clock![index]! - clock![index - 1]! : null;
    if (!validPosition(previous) || !validPosition(current)
      || hasClock && (!Number.isFinite(elapsed) || elapsed! <= 0 || elapsed! > tolerance)
      || range && (!Number.isFinite(from) || !Number.isFinite(to) || from! < 0 || to! < from!)) { line = null; continue; }
    // 기기 GPS가 순간적으로 먼 곳으로 튀어도 긴 직선을 만들지 않는다.
    const radians = Math.PI / 180;
    const a = Math.sin((current[0] - previous[0]) * radians / 2) ** 2 + Math.cos(previous[0] * radians) * Math.cos(current[0] * radians) * Math.sin((current[1] - previous[1]) * radians / 2) ** 2;
    const meters = 12_742_000 * Math.asin(Math.min(1, Math.sqrt(a)));
    if (meters > 5000 || elapsed !== null && meters > 100 && meters / (elapsed / 1000) > 100) { line = null; continue; }
    let start = 0, end = 1;
    if (range) {
      if (to! < range.start || from! > range.end) { line = null; continue; }
      if (to !== from) {
        start = Math.max(0, (range.start - from!) / (to! - from!));
        end = Math.min(1, (range.end - from!) / (to! - from!));
      }
      if (start >= end) { line = null; continue; }
    }
    const interpolate = (fraction: number) => [previous[1] + (current[1] - previous[1]) * fraction, previous[0] + (current[0] - previous[0]) * fraction];
    const first = interpolate(start), last = interpolate(end);
    if (line && line[line.length - 1]![0] === first[0] && line[line.length - 1]![1] === first[1]) line.push(last);
    else { line = [first, last]; coordinates.push(line); }
  }
  return result;
}
