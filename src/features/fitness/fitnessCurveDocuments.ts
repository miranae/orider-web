export interface RunPacePoint {
  durationSec: number;
  paceSecPerKm: number;
}

export interface SwimPacePoint {
  distanceM: number;
  paceSecPer100m: number;
}

export interface CurvePeriods<T> {
  recent28: T[];
  prev28: T[];
}

export interface FitnessCurveDocument {
  version: 1;
  discipline: "run" | "swim";
  windowDays: 56;
  maxEntries: 256;
  entries: Array<{
    activityId: string;
    startTime: number;
    curve: Array<RunPacePoint | SwimPacePoint>;
  }>;
  generation: number;
  updatedAt: number;
  truncated: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function aggregatePoints(
  document: unknown,
  discipline: "run" | "swim",
  now: number,
): CurvePeriods<[number, number]> {
  if (!isRecord(document) || document.version !== 1 || document.discipline !== discipline
    || document.windowDays !== 56 || document.maxEntries !== 256
    || !Array.isArray(document.entries) || !isFiniteNumber(document.generation)
    || !isFiniteNumber(document.updatedAt) || typeof document.truncated !== "boolean") {
    throw new Error("Invalid fitness curve contract");
  }

  const recent28 = new Map<number, number>();
  const prev28 = new Map<number, number>();
  const coordinateKey = discipline === "run" ? "durationSec" : "distanceM";
  const paceKey = discipline === "run" ? "paceSecPerKm" : "paceSecPer100m";
  for (const entry of document.entries) {
    if (!isRecord(entry) || !isFiniteNumber(entry.startTime)
      || entry.startTime < now - 56 * DAY_MS || !Array.isArray(entry.curve)) continue;
    const period = entry.startTime >= now - 28 * DAY_MS ? recent28 : prev28;
    for (const point of entry.curve) {
      if (!isRecord(point)) continue;
      const coordinate = point[coordinateKey];
      const pace = point[paceKey];
      if (!isFiniteNumber(coordinate) || coordinate <= 0 || !isFiniteNumber(pace) || pace <= 0) continue;
      period.set(coordinate, Math.min(period.get(coordinate) ?? Infinity, pace));
    }
  }
  return {
    recent28: [...recent28].sort(([a], [b]) => a - b),
    prev28: [...prev28].sort(([a], [b]) => a - b),
  };
}

export function buildRunPacePeriods(document: unknown, now: number): CurvePeriods<RunPacePoint> {
  const periods = aggregatePoints(document, "run", now);
  const mapPoint = ([durationSec, paceSecPerKm]: [number, number]) => ({ durationSec, paceSecPerKm });
  return { recent28: periods.recent28.map(mapPoint), prev28: periods.prev28.map(mapPoint) };
}

export function buildSwimPacePeriods(document: unknown, now: number): CurvePeriods<SwimPacePoint> {
  const periods = aggregatePoints(document, "swim", now);
  const mapPoint = ([distanceM, paceSecPer100m]: [number, number]) => ({ distanceM, paceSecPer100m });
  return { recent28: periods.recent28.map(mapPoint), prev28: periods.prev28.map(mapPoint) };
}
