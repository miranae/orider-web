import { useEffect, useRef } from "react";

import AnalysisTab from "../../components/AnalysisTab";
import { useActivityAnalysisModel } from "../../hooks/useActivityAnalysisModel";

export interface ActivityAnalysisSurfaceProps {
  activityId: string;
  retryKey: number;
  onReady: () => void;
  onError: (code: "activity_load_failed" | "activity_not_found" | "streams_load_failed") => void;
}

type SurfaceErrorCode = Parameters<ActivityAnalysisSurfaceProps["onError"]>[0];

export default function ActivityAnalysisSurface({
  activityId,
  retryKey,
  onReady,
  onError,
}: ActivityAnalysisSurfaceProps) {
  const model = useActivityAnalysisModel(activityId);
  const lastRetryKey = useRef(retryKey);
  const readyKey = useRef<number | null>(null);
  const errorKey = useRef<string | null>(null);

  useEffect(() => {
    if (lastRetryKey.current === retryKey) return;
    lastRetryKey.current = retryKey;
    readyKey.current = null;
    errorKey.current = null;
    if (model.activity) {
      void model.retryStreams();
    } else {
      model.retryActivity();
    }
  }, [model.activity, model.retryActivity, model.retryStreams, retryKey]);

  useEffect(() => {
    let code: SurfaceErrorCode;
    if (model.activityLoadError) code = "activity_load_failed";
    else if (!model.loadingActivity && !model.activity && !model.activityProcessing) code = "activity_not_found";
    else if (!model.loadingStreams && model.streamsError) code = "streams_load_failed";
    else return;

    const key = `${retryKey}:${code}`;
    if (errorKey.current === key) return;
    errorKey.current = key;
    onError(code);
  }, [
    model.activity,
    model.activityLoadError,
    model.activityProcessing,
    model.loadingActivity,
    model.loadingStreams,
    model.streamsError,
    onError,
    retryKey,
  ]);

  useEffect(() => {
    if (
      readyKey.current === retryKey
      || model.loadingActivity
      || model.activityProcessing
      || model.loadingStreams
      || model.showStreamSpinner
      || !model.analysisTabProps
    ) return;
    readyKey.current = retryKey;
    onReady();
  }, [
    model.activityProcessing,
    model.analysisTabProps,
    model.loadingActivity,
    model.loadingStreams,
    model.showStreamSpinner,
    onReady,
    retryKey,
  ]);

  if (model.loadingActivity || model.activityProcessing || model.loadingStreams || model.showStreamSpinner) {
    return (
      <div className="orider-embedded-status" role="status" aria-label="Loading analysis">
        <div className="orider-embedded-status__pulse" />
      </div>
    );
  }

  if (!model.analysisTabProps) {
    return (
      <div className="orider-embedded-status" role="alert">
        Analysis is unavailable.
      </div>
    );
  }

  return (
    <main className="orider-embedded-surface" data-testid="embedded-activity-analysis">
      <AnalysisTab {...model.analysisTabProps} />
    </main>
  );
}
