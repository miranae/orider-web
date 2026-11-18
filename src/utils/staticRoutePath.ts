import { isRoutePosition, routeSlots, drawableRouteSlots, type RouteSlot } from "./routeGeometry";

type Pixel = [number, number];
type Range = { startIndex: number; endIndex: number };
type StaticGeometry = { path: string | null; points: Pixel[]; selectionPath?: string | null; selectionPoints?: Pixel[] };

function trace(pixels: (Pixel | null)[], starts: Set<number>): string | null {
  let move = true;
  const path = pixels.map((point, index) => {
    if (!point) { move = true; return ""; }
    const command = move || starts.has(index) ? "M" : "L";
    move = false;
    return `${command} ${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
  }).filter(Boolean).join(" ");
  return path || null;
}

/** 지도와 같은 투영 및 단일 배율로 대체 경로와 선택 구간의 실제 비율을 유지한다. */
export function buildStaticRouteGeometry(positions: readonly RouteSlot[], segmentStarts: readonly number[] = [],
  { pointsOnly = false, range }: { pointsOnly?: boolean; range?: Range } = {}): StaticGeometry {
  const normalized = routeSlots(positions);
  const lines = pointsOnly ? [] : drawableRouteSlots(normalized, segmentStarts);
  const hasLine = lines.some(isRoutePosition);
  const starts = new Set(segmentStarts);
  let previousLongitude: number | null = null;
  const projected = Array.from(hasLine ? lines : normalized, point => {
    if (!isRoutePosition(point)) return null;
    const [lat, lng] = point;
    if (Math.abs(lat) > 85.0511) return null;
    let longitude = lng;
    if (previousLongitude !== null) {
      while (longitude - previousLongitude > 180) longitude -= 360;
      while (longitude - previousLongitude < -180) longitude += 360;
    }
    previousLongitude = longitude;
    return [longitude * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))] as const;
  });
  let count = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of projected) {
    if (!point) continue;
    count++;
    minX = Math.min(minX, point[0]); maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]);
  }
  if (count === 0) return { path: null, points: [] };
  const pad = 16, width = 320, height = 160;
  const scale = Math.min(maxX > minX ? (width - pad * 2) / (maxX - minX) : Infinity,
    maxY > minY ? (height - pad * 2) / (maxY - minY) : Infinity);
  const pixels: (Pixel | null)[] = projected.map(point => {
    if (!point) return null;
    const x = Number.isFinite(scale) ? width / 2 + (point[0] - (minX + maxX) / 2) * scale : width / 2;
    const y = Number.isFinite(scale) ? height / 2 + (point[1] - (minY + maxY) / 2) * scale : height / 2;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
  const geometry: StaticGeometry = hasLine ? { path: trace(pixels, starts), points: [] }
    : { path: null, points: pixels.filter((point): point is Pixel => point !== null) };
  if (range && Number.isInteger(range.startIndex) && Number.isInteger(range.endIndex)) {
    const lo = Math.max(0, Math.min(range.startIndex, range.endIndex));
    const hi = Math.min(pixels.length - 1, Math.max(range.startIndex, range.endIndex));
    const selected = hasLine ? drawableRouteSlots(normalized.slice(lo, hi + 1), segmentStarts.map(index => index - lo)) : null;
    const selection = pixels.map((point, index) => index >= lo && index <= hi && (!selected || selected[index - lo]) ? point : null);
    geometry.selectionPath = hasLine ? trace(selection, starts) : null;
    geometry.selectionPoints = hasLine ? [] : selection.filter((point): point is Pixel => point !== null);
  }
  return geometry;
}

export function buildStaticRoutePath(positions: readonly RouteSlot[], segmentStarts: readonly number[] = []): string | null {
  return buildStaticRouteGeometry(positions, segmentStarts).path;
}
