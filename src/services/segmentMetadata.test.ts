import { beforeEach, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadSegmentMetadataPage } from "./segmentMetadata";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), factory: vi.fn(), defaultReady: vi.fn() }));
// Embedded bootstrap deliberately leaves the ordinary Firebase app uninitialized.
vi.mock("./firebase", () => ({ auth: undefined, functions: undefined, ensureAppCheckReady: mocks.defaultReady }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.factory }));
type Services = Pick<FirebaseServices, "auth" | "functions" | "ensureAppCheckReady">;
const scoped = () => ({ auth: { currentUser: { uid: "viewer" } }, functions: { scope: "embedded" }, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) }) as unknown as Services;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.factory.mockReturnValue(mocks.invoke);
  mocks.invoke.mockResolvedValue({ data: { items: [{ id: "segment" }], cursor: "next", hasMore: true } });
});

it("loads both the initial page and continuation with isolated services when the ordinary app is absent", async () => {
  const services = scoped();
  const page = await loadSegmentMetadataPage({ mode: "creator", creatorUid: "athlete" }, services);
  await loadSegmentMetadataPage({ mode: "creator", creatorUid: "athlete", cursor: page.cursor! }, services);
  expect(mocks.factory).toHaveBeenCalledWith(services.functions, "getPublicSegmentMetadata");
  expect(mocks.invoke.mock.calls.map(([request]) => request)).toEqual([
    { mode: "creator", creatorUid: "athlete" },
    { mode: "creator", creatorUid: "athlete", cursor: "next" },
  ]);
  expect(services.ensureAppCheckReady).toHaveBeenCalledTimes(2);
  expect(mocks.defaultReady).not.toHaveBeenCalled();
});

it("does not call the backend after the injected account changes during App Check", async () => {
  const services = scoped();
  vi.mocked(services.ensureAppCheckReady).mockImplementation(async () => { services.auth.currentUser = null; });
  await expect(loadSegmentMetadataPage({ mode: "creator", creatorUid: "athlete" }, services)).rejects.toThrow("account_changed");
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it("discards a late page after a new session replaces the same uid", async () => {
  const services = scoped();
  mocks.invoke.mockImplementation(async () => {
    services.auth.currentUser = { uid: "viewer" } as Services["auth"]["currentUser"];
    return { data: { items: [{ id: "private-session-result" }], cursor: null, hasMore: false } };
  });
  await expect(loadSegmentMetadataPage({ mode: "creator", creatorUid: "athlete" }, services)).rejects.toThrow("account_changed");
});
