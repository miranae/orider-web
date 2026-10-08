/**
 * 러닝 마일스톤 구독 — `users/{uid}/milestones` (설계 문서 §3.4b).
 *
 * 서버(personal-records 트리거)가 거리 완주를 판정해 write 한다. 프론트는 read-only 구독 +
 * `celebrated` 필드만 갱신(모달 노출 표시, rules 로 강제). 판정은 하지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { logClientError, debugLog } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import type { Milestone, MilestoneId } from "@shared/types/milestone";

export interface MilestonesState {
  /** 달성한 마일스톤 (id → 문서). 미달성은 여기 없다. */
  achieved: Map<MilestoneId, Milestone>;
  loading: boolean;
  /** 축하 모달을 띄운 뒤 celebrated=true 로 갱신. */
  markCelebrated: (id: MilestoneId) => Promise<void>;
}

export function useMilestones(enabled = true, active = true): MilestonesState {
  const { user } = useAuth();
  const { firestore } = useFirebaseServices();
  const [achieved, setAchieved] = useState<Map<MilestoneId, Milestone>>(new Map());
  const [loading, setLoading] = useState(true);

  const uid = user?.uid ?? null;
  const ownerUid = useRef(uid);
  const generationRef = useRef(0);
  useEffect(() => {
    const generation = ++generationRef.current;
    if (ownerUid.current !== uid) {
      setAchieved(new Map());
      setLoading(false);
      ownerUid.current = uid;
    }
    if (!active && user && enabled) return;
    if (!user || !enabled) {
      setAchieved(new Map());
      setLoading(false);
      return;
    }
    const ref = collection(firestore, "users", user.uid, "milestones");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (generationRef.current !== generation) return;
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
        if (generationRef.current !== generation) return;
        logClientError("useMilestones.subscribe", err);
        setLoading(false);
      },
    );
    return () => {
      generationRef.current += 1;
      unsub();
    };
  }, [active, enabled, firestore, uid, user]);

  const markCelebrated = useCallback(
    async (id: MilestoneId) => {
      if (!user) return;
      try {
        await updateDoc(doc(firestore, "users", user.uid, "milestones", id), { celebrated: true });
      } catch (err) {
        logClientError("useMilestones.markCelebrated", err, { id });
      }
    },
    [firestore, user],
  );

  return { achieved: ownerUid.current === uid ? achieved : new Map(), loading: ownerUid.current === uid && loading, markCelebrated };
}
