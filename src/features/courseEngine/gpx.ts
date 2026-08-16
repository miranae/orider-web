/**
 * 코스엔진 — GPX 파싱.
 *
 * 이벤트 상세의 `parseGpxFull` 을 여기로 옮겨 코스 생성 화면과 공유한다. 코스 생성 화면은
 * 같은 일을 자체 구현하면서 고도 배열을 버리고 `<wpt>` 를 무시했는데, 이제 양쪽이 같은
 * 파서를 쓴다.
 *
 * 원본 대비 두 가지가 추가됐다.
 * - `hasElevation` — `<ele>` 가 실제로 있었는지. 없으면 고도를 0 으로 채우므로, 이 플래그가
 *   없으면 고도 없는 GPX 가 "완벽한 평지" 프로필로 그려져 사용자가 오독한다.
 * - `routePoints` — `<rtept>`(라우팅 제어점)를 `<wpt>`(관심 지점)와 분리해 읽는다. 둘을 한
 *   목록에 섞으면 턴바이턴 내비게이션이 뱉은 수백 개의 제어점이 경유지 목록을 뒤덮는다.
 */

import { computeTrackStats, type TrackPoint, type TrackStats } from "./stats";

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

  const points: TrackPoint[] = [];
  let elevationSamples = 0;
  const trackPoints = document.getElementsByTagName("trkpt");
  for (let index = 0; index < trackPoints.length; index += 1) {
    const element = trackPoints[index]!;
    const lat = parseFloat(element.getAttribute("lat") || "");
    const lon = parseFloat(element.getAttribute("lon") || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleText = childText(element, "ele");
    const ele = eleText != null ? parseFloat(eleText) : NaN;
    if (Number.isFinite(ele)) elevationSamples += 1;
    points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : 0 });
  }

  // 일부 포인트만 <ele> 를 가진 파일은 고도 곡선이 0 으로 튀어 오히려 왜곡이 크다.
  // 대다수가 값을 가질 때만 고도가 있는 것으로 본다.
  const hasElevation = points.length > 1 && elevationSamples >= points.length * 0.9;

  return {
    points,
    latlng: points.map((point) => [point.lat, point.lon] as [number, number]),
    waypoints: parseWaypointElements(document.getElementsByTagName("wpt")),
    routePoints: parseWaypointElements(document.getElementsByTagName("rtept")),
    hasElevation,
    stats: computeTrackStats(points),
  };
}
