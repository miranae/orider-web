import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../../contexts/FirebaseServicesContext";
import { COURSE_DETAIL_FIELDS, courseAssetUrl, courseMetadataUrl, subscribeCourseDetail } from "./courseDetailAsset";
const sdk = vi.hoisted(() => ({ getDoc: vi.fn(), onSnapshot: vi.fn(), doc: vi.fn() }));
vi.mock("firebase/firestore", () => sdk);
const body = JSON.stringify({ schemaVersion: 1, trackPoints: [{ lat: 37, lon: 127 }, { lat: 38, lon: 128 }], elevationProfile: [{ d: 0, e: 1 }] });
const hash = async (value: string) => Array.from(new Uint8Array(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (n) => n.toString(16).padStart(2, "0")).join("");
function services(): FirebaseServices {
  return { auth: { currentUser: null }, firestore: { app: { options: { projectId: "project", storageBucket: "bucket" } }, toJSON: () => ({}) }, getAppCheckToken: vi.fn(async () => null) } as unknown as FirebaseServices;
}
const fields = (revision: string) => ({ fields: {
  name: { stringValue: "코스" }, trackVersion: { stringValue: revision }, trackAsset: { mapValue: { fields: {
    schemaVersion: { integerValue: "1" }, trackVersion: { stringValue: revision }, storagePath: { stringValue: `course-tracks/course/${revision}.json` }, byteLength: { integerValue: String(body.length) },
  } } },
} });
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("caches", undefined); sdk.onSnapshot.mockReturnValue(vi.fn()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("코스 상세 정적 트랙", () => {
  it("상세 메타데이터가 원본 트랙과 고도를 제외한다", () => {
    const url = courseMetadataUrl(services().firestore, "course");
    expect(url).toContain("mask.fieldPaths=trackAsset");
    expect(COURSE_DETAIL_FIELDS).not.toContain("trackPoints");
    expect(COURSE_DETAIL_FIELDS).not.toContain("elevationProfile");
    expect(() => courseMetadataUrl(services().firestore, "../bad")).toThrow();
  });
  it("앱 버킷과 내용 주소만 허용하고 비공개 포인터는 쓰지 않는다", async () => {
    const revision = await hash(body);
    const metadata = { trackVersion: revision, trackAsset: { schemaVersion: 1, trackVersion: revision, storagePath: `course-tracks/course/${revision}.json`, byteLength: body.length, downloadUrl: "https://evil.test" } };
    expect(courseAssetUrl(services().firestore, "course", metadata)).toContain("/b/bucket/o/");
    expect(courseAssetUrl(services().firestore, "course", { ...metadata, visibility: "private" })).toBeNull();
    expect(courseAssetUrl(services().firestore, "different", metadata)).toBeNull();
  });
  it("신규 코스는 파일을 검증하고 메타데이터만 갱신한다", async () => {
    const revision = await hash(body);
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(fields(revision))))
      .mockResolvedValueOnce(new Response(body)).mockResolvedValue(new Response(JSON.stringify(fields(revision))));
    vi.stubGlobal("fetch", fetcher);
    vi.useFakeTimers();
    const onData = vi.fn(); const onError = vi.fn();
    const stop = subscribeCourseDetail(services(), "course", onData, onError);
    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
    expect(onData.mock.calls[0][0]).toMatchObject({ id: "course", elevationProfile: [{ d: 0, e: 1 }] });
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sdk.getDoc).not.toHaveBeenCalled(); expect(sdk.onSnapshot).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
    stop(); await vi.advanceTimersByTimeAsync(60_000); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("웹뷰 재생성 뒤에도 검증된 공개 파일을 디스크 캐시에서 재사용한다", async () => {
    const revision = await hash(body);
    const responses = new Map<string, Response>();
    vi.stubGlobal("caches", { open: vi.fn(async () => ({
      match: async (url: string) => responses.get(url)?.clone(),
      put: async (url: string, response: Response) => { responses.set(url, response.clone()); },
      keys: async () => [...responses.keys()].map((url) => new Request(url)),
      delete: async (url: string) => responses.delete(url),
    })) });
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(fields(revision))))
      .mockResolvedValueOnce(new Response(body)).mockResolvedValueOnce(new Response(JSON.stringify(fields(revision))));
    vi.stubGlobal("fetch", fetcher);
    const service = services(); const first = vi.fn();
    const stopFirst = subscribeCourseDetail(service, "course", first, vi.fn());
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1)); stopFirst();
    const second = vi.fn(); const stopSecond = subscribeCourseDetail(service, "course", second, vi.fn());
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1)); stopSecond();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(responses.size).toBe(1);
  });
  it("백필하지 않은 문서는 기존 실시간 조회로 열고 종료 시 해제한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ fields: { name: { stringValue: "기존 코스" } } }))));
    const unsubscribe = vi.fn(); sdk.onSnapshot.mockReturnValue(unsubscribe);
    const stop = subscribeCourseDetail(services(), "course", vi.fn(), vi.fn());
    await vi.waitFor(() => expect(sdk.onSnapshot).toHaveBeenCalledTimes(1));
    stop(); expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("손상 파일은 재사용하지 않고 호환 문서를 읽는다", async () => {
    const revision = await hash(body);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(fields(revision)))).mockResolvedValueOnce(new Response(body + " ")));
    sdk.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: "최신 코스", elevationProfile: [] }) });
    const onData = vi.fn(); const stop = subscribeCourseDetail(services(), "course", onData, vi.fn());
    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
    expect(sdk.getDoc).toHaveBeenCalledTimes(1); expect(onData.mock.calls[0][0].name).toBe("최신 코스"); stop();
  });
  it("종료나 계정 전환 전 응답은 게시하지 않는다", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const onData = vi.fn(); const stop = subscribeCourseDetail(services(), "course", onData, vi.fn());
    await vi.waitFor(() => expect(resolve).toBeDefined()); stop();
    resolve(new Response(JSON.stringify({ fields: {} }))); await Promise.resolve(); await Promise.resolve();
    expect(onData).not.toHaveBeenCalled();
  });
});
