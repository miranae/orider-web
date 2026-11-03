import { useEffect, useRef } from "react";

import { ActivityGrowthPanel } from "../../features/activity/detail/ActivityGrowthPanel";
import { useActivityAnalysisModel } from "../../hooks/useActivityAnalysisModel";

export interface ActivityCompareSurfaceProps {
  activityId: string;
  retryKey: number;
  onReady: () => void;
  onError: (code: "activity_load_failed" | "activity_not_found") => void;
}

type SurfaceErrorCode = Parameters<ActivityCompareSurfaceProps["onError"]>[0];

/** 스트림·개요 없이 활동 문서와 서버 메트릭만 읽는다. 비교 패널은 둘만 쓴다. */
const COMPARE_MODEL_OPTIONS = { analysisData: false } as const;

/**
 * 앱 활동 상세의 '비교' 탭 임베드. 웹 활동 상세의 비교 탭과 같은 내용을 그린다.
 * 비교는 소유자 전용이라 소유자가 아니면 화면을 그리지 않고 activity_not_found 로 알린다.
 */
export default function ActivityCompareSurface({
  activityId,
  retryKey,
  onReady,
  onError,
}: ActivityCompareSurfaceProps) {
  const model = useActivityAnalysisModel(activityId, undefined, undefined, COMPARE_MODEL_OPTIONS);
  const lastRetryKey = useRef(retryKey);
  const readyKey = useRef<number | null>(null);
  const errorKey = useRef<string | null>(null);
  const activityLoaded = !model.loadingActivity && !model.activityProcessing
    && !model.activityLoadError && model.activity?.id === activityId;

  // 활동마다 호스트 종료 알림을 따로 보낸다. 다시 들어와도 마찬가지다.
  useEffect(() => {
    readyKey.current = null;
    errorKey.current = null;
  }, [activityId]);

  useEffect(() => {
    if (lastRetryKey.current === retryKey) return;
    lastRetryKey.current = retryKey;
    readyKey.current = null;
    errorKey.current = null;
    model.retryActivity();
  }, [model.retryActivity, retryKey]);

  useEffect(() => {
    let code: SurfaceErrorCode;
    if (model.activityLoadError) code = "activity_load_failed";
    else if (!model.loadingActivity && !model.activity && !model.activityProcessing) code = "activity_not_found";
    // 웹과 같이 비교는 소유자만 본다. 타인 활동은 없는 활동으로 알린다.
    else if (activityLoaded && !model.isActivityOwner) code = "activity_not_found";
    else return;

    const key = `${retryKey}:${code}`;
    if (errorKey.current === key) return;
    errorKey.current = key;
    onError(code);
  }, [
    activityId,
    activityLoaded,
    model.activity,
    model.activityLoadError,
    model.activityProcessing,
    model.isActivityOwner,
    model.loadingActivity,
    onError,
    retryKey,
  ]);

  useEffect(() => {
    if (
      readyKey.current === retryKey
      || !activityLoaded
      || !model.isActivityOwner
      || model.serverMetrics.status === "loading"
    ) return;
    readyKey.current = retryKey;
    onReady();
  }, [activityLoaded, model.isActivityOwner, model.serverMetrics.status, onReady, retryKey]);

  if (model.loadingActivity || model.activityProcessing) {
    return (
      <div className="orider-embedded-status" role="status" aria-label="Loading comparison">
        <div className="orider-embedded-status__pulse" />
      </div>
    );
  }

  if (!activityLoaded || !model.activity || !model.isActivityOwner) return null;

  return (
    <main className="orider-embedded-surface" data-testid="embedded-activity-compare">
      <ActivityGrowthPanel
        activity={model.activity}
        metrics={model.serverMetrics.metrics}
        currentMetricsStatus={model.serverMetrics.status}
        isOwner={model.isActivityOwner}
        comparisonOnly
      />
    </main>
  );
}
