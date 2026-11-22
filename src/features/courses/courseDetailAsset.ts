import { getDoc, doc, onSnapshot, type Firestore, type DocumentData, type DocumentSnapshot } from "firebase/firestore";
import { logClientError } from "../../services/errorLogger";
import { followWorldSignal } from "../ride-world/followWorldSignal";
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
const COURSE_ID = /^[A-Za-z0-9_-]{1,128}$/;
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
  if (!COURSE_ID.test(id)) throw new Error("잘못된 코스 식별자");
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
  // 응답 버퍼를 뷰로 감싸 넘긴다 — 테스트 환경(jsdom)에서는 응답 ArrayBuffer 가 다른 realm 이라 digest 가 거부한다.
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
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
type CourseFetchServices = Pick<FirebaseServices, "auth" | "getAppCheckToken">;
async function courseFetch(url: string, services: CourseFetchServices, signal: AbortSignal, metadata = false): Promise<Response> {
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
async function trackPayload(url: string, version: string, services: CourseFetchServices, signal: AbortSignal): Promise<DocumentData> {
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

/**
 * 코스 하나의 원본을 한 번 읽는다(구독 없음). 상세와 같은 경로 — 경량 메타데이터 + 불변 트랙 파일(브라우저 캐시),
 * 트랙 파일이 없거나 읽지 못하면 그 문서 하나만 전체로 읽는다. 없는 코스는 null.
 */
export async function loadCourseSource(services: Pick<FirebaseServices, "auth" | "firestore" | "getAppCheckToken">,
  id: string, signal: AbortSignal = new AbortController().signal): Promise<DocumentData | null> {
  const full = async () => {
    const snapshot = await getDoc(doc(services.firestore, "courses", id));
    return snapshot.exists() ? { ...snapshot.data(), id } : null;
  };
  const response = await courseFetch(courseMetadataUrl(services.firestore, id), services, signal, true);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`코스 메타데이터 조회 실패 (${response.status})`);
  const wire = await response.json() as { fields?: Record<string, Value> };
  if (!wire.fields) return null;
  const metadata = Object.fromEntries(Object.entries(wire.fields).map(([key, value]) => [key, decode(value)]));
  const url = courseAssetUrl(services.firestore, id, metadata);
  if (!url) return full();
  try {
    const track = await trackPayload(url, String(metadata.trackVersion), services, signal);
    return { ...metadata, trackPoints: track.trackPoints, elevationProfile: track.elevationProfile, altitudeSemantics: track.altitudeSemantics, id };
  } catch (error) {
    if (signal.aborted) throw error;
    logClientError("CourseSource.assetFallback", error, { courseId: id });
    return full();
  }
}

/** 작은 서버 변경 신호를 구독하고 메타데이터만 다시 읽는다. 기존 코스는 SDK 구독으로 호환한다. */
export function subscribeCourseDetail(services: FirebaseServices, id: string,
  onData: (data: DocumentData | null) => void, onError: (error: Error) => void): () => void {
  if (!id || id.includes("/") || id === "." || id === "..") {
    const error = new Error("잘못된 코스 식별자");
    logClientError("CourseDetail.invalidId", error, undefined, services, services.auth?.currentUser ?? null);
    onData(null);
    onError(error);
    return () => {};
  }
  const user = services.auth.currentUser;
  let disposed = false;
  let generation = 0;
  let request: AbortController | undefined;
  let lastVersion: string | undefined;
  let lastTrack: DocumentData | undefined;
  let legacyStop: (() => void) | undefined;
  const worldEnabled = COURSE_ID.test(id) && import.meta.env.DEV && import.meta.env.VITE_ORIDER_LOCAL_WORLD === "1" &&
    import.meta.env.VITE_ORIDER_LOCAL_COURSE_REDIS === "1" && services.firestore.app.options.projectId === "demo-orider-lab";
  const current = () => !disposed && services.auth.currentUser === user;
  const legacy = (publicOnly = false) => {
    if (!current() || legacyStop) return;
    const source = doc(services.firestore, "courses", id);
    const next = (snapshot: DocumentSnapshot) => {
      if (!current() || (publicOnly && snapshot.metadata?.fromCache)) return;
      const data = snapshot.exists() ? snapshot.data() : undefined;
      if (publicOnly && (!data || data.deletedAt != null || data.hidden === true || (data.visibility ?? "public") !== "public")) {
        onData(null);
      } else onData(data ? { ...data, id } : null);
    };
    const failed = (error: Error) => {
      if (current()) { logClientError("CourseDetail.legacyRead", error, { courseId: id }, services, user); onData(null); onError(error); }
    };
    legacyStop = publicOnly ? onSnapshot(source, { includeMetadataChanges: true }, next, failed) : onSnapshot(source, next, failed);
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
      if (!active()) return;
      if (!wire.fields) throw new Error("코스 메타데이터 없음");
      const metadata = Object.fromEntries(Object.entries(wire.fields).map(([key, value]) => [key, decode(value)]));
      const url = courseAssetUrl(services.firestore, id, metadata);
      if (!url) { legacy(worldEnabled); return; }
      const version = String(metadata.trackVersion);
      // 현재 접근이 확인된 메타데이터부터 표시한다. 새 revision에는 이전 고도를 섞지 않는다.
      if (lastVersion !== version || !lastTrack) onData({ ...metadata, elevationProfile: undefined, id, trackLoadState: "loading" });
      let track: DocumentData;
      try {
        track = lastVersion === version && lastTrack ? lastTrack : await trackPayload(url, version, services, signal);
        if (!active()) return;
        lastVersion = version; lastTrack = track;
      } catch (error) {
        if (!active()) return;
        logClientError("CourseDetail.assetFallback", error, { courseId: id }, services, user);
        let snapshot;
        try { snapshot = await getDoc(doc(services.firestore, "courses", id)); }
        catch (fallbackError) {
          logClientError("CourseDetail.assetFallbackRead", fallbackError, { courseId: id }, services, user);
          if (!active()) return;
          const code = (fallbackError as { code?: string })?.code;
          if (code === "permission-denied" || code === "unauthenticated") throw fallbackError;
          onData({ ...metadata, elevationProfile: undefined, id, trackLoadState: "error" }); return;
        }
        if (!active()) return;
        if (snapshot.metadata?.fromCache) {
          const cached = snapshot.data();
          const isCurrentTrack = String(cached?.trackVersion) === version && cached?.hidden !== true && cached?.deletedAt == null && Array.isArray(cached?.elevationProfile);
          onData({ ...metadata, id, elevationProfile: isCurrentTrack ? cached?.elevationProfile : undefined,
            altitudeSemantics: isCurrentTrack ? cached?.altitudeSemantics : undefined,
            trackLoadState: isCurrentTrack ? "ready" : "error" });
          return;
        }
        if (!snapshot.exists()) { onData(null); return; }
        const latest = snapshot.data();
        if (latest.deletedAt != null || latest.hidden === true) { onData(null); return; }
        if (!Array.isArray(latest.elevationProfile)) {
          onData({ ...latest, elevationProfile: undefined, id, trackLoadState: "error" }); return;
        }
        onData({ ...latest, id, trackLoadState: "ready" }); return;
      }
      if (active()) onData({ ...metadata, elevationProfile: track.elevationProfile, altitudeSemantics: track.altitudeSemantics, id, trackLoadState: "ready" });
    } catch (error) {
      if (active()) {
        logClientError("CourseDetail.metadataRead", error, { courseId: id }, services, user);
        onData(null);
        if (worldEnabled) legacy(true);
        else onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };
  const startFirestore = () => {
    const source = doc(services.firestore, "courses", id, "cache_metadata", "current");
    const next = (snapshot: DocumentSnapshot) => {
      if (!current() || (worldEnabled && snapshot.metadata?.fromCache)) return;
      if (!snapshot.exists()) {
        ++generation; request?.abort(); legacy(worldEnabled); return;
      }
      legacyStop?.(); legacyStop = undefined;
      void refresh();
    };
    const failed = (error: Error) => {
      if (!current()) return;
      logClientError("CourseDetail.signalFallback", error, { courseId: id }, services, user);
      onData(null); ++generation; request?.abort(); legacy(worldEnabled);
    };
    return worldEnabled ? onSnapshot(source, { includeMetadataChanges: true }, next, failed) : onSnapshot(source, next, failed);
  };
  let stopFirestore: (() => void) | undefined;
  const restoreFirestore = () => {
    if (current() && !stopFirestore) stopFirestore = startFirestore();
  };
  if (COURSE_ID.test(id)) restoreFirestore();
  else legacy();
  const signalStop = worldEnabled
    ? followWorldSignal("ws://127.0.0.1:19487/course-signals",
        async () => ({ v: 1, type: "course_subscribe", courseId: id }),
        (data) => {
          if (!current()) return false;
          const frame = data as { v?: number; type?: string; revision?: string | null } | null;
          if (frame?.v !== 1 || frame.type !== "course_signal" ||
              (frame.revision !== null && (typeof frame.revision !== "string" || !/^\d{10}:\d{9}$/.test(frame.revision)))) return false;
          stopFirestore?.(); stopFirestore = undefined;
          legacyStop?.(); legacyStop = undefined;
          void refresh();
          return true;
        },
        () => {
          if (!current()) return;
          ++generation; request?.abort();
          legacyStop?.(); legacyStop = undefined;
          lastVersion = undefined; lastTrack = undefined;
          onData(null);
          restoreFirestore();
        },
        (source, error, context) => logClientError(source, error, context, services, user))
    : undefined;
  return () => {
    disposed = true; ++generation; request?.abort();
    stopFirestore?.(); legacyStop?.(); signalStop?.();
  };
}
