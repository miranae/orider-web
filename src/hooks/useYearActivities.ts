import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import type { Activity } from "@shared/types";

/**
 * 연말결산용 — 로그인 사용자 본인의 활동 전체를 한 번에 로드한다.
 *
 * 피드용 useActivities 는 10개 단위 무한스크롤이라 연(年) 집계에 부적합하므로,
 * 본인 활동만 createdAt 내림차순으로 일괄 조회한다(공개범위 무관, 삭제 제외).
 * 연 필터·집계는 소비처에서 computeYearRecap(순수함수)이 담당.
 */
export function useYearActivities(uid: string | null | undefined) {
  const [state, setState] = useState<{ uid: typeof uid; activities: Activity[]; loading: boolean; error: boolean }>({ uid, activities: [], loading: !!uid, error: false });
  const [retryGeneration, setRetryGeneration] = useState(0);
  const retry = useCallback(() => setRetryGeneration((generation) => generation + 1), []);

  useEffect(() => {
    if (!uid) {
      setState({ uid, activities: [], loading: false, error: false });
      return;
    }

    let cancelled = false;
    setState({ uid, activities: [], loading: true, error: false });
    const timer = globalThis.setTimeout(() => {
      cancelled = true;
      setState({ uid, activities: [], loading: false, error: true });
      logClientError("useYearActivities.load", new Error("year-activities-read-timeout"), { uid });
    }, 12_000);

    const load = async () => {
      try {
        const col = collection(firestore, "activities");
        const q = query(
          col,
          // 명시적 and()는 영구 캐시 복원 시 필터가 평탄화되어 조회 target이 달라진다.
          where("userId", "==", uid),
          where("deletedAt", "==", null),
          orderBy("createdAt", "desc"),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const items = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Activity)
          .filter((a) => a.summary != null);
        setState({ uid, activities: items, loading: false, error: false });
      } catch (err) {
        if (cancelled) return;
        logClientError("useYearActivities.load", err, { uid });
        setState({ uid, activities: [], loading: false, error: true });
      } finally {
        globalThis.clearTimeout(timer);
      }
    };

    void load();
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [uid, retryGeneration]);

  const visible = state.uid === uid ? state : { activities: [], loading: !!uid, error: false };
  return { activities: visible.activities, loading: visible.loading, error: visible.error, retry };
}
