import { parseGpxRoot, parseGpxXmlRoot, gpxNameFromDocument, type ParsedGpx, type GpxWaypoint } from '../courseEngine/gpx';
import type { CoursePoint, CourseTrack } from './domain';

/** 기존 코스 엔진으로 읽되, 분리된 트랙 사이를 가상의 주행 구간으로 잇지 않는다. */
export function readCourseTrack(xml: string, fileName: string): CourseTrack { return readCourseTrackData(xml, fileName).track; }
export function readCourseTrackData(xml: string, fileName: string): {track: CourseTrack; parts: ParsedGpx[]; waypoints: GpxWaypoint[]; name: string} {
  if (xml.length > 2_000_000) throw new Error('GPX 파일은 2MB 이하로 올려주세요.');
  const doc = parseGpxXmlRoot(xml);
  if (!doc) {
    throw new Error('올바른 GPX 파일을 선택해주세요.');
  }
  const segments = Array.from(doc.getElementsByTagName('trkseg'))
    .filter(segment => segment.getElementsByTagName('trkpt').length > 0);
  const nodes = Array.from(doc.getElementsByTagName('trkpt'));
  if (nodes.length < 2 || nodes.length > 20_000 || segments.length > 50) {
    throw new Error('2~20,000개의 트랙 지점이 있는 GPX를 선택해주세요.');
  }
  if (nodes.some(node => {
    const lat = Number(node.getAttribute('lat'));
    const lon = Number(node.getAttribute('lon'));
    return !node.getAttribute('lat')?.trim() || !node.getAttribute('lon')?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180;
  })) throw new Error('GPX에 유효하지 않은 좌표가 있습니다.');
  if (segments.length === 0) throw new Error('트랙 구간이 있는 GPX를 선택해주세요.');

  const parsed = segments.map(segment => parseGpxRoot(segment));
  if (parsed.some(part => part.points.length < 2)) throw new Error('각 트랙 구간에는 두 개 이상의 지점이 필요합니다.');
  const distanceKm = parsed.reduce((sum, part) => sum + part.stats.distanceM, 0) / 1000;
  if (distanceKm <= 0) throw new Error('서로 다른 위치가 있는 GPX를 선택해주세요.');
  const hasElevation = parsed.every(part => part.hasElevation);
  const elevationGainM = hasElevation ? parsed.reduce((sum, part) => sum + part.stats.elevationGainM, 0) : undefined;
  const points: CoursePoint[] = [];
  const segmentStarts: number[] = [];
  const total = parsed.reduce((sum, part) => sum + part.points.length, 0);
  const stride = Math.max(1, Math.ceil(total / 1800));
  for (const part of parsed) {
    segmentStarts.push(points.length);
    part.points.forEach((point, index) => {
      if (index % stride === 0 || index === part.points.length - 1) {
        points.push({ lat: point.lat, lon: point.lon, ...(hasElevation ? { ele: point.ele } : {}) });
      }
    });
  }
  for (const node of Array.from(doc.getElementsByTagName('wpt'))) {
    const lat = Number(node.getAttribute('lat')), lon = Number(node.getAttribute('lon'));
    if (!node.getAttribute('lat')?.trim() || !node.getAttribute('lon')?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) node.remove();
  }
  const waypoints = parseGpxRoot(doc).waypoints;
  return { track: { fileName, points, segmentStarts, distanceKm, elevationGainM }, parts: parsed, waypoints, name: (gpxNameFromDocument(doc) ?? fileName.replace(/\.gpx$/i, '')).slice(0, 200) || 'GPX 코스' };
}

/** 배경지도 없는 좌표 미리보기. 위도에 따른 경도 비율을 보정한다. */
export function projectCourseTrack(track: CourseTrack): { path: string; first: [number, number]; last: [number, number] } {
  const lats = track.points.map(point => point.lat);
  const lons = track.points.map(point => point.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const lonScale = Math.max(0.01, Math.cos((minLat + maxLat) * Math.PI / 360));
  const width = (maxLon - minLon) * lonScale;
  const height = maxLat - minLat;
  const scale = Math.min(536 / Math.max(width, 0.000001), 176 / Math.max(height, 0.000001));
  const offsetX = (600 - width * scale) / 2;
  const offsetY = (240 - height * scale) / 2;
  const projected = track.points.map(point => [offsetX + (point.lon - minLon) * lonScale * scale, offsetY + (maxLat - point.lat) * scale] as [number, number]);
  const starts = new Set(track.segmentStarts ?? [0]);
  const path = projected.map(([x, y], index) => `${starts.has(index) || index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return { path, first: projected[0] ?? [0, 0], last: projected[projected.length - 1] ?? [0, 0] };
}
