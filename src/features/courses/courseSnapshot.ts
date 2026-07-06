import { decodeTrack } from "../../utils/polyline";

export type LatLngTuple = [number, number];

export interface ClimbInfo {
  gain: number;
  dist: number;
  cat: number;
}

export interface CourseData {
  id: string;
  name: string;
  polyline: string;
  distance: number;
  elevationGain: number;
  climbs: ClimbInfo[];
  regions: string[];
  likeCount: number;
  createdAt: number;
  surface: string | null;
  difficulty: number | null;
  startLat: number;
  startLon: number;
}

export type CourseDocChange = {
  type: "added" | "modified" | "removed";
  id: string;
  data: Record<string, unknown>;
};

export function sampleCoursePoints(points: LatLngTuple[], maxPoints: number): LatLngTuple[] {
  if (points.length <= maxPoints) return points;
  const result: LatLngTuple[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.round(i * step)]!);
  }
  return result;
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export function courseFromSnapshotData(id: string, data: Record<string, unknown>): CourseData {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    polyline: typeof data.polyline === "string" ? data.polyline : "",
    distance: numberOrZero(data.distance),
    elevationGain: numberOrZero(data.elevationGain),
    climbs: arrayOrEmpty<ClimbInfo>(data.climbs),
    regions: arrayOrEmpty<string>(data.regions),
    likeCount: numberOrZero(data.likeCount),
    createdAt: numberOrZero(data.createdAt),
    surface: typeof data.surface === "string" ? data.surface : null,
    difficulty: typeof data.difficulty === "number" ? data.difficulty : null,
    startLat: numberOrZero(data.startLat),
    startLon: numberOrZero(data.startLon),
  };
}

export function applyCourseDocChanges(
  prevCourses: CourseData[],
  changes: CourseDocChange[],
  polylineCache: Map<string, LatLngTuple[]>,
): CourseData[] {
  const map = new Map(prevCourses.map((course) => [course.id, course]));

  for (const change of changes) {
    if (change.type === "removed") {
      map.delete(change.id);
      polylineCache.delete(change.id);
      continue;
    }

    const course = courseFromSnapshotData(change.id, change.data);
    map.set(change.id, course);
    if (course.polyline) {
      const decoded = decodeTrack(course.polyline) as LatLngTuple[];
      polylineCache.set(change.id, sampleCoursePoints(decoded, 200));
    } else {
      polylineCache.delete(change.id);
    }
  }

  return Array.from(map.values());
}
