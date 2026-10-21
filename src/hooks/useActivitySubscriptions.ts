import { useCallback, useEffect, useState, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { ACTIVITY_SUBSCRIPTIONS_ENABLED } from "../config/activitySubscriptions";
import { ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, isSubscriptionsNotDeployed, readOwnSubscriptionPage } from "../services/activitySubscriptions";

/** 모든 관계 페이지가 준비된 뒤에만 구독 피드 후보를 읽는다. */
export function useActivitySubscriptions(enabled: boolean) {
  const { user, loading: authLoading } = useAuth();
  const uid = ACTIVITY_SUBSCRIPTIONS_ENABLED && enabled && !authLoading && user && !user.isAnonymous ? user.uid : null;
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<{ key: string; ids: string[]; error: boolean; unavailable?: boolean } | null>(null);
  const identity = useRef({ uid, epoch: 0 });
  if (identity.current.uid !== uid) identity.current = { uid, epoch: identity.current.epoch + 1 };
  const key = `${uid ?? "guest"}:${identity.current.epoch}:${generation}`;
  const retry = useCallback(() => setGeneration(value => value + 1), []);
  useEffect(() => {
    if (!uid) return;
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ uid: string }>).detail?.uid === uid) retry();
    };
    window.addEventListener(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, changed);
    return () => window.removeEventListener(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, changed);
  }, [uid, retry]);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    void (async () => {
      const ids = new Set<string>();
      let cursor: string | null = null;
      const seenCursors = new Set<string>();
      do {
        const page = await readOwnSubscriptionPage(uid, "subscriptions", cursor, { hydrateProfiles: false });
        if (!active) return;
        page.items.forEach(item => { if (item.userId !== uid) ids.add(item.userId); });
        if (!page.hasMore) break;
        if (!page.cursor || seenCursors.has(page.cursor)) throw new Error("subscription-page-cursor-stalled");
        seenCursors.add(page.cursor);
        cursor = page.cursor;
      } while (active);
      if (active) setState({ key, ids: [...ids].sort(), error: false });
    })().catch(error => { if (active) setState({ key, ids: [], error: true, unavailable: isSubscriptionsNotDeployed(error) }); });
    return () => { active = false; };
  }, [uid, key]);
  const current = uid && state?.key === key ? state : null;
  return { ids: current?.ids ?? [], ready: !!current && !current.error, loading: !!uid && !current, error: current?.error === true, unavailable: current?.unavailable === true, key, retry };
}
