import { describe, expect, it } from "vitest";
import { hiddenProviderPhotoIds, providerPhotoIdOf, stravaOverviewPhotoTotal, withoutHiddenProviderPhotos } from "./providerPhotoVisibility";

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
    expect(stravaOverviewPhotoTotal({ overviewCount: 3, streamPhotoIds: ["1", "2", "3"], stravaPhotoCount: 4, hiddenIds: ["1"], uploadedCount: 2, publishedTotal: 6 })).toBe(5);
    // 올린 사진 목록을 못 읽은 공개 열람은 서버 합계를 쓴다
    expect(stravaOverviewPhotoTotal({ overviewCount: 2, streamPhotoIds: [], stravaPhotoCount: 4, hiddenIds: [], uploadedCount: null, publishedTotal: 6 })).toBe(6);
  });
});
