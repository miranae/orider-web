import { decodeTrack } from "../../utils/polyline";

export const PERSONAL_HEATMAP_ZOOM = 14;
export const PERSONAL_HEATMAP_LIMITS = {
  trackPoints: 20_000,
  segmentCells: 4_096,
  activityCells: 20_000,
  outputCells: 50_000,
} as const;

interface PersonalHeatmapLimits {
  trackPoints: number;
  segmentCells: number;
  activityCells: number;
  outputCells: number;
}

export interface PersonalHeatPoint {
  lat: number;
  lng: number;
  weight: number;
}

interface TrackActivity { thumbnailTrack?: string | null }
interface CellVisit { x: number; y: number; weight: number }

export interface PersonalHeatmapAggregationOptions {
  signal?: AbortSignal;
  isCancelled?: () => boolean;
  limits?: Partial<PersonalHeatmapLimits>;
}

function isCancelled(options: PersonalHeatmapAggregationOptions): boolean {
  return options.signal?.aborted === true || options.isCancelled?.() === true;
}

function throwIfCancelled(options: PersonalHeatmapAggregationOptions): void {
  if (isCancelled(options)) throw new DOMException("Personal heatmap aggregation cancelled", "AbortError");
}

function normalizedLimits(options: PersonalHeatmapAggregationOptions): PersonalHeatmapLimits {
  const positiveInt = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) && value! > 0 ? Math.floor(value!) : fallback;
  return {
    trackPoints: positiveInt(options.limits?.trackPoints, PERSONAL_HEATMAP_LIMITS.trackPoints),
    segmentCells: positiveInt(options.limits?.segmentCells, PERSONAL_HEATMAP_LIMITS.segmentCells),
    activityCells: positiveInt(options.limits?.activityCells, PERSONAL_HEATMAP_LIMITS.activityCells),
    outputCells: positiveInt(options.limits?.outputCells, PERSONAL_HEATMAP_LIMITS.outputCells),
  };
}

function tilePosition(lat: number, lng: number, zoom: number): [number, number] | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85.0511 || Math.abs(lng) > 180) return null;
  const scale = 2 ** zoom;
  const x = Math.min(scale - Number.EPSILON, Math.max(0, ((lng + 180) / 360) * scale));
  const rad = lat * Math.PI / 180;
  const y = Math.min(scale - Number.EPSILON, Math.max(0, (1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * scale));
  return [x, y];
}

function tileCenter(x: number, y: number, zoom: number): [number, number] {
  const scale = 2 ** zoom;
  const lng = (x + 0.5) / scale * 360 - 180;
  const n = Math.PI - 2 * Math.PI * (y + 0.5) / scale;
  const lat = 180 / Math.PI * Math.atan(Math.sinh(n));
  return [lat, lng];
}

/** Amanatides-Woo traversal with corner-adjacent cells, bounded independently per segment. */
function traverseSegment(
  a: [number, number],
  b: [number, number],
  zoom: number,
  maxCells: number,
  options: PersonalHeatmapAggregationOptions,
  visit: (x: number, y: number) => boolean,
): void {
  const start = tilePosition(a[0], a[1], zoom);
  const end = tilePosition(b[0], b[1], zoom);
  if (!start || !end) return; // damaged coordinates skip only this segment

  const scale = 2 ** zoom;
  let endXPosition = end[0];
  const rawDeltaX = endXPosition - start[0];
  if (rawDeltaX > scale / 2) endXPosition -= scale;
  else if (rawDeltaX < -scale / 2) endXPosition += scale;

  let x = Math.floor(start[0]);
  let y = Math.floor(start[1]);
  const endX = Math.floor(endXPosition);
  const endY = Math.floor(end[1]);
  const dx = endXPosition - start[0];
  const dy = end[1] - start[1];
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const tDeltaX = stepX === 0 ? Infinity : 1 / Math.abs(dx);
  const tDeltaY = stepY === 0 ? Infinity : 1 / Math.abs(dy);
  let tMaxX = stepX > 0
    ? (Math.floor(start[0]) + 1 - start[0]) * tDeltaX
    : stepX < 0 ? (start[0] - Math.floor(start[0])) * tDeltaX : Infinity;
  let tMaxY = stepY > 0
    ? (Math.floor(start[1]) + 1 - start[1]) * tDeltaY
    : stepY < 0 ? (start[1] - Math.floor(start[1])) * tDeltaY : Infinity;
  let visited = 0;
  const emit = (cellX: number, cellY: number): boolean => {
    if (visited >= maxCells || isCancelled(options)) return false;
    visited++;
    const normalizedX = ((cellX % scale) + scale) % scale;
    return visit(normalizedX, cellY);
  };

  if (!emit(x, y)) return;
  while (x !== endX || y !== endY) {
    throwIfCancelled(options);
    if (tMaxX < tMaxY) {
      x += stepX;
      tMaxX += tDeltaX;
      if (!emit(x, y)) return;
    } else if (tMaxY < tMaxX) {
      y += stepY;
      tMaxY += tDeltaY;
      if (!emit(x, y)) return;
    } else {
      // A corner touch intersects both side cells as well as the diagonal cell.
      if (!emit(x + stepX, y) || !emit(x, y + stepY)) return;
      x += stepX;
      y += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
      if (!emit(x, y)) return;
    }
  }
}

