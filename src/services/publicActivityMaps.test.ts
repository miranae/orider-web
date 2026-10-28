import { loadPublicActivityMap } from "./publicActivityMaps";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
const m = vi.hoisted(() => ({ call: vi.fn(), ready: vi.fn(), fn: {} }));
vi.mock("firebase/functions", () => ({ getFunctions: () => m.fn, connectFunctionsEmulator: vi.fn(), httpsCallable: () => m.call }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: "production" }), isEmulatorRuntime: () => false }));
const row = (activityId: string) => ({ activityId, revision: "r1", privacyEnabled: true, mapPreview: { encodedPolyline: null, imageUrl: null } });
const services = () => ({ auth: { currentUser: { uid: "a" } }, functions: { app: {} }, ensureAppCheckReady: m.ready } as unknown as FirebaseServices);
beforeEach(() => { vi.clearAllMocks(); m.ready.mockResolvedValue(undefined); m.call.mockImplementation(async ({ activityIds }) => ({ data: { items: activityIds.map(row) } })); });
it("coalesces duplicate concurrent maps and caps each batch at twenty without caching payloads", async () => {
 const s = services(); const first = loadPublicActivityMap(s, "a"); expect(loadPublicActivityMap(s, "a")).toBe(first);
 await Promise.all([first, ...Array.from({ length: 20 }, (_, i) => loadPublicActivityMap(s, `b${i}`))]);
 expect(m.call.mock.calls.map(call => call[0].activityIds.length)).toEqual([20, 1]);
 await loadPublicActivityMap(s, "a"); expect(m.call).toHaveBeenCalledTimes(3);
});
it("discards responses after same UID user replacement", async () => {
 const s = services(); m.call.mockImplementation(async () => { Object.assign(s.auth, { currentUser: { uid: "a" } }); return { data: { items: [row("a")] } }; });
 await expect(loadPublicActivityMap(s, "a")).rejects.toThrow("account_changed");
});
it("has no raw fallback for unavailable or failed map responses", async () => {
 const s = services(); m.call.mockResolvedValueOnce({ data: { items: [{ activityId: "a", unavailable: true }] } }); expect(await loadPublicActivityMap(s, "a")).toBeNull();
 m.call.mockRejectedValueOnce(Error("offline")); await expect(loadPublicActivityMap(s, "a")).rejects.toThrow("offline");
});
it.each([
 { contentRevision: 5, contentSelectedRevision: 2 },
 { contentRevision: null, contentSelectedRevision: null },
])("preserves snapshot-bound thumbnail revisions: %j", async revisions => {
 const item = { ...row("a"), ...revisions };
 m.call.mockResolvedValueOnce({ data: { items: [item] } });
 await expect(loadPublicActivityMap(services(), "a")).resolves.toEqual(item);
});
it.each([
 { contentRevision: 2 }, { contentSelectedRevision: 1 },
 { contentRevision: 1, contentSelectedRevision: 2 },
 { contentRevision: "2", contentSelectedRevision: 1 },
])("rejects inconsistent live revision metadata: %j", async revisions => {
 m.call.mockResolvedValueOnce({ data: { items: [{ ...row("a"), ...revisions }] } });
 await expect(loadPublicActivityMap(services(), "a")).rejects.toThrow("invalid_public_maps");
});
it("does not coalesce different service contexts sharing one auth object", async () => {
 const a = services(), b = { ...a, functions: { ...a.functions } } as FirebaseServices;
 await Promise.all([loadPublicActivityMap(a, "a"), loadPublicActivityMap(b, "a")]); expect(m.call).toHaveBeenCalledTimes(2);
});
it("rejects the entire batch before resolving a valid first row when a later row is malformed", async () => {
 const s = services(); m.call.mockResolvedValue({ data: { items: [row("a"), { activityId: "b", revision: 1 }] } });
 const results = await Promise.allSettled([loadPublicActivityMap(s, "a"), loadPublicActivityMap(s, "b")]);
 expect(results.map(result => result.status)).toEqual(["rejected", "rejected"]);
});
it("collects separate event-loop tasks and serializes later batches while one request is pending", async () => {
 const s = services(); let finish!: () => void;
 m.call.mockImplementationOnce(({ activityIds }) => new Promise(resolve => { finish = () => resolve({ data: { items: activityIds.map(row) } }); }));
 const first = loadPublicActivityMap(s, "a"); await new Promise(resolve => setTimeout(resolve, 0)); const second = loadPublicActivityMap(s, "b");
 await new Promise(resolve => setTimeout(resolve, 25)); expect(m.call).toHaveBeenCalledTimes(1); expect(m.call.mock.calls[0][0].activityIds).toEqual(["a", "b"]);
 const third = loadPublicActivityMap(s, "c"); await new Promise(resolve => setTimeout(resolve, 25)); expect(m.call).toHaveBeenCalledTimes(1);
 finish(); await Promise.all([first, second, third]); expect(m.call).toHaveBeenCalledTimes(2);
});
it("times out hung App Check, prevents late dispatch, and lets a later retry succeed", async () => {
 vi.useFakeTimers(); const s = services(); let ready!: () => void; m.ready.mockImplementationOnce(() => new Promise<void>(resolve => { ready = resolve; }));
 try {
   const pending = loadPublicActivityMap(s, "a"); const failure = expect(pending).rejects.toThrow("map_request_timeout");
   await vi.advanceTimersByTimeAsync(10_016); await failure; expect(m.call).not.toHaveBeenCalled();
   ready(); await Promise.resolve(); expect(m.call).not.toHaveBeenCalled();
   const retry = loadPublicActivityMap(s, "a"); await vi.advanceTimersByTimeAsync(16); await expect(retry).resolves.toEqual(row("a"));
 } finally { vi.useRealTimers(); }
});
