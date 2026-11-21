import { cumulativeDistances, haversineMeters } from '../courseEngine/geo';
import { resolveWaypointsOnTrack } from '../courseEngine/waypoints';
import type { TrackPoint } from '../courseEngine/stats';
import type { CourseCheckpoint, CoursePoint, CourseSource, CourseTrack, Meeting } from './domain';
import type { MeetingSegment } from './segmentCatalog';
import { readCourseTrackData } from './courseTrackPreview';

export interface CoursePlan {
  source: CourseSource;
  distanceKm?: number;
  elevationGainM?: number;
  checkpoints: CourseCheckpoint[];
  track?: CourseTrack;
  segments: MeetingSegment[];
  warnings?: string[];
}

export function courseStartPlace(meeting: Meeting): string {
  if (meeting.venue !== 'outdoor' || !meeting.courseSource || meeting.courseSource.kind === 'builtin') return '';
  const checkpoints = meeting.courseCheckpoints ?? [];
  const hasCoordinates = (point: { lat?: number; lon?: number } | undefined): point is CoursePoint =>
    point?.lat !== undefined && point.lon !== undefined && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
  const start = meeting.courseSource.kind === 'segments'
    ? meeting.segments?.[0]?.geometry?.[0]
    : meeting.courseTrack?.points[0] ?? checkpoints.find(point => point.distanceKm === 0 && point.source !== 'manual' && hasCoordinates(point));
  if (!hasCoordinates(start)) return '';
  // 출발로 명시된 지점에는 트랙과의 작은 오차를 허용한다. 일반 경유지는 좌표가 일치해야 한다.
  const candidates = checkpoints.flatMap(point => {
    const name = point.name.trim();
    const type = point.type?.trim().toLowerCase();
    const explicitStart = type === 'start';
    const tolerance = explicitStart ? 25 : 1;
    if (type === 'finish' || type === 'end' || point.source === 'manual' || point.source === 'segments' || !hasCoordinates(point)
      || (!explicitStart && point.distanceKm !== undefined && point.distanceKm > 0.001)
      || /^(?:출발|출발점|도착|start|finish|end|체크포인트\s*\d+)?$/i.test(name)) return [];
    const offset = haversineMeters(start.lat, start.lon, point.lat, point.lon);
    return offset <= tolerance ? [{name, offset, explicitStart, lat: point.lat, lon: point.lon}] : [];
  });
  const explicit = new Map(candidates.filter(point => point.explicitStart)
    .map(point => [JSON.stringify([point.name, point.lat, point.lon]), point]));
  const coordinates = `${start.lat.toFixed(5)}, ${start.lon.toFixed(5)}`;
  if (explicit.size > 1) return coordinates;
  const name = explicit.values().next().value?.name ?? candidates.sort((a, b) => a.offset - b.offset)[0]?.name;
  return name?.slice(0, 300) ?? coordinates;
}

/** 경로가 있는 코스를 가져오면 코스를 확정으로 둔다 — 확정 칸이 접힌 곳에 있어 「준비 중」으로 게시되던 것을 막는다(#1779). 경로 없는 구간 소개는 주최자가 확정한다. */
export function applyCoursePlan(meeting: Meeting, plan: CoursePlan): Meeting {
  return { ...meeting, courseSource: structuredClone(plan.source), distanceKm: plan.distanceKm, elevationGainM: plan.elevationGainM, courseCheckpoints: structuredClone(plan.checkpoints), courseTrack: plan.track ? structuredClone(plan.track) : undefined, segments: structuredClone(plan.segments), courseStops: plan.checkpoints.map(point => point.name), courseInfoVersion: 1, courseReady: Boolean(plan.track) };
}

/**
 * 고른 코스를 비운다 — 실내·실외를 바꿔 코스가 맞지 않게 됐을 때 쓴다(#1779).
 * 코스에서 온 값(경로·수치·체크포인트·구간)만 지우고 모임 이름·일시·소개는 그대로 둔다.
 */
