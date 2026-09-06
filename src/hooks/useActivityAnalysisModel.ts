import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useTranslation } from "react-i18next";

import type { Activity, ActivityStreams } from "@shared/types";
import type AnalysisTab from "../components/AnalysisTab";
import { useAuth } from "../contexts/AuthContext";
import {
  buildActivityAnalysisProjection,
  buildActivitySensorSelectionContext,
  deriveStreamSensorSummary,
  withSynthesizedElapsedTime,
  type ActivityPowerOverride,
} from "../features/activity/detail/activityDetailDerived";
import { resolveAnalysisSummaryTiming } from "../features/activity/detail/analysisSummaryTiming";
import {
  createActivityPowerOverride,
  resolveActiveActivityPowerOverride,
} from "../features/activity/detail/activityPowerOverride";
import {
  createSensorRejectionLogState,
  reportSensorRejectionsOnce,
} from "../features/activity/detail/activitySensorRejectionLogging";
import { getSportCategory } from "../features/activity/detail/activityDetailUtils";
import {
  loadOriderActivityStreams,
  useActivityStreamsLoader,
} from "../features/activity/detail/useActivityStreamsLoader";
import { logClientError } from "../services/errorLogger";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useBikeProfiles } from "./useBikeProfiles";
import { useActivityMetrics } from "./useActivityMetrics";
import { useStrava } from "./useStrava";
import { getStravaActivityId } from "../utils/stravaActivity";

type AnalysisTabProps = ComponentProps<typeof AnalysisTab>;

export interface ActivityAnalysisModel {
  activity: Activity | null;
  setActivity: Dispatch<SetStateAction<Activity | null>>;
  loadingActivity: boolean;
  activityLoadError: unknown;
  activityProcessing: boolean;
  retryActivity: () => void;
  streams: ActivityStreams | null;
  effectiveStreams: ActivityStreams | null;
  loadingStreams: boolean;
  showStreamSpinner: boolean;
  streamsError: string | null;
  retryStreams: () => Promise<void>;
  serverMetrics: ReturnType<typeof useActivityMetrics>;
  isActivityOwner: boolean;
  sport: ReturnType<typeof getSportCategory>;
  streamSensorSummary: ReturnType<typeof deriveStreamSensorSummary>;
  displayedSummary: Activity["summary"] | null;
  avgPowerValue: number | null;
  normalizedPowerValue: number | null;
  hasStreamPowerCandidate: boolean;
  hasStreamHeartRateCandidate: boolean;
  hasStreamCadenceCandidate: boolean;
  hasAnalysisStreams: boolean;
  analysisProjection: ReturnType<typeof buildActivityAnalysisProjection>;
  sensorSelectionContext: ReturnType<typeof buildActivitySensorSelectionContext>;
  analysisTabProps: AnalysisTabProps | null;
  canRecalculateVirtualPowerPreview: boolean;
  recalculateVirtualPowerPreview: () => void;
  revertVirtualPowerPreview: () => void;
  activePowerOverride: ActivityPowerOverride | null;
}

