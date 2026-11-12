import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Notification } from "@shared/types";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { doc, onSnapshot } from "firebase/firestore";
import { createWebNotificationClient } from "../services/webNotifications";
import { logClientError } from "../services/errorLogger";
/**
 * 알림함은 주기 조회 없이 `notification_signals/{uid}`(내용 없는 revision 문서, 본인만 get) 를
 * 구독하고, revision 이 바뀔 때만 getWebNotifications 로 ACL 적용된 목록을 다시 받는다.
 * 앱(Android·iOS)과 같은 계약이다. 탭을 숨기면 목록을 지우고 돌아올 때 한 번 다시 읽는다.
 */
export function useNotificationInbox() {
  const { user } = useAuth(); const services = useFirebaseServices();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const client = useMemo(() => createWebNotificationClient(services), [services, user]);
  const [state, setState] = useState<{ client: typeof client; uid: string; items: Notification[]; cursor: string | null } | null>(null);
  const [loading, setLoading] = useState(false); const [failed, setFailed] = useState(false);
  const generation = useRef(0); const activeClient = useRef(client); activeClient.current = client;
  const pendingRefresh = useRef<{ client: typeof client; generation: number; promise: Promise<void> } | null>(null);
  const refresh = useCallback((): Promise<void> => {
    const pending = pendingRefresh.current;
    if (pending?.client === client && pending.generation === generation.current) return pending.promise;
    const request = ++generation.current;
    if (!uid) { setState(null); setFailed(false); setLoading(false); return Promise.resolve(); }
    setLoading(true); setFailed(false);
    const promise = (async () => {
    try { const page = await client.list(); if (request === generation.current && activeClient.current === client) setState({ client, uid, items: page.items, cursor: page.nextCursor }); }
    catch { if (request === generation.current) { setState(null); setFailed(true); } }
    finally {
      if (request === generation.current) setLoading(false);
      if (pendingRefresh.current?.generation === request && pendingRefresh.current.client === client) pendingRefresh.current = null;
    }
    })();
    pendingRefresh.current = { client, generation: request, promise };
    return promise;
  }, [client, uid]);
  useEffect(() => {
    setState(null); void refresh();
    const visibility = () => {
      if (document.visibilityState !== "visible") { generation.current += 1; setState(null); setLoading(false); }
      else void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    // 첫 스냅샷은 위의 첫 조회와 같은 시점이라 건너뛰고, 이후 revision 변경에만 반응한다.
    let seenRevision: unknown = undefined, first = true;
    let unsubscribe = () => {};
    if (uid) {
      try {
        unsubscribe = onSnapshot(doc(services.firestore, "notification_signals", uid), snap => {
          const revision = snap.exists() ? snap.data()?.revision ?? null : null;
          if (first) { first = false; seenRevision = revision; return; }
          if (revision === seenRevision) return;
          seenRevision = revision;
          if (document.visibilityState === "visible") void refresh();
        }, error => logClientError("useNotificationInbox.signal", error, { uid }));
      } catch (error) { logClientError("useNotificationInbox.signal", error, { uid }); }
    }
    return () => { generation.current += 1; unsubscribe(); document.removeEventListener("visibilitychange", visibility); };
  }, [refresh, services, uid]);
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
