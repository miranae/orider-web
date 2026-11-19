import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { approvedCallableEndpoint, postApprovedCallable } from "./approvedCallableGateway";

const httpErrorCodes: Partial<Record<number, string>> = {
  400: "invalid-argument", 401: "unauthenticated", 403: "permission-denied", 404: "not-found",
  408: "deadline-exceeded", 409: "aborted", 429: "resource-exhausted",
  499: "cancelled", 500: "internal", 501: "unimplemented", 503: "unavailable", 504: "deadline-exceeded",
};

type ReadPhase = "app-check" | "id-token" | "endpoint" | "transport" | "body" | "http" | "timeout" | "contract";
type ReadRoute = "getActivityDiscovery" | "getPublicAthleteTotals" | "getActivityPhotoData";

export function reportApprovedActivityReadFailure(
  services: FirebaseServices,
  viewer: FirebaseServices["auth"]["currentUser"],
  route: ReadRoute,
  phase: ReadPhase,
  status?: number,
) {
  logClientError("embedded.activityRead", new Error(`embedded-callable-${phase}-failed`),
    { route, phase, status }, services, viewer, `${route}:${phase}:${status ?? ""}`);
}

export async function callApprovedActivityRead<T>(
  services: FirebaseServices,
  viewer: FirebaseServices["auth"]["currentUser"],
  route: ReadRoute,
  region: string,
  data: unknown,
  assertCurrent: () => void,
  signal: AbortSignal,
): Promise<T> {
  const report = (phase: ReadPhase, status?: number) => reportApprovedActivityReadFailure(services, viewer, route, phase, status);
  const reportTimeout = () => {
    if (signal.reason instanceof DOMException && signal.reason.name === "TimeoutError") report("timeout");
  };
  const cancelled = (error: unknown) => signal.aborted
    && (error === signal.reason || (error instanceof Error && error.name === "AbortError"));

  const config = getRuntimeConfig();
  const appCheckForRequest = async () => {
    try {
      const token = await services.getAppCheckToken();
      if (!token && config.useEmulators !== true) throw new Error("app-check/empty-token");
      return token;
    } catch (error) {
      report("app-check");
      throw error;
    }
  };
  const viewerTokenForRequest = async () => {
    if (!viewer) return null;
    try {
      const token = await viewer.getIdToken();
      if (!token) throw new Error("embedded-callable-empty-auth-token");
      return token;
    } catch (error) {
      report("id-token");
      throw error;
    }
  };

  assertCurrent();
  signal.addEventListener("abort", reportTimeout, { once: true });
  try {
    // The callable SDK resolves live Auth after invocation. Resolve the approved viewer's token explicitly.
    const [appCheck, authToken] = await Promise.all([appCheckForRequest(), viewerTokenForRequest()]);
    assertCurrent();
    const endpoint = approvedCallableEndpoint(config, services.functions, region, route);
    if (!endpoint) {
      report("endpoint");
      throw new Error("embedded-callable-endpoint-unavailable");
    }

    let response: Response;
    try {
      response = await postApprovedCallable(endpoint, data, appCheck, authToken, signal);
    } catch (error) {
      if (!cancelled(error)) report("transport");
      throw error;
    }

    let payload: { result?: T; data?: T; error?: { status?: string } } | null;
    let bodyFailed = false;
    try {
      payload = await response.json();
    } catch (error) {
      bodyFailed = true;
      if (!cancelled(error)) report("body", response.status);
      if (response.ok) throw error;
      payload = null;
    }
    if (!response.ok || payload?.error) {
      if (!bodyFailed) report("http", response.status);
      const status = payload?.error?.status;
      const code = typeof status === "string" && /^[A-Z_]+$/.test(status) ? status.toLowerCase().replace(/_/g, "-")
        : httpErrorCodes[response.status] ?? "unavailable";
      throw Object.assign(new Error("embedded-callable-failed"), { code: `functions/${code}` });
    }
    if (!payload || typeof payload !== "object" || !("result" in payload || "data" in payload)) {
      report("body", response.status);
      throw Object.assign(new Error("embedded-callable-missing-data"), { code: "functions/internal" });
    }
    return (payload?.result ?? payload?.data) as T;
  } finally {
    signal.removeEventListener("abort", reportTimeout);
  }
}
