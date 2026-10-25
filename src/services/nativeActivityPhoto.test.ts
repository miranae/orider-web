import { beforeEach, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadNativeActivityCover, setNativeActivityCover, authorizeNativeActivityPhoto, isLegacyActivityPhotoUrl, loadNativeActivityPhoto, uploadNativeActivityPhoto } from "./nativeActivityPhoto";
const mocks = vi.hoisted(() => ({ call: vi.fn(), getFunctions: vi.fn(() => ({})), callable: vi.fn(), ready: vi.fn() }));
vi.mock("firebase/functions", () => ({ getFunctions: mocks.getFunctions, httpsCallable: (...args: unknown[]) => { mocks.callable(...args); return mocks.call; }, connectFunctionsEmulator: vi.fn() }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: "production" }), isEmulatorRuntime: () => false }));
const services = (uid: string | null = "owner") => ({ auth: { currentUser: uid ? { uid, isAnonymous: false } : null }, functions: { app: { name: "test" } }, ensureAppCheckReady: mocks.ready } as unknown as FirebaseServices);
const photo = { activityId: "ride", photoId: "photo" };
beforeEach(() => { vi.clearAllMocks(); mocks.ready.mockResolvedValue(undefined); mocks.call.mockResolvedValue({ data: { base64: "aW1hZ2U=", contentType: "image/webp" } }); });
it("reads bytes with the injected app and never accepts a returned download URL", async () => {
  const source = services(null);
  const blob = await loadNativeActivityPhoto(source, photo);
  expect(blob.size).toBe(5); expect(blob.type).toBe("image/webp");
  expect(mocks.getFunctions).toHaveBeenCalledWith(source.functions.app, "asia-northeast3");
  expect(mocks.call).toHaveBeenCalledWith(photo);
  mocks.call.mockResolvedValue({ data: { url: "https://example.com/token" } });
  await expect(loadNativeActivityPhoto(source, photo)).rejects.toThrow();
});
it.each([{ base64: "aW1hZ2U=", contentType: "image/svg+xml" }, { base64: "", contentType: "image/png" }, { base64: "<>bad", contentType: "image/webp" }])("rejects invalid byte responses", async data => {
  mocks.call.mockResolvedValue({ data });
  await expect(loadNativeActivityPhoto(services(), photo)).rejects.toThrow("invalid_photo");
});
it("drops a response after account replacement and rejects path traversal before sending", async () => {
  const source = services();
  mocks.call.mockImplementation(async () => { Object.assign(source.auth, { currentUser: { uid: "next" } }); return { data: { base64: "aW1hZ2U=", contentType: "image/png" } }; });
  await expect(loadNativeActivityPhoto(source, photo)).rejects.toThrow("account_changed");
  mocks.call.mockClear();
  await expect(loadNativeActivityPhoto(source, { ...photo, photoId: "../photo" })).rejects.toThrow("invalid_photo");
  expect(mocks.call).not.toHaveBeenCalled();
});
it("uploads bounded bytes and owner-only location through the server without Storage URL writes", async () => {
  await uploadNativeActivityPhoto(services(), photo, new Blob(["image"], { type: "image/webp" }), [37, 127]);
  expect(mocks.call).toHaveBeenCalledWith({ ...photo, base64: "aW1hZ2U=", contentType: "image/webp", location: { lat: 37, lon: 127 } });
  await expect(uploadNativeActivityPhoto(services(null), photo, new Blob(["x"]))).rejects.toThrow("sign_in_required");
  await expect(uploadNativeActivityPhoto(services(), photo, new Blob([]))).rejects.toThrow("invalid_photo");
});
it("rejects legacy bearer URL paths including percent-encoded Storage names", () => {
  expect(isLegacyActivityPhotoUrl("https://firebasestorage.googleapis.com/v0/b/demo/o/activity_photos%2Fowner%2Fride%2Fphoto.webp?alt=media&token=old")).toBe(true);
  expect(isLegacyActivityPhotoUrl("https://example.com/%invalid")).toBe(true);
  expect(isLegacyActivityPhotoUrl("https://example.com/provider-photo.jpg")).toBe(false);
});

it("checks access without requesting another image payload and rejects unconfirmed authorization", async () => {
  mocks.call.mockResolvedValue({ data: { authorized: true } });
  await authorizeNativeActivityPhoto(services(), photo);
  expect(mocks.call).toHaveBeenCalledWith({ ...photo, accessOnly: true });
  mocks.call.mockResolvedValue({ data: { authorized: false } });
  await expect(authorizeNativeActivityPhoto(services(), photo)).rejects.toThrow("photo_access_unconfirmed");
});

it("loads cover CAS state and validates selections without altering image-byte access", async () => {
  const source = services();
  mocks.call.mockResolvedValue({ data: { nativeCoverPhotoId: null, nativeCoverRevision: "r0" } });
  await expect(loadNativeActivityCover(source, "ride")).resolves.toEqual({ photoId: null, coverRevision: "r0" });
  mocks.call.mockResolvedValue({ data: { photoId: "photo", coverRevision: "r1" } });
  await setNativeActivityCover(source, "ride", "photo", "r0");
  expect(mocks.call).toHaveBeenLastCalledWith({ activityId: "ride", photoId: "photo", expectedCoverRevision: "r0" });
  await expect(setNativeActivityCover(services(null), "ride", "photo", "r0")).rejects.toThrow("sign_in_required");
  mocks.call.mockImplementation(async () => { Object.assign(source.auth, { currentUser: { uid: "other" } }); return { data: { photoId: "photo", coverRevision: "r2" } }; });
  await expect(setNativeActivityCover(source, "ride", "photo", "r1")).rejects.toThrow("account_changed");
});
