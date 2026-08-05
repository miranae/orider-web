import { useEffect, useMemo, useRef } from "react";
import type { Activity, ActivityStreams } from "@shared/types";

import {
  buildActivityAnalysisProjection,
  buildActivitySensorSelectionContext,
  buildSampledData,
  buildSummaryStats,
  deriveStreamSensorSummary,
  getAvailableOverlays,
  getChartHighlightRange,
  getSegmentEfforts,
  getStreamPhotos,
} from "./activityDetailDerived";
import type { ActivityPowerOverride } from "./activityDetailDerived";
import type { SegmentEffortData } from "./activityDetailUtils";
import { resolveActiveActivityPowerOverride } from "./activityPowerOverride";
import {
  createSensorRejectionLogState,
  reportSensorRejectionsOnce,
} from "./activitySensorRejectionLogging";

interface UseActivitySensorDetailOptions {
  activityId?: string;
  activity: Activity | null;
  streams: ActivityStreams | null;
  powerOverride?: ActivityPowerOverride | null;
  hoverIndex: number | null;
  hoveredSegment: SegmentEffortData | null;
}

/** Keeps every activity-detail consumer on the same validated sensor selection. */
export function useActivitySensorDetail({
  activityId,
  activity,
  streams,
  powerOverride,
  hoverIndex,
  hoveredSegment,
}: UseActivitySensorDetailOptions) {
  const rejectionLogState = useRef(createSensorRejectionLogState());
  const activePowerOverride = useMemo(
    () => resolveActiveActivityPowerOverride(activityId, activity?.id, streams, powerOverride),
    [activity?.id, activityId, powerOverride, streams],
  );
  const effectiveStreams = useMemo(() => {
    if (!streams || !activePowerOverride) return streams;
    return { ...streams, watts: activePowerOverride.values };
  }, [activePowerOverride, streams]);
  const powerOverrideProvenance = useMemo(() => activePowerOverride
    ? { source: activePowerOverride.source, time: activePowerOverride.time }
    : undefined, [activePowerOverride]);
  const selectionSummary = useMemo(() => {
    const summary = activity?.summary;
    if (!summary || summary.elapsedTimeMillis != null) return summary;

    // 일부 Strava 활동은 elapsedTimeMillis 없이 ridingTimeMillis만 저장한다.
    // 스트림 시계는 정차 구간을 포함한 start/end 경과시간을 사용하므로, 이 경우
    // moving time만으로 센서 커버리지를 판정하면 유효한 파워/심박 스트림을 거부한다.
    const startTime = activity.startTime;
    const endTime = activity.endTime;
    const elapsedTimeMillis = typeof startTime === "number" && typeof endTime === "number"
      ? endTime - startTime
      : 0;
    const ridingTimeMillis = summary.ridingTimeMillis ?? 0;
    if (!Number.isFinite(elapsedTimeMillis) || elapsedTimeMillis <= ridingTimeMillis) return summary;
    return { ...summary, ridingTimeMillis: elapsedTimeMillis };
  }, [activity?.endTime, activity?.startTime, activity?.summary]);
  const selectionContext = useMemo(
    () => buildActivitySensorSelectionContext(selectionSummary, activity?.startTime, powerOverrideProvenance),
    [activity?.startTime, powerOverrideProvenance, selectionSummary],
  );
  const sampledData = useMemo(
    () => buildSampledData(effectiveStreams, selectionContext),
    [effectiveStreams, selectionContext],
  );
  const streamSensorSummary = useMemo(
    () => deriveStreamSensorSummary(effectiveStreams, selectionContext),
    [effectiveStreams, selectionContext],
  );

  useEffect(() => {
    if (!activityId || !streamSensorSummary?.rejections.length) return;
    reportSensorRejectionsOnce(activityId, streamSensorSummary.rejections, rejectionLogState.current);
  }, [activityId, streamSensorSummary]);

  const hasStreamPowerCandidate = !!streamSensorSummary
    && (streamSensorSummary.hasPowerStream || streamSensorSummary.hasRejectedPowerStream);
  const hasStreamHeartRateCandidate = !!streamSensorSummary
    && (streamSensorSummary.hasHeartRateStream || streamSensorSummary.hasRejectedHeartRateStream);
  const hasStreamCadenceCandidate = !!streamSensorSummary
    && (streamSensorSummary.hasCadenceStream || streamSensorSummary.hasRejectedCadenceStream);
  const analysisProjection = useMemo(
    () => buildActivityAnalysisProjection(effectiveStreams, selectionContext),
    [effectiveStreams, selectionContext],
  );
  const availableOverlays = useMemo(() => getAvailableOverlays(sampledData), [sampledData]);
  const summaryStats = useMemo(
    () => buildSummaryStats(effectiveStreams, streamSensorSummary),
    [effectiveStreams, streamSensorSummary],
  );
  const markerPosition = useMemo(() => {
    if (hoverIndex == null || !sampledData[hoverIndex]) return null;
    return sampledData[hoverIndex].latlng;
  }, [hoverIndex, sampledData]);
  const segmentEfforts = useMemo(() => getSegmentEfforts(streams), [streams]);
  const chartHighlightRange = useMemo(
    () => getChartHighlightRange(hoveredSegment, streams),
    [hoveredSegment, streams],
  );
  const photos = useMemo(() => getStreamPhotos(streams), [streams]);
  const hasStreams = sampledData.length > 0;
  const hasAnalysisStreams = !!effectiveStreams && (
    !!streamSensorSummary?.hasReliablePower
    || streamSensorSummary?.averageHeartRate != null
    || (effectiveStreams.distance?.length ?? 0) > 0
    || (effectiveStreams.laps?.length ?? 0) > 0
  );

  const displayedSummary = useMemo(() => {
    const summary = activity?.summary;
    if (!summary || !effectiveStreams || !streamSensorSummary) return summary ?? null;
    const hasHeartRateCandidate = streamSensorSummary.hasHeartRateStream
      || streamSensorSummary.hasRejectedHeartRateStream;
    return {
      ...summary,
      averageHeartRate: hasHeartRateCandidate
        ? streamSensorSummary.averageHeartRate
        : summary.averageHeartRate,
      maxHeartRate: hasHeartRateCandidate ? streamSensorSummary.maxHeartRate : summary.maxHeartRate,
      averageCadence: hasStreamCadenceCandidate
        ? streamSensorSummary.averageCadence
        : summary.averageCadence,
      maxCadence: hasStreamCadenceCandidate
        ? streamSensorSummary.maxCadence
        : summary.maxCadence,
      averagePower: hasStreamPowerCandidate ? streamSensorSummary.averagePower : summary.averagePower,
      maxPower: hasStreamPowerCandidate ? streamSensorSummary.maxPower : summary.maxPower,
      normalizedPower: hasStreamPowerCandidate ? null : summary.normalizedPower,
      tss: hasStreamPowerCandidate ? null : summary.tss,
    };
  }, [activity?.summary, effectiveStreams, hasStreamCadenceCandidate, hasStreamPowerCandidate, streamSensorSummary]);

  // Older virtual-power activities keep these values at the document top level.
  const avgPowerValue = effectiveStreams && hasStreamPowerCandidate
    ? streamSensorSummary?.averagePower ?? null
    : activity?.summary.averagePower ?? activity?.avgPower ?? null;
  const normalizedPowerValue = effectiveStreams && hasStreamPowerCandidate
    ? null
    : activity?.summary.normalizedPower ?? activity?.weightedAvgPower ?? null;

  return {
    activePowerOverride,
    analysisProjection,
    availableOverlays,
    avgPowerValue,
    chartHighlightRange,
    displayedSummary,
    hasAnalysisStreams,
    hasStreamCadenceCandidate,
    hasStreamHeartRateCandidate,
    hasStreamPowerCandidate,
    hasStreams,
    markerPosition,
    normalizedPowerValue,
    photos,
    sampledData,
    segmentEfforts,
    selectionContext,
    streamSensorSummary,
    summaryStats,
  };
}
