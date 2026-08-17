/**
 * 코스엔진 — GPX 파싱.
 *
 * 이벤트 상세의 `parseGpxFull` 을 여기로 옮겨 코스 생성 화면과 공유한다. 코스 생성 화면은
 * 같은 일을 자체 구현하면서 고도 배열을 버리고 `<wpt>` 를 무시했는데, 이제 양쪽이 같은
 * 파서를 쓴다.
 *
 * 원본 대비 두 가지가 추가됐다.
 * - `hasElevation` — 고도 표본이 실제로 있었는지. 없으면 고도가 전부 0 이 되는데, 이 플래그가
 *   없으면 고도 없는 GPX 가 "완벽한 평지" 프로필로 그려져 사용자가 오독한다. 일부만 빠진
 *   경우는 버리지 않고 보간한다(`fillMissingElevations`).
 * - `routePoints` — `<rtept>`(라우팅 제어점)를 `<wpt>`(관심 지점)와 분리해 읽는다. 둘을 한
 *   목록에 섞으면 턴바이턴 내비게이션이 뱉은 수백 개의 제어점이 경유지 목록을 뒤덮는다.
 */

import { computeTrackStats, type TrackPoint, type TrackStats } from "./stats";

/**
 * 빠진 고도를 이웃 값으로 메운다.
 *
 * 0 으로 채우면 그 지점만 해수면까지 급락했다 복귀하는 절벽이 생겨 획득·손실고도가 크게
 * 부풀고 프로필이 망가진다. 실제 GPX 는 점 하나둘이 `<ele>` 를 빠뜨리는 경우가 흔하므로,
 * 파일 전체를 고도 없음으로 버리지 않고 사이를 선형 보간한다. 앞뒤 끝이 비면 가장 가까운
 * 유효 값으로 잇는다.
 *
 * 다만 보간에는 한계가 있다. 수천 점짜리 트랙에 시작·끝 두 점만 고도가 있으면, 그 사이를
 * 직선으로 이어 "실측 고도"로 내놓게 된다 — 언덕이 통째로 사라진 가짜 프로필이다. 그래서
 * 빠진 구간이 연속으로 길면(`MAX_INTERPOLATION_RUN`) 메울 근거가 없다고 보고 고도 없음으로
 * 판정한다. 표본이 2개 미만일 때도 마찬가지다.
 */
/**
 * 연속으로 이만큼 넘게 비어 있으면 보간하지 않는다(점 개수).
 * 실제 GPX 는 한두 점이 빠지는 정도가 흔하고, 그 이상 길게 비면 원래 없는 파일로 본다.
 */
export const MAX_INTERPOLATION_RUN = 10;

export function fillMissingElevations(values: readonly (number | null)[]): {
  elevations: number[];
  hasElevation: boolean;
} {
  const validIndices = values.reduce<number[]>((acc, value, index) => {
    if (value !== null) acc.push(index);
    return acc;
  }, []);
  if (validIndices.length < 2) {
    return { elevations: values.map(() => 0), hasElevation: false };
  }

  // 앞뒤 끝의 빈 구간도 보간 대상이므로 함께 센다.
  const first = validIndices[0]!;
  const last = validIndices[validIndices.length - 1]!;
  let longestRun = Math.max(first, values.length - 1 - last);
  for (let step = 1; step < validIndices.length; step += 1) {
    longestRun = Math.max(longestRun, validIndices[step]! - validIndices[step - 1]! - 1);
  }
  if (longestRun > MAX_INTERPOLATION_RUN) {
    return { elevations: values.map(() => 0), hasElevation: false };
  }

  const filled = values.slice() as (number | null)[];
  for (let index = 0; index < first; index += 1) filled[index] = values[first]!;
  for (let index = last + 1; index < filled.length; index += 1) filled[index] = values[last]!;

  for (let step = 1; step < validIndices.length; step += 1) {
    const from = validIndices[step - 1]!;
    const to = validIndices[step]!;
    const gap = to - from;
    if (gap <= 1) continue;
    const start = values[from]!;
    const end = values[to]!;
    for (let index = from + 1; index < to; index += 1) {
      filled[index] = start + ((end - start) * (index - from)) / gap;
    }
  }

  return { elevations: filled.map((value) => value ?? 0), hasElevation: true };
}