function accumulateActivity(
  activity: TrackActivity,
  visits: Map<string, CellVisit>,
  zoom: number,
  options: PersonalHeatmapAggregationOptions,
): void {
  if (!activity.thumbnailTrack) return;
  const limits = normalizedLimits(options);
  let decoded: [number, number][];
  try {
    decoded = decodeTrack(activity.thumbnailTrack, limits.trackPoints);
  } catch {
    return; // malformed tracks are skipped as a unit
  }
  const track = decoded; // decoder stops at the cap, bounding decode memory and traversal work
  const activityCells = new Map<string, [number, number]>();
  const addCell = (x: number, y: number): boolean => {
    const key = `${x}:${y}`;
    if (!activityCells.has(key)) {
      if (activityCells.size >= limits.activityCells) return false;
      activityCells.set(key, [x, y]);
    }
    return true;
  };

  for (let i = 0; i < track.length; i++) {
    throwIfCancelled(options);
    const current = track[i];
    if (!current) continue;
    const next = track[i + 1];
    if (next) {
      traverseSegment(current, next, zoom, limits.segmentCells, options, addCell);
    } else if (track.length === 1) {
      const point = tilePosition(current[0], current[1], zoom);
      if (point) addCell(Math.floor(point[0]), Math.floor(point[1]));
    }
    if (activityCells.size >= limits.activityCells) break;
  }

  for (const [key, [x, y]] of activityCells) {
    throwIfCancelled(options);
    const prior = visits.get(key);
    if (!prior && visits.size >= limits.outputCells) break;
    visits.set(key, { x, y, weight: (prior?.weight ?? 0) + 1 });
  }
}

function toPoints(visits: Map<string, CellVisit>, zoom: number): PersonalHeatPoint[] {
  return [...visits.values()].map(({ x, y, weight }) => {
    const [lat, lng] = tileCenter(x, y, zoom);
    return { lat, lng, weight };
  });
}

/** Counts at most once per activity/cell. Damaged paths skip; oversized paths truncate at explicit caps. */
export function aggregatePersonalHeatmap(
  activities: TrackActivity[],
  zoom = PERSONAL_HEATMAP_ZOOM,
  options: PersonalHeatmapAggregationOptions = {},
): PersonalHeatPoint[] {
  const visits = new Map<string, CellVisit>();
  const outputCap = normalizedLimits(options).outputCells;
  for (const activity of activities) {
    throwIfCancelled(options);
    accumulateActivity(activity, visits, zoom, options);
    if (visits.size >= outputCap) break;
  }
  return toPoints(visits, zoom);
}

/** Yield between batches while merging each activity immediately into one bounded map. */
export async function aggregatePersonalHeatmapAsync(
  activities: TrackActivity[],
  zoom = PERSONAL_HEATMAP_ZOOM,
  batchSize = 20,
  options: PersonalHeatmapAggregationOptions = {},
): Promise<PersonalHeatPoint[]> {
  const visits = new Map<string, CellVisit>();
  const limits = normalizedLimits(options);
  const size = Math.max(1, Math.floor(batchSize));
  for (let i = 0; i < activities.length; i++) {
    throwIfCancelled(options);
    accumulateActivity(activities[i]!, visits, zoom, options);
    if (visits.size >= limits.outputCells) break;
    if ((i + 1) % size === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      throwIfCancelled(options);
    }
  }
  return toPoints(visits, zoom);
}
