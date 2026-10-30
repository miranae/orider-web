import { getDocs, limit } from "firebase/firestore";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { activityFeedSourceRevision, boundedFeedContent, localActivityFeedContentUrl, loadLocalActivityFeedContent, loadActivityFeedComments, resolveActivityMemo } from "./activityFeedContent";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { withStoredSummary } from "../__tests__/fixtures/activityDefaultSummary";

describe("bounded feed content", () => {
  it("only enables the explicit local read adapter on DEV loopback", () => {
    expect(localActivityFeedContentUrl(true, "127.0.0.1", "/api/local/activity-feed-content")).toBe("/api/local/activity-feed-content");
    expect(localActivityFeedContentUrl(false, "localhost", "/api/local/activity-feed-content")).toBeNull();
    expect(localActivityFeedContentUrl(true, "orider.co.kr", "/api/local/activity-feed-content")).toBeNull();
    expect(localActivityFeedContentUrl(true, "localhost", "https://example.com")).toBeNull();
  });
  it("bounds real previews and excludes unsafe URLs without deriving paths", () => {
    const result = boundedFeedContent({ version: 1, sourceRevision: "source", revision: "revision", memo: "실제 본문", totalPhotoCount: 10,
      photos: [{ id: "unsafe", url: "javascript:alert(1)" }, ...Array.from({ length: 6 }, (_, id) => ({ id: String(id), url: `https://example.com/${id}.jpg` }))] });
    expect(result?.photos.map(photo => photo.id)).toEqual(["0", "1", "2", "3", "4"]);
    expect(result?.memo).toBe("실제 본문");
    expect(result?.totalPhotoCount).toBe(10);
    expect(boundedFeedContent({ memo: "title is not content" })).toBeNull();
  });
  it("changes the projection fence when the current activity revision changes", () => {
    const activity = createMockActivity({ contentRevision: 1 });
    expect(activityFeedSourceRevision(activity)).not.toBe(activityFeedSourceRevision({ ...activity, contentRevision: 2 }));
  });
});

describe("operating feed comments", () => {
  it("does not call a local adapter from a production build even when configured", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ACTIVITY_FEED_CONTENT_PREVIEW_URL", "/api/local/activity-feed-content");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      expect(await loadLocalActivityFeedContent({} as FirebaseServices, "activity", new AbortController().signal)).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); fetchSpy.mockRestore(); }
  });
  it("reads at most nine protected candidates and exposes only three visible valid comments", async () => {
    const viewer = { uid: "viewer", isAnonymous: false };
    const services = { auth: { currentUser: viewer }, firestore: {} } as FirebaseServices;
    const comment = { userId: "rider", nickname: "라이더", profileImage: null, text: "실제 댓글", createdAt: Date.now(), deletedAt: null };
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [
      { id: "hidden", data: () => ({ ...comment, hiddenByOwner: true }) },
      { id: "deleted", data: () => ({ ...comment, deletedAt: 1 }) },
      ...[0, 1, 2, 3].map(id => ({ id: String(id), data: () => comment })),
    ] } as never);
    const result = await loadActivityFeedComments(services, "viewer", "activity", new AbortController().signal);
    expect(result.map(row => row.id)).toEqual(["0", "1", "2"]);
    expect(limit).toHaveBeenCalledWith(9);
  });
  it("skips guests and discards a completed read if the Firebase viewer changed", async () => {
    const services = { auth: { currentUser: null }, firestore: {} } as FirebaseServices;
    const before = vi.mocked(getDocs).mock.calls.length;
    expect(await loadActivityFeedComments(services, "viewer", "activity", new AbortController().signal)).toEqual([]);
    expect(vi.mocked(getDocs).mock.calls.length).toBe(before);
    const viewer = { uid: "viewer", isAnonymous: false };
    services.auth.currentUser = viewer as never;
    vi.mocked(getDocs).mockImplementationOnce(async () => {
      services.auth.currentUser = { uid: "next" } as never;
      return { docs: [] } as never;
    });
    await expect(loadActivityFeedComments(services, "viewer", "activity", new AbortController().signal)).rejects.toThrow("account_changed");
  });
});

