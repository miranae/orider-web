import { useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import type { ActivityAnalysisModel } from "./useActivityAnalysisModel";
import type { ActivityRangeSelection } from "./useActivityRangeAnalysis";
import type { SampledPoint } from "../features/activity/detail/activityDetailUtils";
import { confirmedRouteElapsedAxis, elapsedRangeFromChartSelection, elapsedRangeRouteBounds, validElapsedRange, type ElapsedRange } from "../features/activity/detail/activityRangeSelection";
import { normalizeEpochMilliseconds } from "../utils/timestampUnit";

/** 같은 elapsed 창을 입력·차트·지도에 공유한다. 구간 통계는 서버 훅만 계산한다. */
export function useActivityRangeSelection(model: ActivityAnalysisModel, sampled: readonly SampledPoint[]) {
  const { user } = useAuth();
  const activity = model.activity, metrics = model.serverMetrics?.metrics;
  const activityRevision = activity as (typeof activity & Record<string, unknown>);
  const metricsRevision = metrics as (typeof metrics & Record<string, unknown>);
  const identity = JSON.stringify([user?.uid, activity?.id, activity?.startTime, activity?.source, model.isActivityOwner, metrics?.computedAt,
    activity?.contentRevision, activity?.contentSelectedRevision, activity?.sourceMeta, activity?.visibility, activity?.isVirtualPower,
    activityRevision?.hidePower, activityRevision?.hideHr, activityRevision?.metadataRevision, activityRevision?.updatedAt,
    metricsRevision?.metricsRevision, metricsRevision?.inputDigest, metricsRevision?.etag, metricsRevision?.sourceLayer,
    metrics?.inputPending, metrics?.isVirtualPower, model.activePowerOverride?.sourceFingerprint,
    model.analysisTabProps?.suppressServerPowerMetrics, model.analysisTabProps?.suppressServerHeartRateMetrics]);
  const owner = model.isActivityOwner && activity?.userId === user?.uid && !user?.isAnonymous;
  const durationSec = activity?.summary?.elapsedTimeMillis != null ? activity.summary.elapsedTimeMillis / 1000
    : metrics?.durationSec ?? 0;
  const movingSec = metrics?.movingTimeSec ?? (activity?.summary?.ridingTimeMillis != null ? activity.summary.ridingTimeMillis / 1000 : null);
  const axis = useMemo(() => model.streams?.time ? confirmedRouteElapsedAxis({ time: model.streams.time,
    activityStartEpochMs: normalizeEpochMilliseconds(activity?.startTime), elapsedDurationSec: durationSec, movingDurationSec: movingSec }) : null,
  [model.streams, activity?.startTime, durationSec, movingSec]);
  const sampledAxis = axis && sampled.every((point, index) => Number.isInteger(point.sourceIndex) && point.sourceIndex! >= 0 && point.sourceIndex! < axis.length
    && (index === 0 || point.sourceIndex! > sampled[index - 1]!.sourceIndex!))
    ? sampled.map(point => axis[point.sourceIndex!]!) : null;
  const [state, setState] = useState<{ identity: string; enabled: boolean; selection: ActivityRangeSelection | null; xAxis: "distance" | "elapsed" }>({ identity, enabled: false, selection: null, xAxis: "distance" });
  if (state.identity !== identity) setState({ identity, enabled: false, selection: null, xAxis: "distance" });
  const sourceScope = JSON.stringify([user?.uid, activity?.id]);
  const [sourceLock, setSourceLock] = useState<{ scope: string; source: typeof model.streams; refreshing: boolean } | null>(null);
  const sourceLocked = sourceLock?.scope === sourceScope;
  if (sourceLock && sourceLock.scope !== sourceScope) setSourceLock(null);
  if (sourceLocked && sourceLock.refreshing && model.streams && !model.loadingStreams && model.streams !== sourceLock.source) setSourceLock(null);
  const sequence = useRef(0);
  const current = state.identity === identity && owner ? state : { identity, enabled: false, selection: null, xAxis: "distance" as const };
  const select = (range: ElapsedRange | null) => {
    if (!owner || range && !validElapsedRange(range, durationSec)) return;
    setState({ ...current, selection: range ? { ...range, requestId: String(++sequence.current) } : null });
  };
  const gaps = axis ? axis.slice(1).map((value, index) => value - axis[index]!).sort((a, b) => a - b) : [];
  const interpolationLimit = (gaps[Math.floor(gaps.length / 2)] ?? 0) * 3;
  const bounds = current.selection && axis ? elapsedRangeRouteBounds(axis, current.selection, interpolationLimit) : null;
  const sourceIndices = sampled.map(point => point.sourceIndex ?? -1);
  let chartRange: [number, number] | undefined;
  if (bounds && sampledAxis) {
    let start = 0;
    while (start + 1 < sourceIndices.length && sourceIndices[start + 1]! <= bounds.startIndex) start++;
    const end = sourceIndices.findIndex((index, position) => position > start && index >= bounds.endIndex);
    if (end > start) chartRange = [start, end];
  }
  const route = model.streams?.latlng;
  const routeRange = bounds && route?.length === axis?.length
    && Array.from(route!.slice(bounds.startIndex, bounds.endIndex + 1)).every(point => Array.isArray(point)
      && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180)
    ? { startIndex: bounds.startIndex, endIndex: bounds.endIndex } : undefined;
  return { rawSource: model.streams, sourceLoading: model.loadingStreams, sourceLocked,
    lockSource: () => { if (!sourceLocked) setSourceLock({ scope: sourceScope, source: model.streams, refreshing: false }); },
    reloadSource: async () => {
      if (!sourceLocked) return;
      setSourceLock({ scope: sourceScope, source: model.streams, refreshing: true });
      await model.retryStreams();
    }, identity, ownerUid: owner ? user?.uid : null, enabled: current.enabled, selection: current.selection,
    xAxis: current.xAxis, durationSec, axis, sampledAxis, chartRange, routeRange,
    clippedBoundary: bounds?.clippedBoundary ?? false, locationUnavailable: !!current.selection && !routeRange,
    toggle: () => setState({ ...current, enabled: !current.enabled, selection: null }), clear: () => select(null), select,
    setXAxis: (xAxis: "distance" | "elapsed") => { if (xAxis === "distance" || sampledAxis) setState({ ...current, xAxis }); },
    selectChart: (indices: [number, number]) => {
      if (!axis) return;
      const ordered: [number, number] = indices[0] < indices[1] ? indices : [indices[1], indices[0]];
      const range = elapsedRangeFromChartSelection(axis, sourceIndices, ordered);
      if (!range) return;
      // 입력한 정확한 시간은 둘러싼 차트 표본과 다르다. 움직이지 않은 핸들을 표본 시각으로 바꾸지 않는다.
      if (current.selection && chartRange) {
        const sameStart = ordered[0] === chartRange[0], sameEnd = ordered[1] === chartRange[1];
        if (sameStart && sameEnd) return;
        if (sameStart) range.startOffsetSec = current.selection.startOffsetSec;
        if (sameEnd) range.endOffsetSec = current.selection.endOffsetSec;
      }
      select(range);
    },
  };
}

export type ActivityRangeSelectionModel = ReturnType<typeof useActivityRangeSelection>;
