import {
  blobToBase64,
  copyCanonicalMapThumbnailCanvas,
  createCanonicalMapThumbnailBlob,
  getCanonicalMapThumbnailCrop,
  getCanonicalMapThumbnailFileName,
  getPolylineHash,
  isCanonicalMapThumbnailUrl,
  isAppCheckRetryable,
  isMapThumbnailCoordinatorRetryable,
  invokeMapThumbnailCoordinatorWithRetry,
  MAP_THUMBNAIL_HEIGHT,
  MAP_THUMBNAIL_PIXEL_RATIO,
  MAP_THUMBNAIL_VIEWPORT_HEIGHT,
  MAP_THUMBNAIL_VIEWPORT_WIDTH,
  MAP_THUMBNAIL_WIDTH,
  shouldReportMapCaptureError,
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
    expect(MAP_THUMBNAIL_PIXEL_RATIO).toBe(2);
    expect(MAP_THUMBNAIL_WIDTH).toBe(MAP_THUMBNAIL_VIEWPORT_WIDTH * MAP_THUMBNAIL_PIXEL_RATIO);
    expect(MAP_THUMBNAIL_HEIGHT).toBe(MAP_THUMBNAIL_VIEWPORT_HEIGHT * MAP_THUMBNAIL_PIXEL_RATIO);
  });

  it.each([
    { width: 2560, height: 914, sourceX: 0, sourceY: 0 },
    { width: 2562, height: 914, sourceX: 1, sourceY: 0 },
    { width: 2560, height: 916, sourceX: 0, sourceY: 1 },
    { width: 2562, height: 916, sourceX: 1, sourceY: 1 },
  ])("normalizes only DPR layout rounding: $width×$height", ({ width, height, sourceX, sourceY }) => {
    expect(getCanonicalMapThumbnailCrop(width, height)).toEqual({
      sourceX,
      sourceY,
      sourceWidth: MAP_THUMBNAIL_WIDTH,
      sourceHeight: MAP_THUMBNAIL_HEIGHT,
    });
  });

  it.each([
    { width: 2559, height: 914, error: "canvas-too-small" },
    { width: 2560, height: 913, error: "canvas-too-small" },
    { width: 2561, height: 914, error: "canvas-size-invalid" },
    { width: 2560, height: 915, error: "canvas-size-invalid" },
    { width: 2564, height: 914, error: "canvas-size-invalid" },
    { width: 2560, height: 918, error: "canvas-size-invalid" },
  ])("rejects noncanonical canvas geometry: $width×$height", ({ width, height, error }) => {
    expect(() => getCanonicalMapThumbnailCrop(width, height)).toThrow(error);
  });

  it("center-crops Samsung Internet backing rounding into the exact canonical output", () => {
    const input = document.createElement("canvas");
    input.width = 2560;
    input.height = 916;
    const output = document.createElement("canvas");
    const drawImage = vi.fn();
    vi.spyOn(output, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const createElement = vi.spyOn(document, "createElement").mockReturnValueOnce(output);

    expect(copyCanonicalMapThumbnailCanvas(input)).toBe(output);
    expect(output.width).toBe(2560);
    expect(output.height).toBe(914);
    expect(drawImage).toHaveBeenCalledWith(input, 0, 1, 2560, 914, 0, 0, 2560, 914);
    createElement.mockRestore();
  });

  it("retries only App Check-related callable failures", () => {
    expect(isAppCheckRetryable({ code: "functions/unauthenticated" })).toBe(true);
    expect(isAppCheckRetryable(new Error("App Check token rejected"))).toBe(true);
    expect(isAppCheckRetryable({ code: "functions/permission-denied" })).toBe(false);
  });

  it.each([
    "functions/internal",
    "functions/unavailable",
    "functions/deadline-exceeded",
  ])("retries one transient coordinator failure: %s", async (code) => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ code })
      .mockResolvedValueOnce("ok");

    await expect(invokeMapThumbnailCoordinatorWithRetry(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenNthCalledWith(1, false);
    expect(operation).toHaveBeenNthCalledWith(2, true);
  });

  it("stops after the bounded transient retry", async () => {
    const error = { code: "functions/internal" };
    const operation = vi.fn().mockRejectedValue(error);

    await expect(invokeMapThumbnailCoordinatorWithRetry(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it.each([
    "functions/permission-denied",
    "functions/failed-precondition",
    "functions/not-found",
  ])("does not retry an expected coordinator refusal: %s", async (code) => {
    const error = { code };
    const operation = vi.fn().mockRejectedValue(error);

    expect(isMapThumbnailCoordinatorRetryable(error)).toBe(false);
    await expect(invokeMapThumbnailCoordinatorWithRetry(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
  });

  it("encodes a bounded WebP blob without a data URL prefix", async () => {
    expect(await blobToBase64(new Blob([new Uint8Array([0, 1, 2, 3, 255])], { type: "image/webp" })))
      .toBe("AAECA/8=");
    await expect(blobToBase64(new Blob([new Uint8Array(1024 * 1024)])))
      .rejects.toThrow("map-thumbnail/blob-too-large");
  });

  it.each([
    { code: "functions/permission-denied" },
    { code: "functions/failed-precondition" },
    { code: "functions/not-found" },
    { code: "permission-denied" },
    new Error("functions/permission-denied"),
    new Error("functions/failed-precondition: visibility changed"),
    new Error("functions/not-found: activity deleted"),
    new Error("map-thumbnail/stale-prepare"),
    new Error("map-thumbnail/webp-unsupported"),
  ])("does not report expected capture refusal: %o", (error) => {
    expect(shouldReportMapCaptureError(error)).toBe(false);
  });

  it.each([
    { code: "functions/internal" },
    { code: "functions/unavailable" },
    new Error("network timeout"),
    new Error("map-thumbnail/webp-encode-failed"),
  ])("reports unexpected capture failures: %o", (error) => {
    expect(shouldReportMapCaptureError(error)).toBe(true);
  });

  it("stops after the first non-WebP encoder fallback", async () => {
    const toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    });

    await expect(createCanonicalMapThumbnailBlob({ toBlob } as unknown as HTMLCanvasElement))
      .rejects.toThrow("map-thumbnail/webp-unsupported");
    expect(toBlob).toHaveBeenCalledOnce();
  });
});
