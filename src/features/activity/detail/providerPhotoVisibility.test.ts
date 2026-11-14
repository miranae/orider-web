import { describe, expect, it } from "vitest";
import { effectiveHiddenProviderIds, hiddenProviderPhotoIds, providerPhotoIdOf, stravaOverviewPhotoTotal, withoutHiddenProviderPhotos, withoutHiddenStreamPhotos } from "./providerPhotoVisibility";

describe("Strava 사진 숨김", () => {
  it("주인이 찍힌 v1 값만 인정한다", () => {
    expect(hiddenProviderPhotoIds({ userId: "me", hiddenProviderPhotosV1: { version: 1, userId: "me", ids: ["a", "b", 3, "x/y"] } })).toEqual(["a", "b"]);
    expect(hiddenProviderPhotoIds({ userId: "me", hiddenProviderPhotosV1: { version: 1, userId: "other", ids: ["a"] } })).toEqual([]);
    expect(hiddenProviderPhotoIds({ userId: "me" })).toEqual([]);
  });
  it("Strava 사진만 Strava id 로 본다 — O-Rider 로 올린 사진은 제외", () => {
    expect(providerPhotoIdOf({ id: "strava-123" })).toBe("123");
    expect(providerPhotoIdOf({ id: "strava-123", nativePhoto: { activityId: "a", photoId: "p" } })).toBeNull();
    expect(providerPhotoIdOf({ id: "upload-p", uploadId: "p" })).toBeNull();
  });
  it("숨긴 Strava 사진만 빼고 내가 올린 사진은 남긴다", () => {
    const photos = [{ id: "strava-1" }, { id: "strava-2" }, { id: "upload-p", uploadId: "p", nativePhoto: { activityId: "a", photoId: "p" } }];
    expect(withoutHiddenProviderPhotos(photos, ["1"]).map(p => p.id)).toEqual(["strava-2", "upload-p"]);
  });
  it("총수는 숨긴 Strava 사진을 빼고 올린 사진을 더한다(중복 없이)", () => {
    expect(stravaOverviewPhotoTotal({ overviewCount: 3, streamPhotoIds: ["1", "2", "3"], stravaPhotoCount: 4, hiddenIds: ["1"], uploadedCount: 2, publishedTotal: 5 })).toBe(5);
    // 활동 문서에 Strava 사진 수가 없으면 서버 합계를 하한으로 쓴다
    expect(stravaOverviewPhotoTotal({ overviewCount: 1, streamPhotoIds: [], stravaPhotoCount: undefined, hiddenIds: [], uploadedCount: 0, publishedTotal: 9 })).toBe(9);
    // 올린 사진 목록을 못 읽은 공개 열람은 서버 합계를 쓴다
    expect(stravaOverviewPhotoTotal({ overviewCount: 2, streamPhotoIds: [], stravaPhotoCount: 4, hiddenIds: [], uploadedCount: null, publishedTotal: 6 })).toBe(6);
  });
  it("저장 직후 값은 문서가 그대로일 때만 쓰고, 문서가 바뀌면(다른 탭 복원 포함) 문서를 따른다", () => {
    const override = { activityId: "a", uid: "me", base: "[]", ids: ["1"] };
    expect(effectiveHiddenProviderIds([], override, "a", "me")).toEqual(["1"]);
    expect(effectiveHiddenProviderIds(["1"], override, "a", "me")).toEqual(["1"]);
    // 문서가 저장 당시와 달라지면 문서를 따른다(화면은 이때 임시 값을 지워 되돌아와도 다시 쓰지 않는다)
    expect(effectiveHiddenProviderIds(["2"], override, "a", "me")).toEqual(["2"]);
    expect(effectiveHiddenProviderIds([], override, "b", "me")).toEqual([]);
    expect(effectiveHiddenProviderIds([], override, "a", "other")).toEqual([]);
  });
  it("저장 직후(서버 합계가 아직 옛 값)에는 합계를 하한으로 쓰지 않아 숨긴 사진 수가 바로 빠진다", () => {
    expect(stravaOverviewPhotoTotal({ overviewCount: 0, streamPhotoIds: ["1"], stravaPhotoCount: 1, hiddenIds: ["1"], uploadedCount: 0, publishedTotal: undefined })).toBe(0);
  });
  it("지도용 스트림 사진에서도 숨긴 Strava 사진을 뺀다", () => {
    expect(withoutHiddenStreamPhotos([{ id: 1 }, { id: "2" }, { id: 3 }], ["1", "3"])).toEqual([{ id: "2" }]);
  });
});
