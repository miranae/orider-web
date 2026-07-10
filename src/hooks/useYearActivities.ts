import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  and,
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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setActivities([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const col = collection(firestore, "activities");
        const q = query(
          col,
          and(where("userId", "==", uid), where("deletedAt", "==", null)),
          orderBy("createdAt", "desc"),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const items = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Activity)
          .filter((a) => a.summary != null);
        setActivities(items);
      } catch (err) {
        logClientError("useYearActivities.load", err, { uid });
        if (!cancelled) setActivities([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return { activities, loading };
}
