import { useEffect, useRef, useState, useMemo } from "react";

import { ActivityGrowthPanel } from "../../features/activity/detail/ActivityGrowthPanel";
import { buildSampledData } from "../../features/activity/detail/activityDetailDerived";
import ActivityDetailedCharts from "../../features/activity/detail/ActivityDetailedCharts";
import { ActivityPersonalBenchmark } from "../../features/activity/detail/ActivityPersonalBenchmark";
import ActivityPeakEffortInspector from "../../features/activity/detail/ActivityPeakEffortInspector";
import { visiblePeakEfforts, resolvePeakEffortLocation } from "../../features/activity/detail/activityPeakEfforts";
import type { RidePeakEffort } from "@shared/types/activity-metrics";
import { useTranslation } from "react-i18next";
import Avatar from "../../components/Avatar";
import { useFormatFullDate } from "../../features/activity/detail/activityDisplay";
import { getSportLabelKey } from "../../utils/sportType";
import { useAuth } from "../../contexts/AuthContext";
import AnalysisTab from "../../components/AnalysisTab";
import ActivityOverviewEvidence from "../../features/activity/detail/ActivityOverviewEvidence";
import { ActivityReanalysisControl } from "../../features/activity/detail/ActivityReanalysisControl";
import AiRideAnalysisCard from "../../components/activity/AiRideAnalysisCard";
import { useSavedActivityAnalysisSelection } from "../../hooks/useSavedActivityAnalysisSelection";
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
  const { selected: savedAnalysis, select: selectSavedAnalysis } = useSavedActivityAnalysisSelection(activityId);
  const model = useActivityAnalysisModel(activityId, undefined, savedAnalysis);
  const showingSaved = !!savedAnalysis && model.isActivityOwner;
  const hasStoredAnalysis = !!model.serverMetrics?.metrics && !!model.analysisTabProps;
  const { user } = useAuth();
  const { t: tCommon } = useTranslation("common");
  const formatFullDate = useFormatFullDate();
  useEffect(() => { setPeakSelection({ activityId, peak: null }); }, [activityId, user?.uid, model.isActivityOwner, model.serverMetrics?.metrics?.computedAt, model.activePowerOverride]);
  const selectedPeak = !showingSaved && peakSelection.activityId === activityId
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
      model.overview.retry();
      void model.retryStreams();
    } else {
      model.retryActivity();
    }
  }, [model.activity, model.overview.retry, model.retryActivity, model.retryStreams, retryKey]);

  useEffect(() => {
    let code: SurfaceErrorCode;
    if (model.activityLoadError) code = "activity_load_failed";
    else if (!model.loadingActivity && !model.activity && !model.activityProcessing) code = "activity_not_found";
    else if (!hasStoredAnalysis && !model.loadingStreams && model.streamsError
      && !model.overview.loading && model.overview.response?.status !== "available") code = "streams_load_failed";
    else return;

    const key = `${retryKey}:${code}`;
    if (errorKey.current === key) return;
    errorKey.current = key;
    onError(code);
  }, [
    model.activity,
    model.activityLoadError,
    hasStoredAnalysis,
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
      || (!hasStoredAnalysis && (model.loadingStreams || model.showStreamSpinner || !model.analysisTabProps)
        && model.overview.response?.status !== "available")
    ) return;
    readyKey.current = retryKey;
    onReady();
  }, [
    model.activityProcessing,
    hasStoredAnalysis,
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
      {!model.isActivityOwner && model.activity && (
        <header className="orider-embedded-author" data-testid="embedded-activity-author">
          <Avatar name={model.activity.nickname} imageUrl={model.activity.profileImage} size="md" />
          <div className="orider-embedded-author__text">
            <div className="orider-embedded-author__name">{model.activity.nickname || tCommon("label.rider")}</div>
            <div className="orider-embedded-author__title">{model.activity.description || tCommon(getSportLabelKey(model.activity.type))}</div>
            <div className="orider-embedded-author__date">{formatFullDate(model.activity.startTime)}</div>
          </div>
        </header>
      )}
      {model.isActivityOwner && model.activity?.id === activityId && <ActivityReanalysisControl activityId={activityId} selectedRevision={savedAnalysis?.revisionId} onSelect={selectSavedAnalysis} />}
      {!showingSaved && <ActivityOverviewEvidence isOwner={model.isActivityOwner} overview={model.overview} preview={model.activePowerOverride != null} />}
      {!showingSaved && model.activity?.summary && <ActivityGrowthPanel activity={model.activity}
        metrics={model.serverMetrics?.metrics ?? null} isOwner={model.isActivityOwner} />}
      {!showingSaved && <ActivityPersonalBenchmark activityId={activityId} ownerUid={model.isActivityOwner ? user?.uid : null}
        sport={model.sport === "ride" ? "bike" : model.sport}
        metrics={model.activePowerOverride || model.analysisTabProps?.suppressServerPowerMetrics ? null : model.serverMetrics?.metrics ?? null} />}
      <ActivityPeakEffortInspector chartOnly activityId={activityId} metrics={model.serverMetrics?.metrics ?? null} isOwner={model.isActivityOwner}
        invalidated={model.activePowerOverride != null || model.analysisTabProps?.suppressServerPowerMetrics === true}
        suppressHeartRate={model.analysisTabProps?.suppressServerHeartRateMetrics} suppressCadence={model.analysisTabProps?.suppressServerCadenceMetrics}
        locationUnavailable={!!model.streams && selectedPeak != null && !peakLocation}
        locating={model.loadingStreams && peakSelection.activityId === activityId && peakSelection.peak != null}
        onLocate={showingSaved ? undefined : peak => {
          setPeakSelection({ activityId, peak });
          if (peak && !model.streams && !model.loadingStreams) model.requestStreams();
        }} />
      {!showingSaved && (model.sport === "run" || model.sport === "ride") && <ActivityDetailedCharts key={activityId} model={model} highlightedPeak={selectedPeak} onClearHighlightedPeak={() => setPeakSelection({ activityId, peak: null })} />}
      {model.analysisTabProps && (model.sport === "run" || hasStoredAnalysis || (!model.loadingStreams && !model.showStreamSpinner)) ? <AnalysisTab {...model.analysisTabProps} />
        : model.loadingStreams || model.showStreamSpinner ? <div className="orider-embedded-status" role="status">Loading analysis</div>
          : model.overview.loading ? <div className="orider-embedded-status" role="status">{tCommon("embeddedStatus.loading")}</div>
            : model.overview.response?.status === "available" ? null
              : <div className="orider-embedded-status" role="alert">{tCommon("embeddedStatus.unavailable")}</div>}
      {model.isActivityOwner && (model.sport === "ride" || model.sport === "run") && <AiRideAnalysisCard
        activityId={activityId} enabled sport={model.sport} isActivityOwner
        summaryPreview={model.activity?.aiSummaryPreview} summaryPreviewEn={model.activity?.aiSummaryPreview_en} />}

    </main>
  );
}
