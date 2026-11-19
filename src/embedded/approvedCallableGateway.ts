import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { isFunctionsGatewayRuntime, type RuntimeConfig } from "../services/runtimeConfig";

type ApprovedRoute = "getActivityDiscovery" | "getPublicAthleteTotals" | "getActivityPhotoData" | "logClientError";

export function approvedCallableEndpoint(
  config: RuntimeConfig, functions: FirebaseServices["functions"], region: string, route: ApprovedRoute,
): string | undefined {
  const project = functions.app?.options?.projectId;
  const base = config.useEmulators === true
    ? project && `http://localhost:${Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001)}/${project}/${region}`
    : isFunctionsGatewayRuntime(config) ? config.firebaseFunctionsBase
    : project && `https://${region}-${project}.cloudfunctions.net`;
  return base ? `${base}/${route}` : undefined;
}

export function postApprovedCallable(
  endpoint: string, data: unknown, appCheck: string | null, authToken?: string | null, signal?: AbortSignal,
): Promise<Response> {
  return fetch(endpoint, {
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
}
