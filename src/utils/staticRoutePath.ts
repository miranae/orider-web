import { isRoutePosition, routeSlots, drawableRouteSlots, type RouteSlot } from "./routeGeometry";

/** 지도와 같은 투영 및 단일 배율로 대체 경로의 실제 비율을 유지한다. */
export function buildStaticRouteGeometry(positions: readonly RouteSlot[], segmentStarts: readonly number[] = [], { pointsOnly = false }: { pointsOnly?: boolean } = {}): { path: string | null; points: [number, number][] } {
  const normalized = routeSlots(positions);
  const lines = pointsOnly ? [] : drawableRouteSlots(normalized, segmentStarts);
  const hasLine = lines.some(isRoutePosition);
  const starts = new Set(segmentStarts);
  let previousLongitude: number | null = null;
  const projected = Array.from(hasLine ? lines : normalized, point => {
    if (!isRoutePosition(point)) return null;
    const [lat, lng] = point;
    // 잘못된 좌표를 건너뛸 때 서로 떨어진 구간을 연결하지 않는다.
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85.0511 || Math.abs(lng) > 180) return null;
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
  const pad = 16;
  const width = 320;
  const height = 160;
  const scale = Math.min(
    maxX > minX ? (width - pad * 2) / (maxX - minX) : Infinity,
    maxY > minY ? (height - pad * 2) / (maxY - minY) : Infinity,
  );
  const pixels = projected.map(point => {
    if (!point) return null;
    const x = Number.isFinite(scale) ? width / 2 + (point[0] - (minX + maxX) / 2) * scale : width / 2;
    const y = Number.isFinite(scale) ? height / 2 + (point[1] - (minY + maxY) / 2) * scale : height / 2;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))] as [number, number];
  });
  if (!hasLine) return { path: null, points: pixels.filter((point): point is [number,number] => point !== null) };
  let move = true;
  const path = pixels.map((point, index) => {
    if (point === null) {
      move = true;
      return "";
    }
    const [x,y] = point;
    const command = move || starts.has(index) ? "M" : "L";
    move = false;
    return `${command} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).filter(Boolean).join(" ");
  return { path, points: [] };
}

export function buildStaticRoutePath(positions: readonly RouteSlot[], segmentStarts: readonly number[] = []): string | null {
  return buildStaticRouteGeometry(positions, segmentStarts).path;
}
