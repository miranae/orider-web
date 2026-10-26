import { auth, functions } from "./firebase";

const identities = new WeakMap<object, number>();
let nextIdentity = 0;
function identity(value: object | null | undefined): number {
  if (!value) return 0;
  let id = identities.get(value);
  if (id === undefined) { id = ++nextIdentity; identities.set(value, id); }
  return id;
}

let latest: { key: string; isCurrent: () => boolean; assertCurrent: () => void } | undefined;

/** Memory-only identity: a replacement SDK session must never inherit owner evidence. */
export function captureActivityNarrativeSession() {
  if (latest?.isCurrent()) return latest;
  const currentAuth = auth, user = auth?.currentUser, app = auth?.app, currentFunctions = functions;
  const key = [identity(currentAuth), identity(app), identity(user), identity(currentFunctions)].join(":");
  const isCurrent = () => auth === currentAuth && auth?.app === app && auth?.currentUser === user && functions === currentFunctions;
  const assertCurrent = () => {
    if (!isCurrent()) throw Object.assign(new Error("Authentication session changed."), { code: "auth/session-changed" });
  };
  latest = { key, isCurrent, assertCurrent };
  return latest;
}

export function isActivityNarrativeAccessRevoked(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^functions\//, "") : "";
  return ["permission-denied", "unauthenticated", "not-found", "failed-precondition", "auth/session-changed", "rest-unauthenticated"].includes(code);
}
