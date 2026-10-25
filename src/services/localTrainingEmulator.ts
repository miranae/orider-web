import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig } from "./runtimeConfig";

/** Development-only demo data. Never grants access to a hosted or real-project API. */
export function localTrainingEmulatorAvailable(): boolean {
  const config = getRuntimeConfig();
  if (!import.meta.env.DEV || config.useEmulators !== true || config.trainingAnalysisPeriodsEnabled !== true
    || !["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location?.hostname)
    || !/^demo-[a-z0-9-]+$/u.test(config.firebaseProjectId ?? "")) return false;
  try {
    const url = new URL(config.firebaseFunctionsBase ?? "");
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
      && !!url.port && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === `/${config.firebaseProjectId}/asia-northeast3`;
  } catch { return false; }
}
export function matchesLocalTrainingEmulator(services: FirebaseServices): boolean {
  return localTrainingEmulatorAvailable() && services.functions.app === services.auth.app
    && services.auth.app.options.projectId === getRuntimeConfig().firebaseProjectId
    && services.functions.customDomain === getRuntimeConfig().firebaseFunctionsBase
    // The SDK gives emulatorOrigin precedence over customDomain when building URLs.
    && (services.functions as typeof services.functions & { emulatorOrigin?: string | null }).emulatorOrigin == null;
}
