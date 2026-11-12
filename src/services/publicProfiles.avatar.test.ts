import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDoc, type Firestore } from "firebase/firestore";
import { getPublicUserAvatarProfiles, getPublicUserProfile } from "./publicProfiles";

const db = () => ({} as Firestore);
const missing = { exists: () => false } as Awaited<ReturnType<typeof getDoc>>;
const profile = (photoURL: string | null) => ({ exists: () => true, id: "rider", data: () => ({ nickname: "rider", photoURL }) }) as Awaited<ReturnType<typeof getDoc>>;
describe("social avatar request budget", () => {
  beforeEach(() => { vi.mocked(getDoc).mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); });
  it("coalesces 20 cards with the same three missing avatars into three SDK point requests", async () => {
    const database = db(), auth = {}, viewer = {};
    const releases: Array<(value: Awaited<ReturnType<typeof getDoc>>) => void> = [];
    vi.mocked(getDoc).mockImplementation(() => new Promise(resolve => releases.push(resolve)));
    const cards = Array.from({ length: 20 }, () => getPublicUserAvatarProfiles(["a", "b", "c"], database, auth, viewer));
    expect(getDoc).toHaveBeenCalledTimes(3);
    releases.forEach(resolve => resolve(missing));
    expect((await Promise.all(cards)).every(result => result.size === 0)).toBe(true);
    await getPublicUserAvatarProfiles(["a", "b", "c"], database, auth, viewer);
    expect(getDoc).toHaveBeenCalledTimes(3);
  });
  it("caches avatar absence, not positive profiles, and keeps direct profile lookups fresh", async () => {
    const database = db(), auth = {}, viewer = {};
    vi.mocked(getDoc).mockResolvedValue(profile(null));
    await getPublicUserAvatarProfiles(["no-photo"], database, auth, viewer);
    await getPublicUserAvatarProfiles(["no-photo"], database, auth, viewer);
    expect(getDoc).toHaveBeenCalledTimes(1);
    vi.mocked(getDoc).mockResolvedValue(profile("fresh"));
    expect((await getPublicUserProfile("no-photo", database))?.photoURL).toBe("fresh");
    await getPublicUserAvatarProfiles(["positive"], database, auth, viewer);
    vi.mocked(getDoc).mockResolvedValue(profile("newer"));
    expect((await getPublicUserAvatarProfiles(["positive"], database, auth, viewer)).get("positive")?.photoURL).toBe("newer");
    expect(getDoc).toHaveBeenCalledTimes(4);
  });
  it("invalidates negative sessions on viewer, auth and database changes, including the same UID signing in again", async () => {
    const database = db(), auth = {}, viewer = { uid: "a" };
    vi.mocked(getDoc).mockResolvedValue(missing);
    await getPublicUserAvatarProfiles(["u"], database, auth, viewer);
    await getPublicUserAvatarProfiles(["u"], database, auth, { uid: "b" });
    await getPublicUserAvatarProfiles(["u"], database, auth, { uid: "a" });
    await getPublicUserAvatarProfiles(["u"], database, {}, viewer);
    await getPublicUserAvatarProfiles(["u"], db(), auth, viewer);
    expect(getDoc).toHaveBeenCalledTimes(5);
  });
  it("does not retain permission/network failures as missing avatars and bounds negative entries", async () => {
    const database = db(), auth = {}, viewer = {};
    vi.mocked(getDoc).mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    expect((await getPublicUserAvatarProfiles(["u"], database, auth, viewer)).size).toBe(0);
    vi.mocked(getDoc).mockRejectedValueOnce(new Error("offline"));
    await expect(getPublicUserAvatarProfiles(["u"], database, auth, viewer)).rejects.toThrow("offline");
    vi.mocked(getDoc).mockResolvedValue(missing);
    await getPublicUserAvatarProfiles(["u"], database, auth, viewer);
    expect(getDoc).toHaveBeenCalledTimes(3);
    await getPublicUserAvatarProfiles(Array.from({ length: 256 }, (_, i) => `other-${i}`), database, auth, viewer);
    await getPublicUserAvatarProfiles(["u"], database, auth, viewer);
    expect(getDoc).toHaveBeenCalledTimes(260);
  });
  it("rechecks a missing avatar after demand expiry without scheduling background reads", async () => {
    const database = db(), auth = {}, viewer = {};
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    vi.mocked(getDoc).mockResolvedValueOnce(missing);
    await getPublicUserAvatarProfiles(["new-owner"], database, auth, viewer);
    clock.mockReturnValue(60_999);
    await getPublicUserAvatarProfiles(["new-owner"], database, auth, viewer);
    expect(getDoc).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(61_000);
    vi.mocked(getDoc).mockResolvedValue(profile("created-later"));
    expect(getDoc).toHaveBeenCalledTimes(1);
    const cards = await Promise.all(Array.from({ length: 20 }, () => getPublicUserAvatarProfiles(["new-owner"], database, auth, viewer)));
    expect(getDoc).toHaveBeenCalledTimes(2);
    expect(cards.every(result => result.get("new-owner")?.photoURL === "created-later")).toBe(true);
  });

});
