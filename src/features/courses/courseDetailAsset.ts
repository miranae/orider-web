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
async function trackPayload(url: string, version: string, services: FirebaseServices, signal: AbortSignal): Promise<DocumentData> {
  // 캐시는 공개 파일만 보관한다. 재사용 전에 호출자가 현재 코스 메타데이터의 접근 권한을 확인한다.
  const cache = typeof caches === "undefined" ? null : await caches.open(CACHE_NAME).catch(() => null);
  const existing = await cache?.match(url).catch(() => undefined);
  if (existing) {
    try { return await checkedPayload(existing, version); }
    catch { await cache?.delete(url).catch(() => false); }
  }
  const headers: Record<string, string> = {};
  const token = await services.auth.currentUser?.getIdToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const appCheck = await services.getAppCheckToken();
  if (appCheck) headers["X-Firebase-AppCheck"] = appCheck;
  const response = await fetch(url, { headers, signal });
  const value = await checkedPayload(response.clone(), version);
  if (cache && !signal.aborted) {
    await cache.put(url, response).catch(() => undefined);
    const keys = await cache.keys().catch(() => []);
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_CACHE_ENTRIES))) await cache.delete(key).catch(() => false);
  }
  return value;
}

/** 파일 포인터가 있는 신규 코스는 메타데이터만 갱신한다. 기존 코스는 SDK 실시간 경로를 유지한다. */
export function subscribeCourseDetail(services: FirebaseServices, id: string,
  onData: (data: DocumentData | null) => void, onError: (error: Error) => void): () => void {
  const controller = new AbortController();
  const user = services.auth.currentUser;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastVersion: string | undefined;
  let lastTrack: DocumentData | undefined;
  let legacyStop: (() => void) | undefined;
  const current = () => !controller.signal.aborted && services.auth.currentUser === user;
  const legacy = () => {
    if (!current() || legacyStop) return;
    legacyStop = onSnapshot(doc(services.firestore, "courses", id), (snapshot) => {
      if (current()) onData(snapshot.exists() ? { ...snapshot.data(), id } : null);
    }, (error) => { if (current()) { onData(null); onError(error); } });
  };
  const refresh = async () => {
    if (!current()) return;
    try {
      const headers: Record<string, string> = {};
      const token = await user?.getIdToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const appCheck = await services.getAppCheckToken();
      if (appCheck) headers["X-Firebase-AppCheck"] = appCheck;
      const response = await fetch(courseMetadataUrl(services.firestore, id), { headers, signal: controller.signal, cache: "no-store" });
      if (!current()) return;
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
        track = lastVersion === version && lastTrack ? lastTrack : await trackPayload(url, version, services, controller.signal);
        lastVersion = version; lastTrack = track;
      }
      catch (error) {
        if (!current()) return;
        logClientError("CourseDetail.assetFallback", error, { courseId: id });
        // 게시 지연·브라우저 캐시 API 미지원에서도 현재 코스는 열리게 한다.
        const snapshot = await getDoc(doc(services.firestore, "courses", id));
        if (!current()) return;
        if (!snapshot.exists()) { onData(null); return; }
        const latest = snapshot.data();
        if (latest.deletedAt != null || latest.hidden === true) { onData(null); return; }
        if (!Array.isArray(latest.elevationProfile)) throw error;
        onData({ ...latest, id });
        timer = setTimeout(() => void refresh(), 30_000);
        return;
      }
      if (current()) {
        onData({ ...metadata, elevationProfile: track.elevationProfile, altitudeSemantics: track.altitudeSemantics, id });
        timer = setTimeout(() => { if (document.visibilityState === "visible") void refresh(); else timer = setTimeout(() => void refresh(), 30_000); }, 30_000);
      }
    } catch (error) {
      if (current()) {
        onData(null); onError(error instanceof Error ? error : new Error(String(error)));
        timer = setTimeout(() => void refresh(), 30_000);
      }
    }
  };
  void refresh();
  return () => { controller.abort(); if (timer) clearTimeout(timer); legacyStop?.(); };
}
