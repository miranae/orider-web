import { createActivityMapPrivacyClient } from "./activityMapPrivacy";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
const m = vi.hoisted(() => ({ call: vi.fn(), ready: vi.fn(), fn: {} }));
vi.mock("firebase/functions", () => ({ getFunctions: () => m.fn, connectFunctionsEmulator: vi.fn(), httpsCallable: () => m.call }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: "production" }), isEmulatorRuntime: () => false }));
const response = { activityId: "a", revision: "r1", visibility: "everyone", settings: { startMeters: 0, endMeters: 100 }, mapPreview: { encodedPolyline: null, imageUrl: null }, state: "hidden", policy: "endpoint_radius_longest_safe_section_v1" };
function setup() { const services = { auth: { currentUser: { uid: "owner", isAnonymous: false } }, functions: { app: {} }, ensureAppCheckReady: m.ready } as unknown as FirebaseServices; return { services, client: createActivityMapPrivacyClient(services) }; }
beforeEach(() => { vi.clearAllMocks(); m.ready.mockResolvedValue(undefined); m.call.mockResolvedValue({ data: response }); });
it("sends bounded radius and revision after AppCheck", async () => {
 const { client } = setup(); await expect(client.preview("a", { startMeters: 0, endMeters: 5000 }, "r1")).resolves.toEqual(response);
 expect(m.ready).toHaveBeenCalledOnce(); expect(m.call).toHaveBeenCalledWith({ activityId: "a", startMeters: 0, endMeters: 5000, expectedRevision: "r1" });
});
it.each([-1, 5001, NaN, 1.5])("rejects invalid radius %s before network", async startMeters => {
 const { client } = setup(); await expect(client.save("a", { startMeters, endMeters: 0 }, "r1")).rejects.toThrow("invalid_map_radius"); expect(m.call).not.toHaveBeenCalled();
});
it("rejects same UID SDK replacement after response", async () => {
 const { services, client } = setup(); m.call.mockImplementation(async () => { Object.assign(services.auth, { currentUser: { uid: "owner", isAnonymous: false } }); return { data: response }; });
 await expect(client.load("a")).rejects.toThrow("account_changed");
});
it("preserves CAS errors and rejects foreign response", async () => {
 const { client } = setup(); m.call.mockRejectedValueOnce({ code: "functions/aborted" }); await expect(client.save("a", { startMeters: 0, endMeters: 0 }, "r1")).rejects.toMatchObject({ code: "functions/aborted" });
 m.call.mockResolvedValue({ data: { ...response, activityId: "other" } }); await expect(client.load("a")).rejects.toThrow("invalid_map_privacy");
});
it("rejects unsafe map image URLs", async () => {
 const { client } = setup(); m.call.mockResolvedValue({ data: { ...response, mapPreview: { encodedPolyline: null, imageUrl: "javascript:bad" } } });
 await expect(client.load("a")).rejects.toThrow("invalid_map_privacy");
});
