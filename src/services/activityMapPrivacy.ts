import { withActivityMapDeadline } from "./activityMapDeadline";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";
export interface MapPrivacySettings { startMeters: number; endMeters: number }
export interface ActivityMapPrivacy {
  activityId: string; revision: string; visibility: "everyone" | "friends" | "private"; settings: MapPrivacySettings;
  mapPreview: { encodedPolyline: string | null; imageUrl: string | null };
  state: "available" | "no_gps" | "hidden" | "changed_source";
  policy: "endpoint_radius_longest_safe_section_v1"; revocationPending: boolean;
}
const connected = new WeakSet<object>();
export function createActivityMapPrivacyClient(services: FirebaseServices) {
  const viewer = services.auth.currentUser;
  const assertAccount = () => { if (!viewer || viewer.isAnonymous || services.auth.currentUser !== viewer) throw Error("account_changed"); };
  async function call(name: string, payload: { activityId: string } & Partial<MapPrivacySettings> & { expectedRevision?: string }): Promise<ActivityMapPrivacy> {
    return withActivityMapDeadline(async assertLive => {
    const current = () => { assertLive(); assertAccount(); };
    current();
    if (!payload.activityId || payload.activityId.includes("/")) throw Error("invalid_activity");
    if (name !== "getActivityMapPrivacy" && ![payload.startMeters, payload.endMeters].every(value => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5000)) throw Error("invalid_map_radius");
    await services.ensureAppCheckReady(); current();
    const functions = getRuntimeConfig().appEnvironment === "stage" ? services.functions : getFunctions(services.functions.app, "asia-northeast3");
    if (isEmulatorRuntime() && !connected.has(functions)) { connectFunctionsEmulator(functions, "localhost", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001)); connected.add(functions); }
    const { data } = await httpsCallable<object, ActivityMapPrivacy>(functions, name, { timeout: 10000 })(payload); current();
    if (!data || typeof data.revocationPending !== "boolean" || !["everyone", "friends", "private"].includes(data.visibility) || data.activityId !== payload.activityId || typeof data.revision !== "string" || !data.revision || data.policy !== "endpoint_radius_longest_safe_section_v1"
      || !["available", "no_gps", "hidden", "changed_source"].includes(data.state) || !data.settings || ![data.settings.startMeters, data.settings.endMeters].every(value => Number.isInteger(value) && value >= 0 && value <= 5000)
      || !data.mapPreview || ![data.mapPreview.encodedPolyline, data.mapPreview.imageUrl].every(value => value === null || typeof value === "string")) throw Error("invalid_map_privacy");
    if (data.mapPreview.imageUrl !== null) {
      let url: URL; try { url = new URL(data.mapPreview.imageUrl); } catch { throw Error("invalid_map_privacy"); }
      if (url.protocol !== "https:" || url.username || url.password) throw Error("invalid_map_privacy");
    }
    if (data.mapPreview.encodedPolyline !== null && (data.mapPreview.encodedPolyline.length > 32768 || !/^[?-~]+$/u.test(data.mapPreview.encodedPolyline))) throw Error("invalid_map_privacy");
    return data;
    });
  }
  return {
    load: (activityId: string) => call("getActivityMapPrivacy", { activityId }),
    preview: (activityId: string, settings: MapPrivacySettings, expectedRevision: string) => call("previewActivityMapPrivacy", { activityId, ...settings, expectedRevision }),
    save: (activityId: string, settings: MapPrivacySettings, expectedRevision: string) => call("setActivityMapPrivacy", { activityId, ...settings, expectedRevision }),
  };
}
