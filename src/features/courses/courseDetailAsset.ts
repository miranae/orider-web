import { getDoc, doc, onSnapshot, type Firestore, type DocumentData } from "firebase/firestore";
import { logClientError } from "../../services/errorLogger";
import type { FirebaseServices } from "../../contexts/FirebaseServicesContext";

// 목록과 상세는 별도 계약이다. 상세 표시 필드는 유지하고 무거운 원본만 정적 파일에서 받는다.
export const COURSE_DETAIL_FIELDS = [
  "name", "description", "creatorId", "creatorNickname", "creatorProfileImage", "source", "polyline",
  "distance", "elevationGain", "averageGrade", "maximumGrade", "elevationHigh", "elevationLow", "waypoints",
  "climbs", "photos", "regions", "likeCount", "viewCount", "createdAt", "updatedAt", "deletedAt", "hidden",
  "segmentIds", "segmentNames", "tags", "autoTags", "distanceBand", "elevationBand", "difficultyBand",
  "bikeLaneRatioStatus", "visibility", "curated", "trackVersion", "trackAsset",
];
const MAX_BYTES = 16 * 1024 * 1024;
const CACHE_NAME = "orider-public-course-tracks-v1";
const MAX_CACHE_ENTRIES = 8;
const HASH = /^[a-f0-9]{64}$/;
type Value = { nullValue?: unknown; stringValue?: string; timestampValue?: string; booleanValue?: boolean;
  integerValue?: string; doubleValue?: number; arrayValue?: { values?: Value[] }; mapValue?: { fields?: Record<string, Value> } };
