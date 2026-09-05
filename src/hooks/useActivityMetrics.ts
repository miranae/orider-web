/**
 * useActivityMetrics — Phase A 산출물 `activity_metrics/{activityId}` 구독.
 *
 * 2026-05-28: AnalysisTab 가 매 진입마다 streams 로 재계산하던 14+ 지표를 서버
 * 1회 계산본에서 가져온다. v1 hook 은 doc 만 노출 — 호출자가 어떤 필드를 server
 * 우선으로 쓸지 점진 결정 (full client-recompute 폐기는 follow-up).
 *
 * 상태:
 *   - loading: 첫 read 응답 전
 *   - missing: doc 없음 (orider 활동만 보장. Strava import 가 streams 미생성한
 *     경우 트리거가 발화 안 함 → 없음)
 *   - stale: version 이 클라이언트 기대보다 낮음 (다음 streams write 시 자동 갱신)
 *   - ready: 사용 가능
 *
 * Firestore rules: 활동 owner 만 read. backend write. 본 hook 은 read only.
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { logClientError } from "../services/errorLogger";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";

/** @sync-with functions/src/analysis/activity-metrics.ts#ActivityMetrics
 *  서버에서 영속화되는 모든 필드. 서버가 ground truth, 클라는 read-only.
 *  필드 drift 방지를 위해 모두 optional/nullable 로 선언 — 새 서버 필드 누락 시
 *  consumer 가 undefined 안전 처리하도록 강제.
 *  TODO: shared/types/activity-metrics.ts 로 단일 source 화 (현재 inline mirror 2곳). */
/**
 * `activity_metrics/{activityId}` 문서. 정의는 `@shared/types/activity-metrics` 하나다 —
 * 이전엔 이 파일이 같은 문서를 따로 선언해 필드가 두 곳에서 갈렸다 (#2437).
 */
export type ActivityMetricsDoc = ActivityMetrics & {
  newPrs?: Array<{ duration?: string; durationSeconds?: number; rank?: number; value?: number; watts?: number }>;
  workoutTypeConfidence?: number;
};

export type UseActivityMetricsState =
  | { status: "loading"; metrics: null }
  | { status: "disabled"; metrics: null }
  | { status: "missing"; metrics: null }
  | { status: "ready"; metrics: ActivityMetricsDoc };

/**
 * @param activityId Firestore activity doc id. null 이면 구독 안 함 (status="loading"
 *   유지) — caller 에서 명시적 unmount 와 동일하게 동작.
 * @param enabled 구독 게이트. **소유자만 read 가능**한 doc 이므로(rules: activities
 *   owner 만), 타인의 공개 활동을 볼 때 호출자가 false 를 넘겨 구독 자체를 막는다.
 *   안 그러면 비소유자 뷰마다 permission-denied 가 errorLogger 로 발사돼 알림 노이즈가
 *   되고(2026-06-03 client:useActivityMetrics), contextSnapshot(ftp/maxHr/weightKg/lthr
 *   등 소유자 개인정보)을 owner-only 로 막아둔 의도와도 무관한 잡음이 된다. false 면
 *   status="disabled" — 배너는 아무것도 렌더하지 않고, AnalysisTab 은 streams 재계산
 *   경로를 그대로 쓴다. 기본 true(소유자 화면 등 기존 호출 호환).
 */
export function useActivityMetrics(activityId: string | null, enabled = true): UseActivityMetricsState {
  const { firestore } = useFirebaseServices();
  const [state, setState] = useState<UseActivityMetricsState>({ status: "loading", metrics: null });

  useEffect(() => {
    if (!activityId) {
      setState({ status: "loading", metrics: null });
      return undefined;
    }
    if (!enabled) {
      // 비소유자 — owner-only doc 을 읽을 권한이 없으므로 구독조차 시도하지 않는다.
      setState({ status: "disabled", metrics: null });
      return undefined;
    }
    // 새 activityId 진입 시 loading 으로 초기화 (옛 데이터 깜빡임 방지).
    setState({ status: "loading", metrics: null });
    const unsub = onSnapshot(
      doc(firestore, "activity_metrics", activityId),
      (snap) => {
        if (!snap.exists()) {
          setState({ status: "missing", metrics: null });
          return;
        }
        // 캐스팅은 hook 사용자 책임 영역 — 서버 doc 스키마는 functions 쪽에서
        // 강제. 클라가 잘못 읽을 일 자체가 적음 (rules: owner read).
        setState({ status: "ready", metrics: snap.data() as ActivityMetricsDoc });
      },
      (err) => {
        // permission-denied (rule 평가 실패 — auth state desync 의심) / network 등.
        // missing 으로 격하 + errorLogger 전송 (auth 문제는 진단 가치 있음).
        logClientError("useActivityMetrics", err, { activityId });
        setState({ status: "missing", metrics: null });
      },
    );
    return () => unsub();
  }, [activityId, enabled, firestore]);

  return state;
}
