import { getMapboxToken } from "../../../utils/mapbox";
import { decodeTrack, encodePolyline } from "../../../utils/polyline";

const MAX_STATIC_PATH_POINTS = 512;

function sampleEvenly(points: [number, number][], maxPoints: number): [number, number][] {
  if (points.length <= maxPoints) return points;
  const last = points.length - 1;
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * last / (maxPoints - 1))]!);
}

/** 공유 카드 전용 2x 정적 지도. 피드 썸네일을 확대하지 않고 원본 경로로 다시 렌더한다. */
export function buildActivityShareMapUrl(track: string | null | undefined): string | null {
  const token = getMapboxToken();
  if (!token || !track) return null;

  const points = sampleEvenly(decodeTrack(track), MAX_STATIC_PATH_POINTS);
  if (points.length < 2) return null;
  const polyline = encodeURIComponent(encodePolyline(points));

  return (
    "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/" +
    `path-6+FC5200-0.95(${polyline})/auto/1080x600@2x` +
    `?access_token=${encodeURIComponent(token)}&padding=64`
  );
}
