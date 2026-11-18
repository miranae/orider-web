import { unwrapLongitudeNear, isRoutePosition, routeSlots, drawableRouteSlots, type RouteSlot } from "./routeGeometry";

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
  { pointsOnly = false, range, selectedPosition }: { pointsOnly?: boolean; range?: Range; selectedPosition?: [number,number] } = {}): StaticGeometry {
  const normalized = routeSlots(positions);
  const lines = pointsOnly ? [] : drawableRouteSlots(normalized, segmentStarts);
  const hasLine = lines.some(isRoutePosition);
  const selectedIndex = range && Number.isInteger(range.startIndex) && range.startIndex === range.endIndex ? range.startIndex : null;
  const starts = new Set(segmentStarts);
  let previousLongitude: number | null = null;
  const project = (coordinate: unknown, followsRoute: boolean) => {
    if (!isRoutePosition(coordinate)) return null;
    const latitude = Math.max(-85.0511, Math.min(85.0511, coordinate[0]));
    let longitude = coordinate[1];
    if (previousLongitude !== null) longitude = unwrapLongitudeNear(longitude, previousLongitude);
    if (followsRoute) previousLongitude = longitude;
    return [longitude * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))] as const;
  };
  const projected = Array.from(hasLine ? lines : normalized, point => project(point, true));
  const isolatedSelection = new Set<number>();
  if (hasLine && range && Number.isInteger(range.startIndex) && Number.isInteger(range.endIndex)) {
    let start = Math.max(0, Math.min(range.startIndex, range.endIndex));
    let end = Math.min(normalized.length - 1, Math.max(range.startIndex, range.endIndex));
    while (start <= end && !normalized[start]) start++;
    while (end >= start && !normalized[end]) end--;
    if (start <= end) {
      for (const index of [start, end]) {
        if (projected[index]) continue;
        projected[index] = project(normalized[index], false);
        isolatedSelection.add(index);
      }
    }
  }
  const selectedProjected = project(selectedPosition, false);
  let count = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of projected) {
    if (!point) continue;
    count++;
    minX = Math.min(minX, point[0]); maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]);
  }
  if (selectedProjected) {
    count++;
    minX = Math.min(minX, selectedProjected[0]); maxX = Math.max(maxX, selectedProjected[0]);
    minY = Math.min(minY, selectedProjected[1]); maxY = Math.max(maxY, selectedProjected[1]);
  }
  if (count === 0) return { path: null, points: [] };
  const pad = 16, width = 320, height = 160;
  const scale = Math.min(maxX > minX ? (width - pad * 2) / (maxX - minX) : Infinity,
    maxY > minY ? (height - pad * 2) / (maxY - minY) : Infinity);
  const toPixel = (point: readonly [number,number] | null): Pixel | null => {
    if (!point) return null;
    const x = Number.isFinite(scale) ? width / 2 + (point[0] - (minX + maxX) / 2) * scale : width / 2;
    const y = Number.isFinite(scale) ? height / 2 + (point[1] - (minY + maxY) / 2) * scale : height / 2;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  };
  const pixels = projected.map(toPixel);
  const geometry: StaticGeometry = hasLine ? { path: trace(pixels.map((point, index) => lines[index] ? point : null), starts), points: [] }
    : { path: null, points: pixels.filter((point): point is Pixel => point !== null) };
  if (range && Number.isInteger(range.startIndex) && Number.isInteger(range.endIndex)) {
    const lo = Math.max(0, Math.min(range.startIndex, range.endIndex));
    const hi = Math.min(pixels.length - 1, Math.max(range.startIndex, range.endIndex));
    const selected = hasLine ? drawableRouteSlots(normalized.slice(lo, hi + 1), segmentStarts.map(index => index - lo)) : null;
    const selection = pixels.map((point, index) => index >= lo && index <= hi && (!selected || selected[index - lo]) ? point : null);
    geometry.selectionPath = hasLine && selectedIndex == null ? trace(selection, starts) : null;
    geometry.selectionPoints = selectedIndex != null ? pixels[selectedIndex] ? [pixels[selectedIndex]!] : []
      : hasLine ? [...isolatedSelection].map(index => pixels[index]!).filter((point): point is Pixel => point !== null)
        : selection.filter((point): point is Pixel => point !== null);
  }
  const selectedPixel = toPixel(selectedProjected);
  if (selectedPixel) {
    geometry.selectionPoints ??= [];
    if (!geometry.selectionPoints.some(point => point[0] === selectedPixel[0] && point[1] === selectedPixel[1])) geometry.selectionPoints.push(selectedPixel);
  }
  return geometry;
}

export function buildStaticRoutePath(positions: readonly RouteSlot[], segmentStarts: readonly number[] = []): string | null {
  return buildStaticRouteGeometry(positions, segmentStarts).path;
}
