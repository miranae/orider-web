import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadPublicActivityMap, type PublicActivityMap } from "../services/publicActivityMaps";
const EMPTY = { maps: {} as Record<string, PublicActivityMap | null>, failed: false };
/** Live maps have a stricter lifetime than cached feed cards. Offscreen callers must pass enabled=false. */
export function usePublicActivityMaps(activityIds: string[], enabled = true) {
  const { user } = useAuth(), services = useFirebaseServices();
  const sdkUser = services.auth.currentUser;
  const key = [...new Set(activityIds)].sort().join("|");
  const context = useMemo(() => ({ user, sdkUser, services, key, enabled }), [user, sdkUser, services, key, enabled]);
  const generation = useRef(0);
  const [state, setState] = useState<{ context: typeof context; maps: Record<string, PublicActivityMap | null>; failed: boolean } | null>(null);
  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      const request = ++generation.current; setState(null);
      if (!enabled || document.visibilityState === "hidden" || !key) return;
      const ids = key.split("|");
      void Promise.all(ids.map(async id => [id, await loadPublicActivityMap(services, id)] as const)).then(entries => {
        if (!stopped && request === generation.current && services.auth.currentUser === sdkUser) setState({ context, maps: Object.fromEntries(entries), failed: false });
      }).catch(() => { if (!stopped && request === generation.current) setState({ context, maps: {}, failed: true }); });
    };
    refresh(); const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { stopped = true; generation.current++; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [context, key, enabled, services, user, sdkUser]);
  return state?.context === context ? state : EMPTY;
}
