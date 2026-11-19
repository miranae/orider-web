import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import { getRuntimeConfig, isEmulatorRuntime, isFunctionsGatewayRuntime } from "../services/runtimeConfig";

const httpErrorCodes: Partial<Record<number, string>> = {
  401: "unauthenticated", 403: "permission-denied", 404: "not-found",
  408: "deadline-exceeded", 429: "resource-exhausted",
};

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
  const report = (phase: "transport" | "body" | "http", status?: number) => {
    logClientError("embedded.activityRead", new Error(`embedded-callable-${phase}-failed`),
      { route, phase, status }, services, owner, route, () => {
        try { assertCurrent(); return true; } catch { return false; }
      });
  };
  let response: Response;
  try {
    response = await fetch(`${base}/${route}`, {
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
  } catch (error) {
    if (!(signal.aborted && error instanceof Error && error.name === "AbortError")) report("transport");
    throw error;
  }
  let payload: { result?: T; data?: T; error?: { status?: string } } | null;
  try {
    payload = await response.json();
  } catch (error) {
    if (!(signal.aborted && error instanceof Error && error.name === "AbortError")) report("body", response.status);
    if (response.ok) throw error;
    payload = null;
  }
  if (!response.ok || payload?.error) {
    const status = payload?.error?.status;
    const code = status && /^[A-Z_]+$/.test(status) ? status.toLowerCase().replace(/_/g, "-")
      : httpErrorCodes[response.status] ?? "unavailable";
    if (code === "unavailable" || response.status >= 500) report("http", response.status);
    throw Object.assign(new Error("embedded-callable-failed"), { code: `functions/${code}` });
  }
  return (payload?.result ?? payload?.data) as T;
}
