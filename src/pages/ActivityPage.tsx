import { ArrowLeftRight, BarChart3, ChevronDown, Layers, Route, Menu, Trophy } from "lucide-react";
import SportIcon from "../components/common/SportIcon";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useSearchParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { getPerformanceOverlays } from "../features/activity/detail/activityPerformancePresentation";
import { ActivityGrowthPanel } from "../features/activity/detail/ActivityGrowthPanel";
import { ActivityPersonalBenchmark } from "../features/activity/detail/ActivityPersonalBenchmark";
import ActivityPeakEffortInspector from "../features/activity/detail/ActivityPeakEffortInspector";
import { resolvePeakEffortLocation, visiblePeakEfforts } from "../features/activity/detail/activityPeakEfforts";
import type { RidePeakEffort } from "@shared/types/activity-metrics";
import ActivityRangeAnalysisPanel, { ActivityRangeControls, ActivityChartAxisControls } from "../features/activity/detail/ActivityRangeAnalysisPanel";
import { useActivityRangeSelection } from "../hooks/useActivityRangeSelection";
import ActivityPerformanceCharts from "../features/activity/detail/ActivityPerformanceCharts";
import { recordedLapElapsedRange, resolveRecordedLapRange, type RecordedLap } from "../features/activity/detail/recordedLapRange";
import { normalizeEpochMilliseconds } from "../utils/timestampUnit";
import { useRunSplitLocation } from "../features/activity/detail/useRunSplitLocation";
import { resolveObservedDistanceKm } from "@shared/training/activityDistanceEvidence";
import Avatar from "../components/Avatar";
import "./activity/activity-detail-page.css";
import AnalysisTab, { AnalysisLapTable } from "../components/AnalysisTab";
import ActivityAnalysisBody from "../features/activity/detail/ActivityAnalysisBody";
import ActivityOverviewEvidence from "../features/activity/detail/ActivityOverviewEvidence";
import ActivityOverviewSummary from "../features/activity/detail/ActivityOverviewSummary";
import ActivityDetailMemo from "../features/activity/detail/ActivityDetailMemo";
import LapTable from "../components/LapTable";
import Modal from "../components/Modal";
import ActivityManagementModal from "../components/activity/ActivityManagementModal";
import ExportTab from "../components/ExportTab";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useDialog } from "../contexts/DialogContext";
import { useLocale } from "../contexts/LocaleContext";
import { formatDistance, formatSpeed } from "../utils/units";
import { resolveDuration, resolveAvgSpeedKph } from "../utils/activityTime";
import {
  doc, setDoc, updateDoc,
  collection, query, where, getDocs, orderBy, onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firestore, storage } from "../services/firebase";
import { activitySocialErrorMessageKey, activitySocialMutations } from "../services/activitySocialMutations";
import { track, trackActivationStep } from "../services/analytics";
import type { Activity, Visibility } from "@shared/types";
import { getSportLabelKey } from "../utils/sportType";
import { isIndoorActivity, isVirtualActivityType } from "../utils/indoorActivity";
import { getDiscipline } from "../utils/disciplineFilter";
import { isImplausibleAvgSpeed, isImplausibleMaxSpeed } from "../utils/activitySanity";
import { getStravaActivityId } from "../utils/stravaActivity";
import { useFitnessTimeseries } from "../hooks/useFitnessTimeseries";
import { usePdc } from "../hooks/usePdc";
import { runningCadenceSpm } from "../utils/runningCadence";
import { RunLeftCards, RunRightCards } from "../components/activity/RunDetailCards";
import { SwimLeftCards, SwimRightCards } from "../components/activity/SwimDetailCards";
import KudosCommentsCard, { type CommentItem } from "../components/activity/KudosCommentsCard";
import AiRideAnalysisCard from "../components/activity/AiRideAnalysisCard";
import StravaSummaryPublishing from "../components/activity/StravaSummaryPublishing";
import SegmentEffortsCard from "../components/activity/SegmentEffortsCard";
import { segmentHistoryPath } from "../features/segments/segmentHistoryNavigation";
import { logClientError } from "../services/errorLogger";
import { Button, Card, IconButton, Text, buttonClass } from "../theme/components";
import { ErrorState } from "../components/redesign";
import { formatDuration, formatTime, type SegmentEffortData } from "../features/activity/detail/activityDetailUtils";
import { ActivityStatsGrid, hasSecondaryActivityStats } from "../features/activity/detail/ActivityStatsGrid";
import { resolveSummaryStripStats } from "../features/activity/detail/summaryStripStats";
import { useRunActivityDetail, RunActivityIntro } from "../features/activity/detail/runActivityDetail";
import { ActivityMediaPanel } from "../features/activity/detail/ActivityMediaPanel";
import { ActivityProcessingState, DeletedActivityState, ActivityAnalysisSignInCard, StreamUnavailableCard } from "../features/activity/detail/ActivityDetailStates";
import {
  buildChartOverlays,
  buildSampledData,
  buildSummaryStats,
  getChartHighlightRange,
  getSegmentEfforts,
  getStreamPhotos,
  selectChartOverlay,
} from "../features/activity/detail/activityDetailDerived";
import { extractGpsFromFile } from "../features/activity/detail/photoGps";
import { resizeImageToWebp } from "../features/activity/detail/imageResize";
import { useActivityUnitFormatters, useFormatFullDate, useTimeAgo, type UploadedPhoto } from "../features/activity/detail/activityDisplay";
import { RideActivityRouteButton } from "../features/activity/detail/RideActivityRouteButton";
import { selectActualCoRiders } from "../utils/coRiders";
import { isPermissionDeniedError } from "../utils/firebaseErrors";
import { ActivityShareButton } from "../features/activity/share/ActivityShareButton";
import type { ActivityShareMetric } from "../features/activity/share/activityShareCard";
import { SummarySensorFallbackCard, type SummarySensorMetric } from "../features/activity/detail/ActivityInsightCards";
import { EquipmentSignalCard } from "../features/activity/detail/EquipmentSignalCard";
import { useActivityAnalysisModel } from "../hooks/useActivityAnalysisModel";
import { ActivityFtpDecisionCard } from "../features/activity/detail/ActivityFtpDecisionCard";
import { fitnessDateKeyFor } from "@shared/training/dateKey";
import { ICON_SIZE } from "../theme/tokens/icon";

