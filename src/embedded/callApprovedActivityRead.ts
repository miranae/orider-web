import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig, isEmulatorRuntime, isFunctionsGatewayRuntime } from "../services/runtimeConfig";

export async function callApprovedActivityRead<T>(
  services: FirebaseServices,
  owner: FirebaseServices["auth"]["currentUser"],
  route: "getActivityDiscovery" | "getPublicAthleteTotals",
  region: string,
  data: unknown,
  assertCurrent: () => void,
  signal: AbortSignal,
): Promise<T> {
  // Bind credentials to the approved viewer before fetch. The callable SDK resolves live Auth after invocation.
  const [appCheck, authToken] = await Promise.all([services.getAppCheckToken(), owner?.getIdToken()]);
  assertCurrent();
  const config = getRuntimeConfig();
  const emulator = isEmulatorRuntime();
  if (!appCheck && !emulator) throw new Error("app-check/empty-token");
  if (owner && !authToken) throw new Error("embedded-callable-empty-auth-token");
  const project = services.functions.app.options.projectId;
  const base = emulator && project ? `http://localhost:${Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001)}/${project}/${region}`
    : isFunctionsGatewayRuntime(config) ? config.firebaseFunctionsBase
    : project ? `https://${region}-${project}.cloudfunctions.net` : undefined;
  if (!base) throw new Error("embedded-callable-endpoint-unavailable");
  const response = await fetch(`${base}/${route}`, {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(appCheck ? { "X-Firebase-AppCheck": appCheck } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const payload = await response.json() as { result?: T; data?: T; error?: { status?: string } };
  if (!response.ok || payload.error) {
    const status = payload.error?.status;
    const code = status && /^[A-Z_]+$/.test(status) ? status.toLowerCase().replace(/_/g, "-") : "unavailable";
    throw Object.assign(new Error("embedded-callable-failed"), { code: `functions/${code}` });
  }
  return (payload.result ?? payload.data) as T;
}
