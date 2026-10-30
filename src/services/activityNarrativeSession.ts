import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { auth, functions, ensureAppCheckReady, getAppCheckToken } from "./firebase";

const identities = new WeakMap<object, number>();
let nextIdentity = 0;
function identity(value: object | null | undefined): number {
  if (!value) return 0;
  let id = identities.get(value);
  if (id === undefined) { id = ++nextIdentity; identities.set(value, id); }
  return id;
}

export type ActivityNarrativeServices = Pick<FirebaseServices, "auth" | "functions" | "ensureAppCheckReady" | "getAppCheckToken">;
const sessions = new WeakMap<object, { key: string; services: ActivityNarrativeServices; isCurrent: () => boolean; assertCurrent: () => void }>();

/** Memory-only identity: named Firebase apps and replacement SDK users never share owner evidence. */
export function captureActivityNarrativeSession(injected?: ActivityNarrativeServices) {
  const services = injected ?? { auth, functions, ensureAppCheckReady, getAppCheckToken };
  const currentAuth = services.auth, user = currentAuth?.currentUser, app = currentAuth?.app, currentFunctions = services.functions;
  const scope = currentAuth ?? services;
  const latest = sessions.get(scope);
  if (latest?.isCurrent() && latest.services.functions === currentFunctions) return latest;
  const key = [identity(currentAuth), identity(app), identity(user), identity(currentFunctions)].join(":");
  const isCurrent = () => services.auth === currentAuth && currentAuth?.app === app && currentAuth?.currentUser === user
    && services.functions === currentFunctions && (!injected || currentFunctions?.app === app)
    && (injected !== undefined || auth === currentAuth && functions === currentFunctions);
  const assertCurrent = () => {
    if (!isCurrent()) throw Object.assign(new Error("Authentication session changed."), { code: "auth/session-changed" });
  };
  const session = { key, services, isCurrent, assertCurrent };
  sessions.set(scope, session);
  return session;
}

const retainedInputFailures = new Set([
  "narrative_streams_not_ready", "narrative_streams_unreadable", "narrative_distance_unreconciled",
  "narrative_segments_unavailable", "narrative_saved_metrics_unavailable",
  "narrative_source_changed", "narrative_generation_inputs_changed",
]);
export function isActivityNarrativeAccessRevoked(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^functions\//, "") : "";
  const details = typeof error === "object" && error !== null && "details" in error ? error.details : null;
  const reason = typeof details === "object" && details !== null && "reason" in details ? details.reason : null;
  if (code === "failed-precondition" && typeof reason === "string" && retainedInputFailures.has(reason)) return false;
  return ["permission-denied", "unauthenticated", "not-found", "failed-precondition", "auth/session-changed", "rest-unauthenticated"].includes(code);
}
