import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadPublicActivityMap, type PublicActivityMap } from "../services/publicActivityMaps";
import { logClientError } from "../services/errorLogger";
const EMPTY = { maps: {} as Record<string, PublicActivityMap | null>, failed: false };
/**
 * 공개 지도는 활동 공개 상태 변경 신호(activity_map_signals/{activityId})가 바뀔 때만 다시 조회한다.
 * 신호 구독이 모두 기준값을 받은 뒤 첫 조회를 해서, 그 사이의 변경을 놓치지 않는다. Offscreen callers must pass enabled=false.
 */
export function usePublicActivityMaps(activityIds: string[], enabled = true) {
  const { user } = useAuth(), services = useFirebaseServices();
  const sdkUser = services.auth.currentUser;
  const key = [...new Set(activityIds)].sort().join("|");
  const context = useMemo(() => ({ user, sdkUser, services, key }), [user, sdkUser, services, key]);
  const generation = useRef(0);
  const [state, setState] = useState<{ context: typeof context; maps: Record<string, PublicActivityMap | null>; failed: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || !key) { generation.current++; setState(null); return; }
    let stopped = false;
    // 계정·대상이 바뀐 결과만 즉시 비운다. 같은 대상의 재조회는 응답이 올 때까지 기존 지도를 유지한다.
    setState(previous => previous?.context === context ? previous : null);
    const ids = key.split("|");
    const refresh = () => {
      const request = ++generation.current;
      void Promise.all(ids.map(async id => [id, await loadPublicActivityMap(services, id)] as const)).then(entries => {
        if (stopped || request !== generation.current || services.auth.currentUser !== sdkUser) return;
        const maps = Object.fromEntries(entries);
        // revision 은 공개 범위·지도·콘텐츠 버전 해시라 같으면 표시할 내용도 같다. 같은 객체를 유지해 썸네일을 다시 그리지 않는다.
        setState(previous => previous?.context === context && !previous.failed && sameMapRevisions(previous.maps, maps) ? previous : { context, maps, failed: false });
      }).catch(() => { if (!stopped && request === generation.current) setState({ context, maps: {}, failed: true }); });
    };
    const seen = new Map<string, number>();
    const observe = (id: string, seq: number) => {
      const baselineReady = seen.size === ids.length;
      const changed = seen.has(id) && seen.get(id) !== seq;
      seen.set(id, seq);
      if (changed || (!baselineReady && seen.size === ids.length)) refresh();
    };
    const unsubscribes = ids.map(id => onSnapshot(doc(services.firestore, "activity_map_signals", id), snapshot => {
      const seq = snapshot.data()?.seq;
      observe(id, typeof seq === "number" ? seq : 0);
    }, error => {
      // 신호를 못 받아도 첫 조회는 한다. 이후 변경은 다음 마운트 때 반영된다.
      logClientError("usePublicActivityMaps.signal", error, { activityId: id });
      if (!seen.has(id)) observe(id, -1);
    }));
    return () => { stopped = true; generation.current++; unsubscribes.forEach(unsubscribe => unsubscribe()); };
  }, [context, key, enabled, services, sdkUser]);
  return enabled && state?.context === context ? state : EMPTY;
}

function sameMapRevisions(a: Record<string, PublicActivityMap | null>, b: Record<string, PublicActivityMap | null>) {
  const ids = Object.keys(b);
  return Object.keys(a).length === ids.length && ids.every(id => Object.prototype.hasOwnProperty.call(a, id) && (a[id]?.revision ?? null) === (b[id]?.revision ?? null));
}
