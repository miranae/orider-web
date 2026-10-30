import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig } from "./runtimeConfig";
import { localTrainingEmulatorAvailable, matchesLocalTrainingEmulator } from "./localTrainingEmulator";

type Capability = "routes" | "bikePeriods";
const project = "miranae-orider-g1", region = "asia-northeast3";
const productionEndpoint = `https://${region}-${project}.cloudfunctions.net`;
const stageEndpoint = "https://asia-northeast3-orider-dev.cloudfunctions.net";
function hostedEndpoint(capability: Capability): string | null {
  const config = getRuntimeConfig();
  if (config.useEmulators === true || config.firebaseProjectId !== project || config.firebaseFunctionsRegion !== region) return null;
  if (capability === "bikePeriods" && config.trainingAnalysisPeriodsEnabled !== true) return null;
  if (config.appEnvironment === "stage") return config.firebaseFunctionsBase === stageEndpoint ? stageEndpoint : null;
  if (config.appEnvironment !== "production" || capability === "routes" && config.activityAnalysisExpansionEnabled !== true) return null;
  return !config.firebaseFunctionsBase || config.firebaseFunctionsBase === productionEndpoint ? productionEndpoint : null;
}
/** Uses existing runtime opt-ins; does not turn on deployed features or permit arbitrary endpoints. */
export function analysisCapabilityAvailable(capability: Capability): boolean {
  return localTrainingEmulatorAvailable() || hostedEndpoint(capability) !== null;
}
export function matchesAnalysisCapability(services: FirebaseServices, capability: Capability): boolean {
  if (localTrainingEmulatorAvailable()) return matchesLocalTrainingEmulator(services);
  const expected = hostedEndpoint(capability), { auth, functions } = services;
  if (!expected || functions.app !== auth.app || auth.app.options.projectId !== project || functions.region !== region) return false;
  // Firebase SDK gives emulatorOrigin precedence over customDomain. Never validate only the latter.
  const emulator = (functions as typeof functions & { emulatorOrigin?: string | null }).emulatorOrigin;
  const endpoint = emulator != null ? `${emulator}/${functions.app.options.projectId}/${functions.region}`
    : functions.customDomain ?? `https://${functions.region}-${functions.app.options.projectId}.cloudfunctions.net`;
  return endpoint === expected;
}