export function clearCourse(meeting: Meeting): Meeting {
  const { courseSource: _source, courseTrack: _track, distanceKm: _distance, elevationGainM: _gain, ...rest } = meeting;
  return { ...rest, courseCheckpoints: [], segments: [], courseStops: [], courseReady: false };
}

/** 선택 구간 합계이며, 겹치는 구간과 연결 이동을 보정한 전체 코스 수치가 아니다. */
export function readSegmentCoursePlan(segments: MeetingSegment[]): CoursePlan {
  const known = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value >= 0;
  const distanceKm = segments.length && segments.every(segment => known(segment.distance)) ? segments.reduce((sum, segment) => sum + segment.distance!, 0) / 1000 : undefined;
  const elevationGainM = segments.length && segments.every(segment => known(segment.elevationGain)) ? segments.reduce((sum, segment) => sum + segment.elevationGain!, 0) : undefined;
  const checkpoints: CourseCheckpoint[] = [];
  let offset: number | undefined = 0;
  for (const segment of segments) {
    const first = segment.geometry?.[0];
    const last = segment.geometry?.[segment.geometry.length - 1];
    const end: number | undefined = offset !== undefined && known(segment.distance) ? offset + segment.distance / 1000 : undefined;
    if (first && last) {
      checkpoints.push({name: `${segment.name.slice(0, 290)} · 출발`, lat: first.lat, lon: first.lon, distanceKm: offset, source: 'segments', segmentId: segment.id, segmentEndpoint: 'start'});
      checkpoints.push({name: `${segment.name.slice(0, 290)} · 도착`, lat: last.lat, lon: last.lon, distanceKm: end, source: 'segments', segmentId: segment.id, segmentEndpoint: 'end'});
    }
    offset = end;
  }
  const warnings = ['선택 구간의 합계입니다. 연결 이동은 포함하지 않고, 겹치는 구간도 각각 더합니다.'];
  if (segments.length && distanceKm === undefined) warnings.push('거리 정보가 없는 구간이 있어 거리 합계를 표시하지 않습니다.');
  if (segments.length && elevationGainM === undefined) warnings.push('획득고도 정보가 없는 구간이 있어 획득고도 합계를 표시하지 않습니다.');
  if (segments.some(segment => !segment.geometry?.length)) warnings.push('좌표가 없는 구간은 출발·도착 체크포인트를 만들지 않습니다.');
  return {source: {kind: 'segments', name: '선택한 세그먼트로 준비'}, distanceKm, elevationGainM, checkpoints, segments: structuredClone(segments), warnings};
}

function geometry(points: TrackPoint[], hasElevation: boolean): CoursePoint[] {
  const stride = Math.max(1, Math.ceil(points.length / 1800));
  return points.filter((_, index) => index % stride === 0 || index === points.length - 1).map(point => ({lat: point.lat, lon: point.lon, ...(hasElevation ? {ele: point.ele} : {})}));
}

/** 서버 utils/segment.ts detectClimbs와 동일한 peak 하강 30m·상승 20m·카테고리 계약. 원본 인덱스를 보존한다. */
function climbRanges(points: TrackPoint[], distances: number[]): {start: number; end: number; gain: number; category: number}[] {
  const climbs: {start: number; end: number; gain: number; category: number}[] = [];
  let index = 0;
  while (index < points.length - 1) {
    while (index < points.length - 1 && points[index + 1]!.ele <= points[index]!.ele) index++;
    if (index >= points.length - 1) break;
    const start = index;
    let peak = index;
    index++;
    while (index < points.length) {
      if (points[index]!.ele > points[peak]!.ele) peak = index;
      if (points[peak]!.ele - points[index]!.ele > 30) break;
      index++;
    }
    const gain = points[peak]!.ele - points[start]!.ele;
    const distance = distances[peak]! - distances[start]!;
    // 서버 climb-category.ts: 거리 × 평균 경사(%) = 순 상승고도 × 100.
    const score = distance > 0 ? distance * (gain / distance * 100) : 0;
    const category = score >= 80000 ? 5 : score >= 64000 ? 4 : score >= 32000 ? 3 : score >= 16000 ? 2 : score >= 8000 ? 1 : 0;
    if (gain >= 20 && category > 0) climbs.push({start, end: peak, gain: Math.round(gain), category});
    index = peak + 1;
  }
  return climbs;
}

