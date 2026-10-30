import { savedActivitySummary } from "../services/savedActivityMetrics";
import { withImportedObservationTime } from "../features/activity/detail/importedActivityObservations";
import { canonicalActivityChartMetrics } from "../features/activity/detail/activityPerformancePresentation";
import { withActivityPresentation } from "@shared/analysis/activityPresentation";
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
import { buildCyclingDynamicsCards } from "../features/activity/detail/cyclingDynamicsPresentation";
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
  useActivityStreamsLoader,
} from "../features/activity/detail/useActivityStreamsLoader";
import { logClientError } from "../services/errorLogger";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useBikeProfiles } from "./useBikeProfiles";
import { useActivityMetrics } from "./useActivityMetrics";
import { useActivityOverview } from "./useActivityOverview";
import { useStrava } from "./useStrava";

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
  streamsSignInRequired: boolean;
  retryStreams: () => Promise<void>;
  requestStreams: () => void;
  serverMetrics: ReturnType<typeof useActivityMetrics>;
  overview: ReturnType<typeof useActivityOverview>;
  isActivityOwner: boolean;
  authorizedActivityAccess?: boolean;
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
export interface PublicActivityModelInput {
  activity: Activity | null;
  metrics: ReturnType<typeof useActivityMetrics>;
  accessRevision?: string;
  onAccessRevoked?: () => void;
}

