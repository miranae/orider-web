import { describe, expect, it, vi } from "vitest";

// 전역 테스트 셋업이 firebase/firestore 를 가짜로 바꾼다 — 값 변환은 실제 Timestamp·GeoPoint·Bytes 로 확인한다.
vi.unmock("firebase/firestore");
import { Bytes, GeoPoint, Timestamp, type Firestore } from "firebase/firestore";
import type { Auth } from "firebase/auth";
import {
  COURSE_LIST_FIELDS,
  CourseListRequestError,
  buildCourseListQueryBody,
  decodeRestFields,
  decodeRestValue,
  runCourseListQuery,
  runQueryUrl,
} from "./courseListRest";

const firestore = (settings?: { host: string; ssl: boolean }, database = "(default)") => ({
  app: { options: { projectId: "proj" } },
  toJSON: () => ({ settings, databaseId: { projectId: "proj", database } }),
}) as unknown as Firestore;

describe("REST 값 변환", () => {
  it("SDK doc.data() 와 같은 JS 값으로 바꾼다", () => {
    const data = decodeRestFields({
      n: { nullValue: null },
      b: { booleanValue: false },
      i: { integerValue: "1790995839013" },
      d: { doubleValue: 36.78 },
      nan: { doubleValue: "NaN" },
      inf: { doubleValue: "-Infinity" },
      s: { stringValue: "코스" },
      t: { timestampValue: "2026-10-03T02:50:40.070159Z" },
      t0: { timestampValue: "2026-10-03T02:50:40Z" },
      g: { geoPointValue: { latitude: 37.5, longitude: 127 } },
      by: { bytesValue: "AQI=" },
      r: { referenceValue: "projects/p/databases/(default)/documents/users/u1" },
      a: { arrayValue: { values: [{ integerValue: "1" }, { mapValue: { fields: { gain: { integerValue: "89" }, cat: { integerValue: "1" } } } }] } },
      emptyArray: { arrayValue: {} },
      emptyMap: { mapValue: {} },
    });
    expect(data.n).toBeNull();
    expect(data.b).toBe(false);
    expect(data.i).toBe(1790995839013);
    expect(data.d).toBe(36.78);
    expect(Number.isNaN(data.nan)).toBe(true);
    expect(data.inf).toBe(Number.NEGATIVE_INFINITY);
    expect(data.s).toBe("코스");
    expect(data.t).toEqual(new Timestamp(Date.parse("2026-10-03T02:50:40Z") / 1000, 70159000));
    expect((data.t0 as Timestamp).nanoseconds).toBe(0);
    expect((data.g as GeoPoint).isEqual(new GeoPoint(37.5, 127))).toBe(true);
    expect((data.by as Bytes).toUint8Array()).toEqual(new Uint8Array([1, 2]));
    expect(data.r).toBe("users/u1");
    expect(data.a).toEqual([1, { gain: 89, cat: 1 }]);
    expect(data.emptyArray).toEqual([]);
    expect(data.emptyMap).toEqual({});
    expect(decodeRestValue(undefined)).toBeUndefined();
  });
});

describe("runQuery 요청 본문", () => {
  it("목록 필드만 select 하고 정렬·__name__ 보조 정렬·limit 을 적는다", () => {
    const { structuredQuery } = buildCourseListQueryBody({ orderField: "createdAt", direction: "DESCENDING", limit: 20 });
    expect(structuredQuery.select).toEqual({ fields: COURSE_LIST_FIELDS.map((fieldPath) => ({ fieldPath })) });
    expect(COURSE_LIST_FIELDS).not.toContain("trackPoints");
    expect(COURSE_LIST_FIELDS).not.toContain("elevationProfile");
    expect(COURSE_LIST_FIELDS).toEqual(expect.arrayContaining(["polyline", "deletedAt", "hidden", "creatorId", "createdAt", "likeCount"]));
    expect(structuredQuery.from).toEqual([{ collectionId: "courses" }]);
    expect(structuredQuery.orderBy).toEqual([
      { field: { fieldPath: "createdAt" }, direction: "DESCENDING" },
      { field: { fieldPath: "__name__" }, direction: "DESCENDING" },
    ]);
    expect(structuredQuery.limit).toBe(20);
    expect(structuredQuery.where).toBeUndefined();
    expect(structuredQuery.startAt).toBeUndefined();
  });

  it("작성자 필터 하나는 단일 fieldFilter, 커서는 startAt before:false 로 보낸다", () => {
    const cursor = { values: [{ integerValue: "5" }, { referenceValue: "projects/proj/databases/(default)/documents/courses/c1" }] };
    const { structuredQuery } = buildCourseListQueryBody({ orderField: "likeCount", direction: "DESCENDING", limit: 4, creatorId: "u1", cursor });
    expect(structuredQuery.where).toEqual({ fieldFilter: { field: { fieldPath: "creatorId" }, op: "EQUAL", value: { stringValue: "u1" } } });
    expect(structuredQuery.startAt).toEqual({ values: cursor.values, before: false });
  });
});

