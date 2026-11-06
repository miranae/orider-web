import { Bytes, GeoPoint, Timestamp, type Firestore } from "firebase/firestore";
import type { Auth } from "firebase/auth";

/**
 * 코스 목록 전용 경량 조회(#3235).
 *
 * 코스 문서는 전체 `trackPoints`·`elevationProfile` 을 품고 있어, SDK `getDocs` 로 목록 첫 20건을
 * 받으면 23.7MB 가 내려왔다(trackPoints 가 94%). 목록·지도·필터는 아래 필드만 쓰므로 Firestore REST
 * `runQuery` 의 `select`(projection)로 필요한 필드만 받는다. SDK 웹 클라이언트에는 projection 이 없다.
 *
 * 필드 출처 — `courseFromSnapshotData`(courseSnapshot.ts) 가 읽는 CourseData 필드 전부와
 * `isVisibleCourseDocData`(courseVisibility.ts) 가 보는 `deletedAt`·`hidden`.
 * 상세 화면(CoursePage)은 자기 문서를 SDK 로 따로 읽어 전체 데이터를 받는다.
 */
export const COURSE_LIST_FIELDS = [
  "name",
  "polyline",
  "distance",
  "elevationGain",
  "climbs",
  "regions",
  "tags",
  "autoTags",
  "segmentNames",
  "distanceBand",
  "elevationBand",
  "difficultyBand",
  "bikeLaneRatioStatus",
  "likeCount",
  "createdAt",
  "surface",
  "difficulty",
  "startLat",
  "startLon",
  "visibility",
  "curated",
  "creatorId",
  "deletedAt",
  "hidden",
] as const;

/** Firestore REST 의 typed value(https://firebase.google.com/docs/firestore/reference/rest/v1/Value). */
export interface RestValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number | string;
  timestampValue?: string;
  stringValue?: string;
  bytesValue?: string;
  referenceValue?: string;
  geoPointValue?: { latitude?: number; longitude?: number };
  arrayValue?: { values?: RestValue[] };
  mapValue?: { fields?: Record<string, RestValue> };
}

function decodeDouble(value: number | string): number {
  if (typeof value === "number") return value;
  if (value === "NaN") return Number.NaN;
  if (value === "Infinity") return Number.POSITIVE_INFINITY;
  if (value === "-Infinity") return Number.NEGATIVE_INFINITY;
  return Number(value);
}

/** RFC3339 타임스탬프 → SDK 와 같은 Timestamp(나노초 보존). */
function decodeTimestamp(value: string): Timestamp {
  const match = /^(.*?)(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return Timestamp.fromMillis(Date.parse(value));
  const millis = Date.parse(`${match[1]}${match[3]}`);
  const nanos = match[2] ? Number(match[2].padEnd(9, "0")) : 0;
  return new Timestamp(Math.floor(millis / 1000), nanos);
}

/**
 * REST typed value → SDK `doc.data()` 와 같은 평범한 JS 값.
 * 정수는 number(SDK 기본값과 같다), 타임스탬프는 Timestamp, 좌표는 GeoPoint, 바이트는 Bytes.
 * 참조(referenceValue)는 SDK 에선 DocumentReference 지만 목록이 쓰지 않으므로 문서 경로 문자열로 둔다.
 */
export function decodeRestValue(value: RestValue | undefined): unknown {
  if (!value) return undefined;
  if ("nullValue" in value) return null;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return decodeDouble(value.doubleValue);
  if (value.timestampValue !== undefined) return decodeTimestamp(value.timestampValue);
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.bytesValue !== undefined) return Bytes.fromBase64String(value.bytesValue);
  if (value.referenceValue !== undefined) return value.referenceValue.replace(/^projects\/[^/]+\/databases\/[^/]+\/documents\//, "");
  if (value.geoPointValue !== undefined) return new GeoPoint(value.geoPointValue.latitude ?? 0, value.geoPointValue.longitude ?? 0);
  if (value.arrayValue !== undefined) return (value.arrayValue.values ?? []).map(decodeRestValue);
  if (value.mapValue !== undefined) return decodeRestFields(value.mapValue.fields);
  return undefined;
}

export function decodeRestFields(fields: Record<string, RestValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) out[key] = decodeRestValue(value);
  return out;
}

/** REST 커서 — 마지막 문서의 정렬 필드 값(원본 typed value)과 문서 경로. SDK startAfter(snapshot) 과 같다. */
export interface CourseListCursor {
  values: RestValue[];
}

export type CourseListDirection = "ASCENDING" | "DESCENDING";

export interface CourseListQuery {
  orderField: string;
  direction: CourseListDirection;
  limit: number;
  creatorId?: string;
  /** 이름 접두 검색. 있으면 `name >= text && name <= text + `. */
  namePrefix?: string;
  cursor?: CourseListCursor | null;
}

type RestFilter =
  | { fieldFilter: { field: { fieldPath: string }; op: string; value: RestValue } }
  | { compositeFilter: { op: "AND"; filters: RestFilter[] } };

function fieldFilter(fieldPath: string, op: string, value: RestValue): RestFilter {
  return { fieldFilter: { field: { fieldPath }, op, value } };
}