it("preserves ordered video metadata and falls back to a photo when video metadata is unsafe", () => {
  const projection = { version: 1, sourceRevision: "source", revision: "revision", totalPhotoCount: 3, photos: [
    { id: "movie", url: "https://example.test/poster.jpg", caption: null, kind: "video", videoUrl: "https://example.test/master.m3u8", durationSeconds: 21 },
    { id: "photo", url: "https://example.test/photo.jpg", caption: null },
    { id: "invalid", url: "https://example.test/poster2.jpg", caption: null, kind: "video", videoUrl: "javascript:alert(1)", durationSeconds: -2 },
  ] };
  const result = boundedFeedContent(projection)!;
  expect(result.photos.map(item => item.id)).toEqual(["movie", "photo", "invalid"]);
  expect(result.photos[0]).toMatchObject({ kind: "video", videoUrl: "https://example.test/master.m3u8", durationSeconds: 21 });
  expect(result.photos[1]).not.toHaveProperty("kind");
  expect(result.photos[2]).not.toHaveProperty("videoUrl");
  for (const videoUrl of ["https://user:password@example.test/master.m3u8", "https://example.test/" + "a".repeat(8192), "https://", "http://example.test/master.m3u8"]) {
    const invalid = boundedFeedContent({ ...projection, photos: [{ ...projection.photos[0], videoUrl }] })!;
    expect(invalid.photos[0]).not.toHaveProperty("videoUrl");
    expect(invalid.photos[0]).not.toHaveProperty("kind");
  }
});


describe("stored summary wire validation", () => {
  it("chooses the requested stored language and accepts later formatter versions without a frontend rollout", () => {
    const activity = withStoredSummary(createMockActivity({ source: "strava" }), "한국어", "English");
    expect(resolveActivityMemo(activity, "ko")?.memo).toBe("한국어");
    expect(resolveActivityMemo(activity, "en")?.memo).toBe("English");
    expect(resolveActivityMemo({ ...activity, defaultSummaryV1: { ...activity.defaultSummaryV1!, formatterVersion: "strava-share-v30" } }, "ko")?.memo).toBe("한국어");
  });
  it("ignores malformed, unbound or incomplete stored summary fields", () => {
    const activity = withStoredSummary(createMockActivity({ source: "strava" }));
    for (const patch of [{ version: 2 }, { formatterVersion: "" }, { inputDigest: "invalid" }, { sourceRevision: "stale" },
      { text: { en: "English only" } }, { text: { ko: " " } }, { text: { ko: "x".repeat(3501) } }]) {
      const invalid = { ...activity, defaultSummaryV1: { ...activity.defaultSummaryV1, ...patch } } as unknown as typeof activity;
      expect(resolveActivityMemo(invalid, "ko")).toBeNull();
    }
  });
});

it("preserves bounded photo-count uncertainty rather than inventing an exact total", () => {
  expect(boundedFeedContent({ version: 1, revision: "revision", sourceRevision: "source", memo: null,
    photos: [], totalPhotoCount: 6, totalPhotoCountExact: false })?.totalPhotoCountExact).toBe(false);
});

it("keeps protected photo references but never reuses legacy Storage bearer URLs", () => {
  const nativePhoto = { activityId: "ride", photoId: "photo" };
  const result = boundedFeedContent({ version: 1, revision: "revision", sourceRevision: "source", totalPhotoCount: 3,
    photos: [{ id: "photo", url: "https://example.com/ignored", nativePhoto },
      { id: "legacy", url: "https://firebasestorage.googleapis.com/v0/b/demo/o/activity_photos%2Fowner%2Fride%2Flegacy.webp?token=old" },
      { id: "invalid", url: "https://example.com/%invalid" }] });
  expect(result?.photos).toEqual([{ id: "photo", url: "", nativePhoto, caption: null }]);
});
