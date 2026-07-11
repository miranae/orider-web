/**
 * 서버 산출 통합 피트니스 — `users/{uid}/fitness/current` (UserFitness).
 *
 * 종목별 CTL/ATL/TSB 를 서버가 이미 계산해 두었다. 통합 부하 카드(§3.7)가 `TriFitnessView`
 * 처럼 활동+스트림에서 클라이언트 재계산을 하면 대시보드에서 너무 비싸다.
 *
 * 이 문서는 백엔드(orider-g1-web)가 쓴다. 없을 수도 있으므로(신규 사용자, 미배포 환경)
 * null 을 그대로 반환하고 소비처는 카드를 렌더하지 않는다 — 0 으로 채워 넣지 않는다.
 */
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError, debugLog } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import type { UserFitness } from "@shared/types";

export interface UserFitnessState {
  fitness: UserFitness | null;
  loading: boolean;
}

export function useUserFitness(enabled = true): UserFitnessState {
  const { user } = useAuth();
  const [state, setState] = useState<UserFitnessState>({ fitness: null, loading: true });

  useEffect(() => {
    if (!user || !enabled) {
      setState({ fitness: null, loading: false });
      return;
    }
    const ref = doc(firestore, "users", user.uid, "fitness", "current");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const fitness = snap.exists() ? (snap.data() as UserFitness) : null;
        debugLog("useUserFitness.snapshot", {
          exists: snap.exists(),
          totalCTL: fitness?.totalCTL ?? null,
          hasBreakdown: !!fitness?.breakdown,
        });
        setState({ fitness, loading: false });
      },
      (err) => {
        logClientError("useUserFitness.subscribe", err);
        setState({ fitness: null, loading: false });
      },
    );
    return unsub;
  }, [user, enabled]);

  return state;
}
