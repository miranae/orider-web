import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useNativeActivityPhoto } from "./useNativeActivityPhoto";
const mocks = vi.hoisted(() => ({ uid: "owner", services: {}, load: vi.fn(), authorize: vi.fn(), create: vi.fn(), revoke: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/nativeActivityPhoto", () => ({ loadNativeActivityPhoto: mocks.load, authorizeNativeActivityPhoto: mocks.authorize }));
const photo = { activityId: "ride", photoId: "photo" };
beforeEach(() => {
  mocks.uid = "owner"; mocks.services = {}; mocks.authorize.mockReset().mockResolvedValue(undefined); mocks.load.mockReset().mockResolvedValue(new Blob(["image"]));
  mocks.create.mockReset().mockImplementation(() => `blob:local-${mocks.create.mock.calls.length}`); mocks.revoke.mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: mocks.create, revokeObjectURL: mocks.revoke }));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("defers offscreen requests and revokes its bytes on unmount", async () => {
  const r = renderHook(enabled => useNativeActivityPhoto(photo, enabled), { initialProps: false });
  expect(mocks.load).not.toHaveBeenCalled();
  r.rerender(true); await waitFor(() => expect(r.result.current.url).toBe("blob:local-1"));
  r.unmount(); expect(mocks.revoke).toHaveBeenCalledWith("blob:local-1");
});
it.each(["account", "services", "photo"])("ignores stale bytes through %s A-B-A changes", async field => {
  let old!: (blob: Blob) => void;
  mocks.load.mockReturnValueOnce(new Promise<Blob>(resolve => { old = resolve; }));
  const initialServices = mocks.services;
  const r = renderHook(value => useNativeActivityPhoto(value), { initialProps: photo });
  if (field === "account") mocks.uid = "other";
  if (field === "services") mocks.services = {};
  r.rerender(field === "photo" ? { ...photo, photoId: "other" } : photo);
  mocks.uid = "owner"; mocks.services = initialServices; r.rerender(photo);
  await waitFor(() => expect(r.result.current.url).not.toBeNull());
  const url = r.result.current.url;
  await act(async () => old(new Blob(["old"])));
  expect(r.result.current.url).toBe(url); expect(mocks.create).toHaveBeenCalledTimes(1);
});
it("clears bytes when backgrounded and rechecks authorization on return, preserving failures and retry", async () => {
  const r = renderHook(() => useNativeActivityPhoto(photo));
  await waitFor(() => expect(r.result.current.url).toBe("blob:local-1"));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(r.result.current.url).toBeNull(); expect(mocks.revoke).toHaveBeenCalledWith("blob:local-1");
  mocks.load.mockRejectedValueOnce(new Error("denied"));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await waitFor(() => expect(r.result.current.error).toBeTruthy()); expect(r.result.current.url).toBeNull();
  act(() => r.result.current.retry()); await waitFor(() => expect(r.result.current.url).toBe("blob:local-2"));
});

it("revokes displayed bytes when a periodic authorization check fails", async () => {
  let recheck!: () => void;
  const original = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay, ...args) => {
    if (delay === 30000) { recheck = callback as () => void; return 123 as unknown as ReturnType<typeof setTimeout>; }
    return original(callback, delay, ...args);
  });
  const r = renderHook(() => useNativeActivityPhoto(photo));
  await waitFor(() => expect(r.result.current.url).toBe("blob:local-1"));
  mocks.authorize.mockRejectedValueOnce(new Error("private"));
  await act(async () => recheck());
  expect(r.result.current.url).toBeNull(); expect(mocks.revoke).toHaveBeenCalledWith("blob:local-1");
  expect(mocks.load).toHaveBeenCalledTimes(1);
});
