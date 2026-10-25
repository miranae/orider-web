import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { Activity } from "@shared/types";
import { useFirebaseServices, type FirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityDiscovery } from "../services/activityDiscovery";
import { logClientError } from "../services/errorLogger";

const MAX_PAGES = 10;
const EMPTY: Activity[] = [];
type Context = { services: FirebaseServices; rideId: string; user: User | null; revision: number };
type PageState = { context: Context; activities: Activity[]; cursor: string | null; pages: number };
/** Bounded public observations; raw activity documents never enter the group view. */
export function useGroupRideActivities(rideId: string | undefined, user: User | null) {
  const services = useFirebaseServices();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<PageState | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const active = useRef<Context | null>(null);
  const pending = useRef(false);
  const current = state && state.context.rideId === rideId && state.context.services === services && state.context.user === user && state.context.revision === revision ? state : null;
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("orider:activity-content-changed", refresh);
    window.addEventListener("orider:activity-safety-changed", refresh);
    return () => {
      window.removeEventListener("orider:activity-content-changed", refresh);
      window.removeEventListener("orider:activity-safety-changed", refresh);
    };
  }, []);
  useEffect(() => {
    const context = rideId ? { services, rideId, user, revision } : null;
    active.current = context; pending.current = false;
    setState(null); setError(false); setBusy(!!context);
    if (!context) return;
    pending.current = true;
    void loadActivityDiscovery(services, { scope: "groupRide", rideId: context.rideId, limit: 20 }).then(page => {
      if (active.current !== context) return;
      setState({ context, activities: page.items, cursor: page.nextCursor, pages: 1 });
    }).catch(err => {
      if (active.current !== context) return;
      logClientError("useGroupRideActivities.load", err); setError(true);
    }).finally(() => { if (active.current === context) { pending.current = false; setBusy(false); } });
    return () => { if (active.current === context) active.current = null; };
  }, [rideId, user, services, revision]);
  const loadMore = async () => {
    if (!current?.cursor || current.pages >= MAX_PAGES || pending.current || active.current !== current.context) return;
    const context = current.context;
    pending.current = true; setBusy(true); setError(false);
    try {
      const page = await loadActivityDiscovery(services, { scope: "groupRide", rideId: context.rideId, limit: 20, cursor: current.cursor });
      if (active.current !== context) return;
      const items = new Map(current.activities.map(activity => [activity.id, activity]));
      page.items.forEach(activity => items.set(activity.id, activity));
      setState({ context, activities: [...items.values()], cursor: page.nextCursor, pages: current.pages + 1 });
    } catch (err) {
      if (active.current !== context) return;
      logClientError("useGroupRideActivities.loadMore", err);
      const code = typeof err === "object" && err !== null && "code" in err ? String(err.code).replace(/^functions\//, "") : "";
      if (["permission-denied", "unauthenticated", "not-found", "failed-precondition"].includes(code) || err instanceof Error && err.message === "account_changed") setState(null);
      setError(true);
    } finally { if (active.current === context) { pending.current = false; setBusy(false); } }
  };
  return { context: current?.context ?? null, activities: current?.activities ?? EMPTY, loading: busy && !current, loadingMore: busy && !!current, error,
    hasMore: !!current?.cursor && current.pages < MAX_PAGES, limited: !!current?.cursor && current.pages >= MAX_PAGES,
    loadMore, refresh: () => setRevision(value => value + 1) };
}
