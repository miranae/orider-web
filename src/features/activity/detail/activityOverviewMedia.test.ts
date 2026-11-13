import { expect, it } from "vitest";
import { activityOverviewMedia } from "./activityOverviewMedia";

it("retains authorized HLS metadata when streams only carry the poster and preserves photo locations", () => {
  const result = activityOverviewMedia([{ id: "clip", url: "https://image.test/clip.jpg", caption: null, location: [37, 127] }], [
    { id: "clip", url: "https://image.test/clip.jpg", caption: null, kind: "video", videoUrl: "https://video.test/clip.m3u8", durationSeconds: 21 },
    { id: "photo", url: "https://image.test/photo.jpg", caption: null },
  ]);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({ id: "strava-clip", kind: "video", videoUrl: "https://video.test/clip.m3u8", durationSeconds: 21, location: [37, 127] });
  expect(result[1]).toMatchObject({ id: "strava-photo" });
});

it("keeps ordinary stream photos and published-only galleries usable", () => {
  expect(activityOverviewMedia([{ id: "photo", url: "https://image.test/photo.jpg", caption: null, location: null }])[0]?.id).toBe("strava-photo");
  expect(activityOverviewMedia([], [{ id: "clip", url: "https://image.test/clip.jpg", caption: null, kind: "video", videoUrl: "https://video.test/clip.m3u8" }])[0]?.kind).toBe("video");
});
