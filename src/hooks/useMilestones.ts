/**
 * 러닝 마일스톤 구독 — `users/{uid}/milestones` (설계 문서 §3.4b).
 *
 * 서버(personal-records 트리거)가 거리 완주를 판정해 write 한다. 프론트는 read-only 구독 +
 * `celebrated` 필드만 갱신(모달 노출 표시, rules 로 강제). 판정은 하지 않는다.
 */
import { useCallback, useEffect, useState } from "react";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError, debugLog } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import type { Milestone, MilestoneId } from "@shared/types/milestone";

export interface MilestonesState {
  /** 달성한 마일스톤 (id → 문서). 미달성은 여기 없다. */
  achieved: Map<MilestoneId, Milestone>;
  loading: boolean;
  /** 축하 모달을 띄운 뒤 celebrated=true 로 갱신. */
  markCelebrated: (id: MilestoneId) => Promise<void>;
}

export function useMilestones(enabled = true): MilestonesState {
  const { user } = useAuth();
  const [achieved, setAchieved] = useState<Map<MilestoneId, Milestone>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !enabled) {
      setAchieved(new Map());
      setLoading(false);
      return;
    }
    const ref = collection(firestore, "users", user.uid, "milestones");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const map = new Map<MilestoneId, Milestone>();
        for (const d of snap.docs) map.set(d.id as MilestoneId, d.data() as Milestone);
        debugLog("useMilestones.snapshot", {
          count: map.size,
          uncelebrated: [...map.values()].filter((m) => !m.celebrated).map((m) => m.id),
        });
        setAchieved(map);
        setLoading(false);
      },
      (err) => {
        logClientError("useMilestones.subscribe", err);
        setLoading(false);
      },
    );
    return unsub;
  }, [user, enabled]);

  const markCelebrated = useCallback(
    async (id: MilestoneId) => {
      if (!user) return;
      try {
        await updateDoc(doc(firestore, "users", user.uid, "milestones", id), { celebrated: true });
      } catch (err) {
        logClientError("useMilestones.markCelebrated", err, { id });
      }
    },
    [user],
  );

  return { achieved, loading, markCelebrated };
}
