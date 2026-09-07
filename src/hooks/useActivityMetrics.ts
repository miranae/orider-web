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
 * Firestore rules: `activity_metrics/{id}` 는 **활동 owner 만** read (contextSnapshot 에
 * FTP·최대심박·체중·LTHR 이 들어 있다). 타인의 공개 활동을 보는 사람은 서버가 따로 내는
 * `activity_metrics_public/{id}` 를 읽는다 — 민감 필드를 뺀 부분집합이다. backend write,
 * 본 hook 은 read only.
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { ACTIVITY_METRICS_VERSION, type ActivityMetrics } from "@shared/types/activity-metrics";
import { logClientError } from "../services/errorLogger";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { canonicalRolloutAllows, useCanonicalRollout } from "./useCanonicalRollout";

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
};

/**
 * 공개 projection 이 담는 필드. 민감한 선수 컨텍스트(FTP·존 경계·클라임 파워)는 서버가 애초에
 * 복사하지 않는다.
 *
 * @sync-with orider-g1-web/functions/src/analysis/activity-metrics-public-projection.ts#PUBLIC_ACTIVITY_METRICS_KEYS
 */
export const PUBLIC_ACTIVITY_METRICS_KEYS = [
  "version", "discipline", "activityType", "startTime", "computedAt",
  "durationSec", "movingTimeSec", "pauseTimeSec",
  "distanceKm", "elevationGainM", "elevationLossM", "avgGrade", "maxGrade",
  "avgSpeedKph", "maxSpeedKph", "avgCadence", "maxCadence",
  "workKj", "caloriesKcal", "isVirtualPower", "gpsQuality", "weather",
  "sourceLayer", "inputPending",
] as const;

/**
 * 공개 doc → `ActivityMetricsDoc` 부분집합.
 *
 * 서버가 이미 걸러 내지만 여기서 한 번 더 화이트리스트를 지난다 — 나중에 서버가 필드를 더
 * 흘려도 화면이 조용히 그것을 그리지 않는다. **없는 필드는 undefined 로 남긴다**(0 으로
 * 채우면 "미계산" 과 "실제로 0" 이 같은 화면이 된다).
 */
export function fromPublicActivityMetrics(data: Record<string, unknown>): ActivityMetricsDoc {
  const projection: Record<string, unknown> = {};
  for (const key of PUBLIC_ACTIVITY_METRICS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) projection[key] = data[key];
  }
  // 부분집합이므로 필수 필드가 비어 있다. 타입은 정본과 같은 것으로 두고(소비처가 두 모양을
  // 따로 다루면 화면마다 분기가 늘어난다) 없는 값은 undefined 로 남긴다 — 소비처는 이미 모든
  // 필드를 optional 로 다룬다(파일 머리 주석의 drift 규칙).
  return projection as unknown as ActivityMetricsDoc;
}

export type UseActivityMetricsState =
  | { status: "loading"; metrics: null }
  /** kill switch — 서버가 이 면을 껐다(소유자 정본 경로만). 화면은 중단을 명시한다. */
  | { status: "disabled"; metrics: null }
  | { status: "missing"; metrics: null }
  /** 서버 doc 이 있으나 스키마 버전이 클라 기대보다 낮다. 값은 last-known-good 으로 그대로 쓰되
   *  화면에는 "이전 분석" 표식을 붙인다 — 다음 streams write 때 서버가 재계산한다. */
  | { status: "stale"; metrics: ActivityMetricsDoc }
  | { status: "ready"; metrics: ActivityMetricsDoc };

/**
 * @param activityId Firestore activity doc id. null 이면 구독 안 함 (status="loading"
 *   유지) — caller 에서 명시적 unmount 와 동일하게 동작.
 * @param isOwner 이 활동의 소유자인가.
 *
 *   - `true` → 정본 `activity_metrics/{id}` (rules: owner 만). 개인 컨텍스트까지 전부.
 *   - `false` → 공개 projection `activity_metrics_public/{id}`. 예전에는 이때 구독 자체를
 *     막아(`disabled`) 타인의 공개 활동 분석이 **영구히 빈 화면**이었다 — owner-only doc 을
 *     읽으려다 permission-denied 만 쌓였다(2026-06-03 client:useActivityMetrics). 공개 문서가
 *     생긴 지금은 그것을 읽는다.
 *
 *   기본 true(소유자 화면 등 기존 호출 호환).
 *
 * `disabled` 는 이제 **kill switch** 하나만 뜻한다: 서버가 `activityDetail` 면을 껐고 내가
 * 소유자일 때. 공개 뷰어는 kill switch 와 무관하다 — 끄는 대상은 정본 소비 경로다.
 */
export function useActivityMetrics(activityId: string | null, isOwner = true): UseActivityMetricsState {
  const { firestore } = useFirebaseServices();
  const rollout = useCanonicalRollout();
  const [state, setState] = useState<UseActivityMetricsState>({ status: "loading", metrics: null });

  // 정본 경로만 서버 전환 판정을 따른다. 판정을 기다리는 동안은 켜짐도 꺼짐도 아니다.
  const gateWaiting = isOwner && rollout.gateEnabled && rollout.loading;
  const gateBlocked = isOwner && !gateWaiting && !canonicalRolloutAllows(rollout, "activityDetail");
  const collection = isOwner ? "activity_metrics" : "activity_metrics_public";

  useEffect(() => {
    if (!activityId || gateWaiting) {
      setState({ status: "loading", metrics: null });
      return undefined;
    }
    if (gateBlocked) {
      // kill switch — 서버가 이 면을 껐다. 화면은 빈 칸이 아니라 중단 상태를 밝힌다.
      setState({ status: "disabled", metrics: null });
      return undefined;
    }
    // 새 activityId 진입 시 loading 으로 초기화 (옛 데이터 깜빡임 방지).
    setState({ status: "loading", metrics: null });
    const unsub = onSnapshot(
      doc(firestore, collection, activityId),
      (snap) => {
        if (!snap.exists()) {
          setState({ status: "missing", metrics: null });
          return;
        }
        // 캐스팅은 hook 사용자 책임 영역 — 서버 doc 스키마는 functions 쪽에서 강제.
        // 공개 문서는 부분집합이라 화이트리스트를 지난다.
        const raw = snap.data() as Record<string, unknown>;
        const data = isOwner
          ? (raw as unknown as ActivityMetricsDoc)
          : fromPublicActivityMetrics(raw);
        // version 이 클라 기대보다 낮으면 stale — 값은 그대로 노출하되 호출자가 표식을 붙인다.
        // version 필드가 아예 없는 옛 문서는 0 으로 본다 — 모름을 최신으로 그리면 안 된다 (#2237).
        const version = typeof data.version === "number" ? data.version : 0;
        const isStale = version < ACTIVITY_METRICS_VERSION;
        setState({ status: isStale ? "stale" : "ready", metrics: data });
      },
      (err) => {
        // permission-denied (비공개 활동을 링크로 열었거나 rule 평가 실패) / network 등.
        // missing 으로 격하 + errorLogger 전송 (auth 문제는 진단 가치 있음).
        logClientError("useActivityMetrics", err, { activityId, collection });
        setState({ status: "missing", metrics: null });
      },
    );
    return () => unsub();
  }, [activityId, collection, firestore, gateBlocked, gateWaiting, isOwner]);

  return state;
}
