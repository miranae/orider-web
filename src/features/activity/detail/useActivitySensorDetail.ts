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
import type { SegmentEffortData } from "./activityDetailUtils";
import {
  createSensorRejectionLogState,
  reportSensorRejectionsOnce,
} from "./activitySensorRejectionLogging";

interface UseActivitySensorDetailOptions {
  activityId?: string;
  activity: Activity | null;
  streams: ActivityStreams | null;
  effectiveStreams: ActivityStreams | null;
  preferTopLevelPower: boolean;
  hoverIndex: number | null;
  hoveredSegment: SegmentEffortData | null;
}

/** Keeps every activity-detail consumer on the same validated sensor selection. */
export function useActivitySensorDetail({
  activityId,
  activity,
  streams,
  effectiveStreams,
  preferTopLevelPower,
  hoverIndex,
  hoveredSegment,
}: UseActivitySensorDetailOptions) {
  const rejectionLogState = useRef(createSensorRejectionLogState());
  const selectionContext = useMemo(
    () => buildActivitySensorSelectionContext(activity?.summary, activity?.startTime),
    [activity?.startTime, activity?.summary?.elapsedTimeMillis, activity?.summary?.ridingTimeMillis],
  );
  const sampledData = useMemo(
    () => buildSampledData(streams, selectionContext),
    [selectionContext, streams],
  );
  const streamSensorSummary = useMemo(
    () => deriveStreamSensorSummary(streams, selectionContext),
    [selectionContext, streams],
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
    () => buildActivityAnalysisProjection(effectiveStreams, preferTopLevelPower, selectionContext),
    [effectiveStreams, preferTopLevelPower, selectionContext],
  );
  const availableOverlays = useMemo(() => getAvailableOverlays(sampledData), [sampledData]);
  const summaryStats = useMemo(
    () => buildSummaryStats(streams, streamSensorSummary),
    [streamSensorSummary, streams],
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
  const hasAnalysisStreams = !!streams && (
    !!streamSensorSummary?.hasReliablePower
    || streamSensorSummary?.averageHeartRate != null
    || (streams.distance?.length ?? 0) > 0
    || (streams.laps?.length ?? 0) > 0
  );

  const displayedSummary = useMemo(() => {
    const summary = activity?.summary;
    if (!summary || !streams || !streamSensorSummary) return summary ?? null;
    const hasHeartRateCandidate = streamSensorSummary.hasHeartRateStream
      || streamSensorSummary.hasRejectedHeartRateStream;
    return {
      ...summary,
      averageHeartRate: hasHeartRateCandidate
        ? streamSensorSummary.averageHeartRate
        : summary.averageHeartRate,
      maxHeartRate: hasHeartRateCandidate ? streamSensorSummary.maxHeartRate : summary.maxHeartRate,
      averageCadence: streamSensorSummary.hasCadenceStream
        ? streamSensorSummary.averageCadence
        : summary.averageCadence,
      maxCadence: streamSensorSummary.hasCadenceStream
        ? streamSensorSummary.maxCadence
        : summary.maxCadence,
      averagePower: hasStreamPowerCandidate ? streamSensorSummary.averagePower : summary.averagePower,
      maxPower: hasStreamPowerCandidate ? streamSensorSummary.maxPower : summary.maxPower,
    };
  }, [activity?.summary, hasStreamPowerCandidate, streamSensorSummary, streams]);

  // Older virtual-power activities keep these values at the document top level.
  const avgPowerValue = streams && hasStreamPowerCandidate
    ? streamSensorSummary?.averagePower ?? null
    : activity?.summary.averagePower ?? activity?.avgPower ?? null;
  const normalizedPowerValue = streams && hasStreamPowerCandidate
    ? null
    : activity?.summary.normalizedPower ?? activity?.weightedAvgPower ?? null;

  return {
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
