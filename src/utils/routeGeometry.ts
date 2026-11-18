import { decodeTrack } from "./polyline";

export type RoutePosition = [number, number];
export type RouteSlot = RoutePosition | null;

/** Stream JSON can contain missing samples despite its static tuple-array type. */
export function isRoutePosition(value: unknown): value is RoutePosition {
  return Array.isArray(value) && value.length >= 2
    && typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 90
    && typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) <= 180;
}

/** Keep every source slot: map selections and sensor samples use these indices. */
export function routeSlots(value: unknown): RouteSlot[] {
  return Array.isArray(value) ? Array.from(value, point => isRoutePosition(point) ? [point[0], point[1]] : null) : [];
}

/** Preserve invalid Orider track entries as gaps rather than joining their neighbours. */
export function routeTrackSlots(track: string): RouteSlot[] {
  if (!track.includes(",")) return routeSlots(decodeTrack(track));
  return track.split(";").map(entry => {
    const values = entry.split(",");
    if (values.length !== 2 || values.some(value => !value.trim())) return null;
    const point = values.map(Number);
    return isRoutePosition(point) ? [point[0], point[1]] : null;
  });
}

/** A line needs adjacent measured samples; isolated points must never be bridged. */
export function hasRouteLine(positions: readonly unknown[], segmentStarts: readonly number[] = []): boolean {
  const starts = new Set(segmentStarts);
  for (let index = 1; index < positions.length; index++) {
    if (starts.has(index)) continue;
    if (isRoutePosition(positions[index - 1]) && isRoutePosition(positions[index])) return true;
  }
  return false;
}

export function routeGeometry(positions: readonly RouteSlot[], segmentStarts: readonly number[] = []) {
  const starts = new Set(segmentStarts);
  const parts: RoutePosition[][] = [];
  let part: RoutePosition[] = [];
  const flush = () => { if (part.length >= 2) parts.push(part); part = []; };
  positions.forEach((point, index) => {
    if (!point || starts.has(index)) flush();
    if (point) part.push(point);
  });
  flush();
  const coordinates = parts.map(segment => segment.map(([lat, lon]) => [lon, lat]));
  return {
    type: "Feature", properties: {},
    geometry: coordinates.length === 1
      ? { type: "LineString", coordinates: coordinates[0]! }
      : { type: "MultiLineString", coordinates },
  } as GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;
}

export function routeBounds(positions: readonly unknown[]): [[number, number], [number, number]] | null {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const point of positions) {
    if (!isRoutePosition(point)) continue;
    const [lat, lng] = point;
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  }
  return Number.isFinite(minLat) ? [[minLng, minLat], [maxLng, maxLat]] : null;
}
