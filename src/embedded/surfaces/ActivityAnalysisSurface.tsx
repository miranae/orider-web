import { useEffect, useRef, useState, useMemo } from "react";

import { ActivityGrowthPanel } from "../../features/activity/detail/ActivityGrowthPanel";
import { buildSampledData } from "../../features/activity/detail/activityDetailDerived";
import ActivityDetailedCharts from "../../features/activity/detail/ActivityDetailedCharts";
import { ActivityPersonalBenchmark } from "../../features/activity/detail/ActivityPersonalBenchmark";
import ActivityPeakEffortInspector from "../../features/activity/detail/ActivityPeakEffortInspector";
import { visiblePeakEfforts, resolvePeakEffortLocation } from "../../features/activity/detail/activityPeakEfforts";
import type { RidePeakEffort } from "@shared/types/activity-metrics";
import { useAuth } from "../../contexts/AuthContext";
import AnalysisTab from "../../components/AnalysisTab";
import ActivityOverviewEvidence from "../../features/activity/detail/ActivityOverviewEvidence";
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
  const [peakSelection, setPeakSelection] = useState<{ activityId: string; peak: RidePeakEffort | null }>({ activityId, peak: null });
  const model = useActivityAnalysisModel(activityId);
  const { user } = useAuth();
  useEffect(() => { setPeakSelection({ activityId, peak: null }); }, [activityId, user?.uid, model.isActivityOwner, model.serverMetrics?.metrics?.computedAt, model.activePowerOverride]);
  const selectedPeak = peakSelection.activityId === activityId
    && visiblePeakEfforts(model.serverMetrics?.metrics ?? null, model.isActivityOwner, model.activePowerOverride != null || model.analysisTabProps?.suppressServerPowerMetrics === true)
      .some(peak => peak.durationSec === peakSelection.peak?.durationSec && peak.startOffsetSec === peakSelection.peak?.startOffsetSec && peak.avgPowerW === peakSelection.peak?.avgPowerW)
    ? peakSelection.peak : null;
  const peakLocation = useMemo(() => selectedPeak ? resolvePeakEffortLocation(selectedPeak, model.serverMetrics?.metrics?.peakEfforts?.indexAxis, model.streams,
    buildSampledData(model.effectiveStreams, model.sensorSelectionContext)) : null,
  [selectedPeak, model.serverMetrics, model.streams, model.effectiveStreams, model.sensorSelectionContext]);
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
    else if (!model.loadingStreams && model.streamsError
      && !model.overview.loading && model.overview.response?.status !== "available") code = "streams_load_failed";
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
    model.overview.loading,
    model.overview.response,
    onError,
    retryKey,
  ]);

  useEffect(() => {
    if (
      readyKey.current === retryKey
      || model.loadingActivity
      || model.activityProcessing
      || ((model.loadingStreams || model.showStreamSpinner || !model.analysisTabProps)
        && model.overview.response?.status !== "available")
    ) return;
    readyKey.current = retryKey;
    onReady();
  }, [
    model.activityProcessing,
    model.analysisTabProps,
    model.loadingActivity,
    model.loadingStreams,
    model.overview.response,
    model.showStreamSpinner,
    onReady,
    retryKey,
  ]);

  if (model.loadingActivity || model.activityProcessing) {
    return (
      <div className="orider-embedded-status" role="status" aria-label="Loading analysis">
        <div className="orider-embedded-status__pulse" />
      </div>
    );
  }

  return (
    <main className="orider-embedded-surface" data-testid="embedded-activity-analysis">
      <ActivityOverviewEvidence isOwner={model.isActivityOwner} overview={model.overview} preview={model.activePowerOverride != null} />
      {model.activity?.summary && <ActivityGrowthPanel activity={model.activity}
        metrics={model.serverMetrics?.metrics ?? null} isOwner={model.isActivityOwner} />}
      <ActivityPersonalBenchmark activityId={activityId} ownerUid={model.isActivityOwner ? user?.uid : null}
        sport={model.sport === "ride" ? "bike" : model.sport}
        metrics={model.activePowerOverride || model.analysisTabProps?.suppressServerPowerMetrics ? null : model.serverMetrics?.metrics ?? null} />
      <ActivityPeakEffortInspector chartOnly activityId={activityId} metrics={model.serverMetrics?.metrics ?? null} isOwner={model.isActivityOwner}
        invalidated={model.activePowerOverride != null || model.analysisTabProps?.suppressServerPowerMetrics === true}
        suppressHeartRate={model.analysisTabProps?.suppressServerHeartRateMetrics} suppressCadence={model.analysisTabProps?.suppressServerCadenceMetrics}
        locationUnavailable={!!model.streams && selectedPeak != null && !peakLocation}
        locating={model.loadingStreams && peakSelection.activityId === activityId && peakSelection.peak != null}
        onLocate={peak => {
          setPeakSelection({ activityId, peak });
          if (peak && !model.streams && !model.loadingStreams) model.requestStreams();
        }} />
      {(model.sport === "run" || model.sport === "ride") && <ActivityDetailedCharts key={activityId} model={model} highlightedPeak={selectedPeak} onClearHighlightedPeak={() => setPeakSelection({ activityId, peak: null })} />}
      {model.sport === "run" && model.analysisTabProps ? <AnalysisTab {...model.analysisTabProps} /> : model.loadingStreams || model.showStreamSpinner ? <div className="orider-embedded-status" role="status">Loading analysis</div>
        : model.analysisTabProps ? <AnalysisTab {...model.analysisTabProps} />
          : <div className="orider-embedded-status" role="alert">Analysis is unavailable.</div>}
    </main>
  );
}
