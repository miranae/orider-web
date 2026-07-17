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

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, firestore, functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { STALE_THRESHOLD_MS } from "@shared/training/staleness";
import {
  executeFirestoreSessionRecovery,
  firestoreRecoveryLogContext,
  prepareFirestoreSessionRecovery,
} from "../utils/firestoreSessionRecovery";

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

function reportFreshnessError(err: unknown, discipline: string | undefined, cancelled: boolean) {
  const recovery = prepareFirestoreSessionRecovery(err);
  if (recovery.kind) {
    // b815는 이 요청만의 실패가 아니라 공유 AsyncQueue가 영구 중단된 상태다.
    // 언마운트된 뒤 오류가 도착해도 진단을 남기고 탭 세션당 한 번 복구해야 한다.
    logClientError("useFreshTraining.revalidate", err, {
      discipline,
      ...firestoreRecoveryLogContext(recovery),
    });
    executeFirestoreSessionRecovery(recovery);
  } else if (!cancelled) {
    logClientError("useFreshTraining.revalidate", err, { discipline });
  }
}

export function useFreshTraining(discipline?: string): FreshTrainingState {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid;
  const [revalidating, setRevalidating] = useState(false);
  const [justRecomputed, setJustRecomputed] = useState(false);
  const [lastStatus, setLastStatus] = useState<FreshTrainingState["lastStatus"]>(null);
  const disciplineRef = useRef(discipline);
  const userFreshnessRef = useRef({ uid: undefined as string | undefined, ready: false, failed: false, lastIngest: 0 });
  const evaluateCurrentProjectionRef = useRef<() => void>(() => undefined);
  disciplineRef.current = discipline;

  // user 문서는 discipline과 무관하므로 사용자 세션 전체에서 구독을 유지한다.
  // 종목 전환 때 이 target까지 불필요하게 release/re-add하지 않는다.
  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!uid) {
      userFreshnessRef.current = { uid: undefined, ready: false, failed: false, lastIngest: 0 };
      setRevalidating(false);
      setLastStatus(null);
      return;
    }
    let cancelled = false;
    let listenerFailed = false;
    let unsubscribe: () => void = () => undefined;
    const userGeneration = { uid, ready: false, failed: false, lastIngest: 0 };
    userFreshnessRef.current = userGeneration;

    const handleUserError = (err: unknown) => {
      if (listenerFailed) return;
      listenerFailed = true;
      const isCurrentGeneration = userFreshnessRef.current === userGeneration;
      if (isCurrentGeneration) userGeneration.failed = true;
      reportFreshnessError(err, disciplineRef.current, cancelled);
      if (!cancelled && isCurrentGeneration) {
        setLastStatus("error");
        setRevalidating(false);
      }
    };

    try {
      unsubscribe = onSnapshot(
        doc(firestore, "users", uid),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (cancelled || listenerFailed || userFreshnessRef.current !== userGeneration
            || userGeneration.ready) return;
          userGeneration.lastIngest =
            (snapshot.data()?.lastActivityIngestAt as number | undefined) ?? 0;
          if (snapshot.metadata.fromCache) return;
          userGeneration.ready = true;
          evaluateCurrentProjectionRef.current();
        },
        handleUserError,
      );
    } catch (err) {
      handleUserError(err);
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authLoading, uid]);

  useEffect(() => {
    if (authLoading || !uid) return;
    if (userFreshnessRef.current.uid === uid && userFreshnessRef.current.failed) return;
    const userGeneration = userFreshnessRef.current;
    let cancelled = false;
    let listenerFailed = false;
    let evaluationStarted = false;
    let projectionSnapshotReady = false;
    let computedAt = 0;
    let unsubscribe: () => void = () => undefined;

    const hasCurrentUserGeneration = () => (
      userFreshnessRef.current === userGeneration && !userGeneration.failed
    );

    const handleProjectionError = (err: unknown) => {
      if (listenerFailed) return;
      listenerFailed = true;
      const hasCurrentUser = hasCurrentUserGeneration();
      reportFreshnessError(err, discipline, cancelled || !hasCurrentUser);
      if (!cancelled && hasCurrentUser) {
        setLastStatus("error");
        setRevalidating(false);
      }
    };

    const evaluateFreshness = async () => {
      try {
        if (!hasCurrentUserGeneration()) return;
        const lastIngest = userGeneration.lastIngest;
        const now = Date.now();
        const stale = computedAt === 0
          || lastIngest > computedAt
          || (now - computedAt) > STALE_THRESHOLD_MS;

        if (!stale) {
          setRevalidating(false);
          setLastStatus("fresh");
          return;
        }

        // 2. Stale → 서버 revalidate 호출 (서버가 다시 한 번 확인 + dedup + sentinel write)
        setRevalidating(true);
        await ensureAppCheckReady();
        if (cancelled || listenerFailed || !hasCurrentUserGeneration()) return;
        const fn = httpsCallable<{ discipline?: string }, RevalidateResponse>(
          functions,
          "revalidateTraining",
        );
        const result = await fn(discipline ? { discipline } : {});
        if (cancelled || listenerFailed || !hasCurrentUserGeneration()) return;
        setLastStatus(result.data.status);
        // 실제 재계산이 일어난 경우만 success 표시 — fresh/deduped는 사용자에게 보일
        // 변화가 없으므로 인디케이터 깜빡임 없이 조용히 종료.
        if (result.data.status === "recomputed") {
          setJustRecomputed(true);
        }
      } catch (err) {
        handleProjectionError(err);
      } finally {
        if (!cancelled && !listenerFailed && hasCurrentUserGeneration()) setRevalidating(false);
      }
    };

    const evaluateWhenReady = () => {
      if (cancelled || listenerFailed || evaluationStarted
        || !hasCurrentUserGeneration()
        || !userGeneration.ready || !projectionSnapshotReady) return;
      evaluationStarted = true;
      void evaluateFreshness();
    };
    evaluateCurrentProjectionRef.current = evaluateWhenReady;

    // transient getDoc target을 즉시 만들고 제거하면 멀티탭 Firestore AsyncQueue에서
    // target 해제 경쟁이 발생할 수 있다. 두 서버 확정 스냅샷을 기다린 뒤 한 번만 평가하되,
    // listener는 해당 user/discipline 세대 전체에서 유지해 target churn을 피한다.
    const projDocId = discipline ? `projection_${discipline}` : "projection";
    try {
      unsubscribe = onSnapshot(
        doc(firestore, "users", uid, "fitness", projDocId),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (cancelled || projectionSnapshotReady) return;
          computedAt = (snapshot.data()?.computedAt as number | undefined) ?? 0;
          if (snapshot.metadata.fromCache) return;
          projectionSnapshotReady = true;
          evaluateWhenReady();
        },
        handleProjectionError,
      );
    } catch (err) {
      handleProjectionError(err);
    }

    return () => {
      cancelled = true;
      if (evaluateCurrentProjectionRef.current === evaluateWhenReady) {
        evaluateCurrentProjectionRef.current = () => undefined;
      }
      unsubscribe();
    };
  }, [authLoading, uid, discipline]);

  // justRecomputed가 켜지면 1.5초 후 자동 해제 — "✓ 업데이트 완료" 트랜지언트 표시
  useEffect(() => {
    if (!justRecomputed) return;
    const t = setTimeout(() => setJustRecomputed(false), SUCCESS_DURATION_MS);
    return () => clearTimeout(t);
  }, [justRecomputed]);

  return { revalidating, justRecomputed, lastStatus };
}
