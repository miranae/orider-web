import {
  blobToBase64,
  getCanonicalMapThumbnailFileName,
  getPolylineHash,
  isCanonicalMapThumbnailUrl,
  isAppCheckRetryable,
  MAP_THUMBNAIL_VIEWPORT_HEIGHT,
  MAP_THUMBNAIL_VIEWPORT_WIDTH,
} from "./ActivityRouteThumbnail";

describe("canonical activity map thumbnails", () => {
  const activityId = "activity-123";
  const userId = "owner-456";
  const storageBucket = "orider";
  const track = "37.5665,126.9780;37.5670,126.9790";
  const fileName = "activity-123.route-v2-fcfef7dfc9b21144.webp";
  const encodedPath = encodeURIComponent(`map_thumbnails/${userId}/${fileName}`);

  it("matches the backend SHA-256 known vector and trims the polyline", async () => {
    const expectedHash = "fcfef7dfc9b21144c954be9193a1c8edd7251b56314ceeff9c0fbe36b1449340";
    expect(await getPolylineHash(track)).toBe(expectedHash);
    expect(await getPolylineHash(`  ${track}  `)).toBe(expectedHash);
    expect(await getCanonicalMapThumbnailFileName(activityId, track)).toBe(fileName);
  });

  it.each([
    `https://firebasestorage.googleapis.com/v0/b/orider/o/${encodedPath}?alt=media&token=test`,
    `https://firebasestorage.googleapis.com:443/v0/b/orider/o/${encodedPath}?alt=media`,
  ])("accepts only the exact canonical Firebase Storage object: %s", (url) => {
    expect(isCanonicalMapThumbnailUrl(url, userId, fileName, storageBucket)).toBe(true);
  });

  it.each([
    `http://firebasestorage.googleapis.com/v0/b/orider/o/${encodedPath}`,
    `https://firebasestorage.googleapis.com:444/v0/b/orider/o/${encodedPath}`,
    `https://firebasestorage.googleapis.com.evil.example/v0/b/orider/o/${encodedPath}`,
    `https://evil.example/v0/b/orider/o/${encodedPath}`,
    `https://firebasestorage.googleapis.com/v0/b/another-bucket/o/${encodedPath}`,
    `https://firebasestorage.googleapis.com/not-v0/b/orider/o/${encodedPath}`,
    `https://firebasestorage.googleapis.com/v0/b/orider/o/${encodeURIComponent(`map_thumbnails/another-owner/${fileName}`)}`,
    `https://firebasestorage.googleapis.com/v0/b/orider/o/${encodeURIComponent(`map_thumbnails/${userId}/${activityId}.webp`)}`,
    `https://firebasestorage.googleapis.com/v0/b/orider/o/${encodeURIComponent(`map_thumbnails/${userId}/${activityId}.route-v2-deadbeefdeadbeef.webp`)}`,
    "not a URL firebasestorage.googleapis.com",
    "",
  ])("rejects a noncanonical thumbnail URL: %s", (url) => {
    expect(isCanonicalMapThumbnailUrl(url, userId, fileName, storageBucket)).toBe(false);
  });

  it("rejects missing URL values", () => {
    expect(isCanonicalMapThumbnailUrl(null, userId, fileName, storageBucket)).toBe(false);
    expect(isCanonicalMapThumbnailUrl(undefined, userId, fileName, storageBucket)).toBe(false);
    expect(isCanonicalMapThumbnailUrl(`https://firebasestorage.googleapis.com/v0/b/orider/o/${encodedPath}`, userId, fileName, undefined)).toBe(false);
  });

  it("uses one fixed logical viewport on every device", () => {
    expect(MAP_THUMBNAIL_VIEWPORT_WIDTH).toBe(1280);
    expect(MAP_THUMBNAIL_VIEWPORT_HEIGHT).toBe(457);
  });

  it("retries only App Check-related callable failures", () => {
    expect(isAppCheckRetryable({ code: "functions/unauthenticated" })).toBe(true);
    expect(isAppCheckRetryable(new Error("App Check token rejected"))).toBe(true);
    expect(isAppCheckRetryable({ code: "functions/permission-denied" })).toBe(false);
  });

  it("encodes a bounded WebP blob without a data URL prefix", async () => {
    expect(await blobToBase64(new Blob([new Uint8Array([0, 1, 2, 3, 255])], { type: "image/webp" })))
      .toBe("AAECA/8=");
    await expect(blobToBase64(new Blob([new Uint8Array(1024 * 1024)])))
      .rejects.toThrow("map-thumbnail/blob-too-large");
  });
});
