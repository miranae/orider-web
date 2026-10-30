import { withActivityMapDeadline } from "./activityMapDeadline";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";
export interface PublicActivityMap { activityId: string; revision: string; mapPreview: { encodedPolyline: string | null; imageUrl: string | null }; privacyEnabled?: boolean; contentRevision?: number | null; contentSelectedRevision?: number | null }
type Pending = { resolve: (value: PublicActivityMap | null) => void; reject: (reason: unknown) => void };
type Session = { viewer: FirebaseServices["auth"]["currentUser"]; requests: Map<string, Promise<PublicActivityMap | null>>; queue: Map<string, Pending[]>; scheduled: boolean };
const sessions = new WeakMap<object, Session>(), connected = new WeakSet<object>();
/** In-flight only; no payload cache survives a completed request or identity change. */
export function loadPublicActivityMap(services: FirebaseServices, activityId: string): Promise<PublicActivityMap | null> {
  const viewer = services.auth.currentUser; let session = sessions.get(services);
  if (!session || session.viewer !== viewer) { session = { viewer, requests: new Map(), queue: new Map(), scheduled: false }; sessions.set(services, session); }
  const scope = session;
  if (!activityId || activityId.includes("/")) return Promise.reject(Error("invalid_activity"));
  const existing = scope.requests.get(activityId); if (existing) return existing;
  const promise = new Promise<PublicActivityMap | null>((resolve, reject) => { scope.queue.set(activityId, [{ resolve, reject }]); });
  scope.requests.set(activityId, promise);
  if (!scope.scheduled) { scope.scheduled = true; setTimeout(() => { void drain(); }, 16); }
  async function drain() {
    while (scope.queue.size > 0) {
      const batch = [...scope.queue.entries()].slice(0, 20), ids = batch.map(([id]) => id);
      ids.forEach(id => scope.queue.delete(id));
      try {
        const { data } = await withActivityMapDeadline(async assertLive => {
        const current = () => { assertLive(); if (services.auth.currentUser !== viewer) throw Error("account_changed"); };
        current(); await services.ensureAppCheckReady(); current();
        const functions = getRuntimeConfig().appEnvironment === "stage" ? services.functions : getFunctions(services.functions.app, "asia-northeast3");
        if (isEmulatorRuntime() && !connected.has(functions)) { connectFunctionsEmulator(functions, "localhost", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001)); connected.add(functions); }
        const result = await httpsCallable<object, { items: (PublicActivityMap | { activityId: string; unavailable: true })[] }>(functions, "getActivityPublicMaps", { timeout: 10000 })({ activityIds: ids }); current();
        return result;
        });
        if (!data || !Array.isArray(data.items) || data.items.length !== ids.length || new Set(data.items.map(item => item.activityId)).size !== ids.length || data.items.some(item => !ids.includes(item.activityId))) throw Error("invalid_public_maps");
        for (const item of data.items) {
          if (!("unavailable" in item) && (typeof item.revision !== "string" || !item.revision || typeof item.privacyEnabled !== "boolean" || !item.mapPreview || ![item.mapPreview.encodedPolyline, item.mapPreview.imageUrl].every(value => value === null || typeof value === "string"))) throw Error("invalid_public_maps");
          if (!("unavailable" in item) && item.mapPreview.imageUrl) {
            const url = new URL(item.mapPreview.imageUrl);
            if (url.protocol !== "https:" || url.username || url.password) throw Error("invalid_public_maps");
          }
          if (!("unavailable" in item) && (item.contentRevision !== undefined || item.contentSelectedRevision !== undefined)) {
            const head = item.contentRevision, selected = item.contentSelectedRevision;
            const legacy = head === null && selected === null;
            if (!legacy && (!Number.isSafeInteger(head) || !Number.isSafeInteger(selected)
              || (head as number) < 0 || (selected as number) < 0 || (selected as number) > (head as number))) throw Error("invalid_public_maps");
          }
        }
        for (const [id, waiters] of batch) {
          const item = data.items.find(item => item.activityId === id)!;
          waiters.forEach(waiter => waiter.resolve("unavailable" in item ? null : item));
        }
      } catch (error) { batch.forEach(([, waiters]) => waiters.forEach(waiter => waiter.reject(error))); }
      finally { batch.forEach(([id]) => scope.requests.delete(id)); }
    }
    scope.scheduled = false;
  }
  return promise;
}
