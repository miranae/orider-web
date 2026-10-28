import { collection, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";

interface State { uid: string; hidden: Set<string>; blocked: Set<string>; ready: boolean; error: boolean }
/** Owner-only preference collections. Cached lists alone cannot establish the current safety boundary. */
export function useActivitySafety(uid: string | null, enabled = true) {
  const { firestore } = useFirebaseServices();
  const [state, setState] = useState<State | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!uid || !enabled) return;
    let active = true;
    let failed = false;
    let hidden: Set<string> | null = null;
    let blocked: Set<string> | null = null;
    setState(null);
    const fail = () => { failed = true; if (active) setState({ uid, hidden: new Set(), blocked: new Set(), ready: false, error: true }); };
    const timeout = window.setTimeout(fail, 10000);
    const listen = (kind: "hidden_activities" | "blocks") => onSnapshot(collection(firestore, "users", uid, kind), { includeMetadataChanges: true }, snapshot => {
      if (!active || failed) return;
      if (snapshot.metadata.fromCache) return;
      const ids = new Set(snapshot.docs.filter(doc => doc.data().deletedAt == null).map(doc => doc.id));
      if (kind === "blocks") blocked = ids; else hidden = ids;
      if (hidden && blocked) {
        window.clearTimeout(timeout);
        setState({ uid, hidden, blocked, ready: true, error: false });
      }
    }, fail);
    const offHidden = listen("hidden_activities");
    const offBlocks = listen("blocks");
    const changed = (event: Event) => { if ((event as CustomEvent<{ uid?: string }>).detail?.uid === uid) { setState(null); retry(); } };
    window.addEventListener("orider:activity-safety-changed", changed);
    return () => {
      active = false; window.clearTimeout(timeout); offHidden(); offBlocks();
      window.removeEventListener("orider:activity-safety-changed", changed);
    };
  }, [uid, enabled, attempt, retry]);
  const current = state?.uid === uid ? state : null;
  const ready = !uid || !enabled || current?.ready === true;
  const error = !!uid && enabled && current?.error === true;
  const allows = useCallback((activity: { id: string; userId: string }) => ready && (!uid || !enabled ||
    (!current?.hidden.has(activity.id) && !current?.blocked.has(activity.userId))), [ready, uid, enabled, current]);
  return { allows, loading: !ready && !error, error, retry };
}