export function useActivityAnalysisModel(
  activityId: string | undefined,
  publicInput?: PublicActivityModelInput,
  savedAnalysis?: import("../services/activityReanalysis").SavedActivityAnalysis,
): ActivityAnalysisModel {
  const firebaseServices = useFirebaseServices();
  const { firestore } = firebaseServices;
  const { t } = useTranslation("activity");
  const { user } = useAuth();
  const userId = user?.uid;
  const { getStreams } = useStrava();
  const publicMode = publicInput !== undefined;
  const [ownedActivity, setOwnedActivity] = useState<Activity | null>(null);
  const activity = publicMode ? publicInput.activity : ownedActivity;
  const setActivity = useCallback<Dispatch<SetStateAction<Activity | null>>>(value => { if (!publicMode) setOwnedActivity(value); }, [publicMode]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [activityLoadError, setActivityLoadError] = useState<unknown>(null);
  const [activityReloadKey, setActivityReloadKey] = useState(0);
  const [activityProcessing, setActivityProcessing] = useState(false);
  const [wattsOverride, setWattsOverride] = useState<ActivityPowerOverride | null>(null);

  useEffect(() => {
    if (!activityId || publicMode) return;

    setActivity(null);
    setLoadingActivity(true);
    setWattsOverride(null);
    setActivityLoadError(null);
    setActivityProcessing(false);

    let cancelled = false;
    let processingTimer: number | undefined;
    let attempts = 0;

    const loadActivity = () => {
      attempts += 1;
      return getDoc(doc(firestore, "activities", activityId)).then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data();
          const usableIdentity = typeof data.userId === "string" && data.userId.length > 0
            && typeof data.type === "string" && data.type.length > 0;
          const usableSummary = data.summary !== null && typeof data.summary === "object" && !Array.isArray(data.summary);
          if (!usableSummary && !usableIdentity) {
            setActivity(null);
            setActivityProcessing(true);
            setLoadingActivity(false);
            // 첫 조회 포함 최대 6회. 처리 지연은 3→6→12→24→30초로 기다린다.
            // 상한 뒤에는 기존 오류·재시도 화면으로 전환한다.
            if (attempts < 6) {
              processingTimer = window.setTimeout(() => {
                if (!cancelled) void loadActivity();
              }, Math.min(3000 * 2 ** (attempts - 1), 30000));
            } else {
              setActivityProcessing(false);
              setActivityLoadError(new Error("Activity processing timeout"));
            }
            return;
          }
          setActivityProcessing(false);
          // 누락된 선택 요약이 정상 경로/센서/개요의 조회까지 막지 않는다. 수치 0은 만들지 않는다.
          setActivity(withActivityPresentation({ id: snap.id, ...data, summary: usableSummary ? data.summary : {} } as Activity));
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
    };
    void loadActivity();

    return () => {
      cancelled = true;
      if (processingTimer !== undefined) window.clearTimeout(processingTimer);
    };
  }, [activityId, activityReloadKey, firestore, userId, publicMode, setActivity]);

  const retryActivity = useCallback(() => {
    setActivityReloadKey((key) => key + 1);
  }, []);

  const isActivityOwner = !publicMode && !!activity
    && activity.id === activityId
    && !!user
    && activity.userId === user.uid;
  const ownedMetrics = useActivityMetrics(!publicMode && activity?.id === activityId ? activityId ?? null : null, isActivityOwner);
  const canReadSavedAnalysis = !!activity && activity.id === activityId;
  const serverMetrics = savedAnalysis && canReadSavedAnalysis ? { status: "stale" as const, metrics: savedAnalysis.metrics } : publicMode ? publicInput.metrics : ownedMetrics;
  const showingSavedAnalysis = !!savedAnalysis && canReadSavedAnalysis;
  // 확정 소유자 요약이 오기 전에는 스트림을 요청하지 않는다. 과거 문서만 기존 경로로 폴백한다.
  const serverAnalysisSummary = (isActivityOwner || publicMode)
    && serverMetrics.metrics?.inputPending !== true
    && serverMetrics.metrics?.inputCoverage !== "pending"
    && serverMetrics.metrics?.analysisSummary?.schemaVersion === 1
    ? serverMetrics.metrics.analysisSummary : null;
  const {
    streams: ownedStreams,
    retryStreams,
    requestStreams,
    showStreamSpinner,
    streamsError,
    streamsSignInRequired,
    loadingStreams,
  } = useActivityStreamsLoader({
    activityId,
    activity,
    publicAccess: publicMode,
    accessRevision: publicInput?.accessRevision,
    onAccessRevoked: publicInput?.onAccessRevoked,
    userId: user?.uid,
    getStreams,
    t,
    enabled: !showingSavedAnalysis && !!activity && ((!isActivityOwner && !publicMode) || (
      serverMetrics.status !== "loading" && serverMetrics.status !== "disabled"
      && serverMetrics.metrics?.inputPending !== true
      && serverMetrics.metrics?.inputCoverage !== "pending"
      && !serverAnalysisSummary
    )),
  });

  const streams = showingSavedAnalysis ? null : ownedStreams;

  const overviewActivity = activity as (Activity & Record<string, unknown>) | null;
  const overviewMetrics = serverMetrics.metrics as (NonNullable<typeof serverMetrics.metrics> & Record<string, unknown>) | null;
  // 메트릭 생성 시각이 그대로여도 개인정보·출처·선택 revision 변경은 캐시를 무효화한다.
  // 활동 문서와 첫 메트릭 판정이 도착한 뒤 요청해 초기 revision 변경에 따른 중복 호출을 막는다.
  const overview = useActivityOverview(activityId, !showingSavedAnalysis && !!activity && activity.id === activityId && serverMetrics.status !== "loading", JSON.stringify([
    serverMetrics.status, overviewMetrics?.version, overviewMetrics?.computedAt,
    overviewMetrics?.metricsRevision, overviewMetrics?.inputDigest, overviewMetrics?.etag,
    overviewMetrics?.inputPending, overviewMetrics?.sourceLayer, overviewMetrics?.isVirtualPower,
    activity?.contentRevision, activity?.contentSelectedRevision, activity?.source, activity?.sourceMeta,
    activity?.isVirtualPower, activity?.virtualPowerParams, activity?.visibility,
    overviewActivity?.metadataRevision,
    overviewActivity?.updatedAt,
  ]));
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

  const activePowerOverride = resolveActiveActivityPowerOverride(
    activityId,
    activity?.id,
    streams,
    wattsOverride,
    activityBike?.virtualPower.enabled ? activityBike.virtualPower : null,
  );
  const effectiveStreams = useMemo(() => {
    const exact = withImportedObservationTime(streams, activity?.startTime, activity?.summary?.elapsedTimeMillis == null ? undefined : activity.summary.elapsedTimeMillis / 1000);
    if (!exact || !activePowerOverride) return exact;
    return { ...exact, watts: activePowerOverride.values };
  }, [activePowerOverride, streams, activity?.startTime, activity?.summary?.elapsedTimeMillis]);
  const powerOverrideProvenance = useMemo(() => activePowerOverride
    ? { source: activePowerOverride.source, time: activePowerOverride.time }
    : undefined, [activePowerOverride]);
  const selectionSummary = useMemo(
    () => showingSavedAnalysis ? undefined : withSynthesizedElapsedTime(activity?.summary, activity?.startTime, activity?.endTime),
    [activity?.endTime, activity?.startTime, activity?.summary, showingSavedAnalysis],
  );
  const sensorSelectionContext = useMemo(
    () => buildActivitySensorSelectionContext(
      selectionSummary,
      showingSavedAnalysis ? undefined : activity?.startTime,
      powerOverrideProvenance,
    ),
    [activity?.startTime, powerOverrideProvenance, selectionSummary, showingSavedAnalysis],
  );
  const streamSensorSummary = useMemo(
    () => serverAnalysisSummary && !activePowerOverride
      ? serverAnalysisSummary.sensors
      : deriveStreamSensorSummary(effectiveStreams, sensorSelectionContext),
    [activePowerOverride, effectiveStreams, sensorSelectionContext, serverAnalysisSummary],
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
  const suppressServerPowerMetrics = !!streamSensorSummary?.hasRejectedPowerStream
    || activePowerOverride != null;
  const suppressServerHeartRateMetrics = !!streamSensorSummary?.hasRejectedHeartRateStream;
  const suppressServerCadenceMetrics = !!streamSensorSummary?.hasRejectedCadenceStream;
  const analysisProjection = useMemo(
    () => buildActivityAnalysisProjection(effectiveStreams, sensorSelectionContext),
    [effectiveStreams, sensorSelectionContext],
  );
  const hasAnalysisStreams = serverAnalysisSummary && !activePowerOverride
    ? serverAnalysisSummary.hasAnalysisStreams : !!effectiveStreams && (
    !!streamSensorSummary?.hasReliablePower
    || streamSensorSummary?.averageHeartRate != null
    || (effectiveStreams.distance?.length ?? 0) > 0
    || (effectiveStreams.laps?.length ?? 0) > 0
  );
  const canonicalSummary = canonicalActivityChartMetrics(activity, serverMetrics.metrics, !!activePowerOverride) != null;
  const displayedSummary = useMemo(() => {
    if (showingSavedAnalysis && serverMetrics.metrics) return savedActivitySummary(serverMetrics.metrics);
    if (canonicalSummary) return activity?.summary ?? null;
    const summary = activity?.summary;
    if (summary && serverAnalysisSummary && !activePowerOverride) {
      return { ...summary, ...serverAnalysisSummary.correctedAverages };
    }
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
  }, [showingSavedAnalysis, serverMetrics.metrics, canonicalSummary, activePowerOverride, activity?.summary, effectiveStreams, hasStreamCadenceCandidate, hasStreamPowerCandidate, serverAnalysisSummary, streamSensorSummary]);

  const avgPowerValue = (showingSavedAnalysis || canonicalSummary || serverAnalysisSummary) && !activePowerOverride
    ? displayedSummary?.averagePower ?? null
    : effectiveStreams && hasStreamPowerCandidate
    ? streamSensorSummary?.averagePower ?? null
    : activity?.summary.averagePower ?? activity?.avgPower ?? null;
  const normalizedPowerValue = (showingSavedAnalysis || canonicalSummary || serverAnalysisSummary) && !activePowerOverride
    ? displayedSummary?.normalizedPower ?? null
    : effectiveStreams && hasStreamPowerCandidate
    ? null
    : activity?.summary.normalizedPower ?? activity?.weightedAvgPower ?? null;

  const [previewRequested, setPreviewRequested] = useState(false);
  useEffect(() => { setPreviewRequested(false); }, [activityId, userId]);
  const recalculateVirtualPowerPreview = useCallback(() => {
    // 이 활동의 자전거를 모르면 다시 계산하지 않는다 — 추측한 파워는 데이터가 아니다.
    if (!activityId || !isActivityOwner || !activityBike) return;
    if (!streams) {
      setPreviewRequested(true);
      requestStreams();
      return;
    }
    setWattsOverride(createActivityPowerOverride(
      activityId,
      streams,
      activityBike.virtualPower,
    ));
  }, [activityBike, activityId, isActivityOwner, requestStreams, streams]);
  useEffect(() => {
    if (previewRequested && streams) {
      setPreviewRequested(false);
      recalculateVirtualPowerPreview();
    }
  }, [previewRequested, recalculateVirtualPowerPreview, streams]);
  const revertVirtualPowerPreview = useCallback(() => {
    setPreviewRequested(false);
    setWattsOverride(null);
  }, []);

  useEffect(() => {
    if (wattsOverride && !activePowerOverride) setWattsOverride(null);
  }, [activePowerOverride, wattsOverride]);

  // Saved sensor evidence remains readable when the raw stream is unavailable.
  // Pending inputs and empty documents are not usable evidence, even with a current schema.
  const stored = serverMetrics.metrics;
  const hasStoredSensorAnalysis = (serverMetrics.status === "ready" || serverMetrics.status === "stale")
    && stored?.inputPending !== true && stored?.inputCoverage !== "pending"
    && ([stored?.avgCadence, stored?.maxCadence, stored?.avgHr, stored?.maxHr,
      stored?.avgPower, stored?.np, stored?.cyclingMetrics?.cadenceStdDev,
      stored?.cyclingMetrics?.coastingSec,
      stored?.cyclingMetrics?.longestCoastSec, stored?.cyclingMetrics?.longestZ4PlusSec,
      stored?.decoupling?.ef, stored?.decoupling?.decouplingPct,
      ...Object.values(stored?.quadrant ?? {}),
    ].some(value => typeof value === "number" && Number.isFinite(value))
      || !!stored && buildCyclingDynamicsCards(stored).length > 0);

  const analysisTabProps = useMemo<AnalysisTabProps | null>(() => {
    if (!activity || (!analysisProjection && !serverAnalysisSummary && !hasStoredSensorAnalysis && sport !== "run") || !displayedSummary) return null;
    return {
      activityId: activityId ?? null,
      isOwner: isActivityOwner,
      completeActivityAccess: publicMode,
      serverMetrics,
      canonicalPresentationAvailable: overview.response?.status === "available",
      overviewRecovery: overview.response?.status === "available" ? overview.response.presentation.recovery ?? null : null,
      startTime: activity.startTime,
      streams: analysisProjection?.streams ?? { userId: activity.userId, time: [], distance: [] },
      analysisSummary: activePowerOverride ? undefined : serverAnalysisSummary ?? undefined,
      summary: resolveAnalysisSummaryTiming(displayedSummary, serverMetrics.metrics),
      sport,
      streamsSignInRequired,
      suppressServerPowerMetrics,
      suppressServerHeartRateMetrics,
      suppressServerCadenceMetrics,
      isVirtualPower: showingSavedAnalysis ? serverMetrics.metrics?.isVirtualPower === true : activity.isVirtualPower || activePowerOverride != null,
      virtualPowerParams: showingSavedAnalysis ? undefined : activePowerOverride?.params ?? activity.virtualPowerParams,
    };
  }, [
    overview.response,
    showingSavedAnalysis,
    activePowerOverride,
    activity,
    activityId,
    analysisProjection,
    hasStoredSensorAnalysis,
    displayedSummary,
    hasStreamCadenceCandidate,
    hasStreamHeartRateCandidate,
    hasStreamPowerCandidate,
    isActivityOwner,
    sensorSelectionContext,
    serverMetrics,
    serverAnalysisSummary,
    sport,
    streamsSignInRequired,
    suppressServerCadenceMetrics,
    suppressServerHeartRateMetrics,
    suppressServerPowerMetrics,
  ]);

  return {
    activity,
    setActivity,
    loadingActivity: publicMode ? false : loadingActivity,
    activityLoadError: publicMode ? null : activityLoadError,
    activityProcessing: publicMode || showingSavedAnalysis ? false : activityProcessing,
    retryActivity,
    streams,
    effectiveStreams,
    loadingStreams,
    showStreamSpinner,
    streamsError,
    streamsSignInRequired,
    retryStreams: showingSavedAnalysis ? async () => {} : retryStreams,
    requestStreams: showingSavedAnalysis ? () => {} : requestStreams,
    serverMetrics,
    overview,
    isActivityOwner,
    authorizedActivityAccess: publicMode,
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
    canRecalculateVirtualPowerPreview: !showingSavedAnalysis && isRide
      && isActivityOwner
      && activityBike?.virtualPower.enabled === true,
    recalculateVirtualPowerPreview,
    revertVirtualPowerPreview,
    activePowerOverride,
  };
}
