import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Notification } from "@shared/types";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { createWebNotificationClient } from "../services/webNotifications";
export function useNotificationInbox() {
  const { user } = useAuth(); const services = useFirebaseServices();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const client = useMemo(() => createWebNotificationClient(services), [services, user]);
  const [state, setState] = useState<{ client: typeof client; uid: string; items: Notification[]; cursor: string | null } | null>(null);
  const [loading, setLoading] = useState(false); const [failed, setFailed] = useState(false);
  const generation = useRef(0); const activeClient = useRef(client); activeClient.current = client;
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!uid) { setState(null); setFailed(false); setLoading(false); return; }
    setLoading(true); setFailed(false);
    try { const page = await client.list(); if (request === generation.current && activeClient.current === client) setState({ client, uid, items: page.items, cursor: page.nextCursor }); }
    catch { if (request === generation.current) { setState(null); setFailed(true); } }
    finally { if (request === generation.current) setLoading(false); }
  }, [client, uid]);
  useEffect(() => {
    setState(null); void refresh();
    const poll = () => { if (document.visibilityState === "visible") void refresh(); };
    const visibility = () => {
      if (document.visibilityState !== "visible") { generation.current += 1; setState(null); setLoading(false); }
      else void refresh();
    };
    const timer = window.setInterval(poll, 30000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", poll);
    return () => { generation.current += 1; clearInterval(timer); window.removeEventListener("focus", poll); document.removeEventListener("visibilitychange", visibility); };
  }, [refresh]);
  const current = state?.uid === uid && state.client === client ? state : null;
  const more = async () => {
    if (!current?.cursor || loading || !uid) return;
    const request = ++generation.current; setLoading(true); setFailed(false);
    try {
      const page = await client.list(current.cursor);
      if (request === generation.current && activeClient.current === client) setState({ client, uid, items: [...current.items, ...page.items], cursor: page.nextCursor });
    } catch { if (request === generation.current) { setState(null); setFailed(true); } }
    finally { if (request === generation.current) setLoading(false); }
  };
  const markRead = async (ids: string[]) => {
    if (!uid || services.auth.currentUser?.uid !== uid) return;
    try {
      // Mark all visible pages in bounded server batches; never rewrite notification payloads.
      for (let start = 0; start < ids.length; start += 20) {
        const result = await client.markRead(ids.slice(start, start + 20));
        if (activeClient.current !== client) return;
        setState(value => value?.uid === uid && value.client === client ? { ...value, items: value.items.map(item => result.ids.includes(item.id) ? { ...item, read: true } : item) } : value);
      }
    } catch (error) {
      if (activeClient.current === client) {
        const code = (error as { code?: string })?.code;
        if (code === "functions/permission-denied" || code === "functions/unauthenticated") {
          generation.current += 1;
          setState(null);
          setLoading(false);
        }
        setFailed(true);
      }
    }
  };
  return { items: current?.items ?? [], loading, failed, refresh, more, hasMore: !!current?.cursor, markRead };
}