export interface GpxWaypoint {
  lat: number;
  lon: number;
  ele: number;
  name: string;
  type: string;
}

export interface ParsedGpx {
  /** 트랙 포인트(`<trkpt>`). */
  points: TrackPoint[];
  /** 지도 컴포넌트가 받는 `[lat, lng]` 형식. */
  latlng: [number, number][];
  /** 관심 지점(`<wpt>`) — 이름을 가진 보급소·정상·컷오프 등. 목록에 표시한다. */
  waypoints: GpxWaypoint[];
  /** 라우팅 제어점(`<rtept>`) — 수가 많을 수 있어 목록에는 넣지 않는다. */
  routePoints: GpxWaypoint[];
  /** 트랙에 `<ele>` 가 실제로 있었는가. false 면 고도 관련 표시를 전부 감춰야 한다. */
  hasElevation: boolean;
  stats: TrackStats;
}

function childText(parent: Element, tag: string): string | null {
  const elements = parent.getElementsByTagName(tag);
  if (!elements.length) return null;
  return elements[0]?.textContent?.trim() ?? null;
}

function parseWaypointElements(elements: HTMLCollectionOf<Element>): GpxWaypoint[] {
  const parsed: GpxWaypoint[] = [];
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index]!;
    const lat = parseFloat(element.getAttribute("lat") || "");
    const lon = parseFloat(element.getAttribute("lon") || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleText = childText(element, "ele");
    const ele = eleText != null ? parseFloat(eleText) : 0;
    parsed.push({
      lat,
      lon,
      ele: Number.isFinite(ele) ? ele : 0,
      name: childText(element, "name") || "",
      type: childText(element, "type") || "GENERIC",
    });
  }
  return parsed;
}

/** GPX 문서의 트랙명(`<trk><name>` 우선, 없으면 `<metadata><name>`). 없으면 null. */
export function parseGpxName(gpxXml: string): string | null {
  const document = new DOMParser().parseFromString(gpxXml, "text/xml");
  const name = document.querySelector("trk > name") ?? document.querySelector("metadata > name");
  const text = name?.textContent?.trim();
  return text ? text : null;
}

export function parseGpx(gpxXml: string): ParsedGpx {
  const document = new DOMParser().parseFromString(gpxXml, "text/xml");

  const coordinates: Array<{ lat: number; lon: number }> = [];
  const rawElevations: (number | null)[] = [];
  const trackPoints = document.getElementsByTagName("trkpt");
  for (let index = 0; index < trackPoints.length; index += 1) {
    const element = trackPoints[index]!;
    const lat = parseFloat(element.getAttribute("lat") || "");
    const lon = parseFloat(element.getAttribute("lon") || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleText = childText(element, "ele");
    const ele = eleText != null ? parseFloat(eleText) : Number.NaN;
    coordinates.push({ lat, lon });
    rawElevations.push(Number.isFinite(ele) ? ele : null);
  }

  const { elevations, hasElevation } = fillMissingElevations(rawElevations);
  const points: TrackPoint[] = coordinates.map((coordinate, index) => ({
    ...coordinate,
    ele: elevations[index] ?? 0,
  }));

  return {
    points,
    latlng: points.map((point) => [point.lat, point.lon] as [number, number]),
    waypoints: parseWaypointElements(document.getElementsByTagName("wpt")),
    routePoints: parseWaypointElements(document.getElementsByTagName("rtept")),
    hasElevation,
    stats: computeTrackStats(points),
  };
}
