import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

// 직접 읽기 거부를 흉내 내려고 이 파일에서만 getDoc 을 교체한다.
const mocks = vi.hoisted(() => ({ getDoc: vi.fn(), withAuth: vi.fn(), anonymous: vi.fn() }));
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  getDoc: mocks.getDoc,
}));
vi.mock("../../../services/personalDataApi", () => ({
  getActivityStreams: mocks.anonymous,
  getActivityStreamsWithAuth: mocks.withAuth,
}));

import { loadCanonicalActivityStreams } from "./useActivityStreamsLoader";

const services = { auth: {} as Auth, firestore: {} as Firestore };
const denied = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });

describe("loadCanonicalActivityStreams fallback (orider-g1-web#3133)", () => {
  beforeEach(() => {
    mocks.getDoc.mockReset();
    mocks.withAuth.mockReset();
    mocks.anonymous.mockReset();
  });

  it("does not call the API when the direct read succeeds", async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ userId: "owner", json: JSON.stringify({ time: [0] }) }) });
    await expect(loadCanonicalActivityStreams("a1", "owner", services)).resolves.toEqual({ userId: "owner", time: [0] });
    expect(mocks.withAuth).not.toHaveBeenCalled();
  });

  it("loads through the authenticated API when the direct read is denied", async () => {
    mocks.getDoc.mockRejectedValue(denied());
    mocks.withAuth.mockResolvedValue({ time: [0, 1], cadence: [80, 81] });
    await expect(loadCanonicalActivityStreams("a2", "owner", services))
      .resolves.toEqual({ userId: "owner", time: [0, 1], cadence: [80, 81] });
    expect(mocks.withAuth).toHaveBeenCalledExactlyOnceWith(services.auth, "a2");
  });

  it("uses the default API client when no services are given", async () => {
    mocks.getDoc.mockRejectedValue(denied());
    mocks.anonymous.mockResolvedValue({ time: [0] });
    await expect(loadCanonicalActivityStreams("a3")).resolves.toEqual({ time: [0] });
    expect(mocks.anonymous).toHaveBeenCalledExactlyOnceWith("a3");
  });

  it("rethrows other read errors without calling the API", async () => {
    mocks.getDoc.mockRejectedValue(Object.assign(new Error("offline"), { code: "unavailable" }));
    await expect(loadCanonicalActivityStreams("a4", "owner", services)).rejects.toThrow("offline");
    expect(mocks.withAuth).not.toHaveBeenCalled();
  });

  it("surfaces the API error when the fallback also fails", async () => {
    mocks.getDoc.mockRejectedValue(denied());
    mocks.withAuth.mockRejectedValue(new Error("Activity is not public"));
    await expect(loadCanonicalActivityStreams("a5", "owner", services)).rejects.toThrow("Activity is not public");
  });
});
