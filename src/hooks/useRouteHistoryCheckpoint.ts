import { useEffect, useRef, useState } from "react";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
export type RouteHistoryCheckpoint = { runId: string; version: number; expiresAt: number };
const PREFIX = "orider-route-history-checkpoint-v1-";
const sessions = new WeakMap<object, unknown>();
function clearCheckpoints() {
 try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key); } catch { /* Optional recovery. */ }
}
export function parseRouteHistoryCheckpoint(text: string | null): RouteHistoryCheckpoint | null {
 try {
  if (!text || text.length > 256) return null;
  const value = JSON.parse(text);
  if (Object.keys(value).sort().join(",") !== "expiresAt,runId,version" || !/^[a-f0-9-]{36}$/.test(value.runId)
   || !Number.isSafeInteger(value.version) || value.version < 0 || !Number.isFinite(value.expiresAt)
   || value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 50 * 60000) return null;
  return value;
 } catch { return null; }
}
/** Tab-local opaque recovery only; never stored results, coordinates or activity IDs. */
export function useRouteHistoryCheckpoint(services: FirebaseServices, uid: string, scope: string) {
 const auth = services.auth, user = auth.currentUser, app = auth.app;
 const identity = JSON.stringify([app.options.projectId, app.name, uid, user?.metadata?.creationTime, user?.metadata?.lastSignInTime, scope]);
 const ref = useRef({ identity, user, auth, app, key: null as string | null, edited: false, value: null as RouteHistoryCheckpoint | null });
 if (ref.current.identity !== identity || ref.current.user !== user || ref.current.auth !== auth || ref.current.app !== app) {
  if (ref.current.user && ref.current.user !== user || ref.current.auth !== auth || ref.current.app !== app) clearCheckpoints();
  ref.current = { identity, user, auth, app, key: null, edited: false, value: null };
 }
 const [saved, setSaved] = useState({ owner: ref.current, value: null as RouteHistoryCheckpoint | null });
 useEffect(() => {
  const current = ref.current; let cancelled = false;
  if (sessions.get(auth) && sessions.get(auth) !== user) clearCheckpoints();
  if (user || sessions.has(auth)) sessions.set(auth, user);
  if (!user || user.isAnonymous || user.uid !== uid || !app.options.projectId || !user.metadata?.creationTime || !user.metadata?.lastSignInTime || !globalThis.crypto?.subtle) return;
  void (async () => {
   try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
    if (cancelled || ref.current !== current || auth.currentUser !== user || auth.app !== app) return;
    current.key = PREFIX + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
    if (current.edited) { if (current.value) sessionStorage.setItem(current.key, JSON.stringify(current.value)); else sessionStorage.removeItem(current.key); }
    else { current.value = parseRouteHistoryCheckpoint(sessionStorage.getItem(current.key)); if (!current.value) sessionStorage.removeItem(current.key); }
    setSaved({ owner: current, value: current.value });
   } catch { /* Unavailable storage must not prevent a new scan. */ }
  })();
  return () => { cancelled = true; };
 }, [identity, user, auth, app, uid]);
 const owner = ref.current;
 const write = (value: RouteHistoryCheckpoint | null) => {
  if (ref.current !== owner) return;
  const current = owner;
  if (auth.currentUser !== user || auth.app !== app) { clearCheckpoints(); return; }
  current.edited = true; current.value = value; setSaved({ owner: current, value });
  try { if (current.key) { if (value) sessionStorage.setItem(current.key, JSON.stringify(value)); else sessionStorage.removeItem(current.key); } } catch { /* Optional recovery. */ }
 };
 return { value: saved.owner === ref.current ? saved.value : null, write };
}
