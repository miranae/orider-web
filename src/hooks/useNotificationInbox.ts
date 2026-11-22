import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Notification } from "@shared/types";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { doc, onSnapshot, type DocumentSnapshot } from "firebase/firestore";
import { createWebNotificationClient } from "../services/webNotifications";
import { getRuntimeConfig, isEmulatorRuntime } from "../services/runtimeConfig";
import { logClientError } from "../services/errorLogger";
import { followWorldSignal } from "../features/ride-world/followWorldSignal";
/**
 * 알림함은 주기 조회 없이 `notification_signals/{uid}`(내용 없는 revision 문서, 본인만 get) 를
 * 구독하고, revision 이 바뀔 때만 getWebNotifications 로 ACL 적용된 목록을 다시 받는다.
 * 앱(Android·iOS)과 같은 계약이다. 탭을 숨기면 목록을 지우고 돌아올 때 한 번 다시 읽는다.
 */
export function useNotificationInbox() {
  const { user } = useAuth(); const services = useFirebaseServices();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const redisSignal = import.meta.env.DEV && import.meta.env.VITE_ORIDER_LOCAL_WORLD === "1" &&
    import.meta.env.VITE_ORIDER_LOCAL_NOTIFICATION_REDIS === "1" && isEmulatorRuntime() &&
    getRuntimeConfig().firebaseProjectId === "demo-orider-lab";
  const client = useMemo(() => createWebNotificationClient(services), [services, user]);
  const [state, setState] = useState<{ client: typeof client; uid: string; items: Notification[]; cursor: string | null } | null>(null);
  const [loading, setLoading] = useState(false); const [failed, setFailed] = useState(false);
  const generation = useRef(0); const activeClient = useRef(client); activeClient.current = client;
  const pageDepth = useRef(1);
  const pendingRefresh = useRef<{ client: typeof client; generation: number; promise: Promise<void> } | null>(null);
  const reload = useCallback((preservePages = false): Promise<void> => {
    const pending = pendingRefresh.current;
    if (pending?.client === client && pending.generation === generation.current) return pending.promise;
    const request = ++generation.current;
    if (!uid) { setState(null); setFailed(false); setLoading(false); return Promise.resolve(); }
    setLoading(true); setFailed(false);
    const currentRequest = () => request === generation.current && activeClient.current === client;
    const requestedDepth = preservePages ? pageDepth.current : 1;
    const promise = (async () => {
      try {
        const page = await client.list();
        const items = [...page.items];
        let cursor = page.nextCursor;
        let loaded = 1;
        // Signal sources use separate revisions. Revalidate opened pages on handoff
        // so a healthy fallback preserves pagination without keeping stale rows.
        for (; loaded < requestedDepth && cursor && currentRequest(); loaded++) {
          const next = await client.list(cursor);
          items.push(...next.items);
          cursor = next.nextCursor;
        }
        if (currentRequest()) {
          pageDepth.current = loaded;
          setState({ client, uid, items, cursor });
        }
      } catch (error) {
        logClientError("useNotificationInbox.list", error, undefined, services, user);
        if (currentRequest()) { pageDepth.current = 1; setState(null); setFailed(true); }
      } finally {
        if (currentRequest()) setLoading(false);
        if (pendingRefresh.current?.generation === request && pendingRefresh.current.client === client) pendingRefresh.current = null;
      }
    })();
    pendingRefresh.current = { client, generation: request, promise };
    return promise;
  }, [client, services, uid, user]);
  const refresh = useCallback(() => reload(), [reload]);
  useEffect(() => {
    pageDepth.current = 1;
    setState(null);
    let disposed = false, again = false, preserveNext = false;
    // 신호를 받으면 한 번 읽는다. 이미 읽는 중이면 그 응답이 새 알림보다 앞설 수 있으므로
    // 끝난 뒤 한 번 더 읽는다(합치기만 하면 진행 중 요청에 묻혀 새 알림을 놓친다).
    const pull = (preservePages = false) => {
      if (disposed || document.visibilityState !== "visible") return;
      const pending = pendingRefresh.current;
      if (pending?.client === client && pending.generation === generation.current) {
        // 진행 중인 조회가 pull 이 아니라 탭 복귀·직접 refresh() 로 시작됐어도, 그 응답은 새 알림보다
        // 앞설 수 있으므로 끝난 뒤 한 번 더 읽는다(이 신호를 버리지 않는다).
        preserveNext ||= preservePages;
        if (!again) { again = true; void pending.promise.finally(drain); }
        return;
      }
      void reload(preservePages).finally(drain);
    };
    const drain = () => {
      if (!again || disposed) return;
      const preserve = preserveNext;
      again = false; preserveNext = false; pull(preserve);
    };
    const visibility = () => {
      if (document.visibilityState !== "visible") { generation.current += 1; again = false; preserveNext = false; pageDepth.current = 1; setState(null); setLoading(false); }
      else void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    let unsubscribe = () => {};
    if (!uid) void refresh();
    else {
      // 첫 조회도 첫 신호 스냅샷에서 시작한다 — 먼저 읽고 나중에 기준 revision 을 잡으면
      // 그 사이에 생긴 알림을 놓친다. 구독이 실패하면 한 번 직접 읽는다.
      let canonicalRevision: unknown = undefined;
      let worldRevision: string | null | undefined;
      let awaitingFallback = false;
      const canonicalChanged = (revision: unknown) => {
        const preservePages = awaitingFallback;
        awaitingFallback = false;
        if (revision === canonicalRevision) return;
        canonicalRevision = revision;
        pull(preservePages);
      };
      const fallback = (error: unknown) => {
        logClientError("useNotificationInbox.signal", error, undefined, services, user);
        if (canonicalRevision === undefined && worldRevision === undefined) canonicalChanged(null);
      };
      let stopSource: (() => void) | undefined;
      const startSource = () => {
        if (disposed || stopSource) return;
        try {
          const source = doc(services.firestore, "notification_signals", uid);
          const changed = (snap: DocumentSnapshot) => {
            if (redisSignal && snap.metadata?.fromCache) return;
            canonicalChanged(snap.exists() ? snap.data()?.revision ?? null : null);
          };
          stopSource = redisSignal
            ? onSnapshot(source, { includeMetadataChanges: true }, changed, fallback)
            : onSnapshot(source, changed, fallback);
        } catch (error) { fallback(error); }
      };
      const stopCanonical = () => { stopSource?.(); stopSource = undefined; };
      startSource();
      const stopWorld = redisSignal && user ? followWorldSignal(
        "ws://127.0.0.1:19487/notification-signals",
        async () => ({ v: 1, type: "notification_subscribe", token: await user.getIdToken() }),
        data => {
          const frame = data as { v?: number; type?: string; revision?: string | null } | null;
          if (frame?.v !== 1 || frame.type !== "notification_signal" ||
              (frame.revision !== null && (typeof frame.revision !== "string" || !/^\d{10}:\d{9}$/.test(frame.revision)))) return false;
          const handoff = stopSource !== undefined;
          stopCanonical();
          if (frame.revision !== worldRevision) {
            worldRevision = frame.revision;
            pull(handoff);
          }
          return true;
        },
        code => {
          if (code === 4003 || code === 4004) {
            stopCanonical();
            generation.current += 1; again = false; preserveNext = false; pageDepth.current = 1;
            setState(null); setLoading(false); setFailed(true);
          } else {
            awaitingFallback = true;
            startSource();
          }
        },
        (source, error, context) => logClientError(source, error, context, services, user),
      ) : undefined;
      unsubscribe = () => { stopWorld?.(); stopCanonical(); };
    }
    return () => { disposed = true; generation.current += 1; unsubscribe(); document.removeEventListener("visibilitychange", visibility); };
  }, [refresh, reload, services, uid, client, redisSignal, user]);
  const current = state?.uid === uid && state.client === client ? state : null;
  const more = async () => {
    if (!current?.cursor || loading || !uid) return;
    const request = ++generation.current; setLoading(true); setFailed(false);
    pageDepth.current += 1;
    try {
      const page = await client.list(current.cursor);
      if (request === generation.current && activeClient.current === client) setState({ client, uid, items: [...current.items, ...page.items], cursor: page.nextCursor });
    } catch (error) {
      logClientError("useNotificationInbox.more", error, undefined, services, user);
      if (request === generation.current && activeClient.current === client) {
        pageDepth.current = 1; setState(null); setFailed(true);
      }
    }
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
      logClientError("useNotificationInbox.markRead", error, undefined, services, user);
      if (activeClient.current === client) {
        const code = (error as { code?: string })?.code;
        if (code === "functions/permission-denied" || code === "functions/unauthenticated") {
          generation.current += 1;
          pageDepth.current = 1;
          setState(null);
          setLoading(false);
        }
        setFailed(true);
      }
    }
  };
  return { items: current?.items ?? [], loading, failed, refresh, more, hasMore: !!current?.cursor, markRead };
}
