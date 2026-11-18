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
export function routeTrackSlots(track: unknown): RouteSlot[] {
  if (typeof track !== "string") return [];
  if (!track.includes(",")) {
    // The permissive legacy decoder fabricates zero deltas for truncated values.
    // Require complete latitude/longitude varint pairs before using a thumbnail.
    let values = 0, bits = 0;
    for (const character of track) {
      const byte = character.charCodeAt(0) - 63;
      if (byte < 0 || byte > 63 || (bits += 5) > 30) return [];
      if (byte < 32) { values++; bits = 0; }
    }
    if (bits || values % 2) return [];
    return routeSlots(decodeTrack(track));
  }
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

/** Remove only drawable geometry, never source slots: isolated fixes are not route lines. */
export function drawableRouteSlots(positions: readonly RouteSlot[], segmentStarts: readonly number[] = []): RouteSlot[] {
  const starts = new Set(segmentStarts);
  return positions.map((point, index) => point && (
    index > 0 && !starts.has(index) && positions[index - 1]
    || index + 1 < positions.length && !starts.has(index + 1) && positions[index + 1]
  ) ? point : null);
}

/** Use one longitude placement for every sample before deriving route subranges. */
export function projectRouteSlots(positions: readonly RouteSlot[], segmentStarts: readonly number[] = []): RouteSlot[] {
  const starts = new Set(segmentStarts);
  const lineSlots = drawableRouteSlots(positions, segmentStarts);
  const fitSlots = lineSlots.some(Boolean) ? lineSlots : positions;
  const shifted = routeBounds(fitSlots, true)?.[0][0] !== routeBounds(fitSlots)?.[0][0];
  let previous: number | undefined;
  return positions.map((point, index) => {
    if (!point || starts.has(index)) previous = undefined;
    if (!point) return null;
    const [lat, lon] = point;
    const longitude = shifted && lon < 0 ? lon + 360 : lon;
    const projected = previous === undefined ? longitude : unwrapLongitudeNear(longitude, previous);
    previous = projected;
    return [lat, projected];
  });
}

export function routeGeometry(positions: readonly RouteSlot[], segmentStarts: readonly number[] = []) {
  const starts = new Set(segmentStarts);
  const coordinates: number[][][] = [];
  let part: number[][] = [];
  const flush = () => { if (part.length >= 2) coordinates.push(part); part = []; };
  positions.forEach((point, index) => {
    if (!point || starts.has(index)) flush();
    if (point) part.push([point[1], point[0]]);
  });
  flush();
  return {
    type: "Feature", properties: {},
    geometry: coordinates.length === 1
      ? { type: "LineString", coordinates: coordinates[0]! }
      : { type: "MultiLineString", coordinates },
  } as GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;
}

export function unwrapLongitudeNear(longitude: number, reference: number): number {
  const delta = longitude - reference;
  if (delta > 180) return longitude - 360 * Math.ceil((delta - 180) / 360);
  if (delta < -180) return longitude + 360 * Math.ceil((-delta - 180) / 360);
  return longitude;
}

export function shortestLongitudeDelta(delta: number): number {
  return Math.abs(delta) <= 180 ? delta : ((delta + 180) % 360 + 360) % 360 - 180;
}

export function routeBounds(positions: readonly unknown[], wrapDateline = false): [[number, number], [number, number]] | null {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  let minShiftedLng = Infinity, maxShiftedLng = -Infinity;
  for (const point of positions) {
    if (!isRoutePosition(point)) continue;
    const [lat, lng] = point;
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    const shifted = lng < 0 ? lng + 360 : lng;
    minShiftedLng = Math.min(minShiftedLng, shifted); maxShiftedLng = Math.max(maxShiftedLng, shifted);
  }
  if (!Number.isFinite(minLat)) return null;
  if (wrapDateline && maxShiftedLng - minShiftedLng < maxLng - minLng)
    return [[minShiftedLng, minLat], [maxShiftedLng, maxLat]];
  return [[minLng, minLat], [maxLng, maxLat]];
}

/** Fit the exact emitted line, adding nearby world copies of explicitly included points. */
export function routeGeometryBounds(
  geometry: GeoJSON.LineString | GeoJSON.MultiLineString,
  includedPoints: readonly RouteSlot[] = [],
  pointsAreProjected = false,
): [[number, number], [number, number]] | null {
  const parts = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  const include = (lng: number, lat: number) => {
    west = Math.min(west, lng); east = Math.max(east, lng);
    south = Math.min(south, lat); north = Math.max(north, lat);
  };
  for (const part of parts) for (const [lng, lat] of part) include(lng!, lat!);
  if (!Number.isFinite(west)) {
    if (!pointsAreProjected) return routeBounds(includedPoints, true);
    for (const point of includedPoints) if (point) include(point[1], point[0]);
    return Number.isFinite(west) ? [[west, south], [east, north]] : null;
  }
  const center = (west + east) / 2;
  for (const point of includedPoints) {
    if (isRoutePosition(point)) include(center + shortestLongitudeDelta(point[1] - center), point[0]);
  }
  return [[west, south], [east, north]];
}
