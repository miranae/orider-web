export type Waypoint = { lat: number; lng: number };
export const MAX_BUILDER_WAYPOINTS = 10;
export function addWaypoint(points: Waypoint[], point: Waypoint): Waypoint[] {
  if (points.length >= MAX_BUILDER_WAYPOINTS || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 85 || Math.abs(point.lng) > 180) return points;
  return [...points, point];
}
export function tryAddWaypoint(points: Waypoint[], point: Waypoint): { points: Waypoint[]; changed: boolean } {
  const next = addWaypoint(points, point);
  return { points: next, changed: next !== points };
}
export function undoWaypoint(points: Waypoint[]): Waypoint[] { return points.slice(0, -1); }