export default function ActivityPage() {
  const { t, i18n } = useTranslation("activity");
  const { t: tCommon } = useTranslation("common");
  const timeAgo = useTimeAgo();
  const formatFullDate = useFormatFullDate();
  const { activityId } = useParams<{ activityId: string }>();
  const { user, profile, loading: authLoading, signIn } = useAuth();
  const { units, locale } = useLocale();
  const { distVal, distUnit, speedVal, speedUnit, elevVal, elevUnit } = useActivityUnitFormatters(units);
  const { showToast } = useToast();
  const dialog = useDialog();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [coRiders, setCoRiders] = useState<Activity[]>([]);
  const [liked, setLiked] = useState(false);
  const [kudosList, setKudosList] = useState<{ userId: string; nickname: string; profileImage?: string | null }[]>([]);
  const [kudosLoaded, setKudosLoaded] = useState(false);
  const [kudosTouched, setKudosTouched] = useState(false);
  const [commentsList, setCommentsList] = useState<CommentItem[]>([]);
  const [hiddenComments, setHiddenComments] = useState<CommentItem[]>([]);
  const [moderationBusy, setModerationBusy] = useState(false);
  const moderationScope = `${activityId}:${user?.uid}`;
  const moderationContext = useRef(moderationScope); moderationContext.current = moderationScope;
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [showAllResults, setShowAllResults] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState<SegmentEffortData | null>(null);
  const [segmentMapSelection, setSegmentMapSelection] = useState<{ scope: string; effort: SegmentEffortData } | null>(null);
  const segmentMapTrigger = useRef<HTMLButtonElement | null>(null);
  const [showAllSegments, setShowAllSegments] = useState(false);
  const [activeOverlays, setActiveOverlays] = useState<Set<string> | null>(null);
  const [focusedOverlayKey, setFocusedOverlayKey] = useState<string | null>(null);
  const analysisModel = useActivityAnalysisModel(activityId);
  const {
    activity,
    setActivity,
    loadingActivity,
    activityLoadError,
    activityProcessing,
    retryActivity,
    streams,
    effectiveStreams,
    showStreamSpinner,
    streamsError,
    streamsSignInRequired,
    loadingStreams,
    retryStreams,
    requestStreams,
    serverMetrics,
    overview,
    isActivityOwner,
    sport,
    streamSensorSummary,
    displayedSummary: selectedSummary,
    avgPowerValue,
    normalizedPowerValue,
    hasStreamPowerCandidate,
    hasAnalysisStreams,
    sensorSelectionContext,
    analysisTabProps,
    canRecalculateVirtualPowerPreview,
    recalculateVirtualPowerPreview,
    revertVirtualPowerPreview,
    activePowerOverride,
  } = analysisModel;
  const stravaSummaryLang = i18n.language?.startsWith("en") ? "en" : "ko";
  const shareDiscipline = getDiscipline(activity?.type);
  // 미지 종목(요가·근력 등)은 종목별 피트니스 시계열이 없다 — uid 를 주지 않아 조회를
  // 건너뛴다. 예전엔 사이클로 폴백해 **엉뚱한 종목의 곡선**을 이 활동 화면에 붙였다.
  const { timeseries: fitnessTimeseries } = useFitnessTimeseries(
    isActivityOwner && shareDiscipline ? user?.uid : undefined,
    shareDiscipline ?? "bike",
  );
  const bikePdcState = usePdc(isActivityOwner && shareDiscipline === "bike" ? user?.uid : null);
  const bikePdc = bikePdcState.pdc;
  // Inline description editing
  // Photo upload/delete
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [flyToPosition, setFlyToPosition] = useState<[number, number] | null>(null);
  const activityNavigationRef = useRef<HTMLDivElement>(null);
  const [wideStats, setWideStats] = useState(false);
  const [secondaryStatsOpen, setSecondaryStatsOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 64rem)");
    const update = () => setWideStats(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  // 탭 네비게이션
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [showExport, setShowExport] = useState(searchParams.get("tab") === "export");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionText, setDescriptionText] = useState("");
  const [openManagementScope, setOpenManagementScope] = useState<string | null>(null);
  const managementScope = JSON.stringify([activityId, user?.uid]);
  useEffect(() => setOpenManagementScope(null), [activityId, user?.uid]);
  const requestedTab = searchParams.get("tab") ?? "overview";
  const activeTab = requestedTab === "insights" ? "analysis" : requestedTab === "splits" || requestedTab === "laps" ? "segments"
    : ["overview", "analysis", "segments"].includes(requestedTab) || (requestedTab === "compare" && isActivityOwner) ? requestedTab : "overview";
  useLayoutEffect(() => {
    const list = activityNavigationRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    if (!list) return;
    const reveal = () => {
      const selected = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!selected) return;
      const listRect = list.getBoundingClientRect(), selectedRect = selected.getBoundingClientRect();
      if (selectedRect.left < listRect.left) list.scrollLeft -= listRect.left - selectedRect.left;
      else if (selectedRect.right > listRect.right) list.scrollLeft += selectedRect.right - listRect.right;
    };
    reveal();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reveal);
    observer?.observe(list);
    return () => observer?.disconnect();
  }, [activeTab, i18n.language, isActivityOwner, loadingActivity]);
  const setActiveTab = useCallback((tab: string) => setSearchParams(previous => {
    const next = new URLSearchParams(previous); next.set("tab", tab); return next;
  }, { state: location.state }), [setSearchParams, location.state]);
  useEffect(() => {
    if (requestedTab !== "insights") return;
    setSearchParams(previous => {
      const next = new URLSearchParams(previous); next.set("tab", "analysis"); return next;
    }, { replace: true, state: location.state });
  }, [requestedTab, setSearchParams, location.state]);
  useEffect(() => {
    if (requestedTab === "export") setShowExport(true);
  }, [requestedTab]);
  useEffect(() => {
    if (["segments", "splits", "laps", "export"].includes(requestedTab) && activity && !streams && !streamsSignInRequired) requestStreams();
  }, [requestedTab, activity, streams, streamsSignInRequired, requestStreams]);
  const analysisStreamsRequested = useRef<typeof requestStreams | null>(null);
  useEffect(() => {
    if (activeTab !== "analysis" || !activity || activity.id !== activityId || streams
      || streamsSignInRequired || loadingStreams || streamsError || analysisStreamsRequested.current === requestStreams) return;
    analysisStreamsRequested.current = requestStreams;
    requestStreams();
  }, [activeTab, activity, activityId, user?.uid, streams, streamsSignInRequired, loadingStreams, streamsError, requestStreams]);
  const [peakSelection, setPeakSelection] = useState<{ activityId: string | undefined; peak: RidePeakEffort | null }>({ activityId, peak: null });
  const pendingPeakLocation = useRef<{ activityId: string | undefined; uid: string | undefined; peak: RidePeakEffort } | null>(null);
  useEffect(() => {
    pendingPeakLocation.current = null;
    setPeakSelection({ activityId, peak: null });
  }, [activityId, user?.uid, isActivityOwner, serverMetrics.metrics?.computedAt, activePowerOverride]);
  const selectedPeak = peakSelection.activityId === activityId
    && visiblePeakEfforts(serverMetrics.metrics, isActivityOwner, activePowerOverride != null || analysisTabProps?.suppressServerPowerMetrics === true)
      .some(peak => peak.durationSec === peakSelection.peak?.durationSec && peak.startOffsetSec === peakSelection.peak?.startOffsetSec && peak.avgPowerW === peakSelection.peak?.avgPowerW)
    ? peakSelection.peak : null;
  const runLocationAnchor = useRef<HTMLDivElement>(null);
  const segmentMapScope = `${activityId}:${user?.uid}`;
  const selectedMapSegment = activeTab === "segments" && segmentMapSelection?.scope === segmentMapScope ? segmentMapSelection.effort : null;
  useEffect(() => {
    setHoveredSegment(null);
    setSegmentMapSelection(null);
    segmentMapTrigger.current = null;
  }, [activityId, user?.uid, activeTab]);
  const viewSegmentOnMap = useCallback((effort: SegmentEffortData, trigger: HTMLButtonElement) => {
    segmentMapTrigger.current = trigger;
    setHoveredSegment(null);
    setSegmentMapSelection({ scope: segmentMapScope, effort });
    requestAnimationFrame(() => {
      const stickyNavigation = Array.from(document.querySelectorAll("nav")).filter(nav => {
        const style = getComputedStyle(nav), top = Number.parseFloat(style.top);
        return ["sticky", "fixed"].includes(style.position) && Number.isFinite(top) && nav.getBoundingClientRect().top <= top + 1;
      });
      const clearance = Math.max(0, ...stickyNavigation.map(nav => nav.getBoundingClientRect().bottom))
        + (activityNavigationRef.current?.getBoundingClientRect().height ?? 0);
      runLocationAnchor.current?.style.setProperty("--activity-sticky-clearance", `${Math.ceil(clearance)}px`);
      runLocationAnchor.current?.focus({ preventScroll: true });
      runLocationAnchor.current?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    });
  }, [segmentMapScope]);
  const returnToSegment = useCallback(() => {
    segmentMapTrigger.current?.focus({ preventScroll: true });
    segmentMapTrigger.current?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
  }, []);
  const viewMapLocation = useCallback(() => {
    setActiveTab("overview");
    runLocationAnchor.current?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [setActiveTab]);
  const viewRunSplitLocation = useCallback(() => {
    setActiveTab("analysis");
    runLocationAnchor.current?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [setActiveTab]);

  useEffect(() => {
    // 분석 데이터는 useActivityAnalysisModel 이 초기화한다. 페이지 전용 소셜 상태는
    // route id 변경 즉시 별도로 비워 이전 활동 정보가 잠시 노출되지 않게 한다.
    setKudosList([]);
    setKudosLoaded(false);
    setKudosTouched(false);
    setLiked(false);
    setCoRiders([]);
  }, [activityId]);

  // 첫 활동 상세 진입 마일스톤 — 로그인 사용자가 activity 로드 완료 후 1회.
  // deps 를 primitive identity 로 좁혀 setActivity 가 같은 doc 으로 재할당되어도 useEffect 가 안 돎.
  useEffect(() => {
    if (!user || !activity) return;
    trackActivationStep(user.uid, "first_activity_open", { activity_id: activity.id });
  }, [user?.uid, activity?.id]);

  // Fetch co-riders: activities with the same groupRideId
  useEffect(() => {
    if (!activity?.groupRideId) {
      setCoRiders([]);
      return;
    }

    const q = query(
      collection(firestore, "activities"),
      where("groupRideId", "==", activity.groupRideId),
      where("deletedAt", "==", null),
      where("visibility", "==", "everyone"),
    );
    getDocs(q).then((snap) => {
      const candidates = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Activity)
        .filter((a) => a.visibility === "everyone");
      setCoRiders(selectActualCoRiders(activity, candidates));
    }).catch((err) => {
      if (isPermissionDeniedError(err)) {
        setCoRiders([]);
        return;
      }
      logClientError("ActivityPage.bg", err, {});
    });
  }, [activity?.groupRideId, activity?.id]);

  // Real-time kudos subscription
  useEffect(() => {
    if (authLoading) return;
    if (!user || !activityId) {
      setKudosList([]);
      setKudosLoaded(false);
      setKudosTouched(false);
      setLiked(false);
      return;
    }
    setKudosLoaded(false);
    setKudosTouched(false);
    const kudosRef = collection(firestore, "activities", activityId, "kudos");
    return onSnapshot(kudosRef, (snap) => {
      const list = snap.docs.map((d) => ({ userId: d.id, ...d.data() } as { userId: string; nickname: string; profileImage?: string | null }));
      setKudosList(list);
      setKudosLoaded(true);
      setLiked(list.some((k) => k.userId === user.uid));
    }, (err) => {
      setKudosLoaded(false);
      logClientError("ActivityPage.kudos", err, { path: `activities/${activityId}/kudos` });
    });
  }, [activityId, authLoading, user]);

  // Real-time comments subscription (exclude soft-deleted)
  useEffect(() => {
    if (authLoading) return;
    if (!user || !activityId) {
      setCommentsList([]);
      return;
    }
    const commentsRef = query(
      collection(firestore, "activities", activityId, "comments"),
      where("deletedAt", "==", null),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(commentsRef, (snap) => {
      setCommentsList(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommentItem)).filter(comment => comment.hiddenByOwner !== true && comment.deletedAt == null),
      );
    }, (err) => {
      logClientError("ActivityPage.comments", err, { path: `activities/${activityId}/comments` });
    });

  }, [activityId, authLoading, user]);

  useEffect(() => {
    setHiddenComments([]);
    if (authLoading || !user || !activityId || !isActivityOwner) return;
    return onSnapshot(query(collection(firestore, "activities", activityId, "comments"), where("hiddenByOwner", "==", true)), snap => {
      setHiddenComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommentItem)));
    }, error => logClientError("ActivityPage.hiddenComments", error, {}));
  }, [activityId, authLoading, user?.uid, isActivityOwner]);

  async function handleReportComment(commentId: string) {
    const comment = commentsList.find(comment => comment.id === commentId);
    if (!user || !activityId || !comment || comment.userId === user.uid || moderationBusy) return;
    const note = await dialog.prompt(t("kudosCard.reportReason"), { multiline: true });
    if (!note?.trim() || moderationContext.current !== moderationScope) return;
    setModerationBusy(true);
    try { await activitySocialMutations.reportComment(activityId, commentId, note.trim()); if (moderationContext.current === moderationScope) showToast(t("kudosCard.reported")); }
    catch (error) { showToast(t(activitySocialErrorMessageKey(error)), "error"); }
    finally { setModerationBusy(false); }
  }
  async function handleSetCommentHidden(commentId: string, hidden: boolean) {
    if (!user || !activityId || !isActivityOwner || moderationBusy) return;
    if (!await dialog.confirm(t(hidden ? "kudosCard.hideConfirm" : "kudosCard.restoreConfirm")) || moderationContext.current !== moderationScope) return;
    setModerationBusy(true);
    try { await activitySocialMutations.setCommentHidden(activityId, commentId, hidden); if (moderationContext.current === moderationScope) showToast(t(hidden ? "kudosCard.hidden" : "kudosCard.restored")); }
    catch (error) { showToast(t(activitySocialErrorMessageKey(error)), "error"); }
    finally { setModerationBusy(false); }
  }

  const handleToggleKudos = async () => {
    if (!user || !activityId || !profile) return;
    const fallbackLiked = !kudosTouched
      && (!kudosLoaded || kudosList.length === 0)
      && !!activity?.recentKudos?.some((k) => k.userId === user.uid);
    const wasLiked = liked || fallbackLiked;
    const currentProfileImage = profile.photoURL ?? user.photoURL ?? null;
    const previous = { liked, kudosList, kudosTouched };
    setKudosTouched(true);
    if (wasLiked) {
      setLiked(false);
      setKudosList((list) => list.filter((k) => k.userId !== user.uid));
    } else {
      setLiked(true);
      setKudosList((list) => [
        { userId: user.uid, nickname: profile.nickname ?? user.displayName ?? "User", profileImage: currentProfileImage },
        ...list.filter((k) => k.userId !== user.uid),
      ]);
    }
    try {
      await activitySocialMutations.setKudos(activityId, !wasLiked);
      if (!wasLiked) showToast(t("card.kudosToast"));
    } catch (err) {
      setLiked(previous.liked);
      setKudosList(previous.kudosList);
      setKudosTouched(previous.kudosTouched);
      showToast(t(activitySocialErrorMessageKey(err)), "error");
      logClientError("ActivityPage.kudosMutation", err, { activityId, enabled: !wasLiked });
    }
  };

  const submittingRef = useRef(false);
  const handleSubmitComment = async () => {
    if (!user || !activityId || !profile || !commentText.trim() || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await activitySocialMutations.postComment(activityId, commentText.trim());
      track("activity_comment_send", {
        activity_id: activityId,
        text_len: commentText.trim().length,
        activity_sport: activity ? getDiscipline(activity.type) : "unknown",
        distance_km: activity ? Math.round(activity.summary.distance / 100) / 10 : 0,
        is_own_activity: activity?.userId === user.uid ? "true" : "false",
        activity_source: (activity as Activity & { source?: string } | null)?.source ?? "unknown",
      });
      setCommentText("");
    } catch (err) {
      showToast(t(activitySocialErrorMessageKey(err)), "error");
      logClientError("ActivityPage.commentCreate", err, { activityId });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!activityId) return;
    const previous = commentsList;
    setCommentsList((list) => list.filter((comment) => comment.id !== commentId));
    try {
      await activitySocialMutations.deleteComment(activityId, commentId);
    } catch (err) {
      setCommentsList(previous);
      showToast(t(activitySocialErrorMessageKey(err)), "error");
      logClientError("ActivityPage.commentDelete", err, { activityId, commentId });
    }
  };

  const handleSaveEditComment = async () => {
    if (!activityId || !editingCommentId || !editingText.trim()) return;
    const commentId = editingCommentId;
    const text = editingText.trim();
    const previous = commentsList;
    setCommentsList((list) => list.map((comment) => comment.id === commentId ? { ...comment, text } : comment));
    try {
      await activitySocialMutations.editComment(activityId, commentId, text);
      setEditingCommentId(null);
      setEditingText("");
    } catch (err) {
      setCommentsList(previous);
      showToast(t(activitySocialErrorMessageKey(err)), "error");
      logClientError("ActivityPage.commentEdit", err, { activityId, commentId });
    }
  };

  const handleDeleteActivity = async () => {
    if (!activityId || !user || user.uid !== activity?.userId) return;
    if (!(await dialog.confirm(t("page.deleteConfirm"), { destructive: true }))) return;
    const deletedAt = Date.now();
    await updateDoc(doc(firestore, "activities", activityId), { deletedAt });
    setActivity({ ...activity, deletedAt } as Activity);
    showToast(t("page.deleteToast"), "info");
  };

  const handleRestoreActivity = async () => {
    if (!activityId || !user || user.uid !== activity?.userId) return;
    await updateDoc(doc(firestore, "activities", activityId), { deletedAt: null });
    setActivity({ ...activity, deletedAt: null } as Activity);
    showToast(t("page.restoreToast"));
  };

  const handleVisibilityChange = async (visibility: Visibility) => {
    if (!activity || !user || user.uid !== activity.userId || activity.visibility === visibility) return;
    const previous = activity.visibility;
    setActivity({ ...activity, visibility });
    try {
      await updateDoc(doc(firestore, "activities", activity.id), { visibility });
      showToast(t("page.visibilityToast"));
    } catch (err) {
      setActivity({ ...activity, visibility: previous });
      showToast(t("page.visibilityFailed"), "error");
      logClientError("ActivityPage.visibility", err, { activityId: activity.id, visibility });
    }
  };

  // Load uploaded photos from activity_photos/{activityId} (exclude soft-deleted)
  useEffect(() => {
    if (!activityId) return;
    const photosRef = query(
      collection(firestore, "activity_photos", activityId, "photos"),
      where("deletedAt", "==", null),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(photosRef, (snap) => {
      setUploadedPhotos(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as UploadedPhoto)),
      );
    }, (err) => {
      logClientError("ActivityPage.photos", err, { path: `activity_photos/${activityId}/photos` });
    });
  }, [activityId]);

  // Save description
  const handleSaveDescription = async () => {
    if (!activityId || !activity) return;
    const trimmed = descriptionText.trim();
    if (!trimmed) {
      setDescriptionText(activity.description || tCommon(getSportLabelKey(activity.type)));
      setEditingDescription(false);
      return;
    }
    setEditingDescription(false);
    setActivity({ ...activity, description: trimmed });
    await updateDoc(doc(firestore, "activities", activityId), { description: trimmed });
  };

  // Upload activity photo
  const MAX_PHOTOS = 10;
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activityId || !activity) return;
    if (!file.type.startsWith("image/")) {
      showToast(t("page.photoToast.imageOnly"));
      return;
    }
    if (uploadedPhotos.length >= MAX_PHOTOS) {
      showToast(t("page.photoToast.maxLimit", { count: MAX_PHOTOS }));
      return;
    }
    setPhotoUploading(true);
    try {
      // Extract GPS from EXIF before canvas destroys it
      const location = await extractGpsFromFile(file);
      const blob = await resizeImageToWebp(file);
      if (blob.size > 5 * 1024 * 1024) {
        showToast(t("page.photoToast.tooLarge"));
        return;
      }
      const photoId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const storagePath = `activity_photos/${user.uid}/${activityId}/${photoId}.webp`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob, { contentType: "image/webp" });
      const url = await getDownloadURL(storageRef);
      await setDoc(doc(firestore, "activity_photos", activityId, "photos", photoId), {
        storagePath,
        url,
        userId: user.uid,
        createdAt: Date.now(),
        deletedAt: null,
        ...(location ? { location } : {}),
      });
      showToast(t("page.photoToast.uploaded"));
    } catch {
      showToast(t("page.photoToast.uploadFailed"));
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // Soft-delete uploaded photo (Storage file retained)
  const handleDeletePhoto = async (photo: UploadedPhoto) => {
    if (!activityId) return;
    if (!(await dialog.confirm(t("page.photoToast.deleteConfirm"), { destructive: true }))) return;
    await updateDoc(doc(firestore, "activity_photos", activityId, "photos", photo.id), { deletedAt: Date.now() });
    showToast(t("page.photoToast.deleted"));
  };
  const handleElevHover = useCallback((index: number | null) => setHoverIndex(index), []);
  const toggleOverlay = (key: string) => {
    setActiveOverlays((prev) => {
      const next = selectChartOverlay(prev ?? new Set(availableOverlays.map(item => item.key)), key);
      setFocusedOverlayKey(next.focusedOverlayKey);
      return next.activeOverlays;
    });
  };
  // 지도·세그먼트·개요 차트용 파생값은 분석 모델 경계 밖에서 계산한다.
  const sampledData = useMemo(
    () => buildSampledData(effectiveStreams, sensorSelectionContext),
    [effectiveStreams, sensorSelectionContext],
  );
  const sourceIndices = useMemo(() => sampledData.map(point => point.sourceIndex ?? -1), [sampledData]);
  const rangeSelection = useActivityRangeSelection(analysisModel, sampledData);
  // 시각적 탐색은 소유자 전용 서버 구간 분석과 독립적이다.
  const [visualState, setVisualState] = useState<{ identity: string; axis: "distance" | "elapsed"; range: [number, number] | null }>({ identity: "", axis: "distance", range: null });
  const visualSource = useRef({ streams, generation: 0 });
  if (visualSource.current.streams !== streams) visualSource.current = { streams, generation: visualSource.current.generation + 1 };
  const visualIdentity = `${rangeSelection.identity}:${visualSource.current.generation}`;
  const visualAxis = visualState.identity === visualIdentity && rangeSelection.sampledAxis ? visualState.axis : "distance";
  const visualRange = visualState.identity === visualIdentity ? visualState.range : null;
  useLayoutEffect(() => { setHoverIndex(null); }, [visualIdentity, visualAxis]);
  // 명시적인 서버 구간 분석을 시작하면 별도의 임시 확대를 먼저 종료한다.
  useLayoutEffect(() => {
    if (!rangeSelection.enabled) return;
    setVisualState(previous => ({ ...previous, range: null }));
    setHoverIndex(null);
  }, [rangeSelection.enabled, visualIdentity]);
  const setVisualRange = (range: [number, number] | null) => {
    if (range && (!Number.isInteger(range[0]) || !Number.isInteger(range[1]) || range[0] < 0 || range[1] <= range[0] || range[1] >= sampledData.length)) return;
    setVisualState({ identity: visualIdentity, axis: visualAxis, range });
    setHoverIndex(range?.[1] ?? null);
  };
  const visualRouteRange = useMemo(() => {
    if (!visualRange || !streams?.latlng) return null;
    const startIndex = sampledData[visualRange[0]]?.sourceIndex;
    const endIndex = sampledData[visualRange[1]]?.sourceIndex;
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) || startIndex! < 0 || endIndex! <= startIndex! || endIndex! >= streams.latlng.length) return null;
    if (!streams.latlng.slice(startIndex, endIndex! + 1).every(point => point?.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180)) return null;
    return { startIndex: startIndex!, endIndex: endIndex! };
  }, [visualRange, sampledData, streams]);
  const recordedRunCadenceUnit = serverMetrics.metrics?.cadenceUnit ?? (activity?.source === "strava" ? "strides_per_minute" : activity?.source === "orider" ? "spm" : null);
  const availableOverlays = useMemo(() => getPerformanceOverlays(
    sampledData, sport, units, recordedRunCadenceUnit, t("analysis.run.cadenceUnit"),
  ), [sampledData, sport, units, recordedRunCadenceUnit, t]);
  const summaryStats = useMemo(
    () => buildSummaryStats(effectiveStreams, streamSensorSummary),
    [effectiveStreams, streamSensorSummary],
  );
  const { location: runSplitLocation, onSelectSplit: selectRunSplit } = useRunSplitLocation(activityId, activity?.id, sport === "run", streams, sampledData, resolveObservedDistanceKm(serverMetrics.metrics ?? {}, activity?.summary?.distance));
  const peakLocation = useMemo(() => resolvePeakEffortLocation(selectedPeak, serverMetrics.metrics?.peakEfforts?.indexAxis, streams, sampledData),
    [selectedPeak, serverMetrics.metrics, streams, sampledData]);
  const locatePeak = useCallback((peak: RidePeakEffort | null) => {
    pendingPeakLocation.current = null;
    setPeakSelection({ activityId, peak });
    if (!peak) return;
    if (!streams) {
      pendingPeakLocation.current = { activityId, uid: user?.uid, peak };
      requestStreams();
    }
    else if (resolvePeakEffortLocation(peak, serverMetrics.metrics?.peakEfforts?.indexAxis, streams, sampledData)) viewMapLocation();
  }, [activityId, user?.uid, streams, requestStreams, viewMapLocation, serverMetrics.metrics, sampledData]);
  useEffect(() => {
    const pending = pendingPeakLocation.current;
    if (!pending) return;
    if (pending.activityId !== activityId || pending.uid !== user?.uid || !isActivityOwner
      || pending.peak !== selectedPeak || streamsError) {
      pendingPeakLocation.current = null;
      return;
    }
    if (!streams || loadingStreams) return;
    // 준비된 위치를 한 번만 보여 준다. 이후 사용자의 탭 선택은 바꾸지 않는다.
    pendingPeakLocation.current = null;
    if (peakLocation) viewMapLocation();
  }, [activityId, user?.uid, isActivityOwner, selectedPeak, streams, streamsError, loadingStreams, peakLocation, viewMapLocation]);
  const lapContext = { source: activity?.source, activityStartMs: normalizeEpochMilliseconds(activity?.startTime) ?? 0, durationSec: rangeSelection.durationSec };
  const [unlinkedLapIdentity, setUnlinkedLapIdentity] = useState<string | null>(null);
  const pendingLap = useRef<{ identity: string; lap: RecordedLap } | null>(null);
  if (pendingLap.current?.identity !== rangeSelection.identity) pendingLap.current = null;
  const canSelectLap = (lap: RecordedLap) => !!rangeSelection.ownerUid && activity?.id === activityId
    && !rangeSelection.sourceLocked && (!loadingStreams || !streams) && (streams
      ? !!resolveRecordedLapRange(lap, lapContext, streams.time, streams.laps)
      : !!recordedLapElapsedRange(lap, lapContext));
  const selectLap = (lap: RecordedLap) => {
    if (!canSelectLap(lap) || pendingLap.current) return;
    setUnlinkedLapIdentity(null);
    if (!streams) {
      pendingLap.current = { identity: rangeSelection.identity, lap };
      requestStreams();
      return;
    }
    const range = resolveRecordedLapRange(lap, lapContext, streams.time, streams.laps);
    if (range) { rangeSelection.selectAndEnable(range); viewMapLocation(); }
  };
  useEffect(() => {
    const pending = pendingLap.current;
    if (!pending) return;
    if (pending.identity !== rangeSelection.identity || !rangeSelection.ownerUid || rangeSelection.sourceLocked || streamsError) {
      pendingLap.current = null;
      return;
    }
    if (!streams || loadingStreams) return;
    pendingLap.current = null;
    const range = resolveRecordedLapRange(pending.lap, { source: activity?.source,
      activityStartMs: normalizeEpochMilliseconds(activity?.startTime) ?? 0, durationSec: rangeSelection.durationSec }, streams.time, streams.laps);
    if (range) { rangeSelection.selectAndEnable(range); viewMapLocation(); }
    else setUnlinkedLapIdentity(rangeSelection.identity);
  }, [rangeSelection, streams, loadingStreams, streamsError, activity?.source, activity?.startTime, viewMapLocation]);
  const markerPosition = useMemo(() => {
    if (selectedMapSegment) return streams?.latlng?.[selectedMapSegment.endIndex] ?? null;
    if (hoverIndex == null || !sampledData[hoverIndex]) {
      if (rangeSelection.selection) return rangeSelection.routeRange ? streams?.latlng?.[rangeSelection.routeRange.endIndex] ?? null : null;
      return runSplitLocation?.markerPosition ?? peakLocation?.markerPosition ?? null;
    }
    return sampledData[hoverIndex].latlng;
  }, [hoverIndex, sampledData, runSplitLocation, peakLocation, rangeSelection.selection, rangeSelection.routeRange, streams, selectedMapSegment]);
  const segmentEfforts = useMemo(() => getSegmentEfforts(streams), [streams]);
  const chartSegments = useMemo(() => segmentEfforts.flatMap(effort => {
    if (!Number.isInteger(effort.startIndex) || !Number.isInteger(effort.endIndex) || effort.startIndex < 0 || effort.endIndex <= effort.startIndex || effort.endIndex >= (streams?.distance?.length ?? 0)) return [];
    const startIndex = sampledData.findIndex(point => (point.sourceIndex ?? -1) >= effort.startIndex);
    let endIndex = sampledData.length - 1;
    while (endIndex >= 0 && (sampledData[endIndex]?.sourceIndex ?? Infinity) > effort.endIndex) endIndex--;
    return startIndex >= 0 && endIndex > startIndex ? [{ id: String(effort.id), name: effort.name, startIndex, endIndex,
      summary: [Number.isFinite(effort.distance) && effort.distance > 0 ? formatDistance(effort.distance, units) : null,
        Number.isFinite(effort.elapsedTime) && effort.elapsedTime > 0 ? formatTime(effort.elapsedTime) : null].filter(Boolean).join(" · "),
      href: effort.segment?.id ? `/${locale}${segmentHistoryPath(effort.segment.id, effort.id, activity?.id)}` : undefined,
    }] : [];
  }), [segmentEfforts, sampledData, units, locale, activity?.id, streams]);
  const canViewSegmentOnMap = (effort: SegmentEffortData) => {
    const points = streams?.latlng;
    return !!points && Number.isInteger(effort.startIndex) && Number.isInteger(effort.endIndex)
      && effort.startIndex >= 0 && effort.endIndex > effort.startIndex && effort.endIndex < points.length
      && points.slice(effort.startIndex, effort.endIndex + 1).every(point => point?.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180);
  };
  const chartHighlightRange = useMemo(
    () => rangeSelection.selection ? rangeSelection.chartRange
      : getChartHighlightRange(hoveredSegment, streams) ?? runSplitLocation?.chartRange ?? peakLocation?.chartRange,
    [hoveredSegment, streams, runSplitLocation, peakLocation, rangeSelection.selection, rangeSelection.chartRange],
  );
  const photos = useMemo(() => getStreamPhotos(streams), [streams]);
  const hasStreams = sampledData.length > 0;
  const runDetail = useRunActivityDetail(activity, profile, serverMetrics.metrics, user?.uid, activityId, user?.isAnonymous === true);
  const runGapSecPerKm = serverMetrics.metrics?.runMetrics?.splitTimeStatus === "native_timer_mismatch"
    ? null : serverMetrics.metrics?.runMetrics?.gapAvgSec ?? null;

  if (loadingActivity) {
    return (
      <div className="site-shell activity-detail">
        <div className="h-80 rounded-[var(--r-lg)] animate-pulse" style={{ background: 'var(--bg-2)' }} />
        <div className="h-8 rounded-[var(--r-sm)] w-1/3 animate-pulse" style={{ background: 'var(--bg-2)' }} />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-[var(--r-sm)] animate-pulse" style={{ background: 'var(--bg-2)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (activityLoadError) {
    const isPermissionError = isPermissionDeniedError(activityLoadError);
    return (
      <div className="max-w-xl mx-auto py-16">
        <ErrorState
          title={isPermissionError ? tCommon("error.permission") : tCommon("error.title")}
          description={isPermissionError ? t("card.noActivity") : tCommon("error.description")}
          onRetry={retryActivity}
        />
      </div>
    );
  }

  if (activityProcessing) {
    return (
      <ActivityProcessingState
        title={t("card.processingActivity")}
        description={t("card.processingActivityDesc")}
        retryLabel={t("page.retry")}
        onRetry={retryActivity}
      />
    );
  }

  if (!activity?.summary) {
    return (
      <div className="text-center py-16" style={{ color: 'var(--ink-2)' }}>
        <div className="text-[48px] mb-4">🔍</div>
        <p className="text-[length:var(--fs-lg)]">{t("card.noActivity")}</p>
        <Link to="/" className="text-[length:var(--fs-sm)] mt-2 inline-block hover:underline" style={{ color: 'var(--lime)' }}>{t("card.backHome")}</Link>
      </div>
    );
  }

  if ((activity as Activity & { deletedAt?: number | null }).deletedAt) {
    return (
      <DeletedActivityState
        canRestore={user?.uid === activity.userId}
        deletedLabel={t("card.deletedActivity")}
        restoreLabel={t("page.restore")}
        backHomeLabel={t("card.backHome")}
        onRestore={handleRestoreActivity}
      />
    );
  }

  const s = activity.summary;
  const displayedSummary = selectedSummary ?? s;
  const activityDate = Number.isFinite(activity.startTime) && Number.isFinite(new Date(activity.startTime).getTime())
    ? fitnessDateKeyFor(activity.startTime, fitnessTimeseries?.loadSnapshot?.dateKeyBasis)
    : null;
  const fitnessAtActivity = fitnessTimeseries?.points
    .slice()
    .reverse()
    .find((point) => activityDate != null && point.date <= activityDate) ?? null;
  const shareMetric = (label: string, value: number | null | undefined, unit?: string, signed = false): ActivityShareMetric | null => {
    if (value == null || !Number.isFinite(value)) return null;
    const rounded = Math.round(value);
    return { label, value: `${signed && rounded > 0 ? "+" : ""}${rounded}`, unit };
  };
  // Until streams and activity_metrics share a revision fingerprint, any raw power candidate
  // makes saved/server NP and TSS provenance unprovable. Keep trusted stream avg/max only.
  const activityTss = sport === "run" ? serverMetrics.metrics?.streamTrimpTss ?? null : hasStreamPowerCandidate
    ? null
    : serverMetrics.metrics?.tss ?? s.tss;
  const activityNp = sport !== "ride" || hasStreamPowerCandidate
    ? null
    : serverMetrics.metrics?.np ?? normalizedPowerValue;

  const sharePerformanceMetrics = [
    shareMetric(t(sport === "run" ? "analysis.run.hrLoad" : "page.share.tss"), activityTss),
    shareMetric(activityNp != null ? t("page.share.normalizedPower") : t(sport === "run" ? "stat.runningPower" : "stat.avgPower"), activityNp ?? avgPowerValue, "W"),
    shareMetric("CTL", fitnessAtActivity?.ctl),
    shareMetric("ATL", fitnessAtActivity?.atl),
    shareMetric("TSB", fitnessAtActivity?.tsb, undefined, true),
    sport === "ride" ? shareMetric(t("page.share.vo2max"), bikePdc?.vo2maxEst) : null,
  ].filter((metric): metric is ActivityShareMetric => metric != null);
  const isStrava = (activity as Activity & { source?: string }).source === "strava";
  const stravaActivityId = getStravaActivityId(activity);
  const stravaActivityUrl = stravaActivityId ? `https://www.strava.com/activities/${stravaActivityId}` : null;
  const activityNickname = activity.nickname?.trim() || (isActivityOwner ? profile?.nickname?.trim() || user?.displayName?.trim() : null) || tCommon("label.rider");
  const activityProfileImage = activity.profileImage || (user?.uid === activity.userId ? profile?.photoURL ?? user?.photoURL ?? null : null);
  const hasAnalysisRoute = !!streams?.latlng?.length;
  const hasTrack = !!(activity.thumbnailTrack || hasAnalysisRoute);
  const canCreateFromOwnRoute = isActivityOwner && hasAnalysisRoute && sport !== "swim";
  const canRegisterPublicRoute = !!user && !isActivityOwner && activity.visibility === "everyone" && hasTrack && sport !== "swim";
  const canRideActivityRoute = (isActivityOwner || activity.visibility === "everyone") && sport === "ride" && hasTrack;
  const hasAiSummaryPreview = !!(activity.aiSummaryPreview || activity.aiSummaryPreview_en);
  const canShowAiAnalysis = (sport === "ride" || sport === "run") && (hasAnalysisStreams || hasAiSummaryPreview);
  const showElevation = sport === "ride" || sport === "run";

  // activitySanity 가드 — 비현실 속도 노출 차단용. sport "ride" → discipline "bike".
  const discipline = sport === "ride" ? "bike" : sport === "run" ? "run" : "swim";
  const avgSpeedImplausible = isImplausibleAvgSpeed(s.averageSpeed, discipline);
  const maxSpeedImplausible = isImplausibleMaxSpeed(s.maxSpeed, discipline);
  // 서버 activity_metrics 가 이동/정지 시간의 정본. 활동 문서의 movingTimeSec/pauseTimeSec 는
  // 같은 문서를 비정규화한 미러라 폴백으로 안전하다. Strava 의 ridingTimeMillis 는 이동시간
  // 성격이므로 총 경과시간은 start/end 차이로 확정한다.
  const movingTimeSec = serverMetrics.metrics?.movingTimeSec ?? s.movingTimeSec;
  const pauseTimeSec = serverMetrics.metrics?.pauseTimeSec ?? s.pauseTimeSec;
  const speedDur = resolveDuration({
    ridingTimeMillis: s.ridingTimeMillis,
    elapsedTimeMillis: s.elapsedTimeMillis,
    startTime: activity.startTime,
    endTime: activity.endTime,
    movingTimeSec,
    pauseTimeSec,
  });
  const fallbackAvgKph = resolveAvgSpeedKph(s.distance, speedDur, s.averageSpeed);
  // 요약 스트립도 AnalysisTab 과 같은 서버 정본을 쓴다 — 한 화면에서 값이 갈리지 않도록 (#885 §2).
  const rawStripStats = resolveSummaryStripStats(serverMetrics, {
    summary: displayedSummary,
    avgPowerValue,
    avgSpeedFallbackKph: fallbackAvgKph,
    normalizedPowerValue,
    hasStreamPowerCandidate,
  });
  const runCadenceUnit = recordedRunCadenceUnit;
  const stripStats = sport === "run" ? {
    ...rawStripStats,
    avgCadence: { ...rawStripStats.avgCadence, value: runningCadenceSpm(rawStripStats.avgCadence.value, runCadenceUnit) },
  } : rawStripStats;
  const displayAvgKph = stripStats.avgSpeedKph.value ?? fallbackAvgKph;
  const displayAvgImplausible = isImplausibleAvgSpeed(displayAvgKph, discipline);

  // Elevation data from streams
  const elevData = hasStreams
    ? sampledData.map((d) => ({ distance: d.distance, elevation: d.altitude }))
    : [];

  // Build chart overlays from active toggles
  const chartOverlays = buildChartOverlays(availableOverlays, activeOverlays ?? new Set(availableOverlays.map(item => item.key)), sampledData, (label) => t(`overlay.${label}`));

  const hoverPoint = hoverIndex != null ? sampledData[hoverIndex] ?? null : null;

  const activityComments = commentsList;
  const fallbackKudos = activity.recentKudos ?? [];
  const shouldUseFallbackKudos = !kudosTouched && (!kudosLoaded || (kudosList.length === 0 && fallbackKudos.length > 0));
  const activityKudos = shouldUseFallbackKudos ? fallbackKudos : kudosList;
  const displayLiked = shouldUseFallbackKudos
    ? !!user && fallbackKudos.some((k) => k.userId === user.uid)
    : liked;

  // Top results: efforts with PR or KOM achievements
  const topResults = segmentEfforts.filter(
    (e) => (e.prRank != null && e.prRank >= 1 && e.prRank <= 3) || (e.komRank != null && e.komRank >= 1 && e.komRank <= 10),
  );
  const streamUnavailableMessage = loadingStreams || showStreamSpinner
    ? t("page.loadingGps")
    : streamsError ?? t("page.streamsMissing");

  // 스트립과 같은 서버 정본을 쓰고, 서버 문서를 아직 못 읽었으면 "기기 요약" 표식을 붙인다.
  const sensorSub = (base: string | undefined, stat: { provisional: boolean }) => (
    stat.provisional ? [base, t("stat.deviceSummary")].filter(Boolean).join(" · ") : base
  );
  const summarySensorMetrics = ([
    stripStats.avgHr.value != null
      ? {
          label: t("stat.avgHr"),
          value: String(Math.round(stripStats.avgHr.value)),
          unit: "bpm",
          sub: sensorSub(
            stripStats.maxHr.value != null ? `${t("page.max")} ${Math.round(stripStats.maxHr.value)} bpm` : undefined,
            stripStats.avgHr,
          ),
        }
      : null,
    stripStats.avgPower.value != null && (sport === "ride" || sport === "run")
      ? {
          label: t(sport === "run" ? "stat.runningPower" : "stat.avgPower"),
          value: String(Math.round(stripStats.avgPower.value)),
          unit: "W",
          // NP 는 서버 metrics.np 단일 출처 (#885 §3) — 같은 페이지에서 두 출처가 갈리지 않도록.
          sub: sensorSub(
            sport === "ride" && stripStats.np.value != null ? `NP ${Math.round(stripStats.np.value)} W` : undefined,
            stripStats.avgPower,
          ),
        }
      : null,
    stripStats.maxPower.value != null && (sport === "ride" || sport === "run")
      ? {
          label: t("stat.maxPower"),
          value: String(Math.round(stripStats.maxPower.value)),
          unit: "W",
          sub: sensorSub(undefined, stripStats.maxPower),
        }
      : null,
    stripStats.avgCadence.value != null
      ? {
          label: sport === "swim" ? t("stat.avgStroke") : t("stat.avgCadence"),
          value: String(Math.round(stripStats.avgCadence.value)),
          unit: sport === "run" || sport === "swim" ? "spm" : "rpm",
          sub: sensorSub(undefined, stripStats.avgCadence),
        }
      : null,
    stripStats.caloriesKcal.value != null
      ? {
          label: t("stat.calories"),
          value: Math.round(stripStats.caloriesKcal.value).toLocaleString(),
          unit: "kcal",
          sub: sensorSub(undefined, stripStats.caloriesKcal),
        }
      : null,
  ] as (SummarySensorMetric | null)[]).filter((metric): metric is SummarySensorMetric => metric != null);

  const acceptedLoad = overview.response?.status === "available" ? overview.response.presentation.session.load : null;
  const analysisLoad = serverMetrics.metrics?.tss;
  // 두 화면에 표시하는 정밀도가 다른 경우도 사용자가 보는 차이를 안내한다.
  const differentLoadValues = !activePowerOverride && !analysisTabProps?.suppressServerPowerMetrics
    && (serverMetrics.status === "ready" || serverMetrics.status === "stale") && acceptedLoad != null && Number.isFinite(acceptedLoad)
    && analysisLoad != null && Number.isFinite(analysisLoad) && Math.round(acceptedLoad * 10) / 10 !== Math.round(analysisLoad);

  const secondaryStatsAvailable = hasSecondaryActivityStats({ summary: displayedSummary, stats: stripStats, sport,
    showElevation, runTrainingLoad: serverMetrics.metrics?.streamTrimpTss ?? null });

  const keyStatsStrip = (section: "primary" | "secondary") => (
      <ActivityStatsGrid
        section={section}
        runTrainingLoad={serverMetrics.metrics?.streamTrimpTss ?? null}
        summary={displayedSummary}
        stats={stripStats}
        sport={sport}
        interpretationContext={runDetail.interpretationContext}
        movingTimeSec={movingTimeSec}
        pauseTimeSec={pauseTimeSec}
        elapsedTimeMillis={speedDur.elapsedMs}
        displayAvgKph={displayAvgKph}
        displayAvgImplausible={displayAvgImplausible}
        avgSpeedImplausible={avgSpeedImplausible}
        maxSpeedImplausible={maxSpeedImplausible}
        showElevation={showElevation}
        distVal={distVal}
        distUnit={distUnit}
        speedVal={speedVal}
        speedUnit={speedUnit}
        elevVal={elevVal}
        elevUnit={elevUnit}
        t={t}
      />
  );

  return (
    <div className="site-shell activity-detail">
      {/* 1. Header (제목) */}
      <Card padding="none" className="activity-detail-header">
        <div className="activity-detail-identity">
          <Avatar
            name={activityNickname}
            imageUrl={activityProfileImage}
            size={40}
            userId={activity.userId}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <Link
                to={`/athlete/${activity.userId}`}
                className="font-semibold text-[length:var(--fs-sm)] hover:underline min-w-0 break-words"
                style={{ color: 'var(--ink-1)' }}
              >
                {activityNickname}
              </Link>
              {isStrava ? (
                <svg className="w-4 h-4 text-[#FC4C02]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
              ) : (
                <img src="/favicon.svg" alt="Orider" className="w-4 h-4" />
              )}
              <span
                className="inline-flex items-center gap-1 text-[length:var(--fs-xs)] px-1.5 py-0.5 rounded-[var(--r-sm)] font-medium"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-1)' }}
                title={tCommon(getSportLabelKey(activity.type))}
              >
                {sport !== "other" && <SportIcon sport={sport === "ride" ? "bike" : sport} size={ICON_SIZE.md} />}{tCommon(getSportLabelKey(activity.type))}
                {/* Virtual* 종목은 라벨이 이미 "가상 …" 이라 실내 표기를 덧붙이지 않는다. */}
                {isIndoorActivity(activity) && !isVirtualActivityType(activity.type) && (
                  <span style={{ color: 'var(--ink-3)' }}>· {tCommon("sport.indoor")}</span>
                )}
              </span>
              {hasStreams && (
                <span className="text-[length:var(--fs-xs)] px-1.5 py-0.5 rounded-[var(--r-sm)] font-medium" style={{ background: 'color-mix(in srgb, var(--lime) 15%, transparent)', color: 'var(--lime)' }}>GPS</span>
              )}
              {(avgSpeedImplausible || displayAvgImplausible || maxSpeedImplausible) && (
                <span
                  className="text-[length:var(--fs-xs)] px-1.5 py-0.5 rounded-[var(--r-sm)] font-medium border"
                  style={{ background: 'var(--bg-3)', color: 'var(--amber)', borderColor: 'var(--amber)' }}
                  title={t("stat.dataWarningTooltip")}
                >
                  {t("stat.dataWarning")}
                </span>
              )}
            </div>
            {editingDescription ? (
              <input type="text" value={descriptionText} onChange={e => setDescriptionText(e.target.value)}
                onBlur={handleSaveDescription}
                onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); handleSaveDescription(); } if (e.key === "Escape") setEditingDescription(false); }}
                autoFocus className="ds-text ds-text--page-title bg-transparent outline-none w-full" style={{ borderBottom: "2px solid var(--lime)" }} />
            ) : user?.uid === activity.userId ? (
              <button type="button" className="group block max-w-full text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lime)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-0)]"
                onClick={() => { setDescriptionText(activity.description || ""); setEditingDescription(true); }} aria-label={t("page.editTitleAria")}>
                <Text as="h1" variant="pageTitle">{activity.description || tCommon(getSportLabelKey(activity.type))}
                  <svg className="inline-block w-4 h-4 ml-1.5 text-[var(--ink-3)] group-hover:text-[var(--lime)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </Text>
              </button>
            ) : <Text data-testid="D1-0" as="h1" variant="pageTitle">{activity.description || tCommon(getSportLabelKey(activity.type))}</Text>}
            <div className="flex flex-col items-start gap-2 mt-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <span className="text-[length:var(--fs-sm)]" style={{ color: 'var(--ink-2)', wordBreak: "keep-all", lineHeight: 1.5 }}>{formatFullDate(activity.startTime)}</span>
            </div>

          </div>
        </div>
        <IconButton
          aria-label={t("page.management.title")}
          title={t("page.management.title")}
          aria-haspopup="dialog"
          aria-expanded={openManagementScope === managementScope}
          onClick={() => setOpenManagementScope(managementScope)}
          icon={<Menu size={ICON_SIZE.lg} aria-hidden="true" />}
        />
      </Card>

      <ActivityManagementModal key={managementScope}
        open={openManagementScope === managementScope} activityId={activity.id} visibility={activity.visibility}
        canManage={isActivityOwner}
        stravaActivityUrl={isStrava ? stravaActivityUrl : null}
        shareAction={
          <div data-testid="D1-7">
            <ActivityShareButton
              menuItem
              card={{
                title: activity.description || tCommon(getSportLabelKey(activity.type)),
                athlete: activityNickname,
                sport: tCommon(getSportLabelKey(activity.type)),
                date: formatFullDate(activity.startTime),
                distance: Number.isFinite(s.distance) ? `${distVal(s.distance)} ${distUnit}` : "—",
                duration: Number.isFinite(s.ridingTimeMillis) ? formatDuration(s.ridingTimeMillis) : "—",
                elevation: Number.isFinite(s.elevationGain) ? `${elevVal(s.elevationGain)} ${elevUnit}` : "—",
                distanceLabel: t("stat.distance"),
                durationLabel: t("stat.time"),
                elevationLabel: t("stat.elev"),
                elevationProfileLabel: t("page.share.elevationProfile"),
                performanceLabel: t("page.share.performanceLabel"),
                footer: t("page.share.footer"),
                backgroundImageUrl: activity.mapImageUrl,
                includeRouteImage: activity.visibility === "everyone",
                performanceMetrics: sharePerformanceMetrics,
                elevationProfile: streams?.altitude?.length && streams.altitude.length >= 2 ? elevData : [],
                weather: activity.weather,
              }}
              filename={`orider-activity-${activity.id}.png`}
              url={window.location.href}
              activityId={activity.id}
              visibility={activity.visibility}
              routeTrack={activity.visibility === "everyone" ? activity.thumbnailTrack : null}
              onFeedback={showToast}
            />
            {activity.visibility !== "everyone" && (
              <span className="ml-2 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
                {t("page.share.routeHidden")}
              </span>
            )}
          </div>
        }
        onClose={() => setOpenManagementScope(null)}
        onExport={() => { setOpenManagementScope(null); setShowExport(true); if (!streamsSignInRequired) requestStreams(); }}
        onDelete={() => { setOpenManagementScope(null); void handleDeleteActivity(); }}
        onVisibilityChange={handleVisibilityChange}
      />

      {/* ── 탭 네비게이션 ── */}
      <div className="activity-detail-navigation" ref={activityNavigationRef}>
        <div className="activity-detail-tabs" role="tablist" aria-label={t("detail.navigation")} onKeyDown={(event) => {
          const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
          const index = tabs.indexOf(event.target as HTMLButtonElement);
          if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next]?.focus({ preventScroll: true });
          tabs[next]?.click();
        }}>
          {[
            { id: "overview", icon: Layers },
            { id: "analysis", icon: BarChart3 },
            { id: "segments", icon: Route },
            ...(isActivityOwner ? [{ id: "compare", icon: ArrowLeftRight }] : []),
          ].map(({ id, icon: Icon }) => <button key={id} id={`activity-tab-${id}`} data-testid="D1-T" type="button" role="tab"
            aria-selected={activeTab === id} aria-controls="activity-tab-panel" tabIndex={activeTab === id ? 0 : -1}
            onClick={() => { pendingPeakLocation.current = null; pendingLap.current = null; setActiveTab(id); }}>
            <Icon size={ICON_SIZE.md} aria-hidden="true" /><span>{t(`tab.${id}`)}</span>
            {id === "segments" && segmentEfforts.length > 0 && <span className="activity-detail-tab-count">{segmentEfforts.length}</span>}
          </button>)}
        </div>
      </div>
      <div className="activity-detail-hero" data-analysis={activeTab === "analysis"} data-testid="activity-detail-hero">
      {/* ── 지도 또는 인도어 배너 / 수영 풀 시각화 ── */}
      <div id="activity-route-map" className="activity-detail-map" data-testid="D1-1" ref={runLocationAnchor} tabIndex={hasTrack ? -1 : undefined} role={hasTrack ? "region" : undefined} aria-label={hasTrack ? t("segments.mapRegion") : undefined}>
      {selectedMapSegment && <div className="activity-detail-segment-map-selection">
        <p role="status">{t("segments.selectedOnMap", { name: selectedMapSegment.name })}</p>
        <Button variant="outline" size="sm" onClick={returnToSegment}>{t("segments.returnToSegment")}</Button>
      </div>}
      <ActivityMediaPanel
        activity={activity}
        streams={streams}
        sport={sport}
        hasTrack={hasTrack}
        summary={s}
        markerPosition={markerPosition}
        hoveredSegment={activeTab === "analysis" && visualRange ? null : selectedMapSegment ?? hoveredSegment}
        selectedSegmentRange={selectedMapSegment}
        selectedRunRange={activeTab === "analysis" && visualRange ? visualRouteRange ?? undefined : rangeSelection.selection ? rangeSelection.routeRange : runSplitLocation?.routeRange ?? peakLocation?.routeRange}
        photos={photos}
        uploadedPhotos={uploadedPhotos}
        flyToPosition={flyToPosition}
        t={t}
      />
      </div>

      {activeTab === "analysis" && <div className="activity-detail-chart-workspace" aria-label={t("detail.chartsTitle")}>
      {/* 상세 스트림은 분석 탭 진입 시 자동으로 불러온다. */}
      {streamsSignInRequired && !streams && <ActivityAnalysisSignInCard onSignIn={() => { void signIn(); }} />}
      {streams && !streamsSignInRequired && !streamsError && !loadingStreams && !showStreamSpinner && (!showElevation || elevData.length === 0) && (
        <Card><Text as="p" variant="bodyMedium" tone="secondary">{t("page.chartsUnavailable")}</Text></Card>
      )}

      {/* 분석 (고도 & 성능 차트) — 수영/기타는 고도 차트 숨김 */}
      {(showStreamSpinner || loadingStreams) && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("detail.chartsTitle")}</h3>
          <div className="activity-detail-loading" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t("detail.loadingData")}
            </div>
          </div>
        </Card>
      )}
      {showElevation && elevData.length > 0 && (
        <ActivityPerformanceCharts embedded analysisStyle
          chartIdentity={visualIdentity} rawStreams={effectiveStreams} sensorSelectionContext={sensorSelectionContext}
          rawElapsedAxis={rangeSelection.axis} sourceIndices={sourceIndices}
          visualRange={visualRange} onVisualRangeChange={setVisualRange} hoverIndex={hoverIndex} segments={chartSegments}
          hasElevation={!!effectiveStreams?.altitude?.some(value => value != null && Number.isFinite(value))}
          elevData={elevData} availableOverlays={availableOverlays} activeOverlays={activeOverlays ?? new Set(availableOverlays.map(item => item.key))}
          focusedOverlayKey={focusedOverlayKey} toggleOverlay={toggleOverlay} chartOverlays={chartOverlays}
          hoverPoint={hoverPoint} summaryStats={summaryStats} sport={sport} recordedRunCadenceUnit={recordedRunCadenceUnit}
          elapsedAxisSec={rangeSelection.sampledAxis ?? undefined} xAxis={visualAxis}
          axisControls={<ActivityChartAxisControls compact axis={visualAxis} elapsedAvailable={!!rangeSelection.sampledAxis} onChange={axis => {
            setVisualState({ identity: visualIdentity, axis, range: visualRange }); setHoverIndex(null);
          }} />}
          rangeControls={<ActivityRangeControls selection={rangeSelection} showAxis={false} />}
          rangeAnalysis={activity?.id ? <ActivityRangeAnalysisPanel callableEnabled={getRuntimeConfig().activityAnalysisExpansionEnabled === true} activityId={activity.id} sport={sport} selection={rangeSelection} previewActive={activePowerOverride != null} /> : null}
          range={rangeSelection.selection ? rangeSelection.chartRange : [0, sampledData.length - 1]}
          onRangeChange={rangeSelection.enabled && rangeSelection.sampledAxis ? rangeSelection.selectChart : undefined}
          onHoverIndex={handleElevHover} chartHighlightRange={chartHighlightRange}
          metrics={serverMetrics.metrics} powerSource={streamSensorSummary?.powerSource}
        />
      )}

      {/* Streams error */}
      {!streamsSignInRequired && !hasStreams && !loadingStreams && !showStreamSpinner && streamsError && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <div className="text-center text-[length:var(--fs-sm)]" style={{ color: 'var(--ink-2)' }}>
            <p>{streamsError}</p>
            <button
              onClick={() => { void retryStreams(); }}
              className="mt-2 font-medium hover:underline" style={{ color: 'var(--lime)' }}
            >
              {t("page.retry")}
            </button>
          </div>
        </Card>
      )}


      </div>}

        <div className="activity-detail-summary" hidden={activeTab === "analysis"}>
          <Card padding="none" className="activity-detail-primary-stats">{keyStatsStrip("primary")}</Card>
          {secondaryStatsAvailable && <details className="activity-detail-secondary-stats" open={wideStats || secondaryStatsOpen} onToggle={(event) => {
            if (!wideStats) setSecondaryStatsOpen(event.currentTarget.open);
          }}>
            <summary>{t("detail.additionalStats")}<ChevronDown size={ICON_SIZE.md} aria-hidden="true" /></summary>
            {keyStatsStrip("secondary")}
          </details>}
        </div>

      </div>
      <div id="activity-tab-panel" role="tabpanel" aria-labelledby={`activity-tab-${activeTab}`} tabIndex={0} className="activity-detail-panel">
      {activeTab !== "overview" && <div className="activity-detail-section-heading">
        <div><Text as="h2" variant="title">{t(`detail.${activeTab}.title`)}</Text>
          <Text as="p" variant="bodyMedium" tone="secondary">{t(`detail.${activeTab}.description`)}</Text></div>
      </div>}

      {unlinkedLapIdentity === rangeSelection.identity && rangeSelection.ownerUid && <Text as="p" variant="bodyMedium" tone="secondary" role="status">{t("analysis.lap.locationUnavailable")}</Text>}

      {/* ── 스플릿 탭 (러닝 전용) ── */}
      {activeTab === "segments" && sport === "run" && streams && (
        <RunLeftCards cadenceUnit={runCadenceUnit} streams={streams} thresholdPaceSecPerKm={isActivityOwner ? profile?.thresholdPace ?? null : null} hrZoneSec={serverMetrics.metrics?.hrZoneSec} />
      )}

      {/* ── 랩 탭 ── */}
      {activeTab === "segments" && ((analysisTabProps?.analysisSummary?.laps ?? streams?.laps)?.length ?? 0) > 0 && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          {!analysisTabProps?.analysisSummary && sport !== "run" && <h3 className="text-[length:var(--fs-md)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>
            {sport === "swim" ? t("page.swim.setAnalysis") : t("page.lapAnalysis")}
          </h3>}
          {analysisTabProps?.analysisSummary ? (
            <AnalysisLapTable laps={analysisTabProps.analysisSummary.laps} ftp={serverMetrics.metrics?.contextSnapshot?.ftp ?? null} sport={sport} onSelectLap={rangeSelection.ownerUid ? selectLap : undefined} canSelectLap={canSelectLap} />
          ) : streams?.laps ? sport === "run" ? <AnalysisLapTable laps={streams.laps} ftp={null} sport={sport} onSelectLap={rangeSelection.ownerUid ? selectLap : undefined} canSelectLap={canSelectLap} /> : <LapTable laps={streams.laps} onSelectLap={rangeSelection.ownerUid ? selectLap : undefined} canSelectLap={canSelectLap} /> : null}
        </Card>
      )}

      <Modal open={showExport} onClose={() => setShowExport(false)} title={t("tab.export")} maxWidth="max-w-3xl">
        <div>
        {streams ? <ExportTab activity={activity} streams={streams} /> : streamsSignInRequired ? <ActivityAnalysisSignInCard onSignIn={() => { void signIn(); }} /> : <StreamUnavailableCard title={t("page.exportUnavailableTitle")} message={streamUnavailableMessage} onRetry={() => { void retryStreams(); }} retryLabel={t("page.retry")} />}
        </div>
      </Modal>
      <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
      {activeTab === "compare" && isActivityOwner && <ActivityGrowthPanel activity={activity} metrics={serverMetrics.metrics} currentMetricsStatus={serverMetrics.status} isOwner={isActivityOwner} comparisonOnly />}

      {activeTab === "overview" && <div data-testid="D1-2" className="space-y-6">
      <ActivityDetailMemo activity={activity} />
      {/* 사진 (가로 스크롤) — Strava + 업로드 사진 */}
      {(photos.length > 0 || uploadedPhotos.length > 0 || user?.uid === activity.userId) && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>
            {t("page.photos")} ({photos.length + uploadedPhotos.length})
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin" style={{ '--scrollbar-thumb': 'var(--line)' } as React.CSSProperties}>
            {/* Strava photos */}
            {photos.map((photo) => photo.url && (
              <button
                type="button"
                key={`strava-${photo.id}`}
                className="relative group flex-shrink-0 w-48 h-48 sm:w-56 sm:h-56 snap-start overflow-hidden rounded-[var(--r-lg)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lime)]" style={{ background: 'var(--bg-2)' }}
                onClick={() => {
                  if (photo.location) {
                    setFlyToPosition(null);
                    setTimeout(() => setFlyToPosition(photo.location), 10);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                aria-label={photo.location ? t("page.photoMapFocus") : t("page.photoPreview")}
              >
                <img
                  src={photo.url}
                  alt={photo.caption || t("page.photoPreview")}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                {photo.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-[length:var(--fs-xs)] text-[var(--ink-0)] truncate">{photo.caption}</p>
                  </div>
                )}
              </button>
            ))}
            {/* Uploaded photos */}
            {uploadedPhotos.map((photo) => (
              <div
                key={`upload-${photo.id}`}
                className="relative group flex-shrink-0 w-48 h-48 sm:w-56 sm:h-56 snap-start overflow-hidden rounded-[var(--r-lg)]"
                style={{ background: 'var(--bg-2)' }}
              >
                <button
                  type="button"
                  className="h-full w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lime)]"
                  onClick={() => {
                    const loc = photo.location;
                    if (loc) {
                      setFlyToPosition(null);
                      setTimeout(() => setFlyToPosition(loc), 10);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  aria-label={photo.location ? t("page.photoMapFocus") : t("page.photoPreview")}
                >
                  <img
                    src={photo.url}
                    alt={t("page.photoPreview")}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </button>
                {user?.uid === photo.userId && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo); }}
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 hover:bg-red-600 text-[var(--ink-0)] rounded-full flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    title={t("page.delete")}
                    aria-label={t("page.delete")}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {/* Upload button (owner only) */}
            {user?.uid === activity.userId && uploadedPhotos.length < MAX_PHOTOS && (
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
                className="flex-shrink-0 w-48 h-48 sm:w-56 sm:h-56 snap-start rounded-[var(--r-lg)] border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}
              >
                {photoUploading ? (
                  <>
                    <svg className="w-8 h-8 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-[length:var(--fs-xs)]">{t("page.uploading")}</span>
                  </>
                ) : (
                  <>
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-[length:var(--fs-xs)]">{t("page.addPhoto")}</span>
                  </>
                )}
              </button>
            )}
          </div>

        </Card>
      )}

      {/* ── 6. 좋아요 & 댓글 ── */}
      <section data-testid="D1-6"><KudosCommentsCard
        user={user}
        profile={profile}
        liked={displayLiked}
        kudos={activityKudos}
        kudosCount={user ? activityKudos.length : activity.kudosCount}
        comments={activityComments}
        commentCount={user ? activityComments.length : activity.commentCount}
        commentText={commentText}
        setCommentText={setCommentText}
        submitting={submitting}
        editingCommentId={editingCommentId}
        setEditingCommentId={setEditingCommentId}
        editingText={editingText}
        setEditingText={setEditingText}
        onToggleKudos={handleToggleKudos}
        onSubmitComment={handleSubmitComment}
        onDeleteComment={handleDeleteComment}
        onSaveEditComment={handleSaveEditComment}
        onSignIn={() => { void signIn(); }}
        activityOwnerId={activity.userId}
        hiddenComments={hiddenComments}
        moderationBusy={moderationBusy}
        onReportComment={handleReportComment}
        onSetCommentHidden={handleSetCommentHidden}
        formatTimeAgo={timeAgo}
      /></section>

      {/* AI 활동 분석 — 실외는 경로, 실내/가상은 파워·심박·거리 스트림으로 분석 가능. */}
      {canShowAiAnalysis && (
        <AiRideAnalysisCard
          activityId={activityId ?? null}
          enabled={canShowAiAnalysis}
          sport={sport}
          isActivityOwner={isActivityOwner}
          summaryPreview={activity.aiSummaryPreview}
          summaryPreviewEn={activity.aiSummaryPreview_en}
        />
      )}

      </div>}

      <div className="activity-detail-analysis-content space-y-6" data-testid="activity-analysis-content" hidden={activeTab !== "analysis"}>
      {activeTab === "analysis" && <>
      {/* 러닝 인트로 — 기록 갱신 축하 + 쉬운 말 해석 요약 (§3.4a, §1) */}
      <RunActivityIntro detail={runDetail} activityId={activityId} gapSecPerKm={runGapSecPerKm} />

      {sport === "ride" ? <ActivityAnalysisBody
        overview={overview} isOwner={isActivityOwner} preview={activePowerOverride != null}
        ftpW={serverMetrics.metrics?.contextSnapshot?.ftp ?? null} totalCalories={stripStats.caloriesKcal.value}
        storedLoad={(isActivityOwner || overview.response?.status !== "available" || differentLoadValues) && !activePowerOverride && !analysisTabProps?.suppressServerPowerMetrics && (serverMetrics.status === "ready" || serverMetrics.status === "stale") ? serverMetrics.metrics?.tss ?? null : null}
        sharedStats={{ averagePower: stripStats.avgPower.value, averageCadence: stripStats.avgCadence.value, averageHeartRate: stripStats.avgHr.value, maxHeartRate: stripStats.maxHr.value }}
        analysisProps={hasAnalysisStreams && analysisTabProps ? { ...analysisTabProps, onSignIn: () => { void signIn(); } } : null}
        timeline={null}
        provenance={differentLoadValues ? <Text as="p" variant="caption" tone="secondary">{t("detail.loadValuesDescription")}{serverMetrics.status === "stale" ? ` · ${t("detail.previousAnalysisValue")}` : ""}</Text> : null}
        benchmark={isActivityOwner && shareDiscipline === "bike" ? <>
      {activeTab === "analysis" && activity?.id && <ActivityPersonalBenchmark activityId={activity.id}
        ownerUid={isActivityOwner ? user?.uid : null} sport={shareDiscipline ?? "other"}
        metrics={activePowerOverride || analysisTabProps?.suppressServerPowerMetrics ? null : serverMetrics.metrics}
        suppliedPdcState={bikePdcState} defaultExpanded /> }        </> : null}
        peakInspector={<>

      {visiblePeakEfforts(serverMetrics.metrics, isActivityOwner, activePowerOverride != null || analysisTabProps?.suppressServerPowerMetrics === true).length > 0 && sport === "ride" && activity?.id && <ActivityPeakEffortInspector
        activityId={activity.id} metrics={serverMetrics.metrics} isOwner={isActivityOwner}
        invalidated={activePowerOverride != null || analysisTabProps?.suppressServerPowerMetrics === true}
        suppressHeartRate={analysisTabProps?.suppressServerHeartRateMetrics} suppressCadence={analysisTabProps?.suppressServerCadenceMetrics}
        defaultExpanded onLocate={locatePeak} locating={loadingStreams && selectedPeak != null}
        locationUnavailable={!!streams && selectedPeak != null && !peakLocation} /> }        </>}
        powerControls={isActivityOwner && (canRecalculateVirtualPowerPreview || activePowerOverride) ? <div className="activity-analysis-power-controls">
          <Text as="h3" variant="bodyMedium" weight={600}>{t("page.vp.heading")}</Text>
          <div className="flex flex-wrap gap-2">
            {canRecalculateVirtualPowerPreview && <Button variant="outline" size="sm" onClick={recalculateVirtualPowerPreview}>{t("page.vp.recalcBtn")}</Button>}
            {activePowerOverride && <Button variant="ghost" size="sm" onClick={revertVirtualPowerPreview}>{t("page.vp.revertBtn")}</Button>}
          </div>
        </div> : null}
        sensorFallback={<>
      {activeTab === "analysis" && summarySensorMetrics.length > 0 && (isActivityOwner || overview.response?.status !== "available") && !hasAnalysisStreams && (
        <div className="space-y-4">
          <SummarySensorFallbackCard
            title={t("page.summarySensorTitle")}
            description={t(streamsSignInRequired ? "page.summarySensorSignInDesc" : "page.summarySensorDesc")}
            metrics={summarySensorMetrics}
          />
        </div>
      )}
        </>}
      /> : <>
      <ActivityOverviewSummary integrated overview={overview} preview={activePowerOverride != null} isOwner={isActivityOwner} ftpW={serverMetrics.metrics?.contextSnapshot?.ftp ?? null} />

      {activeTab === "analysis" && differentLoadValues && <Card data-testid="activity-load-provenance" role="note" aria-label={t("detail.loadValuesTitle")}>
        <Text as="h3" variant="bodyMedium" weight={600}>{t("detail.loadValuesTitle")}</Text>
        <Text as="p" variant="bodyMedium" mono style={{ marginTop: "var(--space-2)" }}>{t("detail.loadValues", { accepted: Math.round(acceptedLoad! * 10) / 10, analysis: Math.round(analysisLoad!) })}</Text>
        <Text as="p" variant="bodySmall" tone="secondary" style={{ marginTop: "var(--space-2)" }}>{t("detail.loadValuesDescription")}</Text>
        {serverMetrics.status === "stale" && <Text as="p" variant="bodySmall" tone="warning" style={{ marginTop: "var(--space-2)" }}>{t("detail.previousAnalysisValue")}</Text>}
      </Card>}

      {/* 러닝/수영 전용 상세 — 기존 공개·센서 조건 유지 */}
      {sport === "run" && streams && <RunLeftCards cadenceUnit={runCadenceUnit} streams={streams} thresholdPaceSecPerKm={isActivityOwner ? profile?.thresholdPace ?? null : null} hrZoneSec={serverMetrics.metrics?.hrZoneSec} />}
      {sport === "swim" && streams && <SwimLeftCards streams={streams} />}

      {(sport === "run" || sport === "swim") && (
      <div className="space-y-6">
      {sport === "run" && (
        <RunRightCards
          avgSpeedKph={stripStats.avgSpeedKph.value}
          hrLoad={serverMetrics.metrics?.streamTrimpTss ?? null}
          gapSecPerKm={runGapSecPerKm}
          summary={s}
          activity={activity}
          metricsWeather={serverMetrics.metrics?.weather}
          metricsStatus={serverMetrics.status}
        />
      )}
      {sport === "swim" && <SwimRightCards summary={s} streams={streams} />}
      </div>
      )}



      {(sport === "run" || hasAnalysisStreams && !!analysisTabProps
        || overview.enabled && (isActivityOwner || overview.response?.status === "available")
        || isActivityOwner && shareDiscipline === "bike"
        || !hasAnalysisStreams && (isActivityOwner || overview.response?.status !== "available") && summarySensorMetrics.length > 0) && <Card className="activity-detail-analysis-details">
      <Text as="h2" variant="subtitle" weight={600}>{t("detail.technicalDetails.title")}</Text>
      {activeTab === "analysis" && <section data-testid="D1-3" className="activity-detail-analysis">

      {activeTab === "analysis" && sport !== "run" && (isActivityOwner || overview.response?.status !== "available") && !hasAnalysisStreams && (
        <div className="space-y-4">
          <SummarySensorFallbackCard
            title={t("page.summarySensorTitle")}
            description={t(streamsSignInRequired ? "page.summarySensorSignInDesc" : "page.summarySensorDesc")}
            metrics={summarySensorMetrics}
          />
        </div>
      )}
      <div className="activity-analysis-peak-tools">
      {activeTab === "analysis" && activity?.id && <ActivityPersonalBenchmark activityId={activity.id}
        ownerUid={isActivityOwner ? user?.uid : null} sport={shareDiscipline ?? "other"}
        metrics={activePowerOverride || analysisTabProps?.suppressServerPowerMetrics ? null : serverMetrics.metrics}
        suppliedPdcState={bikePdcState} defaultExpanded /> }

      </div>
      {activeTab === "analysis" && sport !== "run" && hasAnalysisStreams && analysisTabProps && (
        <div>
          {/* 가상 파워 보정 컨트롤 — 소유자만 노출.
              훅이 소유권과 활성 자전거를 함께 검증해 비소유자의 프로필로 활동 스트림을
              다시 추정하지 않도록 한다. */}
          <AnalysisTab {...analysisTabProps} canonicalPresentationAvailable={overview.response?.status === "available"} onSignIn={() => { void signIn(); }} integratedPresentation={overview.enabled && !overview.loading && overview.response?.status === "available" ? overview.response.presentation : undefined} />
        </div>
      )}
      {activeTab === "analysis" && sport === "run" && <AnalysisTab
        key={activityId}
        {...analysisTabProps}
        activityId={activityId}
        isOwner={isActivityOwner}
        sport="run"
        streamsSignInRequired={streamsSignInRequired}
        showStreamSignInPrompt={false}
        onSignIn={() => { void signIn(); }}
        streams={streams ?? { userId: activity.userId, time: [], distance: [] }}
        summary={displayedSummary}
        canonicalPresentationAvailable={overview.response?.status === "available"}
        onSelectRunEffort={getRuntimeConfig().appEnvironment === "stage" && getRuntimeConfig().activityAnalysisExpansionEnabled === true && rangeSelection.enabled && !rangeSelection.sourceLocked ? rangeSelection.select : undefined}
        onSelectLap={rangeSelection.ownerUid ? selectLap : undefined}
        canSelectLap={canSelectLap}
        onSelectRunSplit={selectRunSplit}
        onViewRunSplitLocation={viewRunSplitLocation}
        canViewRunSplitLocation={!!runSplitLocation?.routeRange && !!runSplitLocation.chartRange}
      />}
      {activeTab === "analysis" && sport === "run" && isActivityOwner && activity?.id && !(showElevation && elevData.length > 0) && <div className="space-y-4">
        <ActivityRangeControls selection={rangeSelection} />
        <ActivityRangeAnalysisPanel callableEnabled={getRuntimeConfig().activityAnalysisExpansionEnabled === true} activityId={activity.id} sport={sport} selection={rangeSelection} previewActive={activePowerOverride != null} />
      </div>}
      {activeTab === "analysis" && <ActivityOverviewEvidence overview={overview} preview={activePowerOverride != null} isOwner={isActivityOwner} supplemental />}

      </section>}
      </Card>}
      </>}

      <EquipmentSignalCard
        key={activity.id}
        activityId={activity.id}
        ownerId={activity.userId}
        viewerId={user?.uid ?? null}
      />

      <ActivityFtpDecisionCard
        uid={user?.uid ?? null}
        activityId={activity.id}
        enabled={isActivityOwner && shareDiscipline === "bike"}
      />

      </>}
      {isActivityOwner && activityId && <section aria-labelledby="activity-summary-sharing" className="space-y-4">
        <Text as="h2" variant="subtitle" weight={600} style={{ paddingInline: "var(--dim-card-padding)" }} id="activity-summary-sharing">{t("detail.summarySharing")}</Text>
        <StravaSummaryPublishing
          key={`${activityId}:${stravaSummaryLang}:${user?.uid ?? "anonymous"}`}
          activityId={activityId}
          lang={stravaSummaryLang}
        />

      </section>}
      </div>

      {activeTab === "segments" && <>
      {/* Co-riders (함께 탄 라이더) */}
      {coRiders.length > 0 && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--ink-1)' }}>
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none">
              <circle cx="9" cy="7" r="3.5" fill="#F97316" opacity="0.15" stroke="#F97316" strokeWidth="1.2" />
              <path d="M2 19.5v-1a5 5 0 0110 0v1" stroke="#F97316" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="16" cy="8" r="2.5" fill="#F97316" opacity="0.1" stroke="#F97316" strokeWidth="1.2" />
              <path d="M14 19.5v-.5a4 4 0 018 0v.5" stroke="#F97316" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {t("page.coRiders", { count: coRiders.length })}
          </h3>
          <div className="space-y-2">
            {coRiders.map((r) => (
              <Link
                key={r.id}
                to={`/activity/${r.id}`}
                className="flex items-center gap-3 p-2 rounded-[var(--r-lg)] transition-colors hover:bg-[var(--bg-2)]"
              >
                <Avatar
                  name={r.nickname}
                  imageUrl={r.profileImage}
                  size="sm"
                  userId={r.userId}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[length:var(--fs-sm)] font-medium truncate" style={{ color: 'var(--ink-0)' }}>{r.nickname}</div>
                  <div className="text-[length:var(--fs-xs)] flex items-center gap-2" style={{ color: 'var(--ink-2)' }}>
                    <span>{formatDistance(r.summary.distance, units)}</span>
                    <span>{formatSpeed(r.summary.averageSpeed / 3.6, units, 'bike')}</span>
                    {r.summary.averageHeartRate != null && <span>{r.summary.averageHeartRate} bpm</span>}
                    {(r.summary.averagePower ?? r.avgPower) != null && <span>{Math.round((r.summary.averagePower ?? r.avgPower)!)} W</span>}
                  </div>
                </div>
                <div className="text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>
                  {formatDuration(r.summary.ridingTimeMillis)}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      </>}

      {/* 공개 경로 등록·전송과 본인 스트림 기반 구간 편집의 권한을 구분한다.
          다른 탭에서는 그룹만 숨겨 진행 중인 생성·전송을 중단하지 않는다. */}
      {(canCreateFromOwnRoute || canRegisterPublicRoute || canRideActivityRoute) && (
        <div className="activity-detail-segment-actions flex gap-2" hidden={activeTab !== "segments"}>
          {canCreateFromOwnRoute && <>
          <Link
            to={`/segment/create?activityId=${activityId}`}
            className={buttonClass({ className: "flex-1 gap-2" })}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
              <path d="M2 20L8.5 8l4 6 3.5-5L22 20H2z" fill="currentColor" opacity="0.15" />
              <path d="M2 20L8.5 8l4 6 3.5-5L22 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 4v4m-2-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {t("page.createSegment")}
          </Link>
          <Link
            to={`/course/create?activityId=${activityId}`}
            className={buttonClass({ variant: "outline", className: "flex-1 gap-2" })}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            {t("page.registerRoute")}
          </Link>
          </>}
          {canRegisterPublicRoute && <RideActivityRouteButton activityId={activityId} activity={activity} hasRoute={hasTrack} sport={sport} action="register" />}
          <RideActivityRouteButton activityId={activityId} activity={activity} hasRoute={hasTrack} sport={sport} />
        </div>
      )}

      {/* ── 세그먼트 탭 — 주요성과 + 세그먼트/코스 등록 ── */}
      {activeTab === "segments" && !streams && (
        loadingStreams || showStreamSpinner ? <Card className="activity-detail-loading" role="status" aria-live="polite"><span className="activity-detail-spinner" aria-hidden="true" />{t("detail.loadingData")}</Card> : streamsSignInRequired ? <ActivityAnalysisSignInCard onSignIn={() => { void signIn(); }} /> : <StreamUnavailableCard title={t("page.segmentsUnavailableTitle")} message={streamUnavailableMessage} onRetry={() => { void retryStreams(); }} retryLabel={t("page.retry")} />
      )}
      {activeTab === "segments" && streams && (
      <div data-testid="D1-4" className="space-y-6">

      {/* 주요 성과 */}
      {topResults.length > 0 && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy size={ICON_SIZE.lg} aria-hidden="true" style={{ color: "var(--amber)" }} />
              <h3 className="text-[length:var(--fs-sm)] font-bold" style={{ color: 'var(--ink-0)' }}>{t("page.topResults")}</h3>
              <span className="text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>{topResults.length}</span>
            </div>
            {topResults.length > 3 && (
              <button
                onClick={() => setShowAllResults(!showAllResults)}
                className="text-[length:var(--fs-xs)] font-medium hover:underline" style={{ color: 'var(--lime)' }}
              >
                {showAllResults ? t("page.collapse") : t("page.viewAll", { count: topResults.length })}
              </button>
            )}
          </div>
          <div className="space-y-1">
            {(showAllResults ? topResults : topResults.slice(0, 3)).map((effort) => {
              const isPR = effort.prRank != null && effort.prRank >= 1 && effort.prRank <= 3;
              const isKOM = effort.komRank != null && effort.komRank >= 1 && effort.komRank <= 10;
              const rank = isPR ? effort.prRank! : (effort.komRank ?? 0);

              let iconBg: string;
              let iconContent: React.ReactNode;
              let badgeText: string;
              let badgeBg: string;

              if (isKOM) {
                iconBg = "activity-detail-achievement-icon";
                iconContent = (
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
                    <path d="M4 17h16l-2-10-4.5 4L12 5l-1.5 6L6 7l-2 10z" fill="currentColor" />
                    <path d="M4 17h16l-2-10-4.5 4L12 5l-1.5 6L6 7l-2 10z" fill="currentColor" opacity="0.15" />
                    <circle cx="6" cy="7" r="1.5" fill="currentColor" opacity="0.7" />
                    <circle cx="12" cy="4.5" r="1.5" fill="currentColor" opacity="0.7" />
                    <circle cx="18" cy="7" r="1.5" fill="currentColor" opacity="0.7" />
                    <rect x="4" y="18" width="16" height="2.5" rx="0.75" fill="currentColor" opacity="0.85" />
                  </svg>
                );
                badgeText = `KOM #${effort.komRank}`;
                badgeBg = "activity-detail-achievement-badge";
              } else if (rank === 1) {
                iconBg = "activity-detail-achievement-icon";
                iconContent = (
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
                    <path d="M8 4h8v6.5a4 4 0 01-8 0V4z" fill="currentColor" opacity="0.25" />
                    <path d="M8 4h8v6.5a4 4 0 01-8 0V4z" fill="currentColor" opacity="0.7" />
                    <path d="M8 6H6.5a1.5 1.5 0 00-1.5 1.5v0A2.5 2.5 0 007.5 10H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
                    <path d="M16 6h1.5A1.5 1.5 0 0119 7.5v0a2.5 2.5 0 01-2.5 2.5H16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
                    <rect x="10.5" y="13" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.7" />
                    <rect x="9" y="17" width="6" height="2" rx="1" fill="currentColor" opacity="0.85" />
                    <path d="M10.5 6.5v3" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" opacity="0.5" />
                  </svg>
                );
                badgeText = "PR";
                badgeBg = "activity-detail-achievement-badge";
              } else if (rank === 2) {
                iconBg = "activity-detail-achievement-icon";
                iconContent = (
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
                    <path d="M10 3l-1 5h6l-1-5h-4z" fill="currentColor" opacity="0.5" />
                    <circle cx="12" cy="14" r="6" fill="currentColor" opacity="0.25" />
                    <circle cx="12" cy="14" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
                    <circle cx="12" cy="14" r="3.5" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                    <text x="12" y="16" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold" opacity="0.85">2</text>
                  </svg>
                );
                badgeText = "2nd";
                badgeBg = "activity-detail-achievement-badge";
              } else {
                iconBg = "activity-detail-achievement-icon";
                iconContent = (
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
                    <path d="M10 3l-1 5h6l-1-5h-4z" fill="currentColor" opacity="0.5" />
                    <circle cx="12" cy="14" r="6" fill="currentColor" opacity="0.25" />
                    <circle cx="12" cy="14" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
                    <circle cx="12" cy="14" r="3.5" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                    <text x="12" y="16" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold" opacity="0.85">3</text>
                  </svg>
                );
                badgeText = "3rd";
                badgeBg = "activity-detail-achievement-badge";
              }

              return (
                <div
                  key={effort.id}
                  className="activity-detail-achievement-row"
                  onMouseEnter={() => setHoveredSegment(canViewSegmentOnMap(effort) ? effort : null)}
                  onMouseLeave={() => setHoveredSegment(null)}
                  onFocus={() => setHoveredSegment(canViewSegmentOnMap(effort) ? effort : null)}
                  onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHoveredSegment(null); }}
                >
                <Link
                  to={segmentHistoryPath(effort.segment.id, effort.id, activityId)}
                  className="flex items-center gap-3 p-2 rounded-[var(--r-xl)] transition-colors hover:bg-[var(--bg-2)]"
                >
                  <div className={`w-8 h-8 rounded-[var(--r-lg)] ${iconBg} flex items-center justify-center flex-shrink-0`}>
                    {iconContent}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[length:var(--fs-sm)] font-medium transition-colors truncate block" style={{ color: 'var(--ink-0)' }}>
                      {effort.name}
                    </span>
                    <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      {formatDistance(effort.segment.distance, units)}
                      {effort.segment.averageGrade > 0 && ` · ${effort.segment.averageGrade.toFixed(1)}%`}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-[length:var(--fs-xs)] font-bold px-2 py-0.5 rounded-full ${badgeBg}`}>
                      {badgeText}
                    </span>
                    <div className="font-mono font-bold text-[length:var(--fs-xs)] tabular-nums mt-0.5" style={{ color: 'var(--ink-0)' }}>{formatTime(effort.elapsedTime)}</div>
                  </div>
                </Link>
                {canViewSegmentOnMap(effort) && <Button
                  variant="ghost" size="sm" className="activity-detail-segment-map-action"
                  aria-label={t("segments.viewOnMapNamed", { name: effort.name })}
                      aria-controls="activity-route-map"
                  aria-pressed={selectedMapSegment?.id === effort.id}
                  onClick={(event) => viewSegmentOnMap(effort, event.currentTarget)}
                >{t("segments.viewOnMap")}</Button>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 세그먼트 목록 (전체) */}
      {segmentEfforts.length > 0 && (
        <SegmentEffortsCard
          activityId={activityId}
          efforts={segmentEfforts}
          showAll={showAllSegments}
          setShowAll={setShowAllSegments}
          onHover={(effort) => setHoveredSegment(effort && canViewSegmentOnMap(effort) ? effort : null)}
          onViewOnMap={viewSegmentOnMap}
          canViewOnMap={canViewSegmentOnMap}
          selectedEffortId={selectedMapSegment?.id}
          formatTime={formatTime}
        />
      )}

      {segmentEfforts.length === 0 && topResults.length === 0 && (
        <StreamUnavailableCard title={t("page.noSegmentsTitle")} message={t("page.noSegmentsDesc")} />
      )}

      {/* 세그먼트 효과는 개요의 AI 라이딩 분석 카드(AiRideAnalysisCard)에 구간별로도 녹여 표시.
          매핑: analysis/ride-segments.ts */}

      </div>
      )}{/* end 세그먼트 탭 */}
      </div>
    </div>
  );
}
