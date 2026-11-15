/**
 * 최근 N주 러닝 이력 — 주간 리캡(§3.4c)과 러너 레벨 추정(§3.1)이 공유하는 단일 쿼리.
 *
 * 두 기능이 각자 쿼리하면 대시보드 한 화면에서 같은 문서를 두 번 읽는다. 더 긴 창(레벨: 8주)이
 * 짧은 창(리캡: 3주)을 포함하므로 한 번만 읽고 소비처에서 잘라 쓴다.
 *
 * 창은 **`startTime`(실제 운동 시각)** 기준이다. `createdAt`(동기화 시각) 기준이면 Strava 를
 * 방금 연결한 사용자의 수년치 백필이 전부 `createdAt ≈ now` 로 창에 들어오고, 그중 상위
 * QUERY_LIMIT 개만 읽히면서 **정작 지난주 러닝이 잘려 나갈 수 있다** — 리캡·레벨 추정이
 * 연결 직후(=aha moment)에 틀린 값을 말하게 된다. 기존 인덱스(deletedAt, userId, startTime DESC)를
 * 재사용하므로 새 복합 인덱스는 필요 없다. 종목 필터만 클라이언트에서 적용한다.
 */
import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError, debugLog } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import type { Activity } from "@shared/types";
import { getDiscipline } from "../utils/disciplineFilter";

const WEEK_MS = 7 * 86400000;
const QUERY_LIMIT = 200;

export interface RunHistory {
  runs: Activity[];
  loading: boolean;
  available: boolean;
}

/**
 * @param enabled 러닝 탭이 아닐 때는 쿼리하지 않는다 — 자전거 사용자에게 불필요한 읽기 비용.
 */
export function useRunHistory(weeks: number, enabled = true): RunHistory & { reload: () => void } {
  const { firestore } = useFirebaseServices();
  const { user } = useAuth();
  const [state, setState] = useState<RunHistory & { ownerUid: string | null }>({ runs: [], loading: true, available: false, ownerUid: null });
  // 다시 불러오기 세대 — 바뀌면 다시 조회한다. 앞선 조회의 늦은 응답은 cancelled 로 버린다.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!user || !enabled) {
      setState({ runs: [], loading: false, available: false, ownerUid: null });
      return;
    }
    setState({ runs: [], loading: true, available: false, ownerUid: user.uid });

    const load = async () => {
      try {
        const cutoff = Date.now() - weeks * WEEK_MS;
        const q = query(
          collection(firestore, "activities"),
          where("userId", "==", user.uid),
          where("deletedAt", "==", null),
          where("startTime", ">=", cutoff),
          orderBy("startTime", "desc"),
          limit(QUERY_LIMIT),
        );
        const snap = await getDocs(q);
        const runs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Activity)
          .filter((a) => a.userId === user.uid)
          .filter((a) => a.summary != null)
          .filter((a) => getDiscipline(a.type) === "run");

        debugLog("useRunHistory.loaded", {
          weeks,
          totalDocs: snap.size,
          runs: runs.length,
          hitLimit: snap.size >= QUERY_LIMIT,
        });

        const available = snap.size < QUERY_LIMIT && snap.metadata?.fromCache === false && snap.metadata.hasPendingWrites === false;
        if (!cancelled) setState({ runs: available ? runs : [], loading: false, available, ownerUid: user.uid });
      } catch (err) {
        logClientError("useRunHistory.load", err, { weeks, attempt });
        if (!cancelled) setState({ runs: [], loading: false, available: false, ownerUid: user.uid });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, weeks, enabled, attempt]);

  const current: RunHistory = !user || !enabled ? { runs: [], loading: false, available: false }
    : state.ownerUid === user.uid ? state : { runs: [], loading: true, available: false };
  const busy = current.loading;
  // 조회 중에는 거듭 눌러도 새로 조회하지 않는다.
  const reload = useCallback(() => { if (!busy) setAttempt((n) => n + 1); }, [busy]);
  return { ...current, reload };
}
