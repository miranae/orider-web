import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { usePeriodControls } from "./usePeriodControls";

export interface RouteHistoryControls { open: boolean; observed: boolean; year: number | null }
export function validRouteHistoryControls(value: unknown): RouteHistoryControls | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as RouteHistoryControls;
  return Object.keys(v).length === 3 && typeof v.open === "boolean" && typeof v.observed === "boolean"
    && (v.year === null || Number.isInteger(v.year) && v.year >= 1970 && v.year <= new Date(Date.now() + 32400000).getUTCFullYear()) ? v : null;
}
// Reuse the UI-only store, but never restore hints from a different SDK session or page boot.
const sessions = new WeakMap<object, string>();
function sessionKey(identity: object | null | undefined) {
  if (!identity) return "none";
  let key = sessions.get(identity);
  if (!key) { key = crypto.randomUUID(); sessions.set(identity, key); }
  return key;
}
export function useRouteHistoryControls(ownerUid: string, activityId: string, kind: "group" | "index") {
  const { auth } = useFirebaseServices();
  const session = [sessionKey(auth), sessionKey(auth.app), sessionKey(auth.currentUser)].join(":");
  return usePeriodControls<RouteHistoryControls>(ownerUid, `route-${kind}:${activityId}:${session}`,
    () => ({ open: false, observed: false, year: null }), validRouteHistoryControls);
}
