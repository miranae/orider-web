/**
 * 코스엔진 — 지오메트리 기본 연산.
 *
 * 하버사인 거리 계산이 이벤트 상세(`features/event/detail/courseGpx.ts`), 코스 상세
 * (`pages/CoursePage.tsx`), 코스 생성(`pages/CreateCoursePage.tsx`) 세 곳에 각각 복제되어
 * 있었다. 코스/이벤트 양쪽이 같은 값을 쓰도록 여기 한 곳으로 모은다.
 */

const EARTH_RADIUS_M = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** 두 좌표 사이의 대권 거리(m). */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface LatLonPoint {
  lat: number;
  lon: number;
}

/**
 * 트랙 각 점의 시작점 기준 누적 거리(m). 반환 길이는 입력과 동일하며 첫 원소는 항상 0.
 * 좌표가 비거나 1개면 각각 빈 배열/`[0]` 을 돌려준다.
 */
export function cumulativeDistances(points: readonly LatLonPoint[]): number[] {
  if (points.length === 0) return [];
  const cumulative: number[] = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    cumulative.push(cumulative[index - 1]! + haversineMeters(previous.lat, previous.lon, current.lat, current.lon));
  }
  return cumulative;
}

/** `[lat, lng]` 튜플 배열(지도 컴포넌트 형식)을 누적 거리로 변환한다. */
export function cumulativeDistancesFromLatLng(latlng: readonly [number, number][]): number[] {
  return cumulativeDistances(latlng.map(([lat, lon]) => ({ lat, lon })));
}

export interface NearestPointResult {
  /** 트랙 상 최근접 점의 인덱스. 트랙이 비면 -1. */
  index: number;
  /** 그 점까지의 거리(m). 트랙이 비면 Infinity. */
  distanceM: number;
}

/**
 * 트랙에서 대상 좌표에 가장 가까운 점을 찾는다.
 *
 * `fromIndex` 를 주면 그 인덱스부터만 탐색한다. 왕복(out-and-back)·순환 코스에서는 geometry 상
 * 멀리 떨어진 두 인덱스가 거의 같은 좌표를 갖기 때문에, 단순 전역 최근접 탐색은 경유지를 되돌아
 * 오는 쪽 인덱스에 붙여 구간 거리를 음수로 만든다. 경유지를 순서대로 훑으며 `fromIndex` 를
 * 전진시키면 이 역전이 생기지 않는다.
 */
export function nearestPointIndex(
  track: readonly LatLonPoint[],
  target: LatLonPoint,
  fromIndex = 0,
): NearestPointResult {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let index = Math.max(0, fromIndex); index < track.length; index += 1) {
    const point = track[index]!;
    const distance = haversineMeters(target.lat, target.lon, point.lat, point.lon);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return { index: bestIndex, distanceM: bestDistance };
}
