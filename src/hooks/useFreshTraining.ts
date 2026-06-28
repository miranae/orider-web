/**
 * 화면 진입 시 훈련 데이터(projection) 신선도 체크 + 필요 시 lazy revalidate 호출.
 *
 * 신선도 기준 (서버와 동일):
 *   - lastActivityIngestAt > projection.computedAt  (신규 활동)
 *   - now - computedAt > 3h                          (시간 경과)
 *   - computedAt 없음                                (한 번도 계산 안 됨)
 *
 * 사용처: FitnessPage, PlanPage, HomePage TodaysWorkout 등 "살아있는 분석"이 필요한 화면.
 *
 * 휴면계정 비용 0 — 화면을 안 열면 호출되지 않음.
 */

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { STALE_THRESHOLD_MS } from "@shared/training/staleness";

interface FreshTrainingState {
  /** 서버 호출 진행 중 — 로딩 UI에 사용 */
  revalidating: boolean;
  /** 재계산 완료 직후 1.5초간 true — "✓ 업데이트 완료" 트랜지언트 표시용.
   *  status='recomputed'일 때만 활성 (fresh/deduped은 사용자에게 보일 변화가 없으므로 생략). */
  justRecomputed: boolean;
  /** 마지막 revalidate 결과 (디버그/안내용) */
  lastStatus: "fresh" | "recomputed" | "deduped" | "error" | null;
}

interface RevalidateResponse {
  ok: boolean;
  status: "fresh" | "recomputed" | "deduped";
  reason?: string;
  discipline?: string | null;
}

/**
 * 컴포넌트 마운트(또는 user/discipline 변경) 시 1회 신선도 체크 → stale이면 revalidateTraining 호출.
 *
 * @param discipline 종목 지정 (예: 'bike'/'run'/'swim'). 지정 시 종목별 projection_{discipline}
 *        문서를 평가하고 서버도 해당 종목 goal만 재계산. 멀티 goal 사용자가 종목 전환할 때
 *        해당 종목 신선도를 정확히 검사하기 위함.
 */
const SUCCESS_DURATION_MS = 1500;

export function useFreshTraining(discipline?: string): FreshTrainingState {
  const { user, loading: authLoading } = useAuth();
  const [revalidating, setRevalidating] = useState(false);
  const [justRecomputed, setJustRecomputed] = useState(false);
  const [lastStatus, setLastStatus] = useState<FreshTrainingState["lastStatus"]>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      setLastStatus(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        // 1. 클라이언트 빠른 체크 — 신선하면 서버 호출 자체를 건너뛴다.
        // 종목 지정 시 projection_{discipline}, 미지정 시 호환용 단일 문서.
        const projDocId = discipline ? `projection_${discipline}` : "projection";
        const [userDoc, projDoc] = await Promise.all([
          getDoc(doc(firestore, "users", user.uid)),
          getDoc(doc(firestore, "users", user.uid, "fitness", projDocId)),
        ]);
        if (cancelled) return;

        const lastIngest = (userDoc.data()?.lastActivityIngestAt as number | undefined) ?? 0;
        const computedAt = (projDoc.data()?.computedAt as number | undefined) ?? 0;
        const now = Date.now();
        const stale = computedAt === 0
          || lastIngest > computedAt
          || (now - computedAt) > STALE_THRESHOLD_MS;

        if (!stale) {
          setLastStatus("fresh");
          return;
        }

        // 2. Stale → 서버 revalidate 호출 (서버가 다시 한 번 확인 + dedup + sentinel write)
        setRevalidating(true);
        const fn = httpsCallable<{ discipline?: string }, RevalidateResponse>(
          functions,
          "revalidateTraining",
        );
        const result = await fn(discipline ? { discipline } : {});
        if (cancelled) return;
        setLastStatus(result.data.status);
        // 실제 재계산이 일어난 경우만 success 표시 — fresh/deduped는 사용자에게 보일
        // 변화가 없으므로 인디케이터 깜빡임 없이 조용히 종료.
        if (result.data.status === "recomputed") {
          setJustRecomputed(true);
        }
      } catch (err) {
        if (cancelled) return;
        logClientError("useFreshTraining.revalidate", err, { discipline });
        setLastStatus("error");
      } finally {
        if (!cancelled) setRevalidating(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authLoading, user, discipline]);

  // justRecomputed가 켜지면 1.5초 후 자동 해제 — "✓ 업데이트 완료" 트랜지언트 표시
  useEffect(() => {
    if (!justRecomputed) return;
    const t = setTimeout(() => setJustRecomputed(false), SUCCESS_DURATION_MS);
    return () => clearTimeout(t);
  }, [justRecomputed]);

  return { revalidating, justRecomputed, lastStatus };
}
