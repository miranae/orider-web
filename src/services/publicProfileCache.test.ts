import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadPublicUserProfile, peekPublicUserProfile, resetPublicProfileCache } from "./publicProfileCache";
import { getPublicUserProfile } from "./publicProfiles";

vi.mock("./publicProfiles", () => ({
  getPublicUserProfile: vi.fn(),
}));

const profile = { id: "user-1", nickname: "심새롬", photoURL: null };

describe("publicProfileCache", () => {
  beforeEach(() => {
    resetPublicProfileCache();
    vi.mocked(getPublicUserProfile).mockReset();
  });

  it("사용자당 한 번만 읽는다 — 카드가 여러 장이어도 N+1 이 되지 않는다", async () => {
    vi.mocked(getPublicUserProfile).mockResolvedValue(profile);

    await loadPublicUserProfile("user-1");
    await loadPublicUserProfile("user-1");

    expect(getPublicUserProfile).toHaveBeenCalledTimes(1);
    expect(peekPublicUserProfile("user-1")).toEqual(profile);
  });

  it("동시 요청은 같은 in-flight 프로미스를 공유한다", async () => {
    vi.mocked(getPublicUserProfile).mockResolvedValue(profile);

    const [first, second] = await Promise.all([
      loadPublicUserProfile("user-1"),
      loadPublicUserProfile("user-1"),
    ]);

    expect(getPublicUserProfile).toHaveBeenCalledTimes(1);
    expect(first).toEqual(profile);
    expect(second).toEqual(profile);
  });

  it("권한 거부는 '없음' 으로 캐시한다 — 비공개 프로필에 재시도를 반복하지 않는다", async () => {
    vi.mocked(getPublicUserProfile).mockRejectedValue({ code: "permission-denied" });

    expect(await loadPublicUserProfile("user-2")).toBeNull();
    expect(await loadPublicUserProfile("user-2")).toBeNull();
    expect(getPublicUserProfile).toHaveBeenCalledTimes(1);
    expect(peekPublicUserProfile("user-2")).toBeNull();
  });

  it("조회 전에는 peek 가 undefined — '없음' 과 구분된다", () => {
    expect(peekPublicUserProfile("user-3")).toBeUndefined();
  });

  it("권한 외 오류는 삼키지 않고, 캐시에 남기지도 않는다", async () => {
    const boom = new Error("network");
    vi.mocked(getPublicUserProfile).mockRejectedValueOnce(boom);

    await expect(loadPublicUserProfile("user-4")).rejects.toBe(boom);
    expect(peekPublicUserProfile("user-4")).toBeUndefined();
  });
});
