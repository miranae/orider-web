import type { Waypoint } from "../features/courseBuilder/routeBuilder";

export interface CyclingRoute { coordinates: [number, number][]; distance: number; duration: number }
export class DirectionsTimeoutError extends Error { constructor() { super("Directions request timed out"); this.name = "DirectionsTimeoutError"; } }
const MAX_ROUTE_POINTS = 50_000;
export async function fetchCyclingRoute(points: Waypoint[], token: string, signal?: AbortSignal): Promise<CyclingRoute> {
  if (points.length < 2 || points.length > 25) throw new Error("Waypoint count must be between 2 and 25");
  if (!token) throw new Error("Map token unavailable");
  if (points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 85 || Math.abs(p.lng) > 180)) throw new Error("Invalid waypoint coordinates");
  if (signal?.aborted) throw new DOMException("Directions request aborted", "AbortError");
  const coordinates = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
  const externalAbort = () => controller.abort();
  signal?.addEventListener("abort", externalAbort, { once: true });
  try {
    const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/cycling/${coordinates}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Directions request failed (${response.status})`);
    const data = await response.json() as { routes?: Array<{ geometry?: { coordinates?: [number, number][] }; distance?: number; duration?: number }> };
    const route = data.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (!coords || coords.length < 2 || coords.length > MAX_ROUTE_POINTS || coords.some((p) => !Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 85) || !Number.isFinite(route.distance) || route.distance! < 0 || !Number.isFinite(route.duration) || route.duration! < 0) throw new Error("Invalid cycling route response");
    return { coordinates: coords, distance: route.distance!, duration: route.duration! };
  } catch (error) {
    if (timedOut) throw new DirectionsTimeoutError();
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", externalAbort); }
}
