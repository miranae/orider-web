import type { FirebaseServices } from "../../contexts/FirebaseServicesContext";
import { SEARCH_PAGE_SIZE } from "../../constants/pagination";
import { readStoredElevationProfile } from './segmentCatalog';
import { decodePolyline } from '../../utils/polyline';
import { cumulativeDistances } from '../courseEngine/geo';
import type { CourseCheckpoint, CoursePoint, CourseTrack } from './domain';
import type { CoursePlan } from './meetingCoursePlan';
import type { CourseListCursor } from '../courses/courseListRest';

export type SavedCourseChoice = {
  id: string;
  name: string;
  description?: string;
  distanceKm?: number;
  elevationGainM?: number;
  checkpoints: CourseCheckpoint[];
  track?: CourseTrack;
  segmentIds?: string[];
};
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const coordinate = (lat: unknown, lon: unknown): boolean => finite(lat) && finite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** 공개 코스의 필요한 필드만 가져온다. 고저차로 누적 획고를 추정하지 않는다. */
export function parseSavedCourse(id: string, data: Record<string, unknown>): SavedCourseChoice | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || data.deletedAt != null || data.hidden === true || data.visibility !== 'public' || typeof data.name !== 'string' || !data.name.trim()) return null;
  const name = data.name.trim().slice(0, 300);
  const distanceKm = nonnegative(data.distance) ? data.distance / 1000 : undefined;
  const elevationGainM = nonnegative(data.elevationGain) ? data.elevationGain : undefined;
  const checkpoints: CourseCheckpoint[] = Array.isArray(data.waypoints) ? data.waypoints.slice(0, 100).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const value = item as Record<string, unknown>;
    if (!coordinate(value.latitude, value.longitude)) return [];
    return [{ name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 300) : `체크포인트 ${index + 1}`, type: typeof value.type === 'string' ? value.type.slice(0, 100) : undefined, note: typeof value.note === 'string' ? value.note.slice(0, 1000) : undefined, lat: value.latitude as number, lon: value.longitude as number, distanceKm: nonnegative(value.distanceFromStartMeters) ? value.distanceFromStartMeters / 1000 : undefined, source: 'course' as const }];
  }).sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)) : [];
  let points: CoursePoint[] = [];
  if (Array.isArray(data.trackPoints)) {
    const raw = data.trackPoints;
    const stride = Math.max(1, Math.ceil(raw.length / 1800));
    points = raw.flatMap((point, index) => {
      if (index % stride !== 0 && index !== raw.length - 1) return [];
      if (!point || typeof point !== 'object') return [];
      const value = point as Record<string, unknown>;
      if (!coordinate(value.lat, value.lon)) return [];
      return [{ lat: value.lat as number, lon: value.lon as number, ...(finite(value.alt) ? { ele: value.alt } : {}) }];
    });
  }
  if (points.length < 2 && typeof data.polyline === 'string' && data.polyline.length <= 200_000) {
    try {
      const decoded = decodePolyline(data.polyline, 20_000);
      const stride = Math.max(1, Math.ceil(decoded.length / 1800));
      points = decoded.flatMap(([lat, lon], index) => (index % stride === 0 || index === decoded.length - 1) && coordinate(lat, lon) ? [{lat, lon}] : []);
    } catch { points = []; }
  }
  const elevationProfile = readStoredElevationProfile(Array.isArray(data.elevationProfile) ? data.elevationProfile.map(point => point && typeof point === 'object' ? { distance: point.d, elevation: point.e } : point) : undefined);
  const distances = cumulativeDistances(points);
  const measuredDistance = (distances[distances.length - 1] ?? 0) / 1000;
  const track: CourseTrack | undefined = points.length > 1 ? { fileName: name, points, segmentStarts: [0], distanceKm: distanceKm ?? measuredDistance, elevationGainM, elevationProfile } : undefined;
  return { id, name, description: typeof data.description === 'string' ? data.description.slice(0, 5000) : undefined, distanceKm, elevationGainM, checkpoints, track, segmentIds: Array.isArray(data.segmentIds) ? data.segmentIds.filter((value): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)).slice(0, 50) : undefined };
}

/**
 * 목록이 쓰는 필드만(#1545). 코스 문서의 trackPoints·elevationProfile·polyline 은 목록 20건에 수십 MB 라
 * 받지 않는다 — 경로는 주최자가 고른 코스 하나만 `loadSavedCourse` 로 읽는다.
 */
export const COURSE_CATALOG_FIELDS = ['name', 'description', 'distance', 'elevationGain', 'waypoints', 'segmentIds', 'visibility', 'deletedAt', 'hidden'] as const;

let readiness: Promise<void> | undefined;
async function catalogServices(injected?: FirebaseServices) {
  if (injected) return injected;
  // eslint-disable-next-line design-system/no-firebase-singleton-in-embed -- 일반 웹 fallback만 초기화한다. 임베드 CoursePreparation은 services를 주입한다.
  const services = await import('../../services/firebase');
  readiness ??= (async () => { if (!services.getFirebaseApp()) await services.initFirebase(); })().catch(error => { readiness = undefined; throw error; });
  await readiness;
  return { firestore: services.firestore, auth: services.auth, getAppCheckToken: services.getAppCheckToken };
}

/** 기존 코스 목록과 같은 공개 읽기(공개·미삭제, 문서 이름 순). 서버 rules를 그대로 적용하며 데이터를 쓰지 않는다. */
export async function loadCourseCatalogPage(cursor: CourseListCursor | null = null, injected?: FirebaseServices) {
  const { runCourseListQuery } = await import('../courses/courseListRest');
  const page = await runCourseListQuery(await catalogServices(injected), {
    orderField: '__name__', direction: 'ASCENDING', limit: SEARCH_PAGE_SIZE, cursor,
    fields: COURSE_CATALOG_FIELDS,
    equals: [['visibility', { stringValue: 'public' }], ['deletedAt', { nullValue: null }]],
  });
  const items = page.docs.flatMap(document => {
    const course = parseSavedCourse(document.id, document.data);
    return course ? [course] : [];
  });
  return { items, cursor: page.cursor, hasMore: page.rawCount === SEARCH_PAGE_SIZE };
}

/** 고른 코스 하나의 경로까지 읽는다(상세와 같은 트랙 파일·캐시). 지금은 가져올 수 없는 코스면 null. */
export async function loadSavedCourse(id: string, injected?: FirebaseServices): Promise<SavedCourseChoice | null> {
  const { loadCourseSource } = await import('../courses/courseDetailAsset');
  const data = await loadCourseSource(await catalogServices(injected), id);
  return data ? parseSavedCourse(id, data) : null;
}

export async function loadCourseCatalog(): Promise<SavedCourseChoice[]> { return (await loadCourseCatalogPage()).items; }

export function toCoursePlan(course: SavedCourseChoice): CoursePlan {
  return { source: { kind: 'saved-course', id: course.id, name: course.name, importedAt: Date.now() }, distanceKm: course.distanceKm, elevationGainM: course.elevationGainM, checkpoints: structuredClone(course.checkpoints), track: course.track ? structuredClone(course.track) : undefined, segments: [] };
}
