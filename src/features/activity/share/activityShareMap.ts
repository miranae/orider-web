import { getMapboxToken } from "../../../utils/mapbox";
import { decodeTrack, encodePolyline } from "../../../utils/polyline";

const MAX_STATIC_PATH_POINTS = 512;
const KOREAN_MAP_STYLE = "orider/cmp9okm6p006c01snfd3dexqb";
const ENGLISH_MAP_STYLE = "mapbox/outdoors-v12";

function sampleEvenly(points: [number, number][], maxPoints: number): [number, number][] {
  if (points.length <= maxPoints) return points;
  const last = points.length - 1;
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * last / (maxPoints - 1))]!);
}

/** 공유 카드 전용 2x 정적 지도. 피드 썸네일을 확대하지 않고 원본 경로로 다시 렌더한다. */
export function buildActivityShareMapUrl(track: string | null | undefined, language = "ko"): string | null {
  const token = getMapboxToken();
  if (!token || !track) return null;

  const points = sampleEvenly(decodeTrack(track), MAX_STATIC_PATH_POINTS);
  if (points.length < 2) return null;
  const polyline = encodeURIComponent(encodePolyline(points));
  const style = language.toLowerCase().startsWith("ko") ? KOREAN_MAP_STYLE : ENGLISH_MAP_STYLE;

  return (
    `https://api.mapbox.com/styles/v1/${style}/static/` +
    `path-6+FC5200-0.95(${polyline})/auto/1080x600@2x` +
    `?access_token=${encodeURIComponent(token)}&padding=64`
  );
}
