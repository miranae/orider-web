import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseServices } from '../contexts/FirebaseServicesContext';
import { createPublicActivityClient, type PublicActivityDetail } from '../services/publicActivityDetail';

/** The board never reads or reconstructs an owner's raw activity. */
export function useLinkedPublicActivity(activityId?: string) {
  const services = useFirebaseServices();
  const viewer = services.auth.currentUser;
  const [state, setState] = useState<{id:string;services:typeof services;viewer:typeof viewer;data:PublicActivityDetail}|null>(null);
  useEffect(() => {
    let generation = 0;
    let alive = true;
    const load = () => {
      const request = ++generation;
      setState(null);
      if (!activityId || document.visibilityState === 'hidden' || services.auth.currentUser !== viewer) return;
      void createPublicActivityClient(services).load(activityId).then(data => {
        if (alive && request === generation && services.auth.currentUser === viewer && data.activity.id === activityId && data.content.activityId === activityId)
          setState({id:activityId,services,viewer,data});
      }).catch(() => { if (alive && request === generation) setState(null); });
    };
    const changed = () => load();
    const unsubscribe = onAuthStateChanged(services.auth, changed);
    document.addEventListener('visibilitychange', changed);
    window.addEventListener('orider:activity-content-changed', changed);
    window.addEventListener('orider:activity-safety-changed', changed);
    // 주기 재조회 없음: 띄워 둔 게시글에서 카드가 30초마다 사라졌다 나타나고 함수 호출이 쌓였다.
    // 권한 재확인은 탭 복귀·로그인 변경·안전/내용 변경 이벤트 때만 한다.
    load();
    return () => { alive=false; generation++; unsubscribe(); document.removeEventListener('visibilitychange',changed); window.removeEventListener('orider:activity-content-changed',changed); window.removeEventListener('orider:activity-safety-changed',changed); };
  }, [activityId, services, viewer]);
  return state && state.id===activityId && state.services===services && state.viewer===viewer ? state.data : null;
}
