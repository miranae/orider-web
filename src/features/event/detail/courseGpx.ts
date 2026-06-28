export interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
}

export interface GpxWaypoint {
  lat: number;
  lon: number;
  ele: number;
  name: string;
  type: string;
}

export interface CourseData {
  points: GpxPoint[];
  waypoints: GpxWaypoint[];
  latlng: [number, number][];
  distance: number;
  elevationGain: number;
  elevationLoss: number;
  maxElevation: number;
  minElevation: number;
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parseGpxFull(gpxXml: string): CourseData {
  const parser = new DOMParser();
  const gpxDoc = parser.parseFromString(gpxXml, "text/xml");

  const childText = (parent: Element, tag: string): string | null => {
    const els = parent.getElementsByTagName(tag);
    if (!els.length) return null;
    return els[0]?.textContent?.trim() ?? null;
  };

  const points: GpxPoint[] = [];
  const trkpts = gpxDoc.getElementsByTagName("trkpt");
  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i]!;
    const lat = parseFloat(pt.getAttribute("lat") || "");
    const lon = parseFloat(pt.getAttribute("lon") || "");
    const eleStr = childText(pt, "ele");
    const ele = eleStr != null ? parseFloat(eleStr) : 0;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : 0 });
    }
  }

  const waypoints: GpxWaypoint[] = [];
  const wpts = gpxDoc.getElementsByTagName("wpt");
  for (let i = 0; i < wpts.length; i++) {
    const wpt = wpts[i]!;
    const lat = parseFloat(wpt.getAttribute("lat") || "");
    const lon = parseFloat(wpt.getAttribute("lon") || "");
    const eleStr = childText(wpt, "ele");
    const ele = eleStr != null ? parseFloat(eleStr) : 0;
    const name = childText(wpt, "name") || "";
    const type = childText(wpt, "type") || "GENERIC";
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      waypoints.push({ lat, lon, ele: Number.isFinite(ele) ? ele : 0, name, type });
    }
  }

  let distance = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let maxElevation = -Infinity;
  let minElevation = Infinity;

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (p.ele > maxElevation) maxElevation = p.ele;
    if (p.ele < minElevation) minElevation = p.ele;
    if (i > 0) {
      const prev = points[i - 1]!;
      distance += haversine(prev.lat, prev.lon, p.lat, p.lon);
      const diff = p.ele - prev.ele;
      if (diff > 0) elevationGain += diff;
      else elevationLoss += Math.abs(diff);
    }
  }

  return {
    points,
    waypoints,
    latlng: points.map((p) => [p.lat, p.lon]),
    distance,
    elevationGain,
    elevationLoss,
    maxElevation: maxElevation === -Infinity ? 0 : maxElevation,
    minElevation: minElevation === Infinity ? 0 : minElevation,
  };
}
