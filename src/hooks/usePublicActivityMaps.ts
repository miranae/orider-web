import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadPublicActivityMap, type PublicActivityMap } from "../services/publicActivityMaps";
import { logClientError } from "../services/errorLogger";
const RETRY_DELAYS_MS = [5_000, 20_000, 60_000];
const EMPTY = { maps: {} as Record<string, PublicActivityMap | null>, failed: false };
/**
 * 공개 지도는 신호가 바뀔 때만 다시 조회한다.
 * - activity_map_signals/{activityId}: 활동 공개 상태 변경
 * - activity_map_viewer_signals/{uid}: 로그인한 뷰어의 접근 관계(차단·구독·친구) 변경. 익명 요청은 관계와 무관하다.
 * 신호 구독이 모두 기준값을 받은 뒤 첫 조회를 해서, 그 사이의 변경을 놓치지 않는다.
 * enabled 동안 데이터와 구독을 유지한다. 화면 밖이어도 신호가 최신을 보장하므로 비울 필요가 없다.
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
    // 조회 중에 신호가 오면 서비스가 진행 중인 같은 요청을 돌려주므로, 끝난 뒤 한 번 더 조회한다.
    let loading = false, again = false, failures = 0, retryTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (loading) { again = true; return; }
      clearTimeout(retryTimer); loading = true; again = false;
      const request = ++generation.current;
      void Promise.all(ids.map(async id => [id, await loadPublicActivityMap(services, id)] as const)).then(entries => {
        if (stopped || request !== generation.current || services.auth.currentUser !== sdkUser) return;
        failures = 0;
        const maps = Object.fromEntries(entries);
        // revision 은 공개 범위·지도·콘텐츠 버전 해시라 같으면 표시할 내용도 같다. 같은 객체를 유지해 썸네일을 다시 그리지 않는다.
        setState(previous => previous?.context === context && !previous.failed && sameMapRevisions(previous.maps, maps) ? previous : { context, maps, failed: false });
      }).catch(error => {
        if (stopped || request !== generation.current) return;
        setState({ context, maps: {}, failed: true });
        // 일시 실패는 신호가 다시 오지 않으면 복구되지 않으므로 몇 번만 늦춰 다시 시도한다.
        if (failures < RETRY_DELAYS_MS.length) retryTimer = setTimeout(refresh, RETRY_DELAYS_MS[failures++]);
        else logClientError("usePublicActivityMaps.load", error, { activityIds: key });
      }).finally(() => { if (request !== generation.current) return; loading = false; if (again && !stopped) refresh(); });
    };
    const signals: { key: string; path: readonly [string, string]; activityId?: string }[] = ids.map(id => ({ key: `activity:${id}`, path: ["activity_map_signals", id], activityId: id }));
    const viewerUid = sdkUser && !sdkUser.isAnonymous ? sdkUser.uid : null;
    if (viewerUid) signals.push({ key: "viewer", path: ["activity_map_viewer_signals", viewerUid] });
    const seen = new Map<string, number>();
    const observe = (signalKey: string, seq: number) => {
      const baselineReady = seen.size === signals.length;
      const changed = seen.has(signalKey) && seen.get(signalKey) !== seq;
      seen.set(signalKey, seq);
      if (changed || (!baselineReady && seen.size === signals.length)) refresh();
    };
    const unsubscribes = signals.map(signal => onSnapshot(doc(services.firestore, ...signal.path), snapshot => {
      const seq = snapshot.data()?.seq;
      observe(signal.key, typeof seq === "number" ? seq : 0);
    }, error => {
      // 신호를 못 받아도 첫 조회는 한다. 이후 변경은 다음 마운트 때 반영된다.
      logClientError("usePublicActivityMaps.signal", error, { signal: signal.path[0], activityId: signal.activityId });
      if (!seen.has(signal.key)) observe(signal.key, -1);
    }));
    return () => { stopped = true; generation.current++; clearTimeout(retryTimer); unsubscribes.forEach(unsubscribe => unsubscribe()); };
  }, [context, key, enabled, services, sdkUser]);
  return enabled && state?.context === context ? state : EMPTY;
}

function sameMapRevisions(a: Record<string, PublicActivityMap | null>, b: Record<string, PublicActivityMap | null>) {
  const ids = Object.keys(b);
  return Object.keys(a).length === ids.length && ids.every(id => Object.prototype.hasOwnProperty.call(a, id) && (a[id]?.revision ?? null) === (b[id]?.revision ?? null));
}
