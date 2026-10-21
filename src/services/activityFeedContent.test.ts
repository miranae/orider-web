import { getDocs, limit } from "firebase/firestore";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { activityFeedSourceRevision, boundedFeedContent, localActivityFeedContentUrl, loadLocalActivityFeedContent, loadActivityFeedComments } from "./activityFeedContent";
import { createMockActivity } from "../__tests__/fixtures/mockData";

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