export function readGpxCoursePlan(xml: string, fileName: string): CoursePlan {
  const {track, parts, waypoints, name} = readCourseTrackData(xml, fileName);
  let hash = 2166136261;
  for (let index = 0; index < xml.length; index++) hash = Math.imul(hash ^ xml.charCodeAt(index), 16777619);
  const prefix = `local-gpx-${(hash >>> 0).toString(16)}`;
  const segments: MeetingSegment[] = [];
  const allPoints: TrackPoint[] = [];
  const distances: number[] = [];
  const warnings: string[] = [];
  let offset = 0;
  let climbCount = 0;
  let omittedClimbs = 0;
  parts.forEach((part, partIndex) => {
    const cumulative = cumulativeDistances(part.points);
    allPoints.push(...part.points);
    distances.push(...cumulative.map(distance => offset + distance));
    offset += cumulative[cumulative.length - 1] ?? 0;
    const distance = part.stats.distanceM;
    segments.push({id: `${prefix}-route${partIndex + 1}`, name: `${name} · 주행 구간 ${partIndex + 1}`, distance, ...(part.hasElevation ? {elevationGain: part.stats.elevationGainM, averageGrade: distance > 0 ? (part.points[part.points.length - 1]!.ele - part.points[0]!.ele) / distance * 100 : 0} : {}), source: 'gpx', segmentKind: 'route', geometry: geometry(part.points, part.hasElevation), mode: '함께', instruction: ''});
    if (!part.hasElevation) return;
    for (const climb of climbRanges(part.points, cumulative)) {
      if (climbCount >= 50) { omittedClimbs++; continue; }
      climbCount++;
      const climbDistance = cumulative[climb.end]! - cumulative[climb.start]!;
      segments.push({id: `${prefix}-climb${climbCount}`, name: `${name} · 오르막 ${climbCount}`, distance: Math.round(climbDistance), elevationGain: climb.gain, averageGrade: climb.gain / climbDistance * 100, climbCategory: climb.category, source: 'gpx', segmentKind: 'climb', geometry: geometry(part.points.slice(climb.start, climb.end + 1), true), mode: '현장 협의', instruction: ''});
    }
  });
  const first = allPoints[0]!;
  const last = allPoints[allPoints.length - 1]!;
  const checkpoints: CourseCheckpoint[] = [{name: '출발', lat: first.lat, lon: first.lon, distanceKm: 0, source: 'gpx'}];
  const resolved = resolveWaypointsOnTrack(waypoints, allPoints, distances);
  for (const [index, item] of resolved.slice(0, 98).entries()) {
    checkpoints.push({name: (item.waypoint.name?.trim() || `체크포인트 ${index + 1}`).slice(0, 300), type: item.waypoint.type, lat: item.waypoint.lat, lon: item.waypoint.lon, distanceKm: item.distanceFromStartM / 1000, offTrackM: item.offTrackM, source: 'gpx'});
  }
  checkpoints.push({name: '도착', lat: last.lat, lon: last.lon, distanceKm: track.distanceKm, source: 'gpx'});
  if (waypoints.length > 98) warnings.push('GPX 체크포인트가 많아 출발·도착을 포함한 첫 100개만 가져왔습니다.');
  if (omittedClimbs) warnings.push(`오르막 구간은 첫 50개만 생성했습니다. 나머지 ${omittedClimbs}개는 전체 주행 경로에 포함됩니다.`);
  if (track.elevationGainM === undefined) warnings.push('고도 정보가 부족한 트랙은 획득고도와 오르막 구간을 추정하지 않습니다.');
  return {source: {kind: 'gpx', id: prefix, name}, distanceKm: track.distanceKm, elevationGainM: track.elevationGainM, checkpoints, track, segments, warnings};
}