/** Analysis-only activity data model shared by the full page and embed surfaces. */
export function useActivityAnalysisModel(
  activityId: string | undefined,
): ActivityAnalysisModel {
  const firebaseServices = useFirebaseServices();
  const { firestore } = firebaseServices;
  const { t } = useTranslation("activity");
  const { user } = useAuth();
  const { getStreams } = useStrava();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [activityLoadError, setActivityLoadError] = useState<unknown>(null);
  const [activityReloadKey, setActivityReloadKey] = useState(0);
  const [activityProcessing, setActivityProcessing] = useState(false);
  const [wattsOverride, setWattsOverride] = useState<ActivityPowerOverride | null>(null);

  useEffect(() => {
    if (!activityId) return;

    setActivity(null);
    setLoadingActivity(true);
    setWattsOverride(null);
    setActivityLoadError(null);

    let cancelled = false;
    let processingTimer: number | undefined;

    getDoc(doc(firestore, "activities", activityId)).then((snap) => {
      if (cancelled) return;
      if (snap.exists()) {
        const data = snap.data();
        if (data.summary == null) {
          setActivity(null);
          setActivityProcessing(true);
          setLoadingActivity(false);
          processingTimer = window.setTimeout(() => {
            setActivityReloadKey((key) => key + 1);
          }, 3000);
          return;
        }
        setActivityProcessing(false);
        setActivity({ id: snap.id, ...data } as Activity);
      } else {
        setActivityProcessing(false);
      }
      setLoadingActivity(false);
    }).catch((error) => {
      if (cancelled) return;
      setActivityLoadError(error);
      setActivityProcessing(false);
      setLoadingActivity(false);
      logClientError("ActivityPage.loadActivity", error, { activityId });
    });

    return () => {
      cancelled = true;
      if (processingTimer !== undefined) window.clearTimeout(processingTimer);
    };
  }, [activityId, activityReloadKey, firestore]);

  const retryActivity = useCallback(() => {
    setActivityReloadKey((key) => key + 1);
  }, []);

  const {
    streams,
    setStreams,
    showStreamSpinner,
    setShowStreamSpinner,
    streamsError,
    setStreamsError,
    loadingStreams,
    setLoadingStreams,
  } = useActivityStreamsLoader({
    activityId,
    activity,
    userId: user?.uid,
    getStreams,
    t,
  });

  const isActivityOwner = !!activity
    && activity.id === activityId
    && !!user
    && activity.userId === user.uid;
  const serverMetrics = useActivityMetrics(activityId ?? null, isActivityOwner);
  const isStrava = activity?.source === "strava";
  const sport = getSportCategory(activity?.type || (isStrava ? undefined : "Ride"));
  const isRide = sport === "ride";
  /**
   * 이 활동을 기록한 자전거 (#1943 §3, #1950).
   *
   * 예전에는 **지금 선택된** 자전거의 가상 파워 설정으로 다시 계산했다. 자전거를 바꾸면 옛
   * 활동의 파워가 조용히 달라졌다 — 그 라이드를 그 자전거로 탄 적이 없는데도.
   * 활동이 자전거를 모르면(기능 이전 기록) **아무 자전거도 쓰지 않는다** — 추측한 계산보다
   * 계산하지 않는 편이 정확하다.
   */
  const { profiles: bikeProfiles } = useBikeProfiles(
    isRide && isActivityOwner ? (user?.uid ?? null) : null,
  );
  const activityBike = activity?.bikeProfileId
    ? (bikeProfiles.find((p) => p.id === activity.bikeProfileId) ?? null)
    : null;

  const retryStreams = useCallback(async () => {
    if (!activityId || !activity) return;
    const source = activity.source;
    const isOriderActivity = source === "orider" || activityId.startsWith("orider_");

    setLoadingStreams(true);
    setStreamsError(null);
    setShowStreamSpinner(true);
    try {
      if (isOriderActivity) {
        setStreams(await loadOriderActivityStreams(activityId, activity.userId, firebaseServices));
        return;
      }

      const stravaId = getStravaActivityId(activity);
      if (!stravaId) {
        setStreamsError(t("page.streamsMissing"));
        return;
      }
      const data = await getStreams(stravaId);
      setStreams(data as unknown as ActivityStreams);
    } catch (error) {
      logClientError("ActivityPage.streams.retry", error, {
        activityId,
        source: isOriderActivity ? "orider" : "strava",
      });
      setStreamsError(error instanceof Error && error.message !== "STREAMS_MISSING"
        ? error.message
        : t("page.streamsMissing"));
    } finally {
      setShowStreamSpinner(false);
      setLoadingStreams(false);
    }
  }, [activity, activityId, firebaseServices, getStreams, setLoadingStreams, setShowStreamSpinner, setStreams, setStreamsError, t]);

  const activePowerOverride = resolveActiveActivityPowerOverride(
    activityId,
    activity?.id,
    streams,
    wattsOverride,
    activityBike?.virtualPower.enabled ? activityBike.virtualPower : null,
  );
  const effectiveStreams = useMemo(() => {
    if (!streams || !activePowerOverride) return streams;
    return { ...streams, watts: activePowerOverride.values };
  }, [activePowerOverride, streams]);
  const powerOverrideProvenance = useMemo(() => activePowerOverride
    ? { source: activePowerOverride.source, time: activePowerOverride.time }
    : undefined, [activePowerOverride]);
  const selectionSummary = useMemo(
    () => withSynthesizedElapsedTime(activity?.summary, activity?.startTime, activity?.endTime),
    [activity?.endTime, activity?.startTime, activity?.summary],
  );
  const sensorSelectionContext = useMemo(
    () => buildActivitySensorSelectionContext(
      selectionSummary,
      activity?.startTime,
      powerOverrideProvenance,
    ),
    [activity?.startTime, powerOverrideProvenance, selectionSummary],
  );
  const streamSensorSummary = useMemo(
    () => deriveStreamSensorSummary(effectiveStreams, sensorSelectionContext),
    [effectiveStreams, sensorSelectionContext],
  );
  const rejectionLogState = useRef(createSensorRejectionLogState());

  useEffect(() => {
    if (!activityId || !streamSensorSummary?.rejections.length) return;
    reportSensorRejectionsOnce(
      activityId,
      streamSensorSummary.rejections,
      rejectionLogState.current,
    );
  }, [activityId, streamSensorSummary]);

  const hasStreamPowerCandidate = !!streamSensorSummary
    && (streamSensorSummary.hasPowerStream || streamSensorSummary.hasRejectedPowerStream);
  const hasStreamHeartRateCandidate = !!streamSensorSummary
    && (streamSensorSummary.hasHeartRateStream || streamSensorSummary.hasRejectedHeartRateStream);
  const hasStreamCadenceCandidate = !!streamSensorSummary
    && (streamSensorSummary.hasCadenceStream || streamSensorSummary.hasRejectedCadenceStream);
  const analysisProjection = useMemo(
    () => buildActivityAnalysisProjection(effectiveStreams, sensorSelectionContext),
    [effectiveStreams, sensorSelectionContext],
  );
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
      maxHeartRate: hasHeartRateCandidate
        ? streamSensorSummary.maxHeartRate
        : summary.maxHeartRate,
      averageCadence: hasStreamCadenceCandidate
        ? streamSensorSummary.averageCadence
        : summary.averageCadence,
      maxCadence: hasStreamCadenceCandidate
        ? streamSensorSummary.maxCadence
        : summary.maxCadence,
      averagePower: hasStreamPowerCandidate
        ? streamSensorSummary.averagePower
        : summary.averagePower,
      maxPower: hasStreamPowerCandidate ? streamSensorSummary.maxPower : summary.maxPower,
      normalizedPower: hasStreamPowerCandidate ? null : summary.normalizedPower,
      tss: hasStreamPowerCandidate ? null : summary.tss,
    };
  }, [activity?.summary, effectiveStreams, hasStreamCadenceCandidate, hasStreamPowerCandidate, streamSensorSummary]);

  const avgPowerValue = effectiveStreams && hasStreamPowerCandidate
    ? streamSensorSummary?.averagePower ?? null
    : activity?.summary.averagePower ?? activity?.avgPower ?? null;
  const normalizedPowerValue = effectiveStreams && hasStreamPowerCandidate
    ? null
    : activity?.summary.normalizedPower ?? activity?.weightedAvgPower ?? null;

  const recalculateVirtualPowerPreview = useCallback(() => {
    // 이 활동의 자전거를 모르면 다시 계산하지 않는다 — 추측한 파워는 데이터가 아니다.
    if (!activityId || !isActivityOwner || !activityBike || !streams) return;
    setWattsOverride(createActivityPowerOverride(
      activityId,
      streams,
      activityBike.virtualPower,
    ));
  }, [activityBike, activityId, isActivityOwner, streams]);
  const revertVirtualPowerPreview = useCallback(() => {
    setWattsOverride(null);
  }, []);

  useEffect(() => {
    if (wattsOverride && !activePowerOverride) setWattsOverride(null);
  }, [activePowerOverride, wattsOverride]);

  const analysisTabProps = useMemo<AnalysisTabProps | null>(() => {
    if (!activity || !analysisProjection || !displayedSummary) return null;
    return {
      activityId: activityId ?? null,
      isOwner: isActivityOwner,
      startTime: activity.startTime,
      streams: analysisProjection.streams,
      summary: resolveAnalysisSummaryTiming(displayedSummary, serverMetrics.metrics),
      sport,
      isVirtualPower: activity.isVirtualPower || activePowerOverride != null,
      virtualPowerParams: activePowerOverride?.params ?? activity.virtualPowerParams,
    };
  }, [
    activePowerOverride,
    activity,
    activityId,
    analysisProjection,
    displayedSummary,
    hasStreamCadenceCandidate,
    hasStreamHeartRateCandidate,
    hasStreamPowerCandidate,
    isActivityOwner,
    sensorSelectionContext,
    serverMetrics.metrics,
    sport,
  ]);

  return {
    activity,
    setActivity,
    loadingActivity,
    activityLoadError,
    activityProcessing,
    retryActivity,
    streams,
    effectiveStreams,
    loadingStreams,
    showStreamSpinner,
    streamsError,
    retryStreams,
    serverMetrics,
    isActivityOwner,
    sport,
    streamSensorSummary,
    displayedSummary,
    avgPowerValue,
    normalizedPowerValue,
    hasStreamPowerCandidate,
    hasStreamHeartRateCandidate,
    hasStreamCadenceCandidate,
    hasAnalysisStreams,
    analysisProjection,
    sensorSelectionContext,
    analysisTabProps,
    canRecalculateVirtualPowerPreview: isRide
      && isActivityOwner
      && activityBike?.virtualPower.enabled === true,
    recalculateVirtualPowerPreview,
    revertVirtualPowerPreview,
    activePowerOverride,
  };
}
