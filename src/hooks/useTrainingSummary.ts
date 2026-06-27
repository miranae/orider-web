/**
 * `users/{uid}/fitness/summary_{discipline}` 문서 onSnapshot 구독.
 *
 * 갱신: 서버 측 recomputeTrainingSummary (PMC projection 과 같은 신선도 트리거).
 * 활용: 오늘의 권장 카드 fallback narrative 컨텍스트 + CF 프롬프트 입력.
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import type { TrainingSummary } from "@shared/types/training-summary";
import type { Discipline } from "../utils/disciplineFilter";

export function useTrainingSummary(discipline: Discipline): TrainingSummary | null {
  const { user } = useAuth();
  const [summary, setSummary] = useState<TrainingSummary | null>(null);

  useEffect(() => {
    setSummary(null);
    if (!user || discipline === "tri") return;
    const ref = doc(firestore, "users", user.uid, "fitness", `summary_${discipline}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setSummary(null);
          return;
        }
        setSummary(snap.data() as TrainingSummary);
      },
      (err) => {
        console.warn("[useTrainingSummary] subscribe fail:", err);
      },
    );
    return () => unsub();
  }, [user, discipline]);

  return summary;
}