describe("runQuery 호출", () => {
  it("에뮬레이터 연결이면 그 호스트(http)로, 아니면 운영 엔드포인트로 보낸다", () => {
    expect(runQueryUrl(firestore({ host: "localhost:8080", ssl: false }))).toBe("http://localhost:8080/v1/projects/proj/databases/(default)/documents:runQuery");
    expect(runQueryUrl(firestore())).toBe("https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents:runQuery");
  });

  it("로그인 사용자는 ID 토큰을 붙이고, 문서·커서를 돌려준다", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([
      { document: { name: "projects/proj/databases/(default)/documents/courses/a", fields: { createdAt: { integerValue: "9" } } } },
      { document: { name: "projects/proj/databases/(default)/documents/courses/b", fields: { createdAt: { integerValue: "8" } } } },
      { readTime: "2026-11-06T00:00:00Z" },
    ]), { status: 200 }));
    const auth = { currentUser: { getIdToken: async () => "id-token" } } as unknown as Auth;
    const page = await runCourseListQuery({ firestore: firestore(), auth }, { orderField: "createdAt", direction: "DESCENDING", limit: 20 }, fetchImpl);
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
    expect(page.docs).toEqual([{ id: "a", data: { createdAt: 9 } }, { id: "b", data: { createdAt: 8 } }]);
    expect(page.rawCount).toBe(2);
    expect(page.cursor).toEqual({ values: [{ integerValue: "8" }, { referenceValue: "projects/proj/databases/(default)/documents/courses/b" }] });
  });

  it("빈 결과(readTime 만)면 커서가 없다", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ readTime: "x" }]), { status: 200 }));
    const page = await runCourseListQuery({ firestore: firestore() }, { orderField: "createdAt", direction: "DESCENDING", limit: 20 }, fetchImpl);
    expect(page).toEqual({ docs: [], rawCount: 0, cursor: null });
  });

  it("401/403 이면 App Check 토큰을 붙여 한 번만 다시 시도한다", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "app check" } }), { status: 403 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));
    const getAppCheckToken = vi.fn(async () => "ac-token");
    await runCourseListQuery({ firestore: firestore(), getAppCheckToken }, { orderField: "createdAt", direction: "DESCENDING", limit: 20 }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(((fetchImpl.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>)["X-Firebase-AppCheck"]).toBe("ac-token");
  });

  it("HTTP 오류·스트림 오류는 CourseListRequestError 로 던진다", async () => {
    const httpError = vi.fn(async () => new Response(JSON.stringify({ error: { message: "missing index" } }), { status: 400 }));
    await expect(runCourseListQuery({ firestore: firestore() }, { orderField: "name", direction: "ASCENDING", limit: 20 }, httpError))
      .rejects.toMatchObject({ status: 400, message: "course-list/http-400: missing index" });
    const streamError = vi.fn(async () => new Response(JSON.stringify([{ error: { code: 9, message: "failed" } }]), { status: 200 }));
    await expect(runCourseListQuery({ firestore: firestore() }, { orderField: "name", direction: "ASCENDING", limit: 20 }, streamError))
      .rejects.toBeInstanceOf(CourseListRequestError);
  });
});