function decode(value: Value): unknown {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return Date.parse(value.timestampValue!);
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(decode);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key, child]) => [key, decode(child)]));
  throw new Error("지원하지 않는 코스 필드 형식");
}
export function courseMetadataUrl(firestore: Firestore, id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("잘못된 코스 식별자");
  const project = firestore.app.options.projectId;
  if (!project) throw new Error("코스 프로젝트 설정 없음");
  const settings = (firestore.toJSON() as { settings?: { host?: string; ssl?: boolean } }).settings;
  const origin = settings?.host ? `${settings.ssl === false ? "http" : "https"}://${settings.host}` : "https://firestore.googleapis.com";
  const query = new URLSearchParams(COURSE_DETAIL_FIELDS.map((field) => ["mask.fieldPaths", field]));
  return `${origin}/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/courses/${id}?${query}`;
}
export function courseAssetUrl(firestore: Firestore, id: string, metadata: DocumentData): string | null {
  const version: unknown = metadata.trackVersion;
  const asset = metadata.trackAsset as Record<string, unknown> | undefined;
  const bucket = firestore.app.options.storageBucket;
  if (!bucket || typeof version !== "string" || !HASH.test(version) || !asset || asset.schemaVersion !== 1 ||
      asset.trackVersion !== version || asset.storagePath !== `course-tracks/${id}/${version}.json` ||
      typeof asset.byteLength !== "number" || asset.byteLength <= 0 || asset.byteLength > MAX_BYTES ||
      metadata.deletedAt != null || metadata.hidden === true || (metadata.visibility ?? "public") !== "public") return null;
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(String(asset.storagePath))}?alt=media`;
}
async function checkedPayload(response: Response, version: string): Promise<DocumentData> {
  if (!response.ok) throw new Error(`코스 트랙 조회 실패 (${response.status})`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("코스 트랙 크기 초과");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new Error("코스 트랙 크기 초과");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  if (hash !== version) throw new Error("코스 트랙 버전 불일치");
  const value = JSON.parse(new TextDecoder().decode(bytes)) as DocumentData;
  if (value.schemaVersion !== 1 || !Array.isArray(value.trackPoints) || value.trackPoints.length < 2 || !Array.isArray(value.elevationProfile)) {
    throw new Error("코스 트랙 응답 오류");
  }
  return value;
}
async function cacheIO<T>(stage: string, fallback: T, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { logClientError("CourseDetail.cacheIO", error, { stage }); return fallback; }
}
async function courseFetch(url: string, services: FirebaseServices, signal: AbortSignal, metadata = false): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = await services.auth.currentUser?.getIdToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let response = await fetch(url, { headers, signal, ...(metadata ? { cache: "no-store" as const } : {}) });
  if (response.status === 401 || response.status === 403) {
    const appCheck = await services.getAppCheckToken();
    if (appCheck) {
      headers["X-Firebase-AppCheck"] = appCheck;
      response = await fetch(url, { headers, signal, ...(metadata ? { cache: "no-store" as const } : {}) });
    }
  }
  return response;
}
async function trackPayload(url: string, version: string, services: FirebaseServices, signal: AbortSignal): Promise<DocumentData> {
  // 공개 파일만 저장한다. 호출자는 현재 메타데이터의 접근 권한을 먼저 확인한다.
  const cache = typeof caches === "undefined" ? null : await cacheIO("open", null as Cache | null, () => caches.open(CACHE_NAME));
  const existing = cache ? await cacheIO("read", undefined as Response | undefined, () => cache.match(url)) : undefined;
  if (existing) {
    try { return await checkedPayload(existing, version); }
    catch (error) {
      logClientError("CourseDetail.cacheValidation", error, { version });
      if (cache) await cacheIO("delete_corrupt", false, () => cache.delete(url));
    }
  }
  const response = await courseFetch(url, services, signal);
  const value = await checkedPayload(response.clone(), version);
  if (cache && !signal.aborted) {
    await cacheIO("write", undefined, () => cache.put(url, response));
    const keys = await cacheIO("list", [] as readonly Request[], () => cache.keys());
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_CACHE_ENTRIES))) await cacheIO("prune", false, () => cache.delete(key));
  }
  return value;
}

/** 작은 서버 변경 신호를 구독하고 메타데이터만 다시 읽는다. 기존 코스는 SDK 구독으로 호환한다. */
export function subscribeCourseDetail(services: FirebaseServices, id: string,
  onData: (data: DocumentData | null) => void, onError: (error: Error) => void): () => void {
  const user = services.auth.currentUser;
  let disposed = false;
  let generation = 0;
  let request: AbortController | undefined;
  let lastVersion: string | undefined;
  let lastTrack: DocumentData | undefined;
  let legacyStop: (() => void) | undefined;
  const current = () => !disposed && services.auth.currentUser === user;
  const legacy = () => {
    if (!current() || legacyStop) return;
    legacyStop = onSnapshot(doc(services.firestore, "courses", id), (snapshot) => {
      if (current()) onData(snapshot.exists() ? { ...snapshot.data(), id } : null);
    }, (error) => {
      if (current()) { logClientError("CourseDetail.legacyRead", error, { courseId: id }); onData(null); onError(error); }
    });
  };
  const refresh = async () => {
    if (!current()) return;
    const ticket = ++generation;
    request?.abort(); request = new AbortController();
    const signal = request.signal;
    const active = () => current() && ticket === generation;
    try {
      const response = await courseFetch(courseMetadataUrl(services.firestore, id), services, signal, true);
      if (!active()) return;
      if (response.status === 404) { onData(null); return; }
      if (!response.ok) throw new Error(`코스 메타데이터 조회 실패 (${response.status})`);
      const wire = await response.json() as { fields?: Record<string, Value> };
      if (!wire.fields) throw new Error("코스 메타데이터 없음");
      const metadata = Object.fromEntries(Object.entries(wire.fields).map(([key, value]) => [key, decode(value)]));
      const url = courseAssetUrl(services.firestore, id, metadata);
      if (!url) { legacy(); return; }
      let track: DocumentData;
      try {
        const version = String(metadata.trackVersion);
        track = lastVersion === version && lastTrack ? lastTrack : await trackPayload(url, version, services, signal);
        lastVersion = version; lastTrack = track;
      } catch (error) {
        if (!active()) return;
        logClientError("CourseDetail.assetFallback", error, { courseId: id });
        const snapshot = await getDoc(doc(services.firestore, "courses", id));
        if (!active()) return;
        if (!snapshot.exists()) { onData(null); return; }
        const latest = snapshot.data();
        if (latest.deletedAt != null || latest.hidden === true) { onData(null); return; }
        if (!Array.isArray(latest.elevationProfile)) throw error;
        onData({ ...latest, id }); return;
      }
      if (active()) onData({ ...metadata, elevationProfile: track.elevationProfile, altitudeSemantics: track.altitudeSemantics, id });
    } catch (error) {
      if (active()) {
        logClientError("CourseDetail.metadataRead", error, { courseId: id });
        onData(null); onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };
  const signalStop = onSnapshot(doc(services.firestore, "courses", id, "cache_metadata", "current"), (snapshot) => {
    if (!current()) return;
    if (!snapshot.exists()) {
      ++generation; request?.abort(); legacy(); return;
    }
    legacyStop?.(); legacyStop = undefined;
    void refresh();
  }, (error) => {
    if (!current()) return;
    logClientError("CourseDetail.signalFallback", error, { courseId: id });
    onData(null); ++generation; request?.abort(); legacy();
  });
  return () => { disposed = true; ++generation; request?.abort(); legacyStop?.(); signalStop(); };
}
