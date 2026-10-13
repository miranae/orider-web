import type { Activity } from "@shared/types";
import { decodeTrack } from "../../../utils/polyline";
import { isIndoorActivity } from "../../../utils/indoorActivity";
import { sameActivitySport } from "./activityGrowth";

type Point = [number, number];
export const ROUTE_CANDIDATE_LIMIT = 50;

/** 썸네일만 검사한다. 잘린/잘못된 인코딩을 기존 관대한 디코더에 넘기지 않는다. */
export function validatedThumbnail(track: unknown): Point[] | null {
  if (typeof track !== "string" || !track || track.length > 30000) return null;
  if (track.includes(",")) {
    const pairs = track.split(";");
    if (pairs.length > 4096 || pairs.some((pair) => !/^[-+]?\d+(?:\.\d+)?,[-+]?\d+(?:\.\d+)?$/.test(pair))) return null;
  } else {
    let values = 0;
    let digits = 0;
    for (const character of track) {
      const byte = character.charCodeAt(0) - 63;
      if (byte < 0 || byte > 63 || ++digits > 6 || (digits === 6 && byte > 3)) return null;
      if (byte < 32) { values += 1; digits = 0; }
      if (values > 8192) return null;
    }
    if (digits !== 0 || values % 2 !== 0) return null;
  }
  const points = decodeTrack(track, 4097);
  return points.length >= 4 && points.length <= 4096 && points.every(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
    ? points : null;
}
function distance(a: Point, b: Point): number {
  const radians = Math.PI / 180;
  const lat = (b[0] - a[0]) * radians;
  const lng = (b[1] - a[1]) * radians;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
function sampledRoute(activity: Activity): { points: Point[]; length: number } | null {
  if (isIndoorActivity(activity) || activity.deletedAt != null) return null;
  const route = validatedThumbnail(activity.thumbnailTrack);
  const recorded = activity.summary?.distance;
  if (!route || !Number.isFinite(recorded) || recorded <= 0) return null;
  const cumulative = [0];
  for (let index = 1; index < route.length; index += 1) {
    // 경도 경계를 가로지르는 보간은 지원하지 않는다.
    if (Math.abs(route[index]![1] - route[index - 1]![1]) > 180) return null;
    cumulative.push(cumulative[index - 1]! + distance(route[index - 1]!, route[index]!));
  }
  const length = cumulative[cumulative.length - 1]!;
  // 전체 기록 거리의 대부분을 설명하지 못하는 경로는 추천하지 않는다.
  if (length < 300 || length / recorded < 0.75 || length / recorded > 1.25) return null;
  let segment = 1;
  const points = Array.from({ length: 64 }, (_, index): Point => {
    const target = length * index / 63;
    while (segment < route.length - 1 && cumulative[segment]! < target) segment += 1;
    const span = cumulative[segment]! - cumulative[segment - 1]!;
    const fraction = span > 0 ? (target - cumulative[segment - 1]!) / span : 0;
    return [route[segment - 1]![0] + (route[segment]![0] - route[segment - 1]![0]) * fraction,
      route[segment - 1]![1] + (route[segment]![1] - route[segment - 1]![1]) * fraction];
  });
  return { points, length };
}
/** 원본 GPS 동일 경로 판정이 아닌, 소유자 과거 활동의 보수적인 추천 목록이다. 추가 읽기 없음. */
export function similarRouteCandidates(current: Activity, activities: Activity[]) {
  const route = sampledRoute(current);
  if (!route) return { available: false, checked: 0, candidates: [] as Activity[] };
  const eligible = activities.filter((candidate) => candidate.userId === current.userId && candidate.id !== current.id
    && candidate.deletedAt == null && Number.isFinite(candidate.startTime) && candidate.startTime < current.startTime && sameActivitySport(current, candidate)).slice(0, ROUTE_CANDIDATE_LIMIT);
  const ranked = eligible.flatMap((activity) => {
    const previous = sampledRoute(activity);
    if (!previous || Math.min(route.length, previous.length) / Math.max(route.length, previous.length) < 0.9) return [];
    const gaps = route.points.map((point, index) => distance(point, previous.points[index]!));
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    // 같은 진행 순서/출발/도착과 전체 구간을 검사해 역방향 루프·일부 겹침을 제외한다.
    return gaps[0]! <= 150 && gaps[63]! <= 150 && gaps.filter((gap) => gap <= 150).length >= 61 && mean <= 80
      ? [{ activity, mean }] : [];
  });
  return { available: true, checked: eligible.length, candidates: ranked.sort((a, b) => a.mean - b.mean || b.activity.startTime - a.activity.startTime).map(({ activity }) => activity) };
}