/** `runQuery` 요청 본문. 커서를 쓰려면 정렬에 `__name__` 을 명시해야 해서 SDK 의 암묵 정렬을 그대로 적는다. */
export function buildCourseListQueryBody(query: CourseListQuery): { structuredQuery: Record<string, unknown> } {
  const filters: RestFilter[] = [];
  if (query.creatorId) filters.push(fieldFilter("creatorId", "EQUAL", { stringValue: query.creatorId }));
  if (query.namePrefix) {
    filters.push(fieldFilter("name", "GREATER_THAN_OR_EQUAL", { stringValue: query.namePrefix }));
    filters.push(fieldFilter("name", "LESS_THAN_OR_EQUAL", { stringValue: `${query.namePrefix}` }));
  }
  const structuredQuery: Record<string, unknown> = {
    select: { fields: COURSE_LIST_FIELDS.map((fieldPath) => ({ fieldPath })) },
    from: [{ collectionId: "courses" }],
    orderBy: [
      { field: { fieldPath: query.orderField }, direction: query.direction },
      { field: { fieldPath: "__name__" }, direction: query.direction },
    ],
    limit: query.limit,
  };
  if (filters.length === 1) structuredQuery.where = filters[0];
  else if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: "AND", filters } };
  // before:false — 커서 문서 **다음**부터(SDK startAfter).
  if (query.cursor) structuredQuery.startAt = { values: query.cursor.values, before: false };
  return { structuredQuery };
}

/** 조회에 필요한 Firebase 묶음 — 임베드는 주입된 별도 app 의 인스턴스를 넘긴다(싱글턴 금지, #847). */
export interface CourseListServices {
  firestore: Firestore;
  auth?: Auth | null;
  getAppCheckToken?: (forceRefresh?: boolean) => Promise<string | null>;
}

export interface CourseListPage {
  docs: Array<{ id: string; data: Record<string, unknown> }>;
  /** 이번 응답이 돌려준 문서 수(가시성 필터 전). 페이지가 꽉 찼는지 판단한다. */
  rawCount: number;
  cursor: CourseListCursor | null;
}

export class CourseListRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "CourseListRequestError";
  }
}

interface FirestoreInstanceJson {
  settings?: { host?: string; ssl?: boolean };
  databaseId?: { database?: string };
}

/** 이 Firestore 인스턴스가 실제로 붙은 엔드포인트(에뮬레이터 포함)와 프로젝트·DB. */
export function runQueryUrl(firestore: Firestore): string {
  const json = (typeof firestore.toJSON === "function" ? firestore.toJSON() : {}) as FirestoreInstanceJson;
  const host = json.settings?.host || "firestore.googleapis.com";
  const scheme = json.settings?.ssl === false ? "http" : "https";
  const projectId = firestore.app.options.projectId;
  if (!projectId) throw new Error("course-list/missing-project-id");
  const database = json.databaseId?.database || "(default)";
  return `${scheme}://${host}/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(database)}/documents:runQuery`;
}

interface RunQueryResponseItem {
  document?: { name: string; fields?: Record<string, RestValue> };
  error?: { message?: string; status?: string; code?: number };
}

async function postRunQuery(url: string, body: unknown, headers: Record<string, string>, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

/**
 * 필드 projection 으로 코스 목록 한 페이지를 읽는다. 로그인 상태면 ID 토큰을 붙인다(SDK 와 같은 권한).
 * App Check 는 Firestore 에 강제되지 않아(2026-11-06 비로그인 REST 조회 200 확인) 먼저 붙이지 않고,
 * 401/403 이면 App Check 토큰을 받아 한 번만 다시 시도한다 — 강제가 켜져도 목록이 깨지지 않게.
 */
export async function runCourseListQuery(
  services: CourseListServices,
  query: CourseListQuery,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<CourseListPage> {
  const url = runQueryUrl(services.firestore);
  const body = buildCourseListQueryBody(query);
  const headers: Record<string, string> = {};
  const user = services.auth?.currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

  let response = await postRunQuery(url, body, headers, fetchImpl);
  if ((response.status === 401 || response.status === 403) && services.getAppCheckToken) {
    const appCheckToken = await services.getAppCheckToken().catch(() => null);
    if (appCheckToken) response = await postRunQuery(url, body, { ...headers, "X-Firebase-AppCheck": appCheckToken }, fetchImpl);
  }
  if (!response.ok) {
    let message = `course-list/http-${response.status}`;
    try {
      const payload = await response.json() as { error?: { message?: string } } | RunQueryResponseItem[];
      const detail = Array.isArray(payload) ? payload[0]?.error?.message : payload.error?.message;
      if (detail) message = `${message}: ${detail}`;
    } catch { /* 본문이 JSON 이 아니면 상태 코드만 남긴다 */ }
    throw new CourseListRequestError(response.status, message);
  }

  const items = await response.json() as RunQueryResponseItem[];
  const streamError = items.find((item) => item.error)?.error;
  if (streamError) throw new CourseListRequestError(streamError.code ?? 500, `course-list/stream-error: ${streamError.message ?? streamError.status ?? "unknown"}`);

  const documents = items.flatMap((item) => item.document ? [item.document] : []);
  const docs = documents.map((document) => ({
    id: document.name.slice(document.name.lastIndexOf("/") + 1),
    data: decodeRestFields(document.fields),
  }));
  const last = documents[documents.length - 1];
  const cursor = last
    ? { values: [last.fields?.[query.orderField] ?? { nullValue: null }, { referenceValue: last.name }] }
    : null;
  return { docs, rawCount: documents.length, cursor };
}
