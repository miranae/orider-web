import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityOverview } from "./activityOverview";

const mocks = vi.hoisted(() => ({ callable: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.callable }));
const services = () => ({ auth: { currentUser: { uid: "u1" } }, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) }) as unknown as FirebaseServices;

describe("activity overview read cache", () => {
  beforeEach(() => mocks.callable.mockReset().mockResolvedValue({ data: { status: "unavailable", activityId: "a", reason: "metrics_unavailable" } }));
  it("deduplicates identical pending requests but separates metric revisions", async () => {
    const firebase = services();
    const a = loadActivityOverview(firebase, "u1", "a", "ko", "r1");
    const b = loadActivityOverview(firebase, "u1", "a", "ko", "r1");
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(mocks.callable).toHaveBeenCalledTimes(1);
    await loadActivityOverview(firebase, "u1", "a", "ko", "r2");
    expect(mocks.callable).toHaveBeenCalledTimes(2);
  });
  it("checks ownership before reading and after a late response", async () => {
    const firebase = services();
    await expect(loadActivityOverview(firebase, "other", "a", "ko", "r")).rejects.toThrow("account_changed");
    let resolve!: (value: unknown) => void;
    mocks.callable.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = loadActivityOverview(firebase, "u1", "a", "ko", "r");
    await Promise.resolve();
    Object.assign(firebase.auth, { currentUser: { uid: "u2" } });
    resolve({ data: { activityId: "a" } });
    await expect(pending).rejects.toThrow("input_changed");
  });
  it("expires cache after 30 seconds and never retains rejected calls", async () => {
    const firebase = services();
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    await loadActivityOverview(firebase, "u1", "a", "en", "r");
    now.mockReturnValue(32_000);
    mocks.callable.mockRejectedValueOnce(new Error("offline"));
    await expect(loadActivityOverview(firebase, "u1", "a", "en", "r")).rejects.toThrow("offline");
    await loadActivityOverview(firebase, "u1", "a", "en", "r");
    expect(mocks.callable).toHaveBeenCalledTimes(3);
    now.mockRestore();
  });
});
