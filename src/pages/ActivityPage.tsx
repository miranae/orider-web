import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import ElevationChart from "../components/ElevationChart";
import Avatar from "../components/Avatar";
import TabNav from "../components/TabNav";
import AnalysisTab from "../components/AnalysisTab";
import LapTable from "../components/LapTable";
import ExportTab from "../components/ExportTab";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useLocale } from "../contexts/LocaleContext";
import { formatDistance, formatSpeed } from "../utils/units";
import { resolveDuration, resolveAvgSpeedKph } from "../utils/activityTime";
import { useStrava } from "../hooks/useStrava";
import {
  doc, getDoc, setDoc, deleteDoc, addDoc, updateDoc,
  collection, query, where, getDocs, orderBy, onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firestore, storage } from "../services/firebase";
import { track, trackActivationStep } from "../services/analytics";
import type { Activity, Visibility } from "@shared/types";
import type { ActivityStreams } from "@shared/types";
import { getSportIcon, getSportLabelKey } from "../utils/sportType";
import { getDiscipline } from "../utils/disciplineFilter";
import { isImplausibleAvgSpeed, isImplausibleMaxSpeed } from "../utils/activitySanity";
import { useActivityMetrics } from "../hooks/useActivityMetrics";
import { RunLeftCards, RunRightCards } from "../components/activity/RunDetailCards";
import { SwimLeftCards, SwimRightCards } from "../components/activity/SwimDetailCards";
import KudosCommentsCard from "../components/activity/KudosCommentsCard";
import AiRideAnalysisCard from "../components/activity/AiRideAnalysisCard";
import SegmentEffortsCard from "../components/activity/SegmentEffortsCard";
import { useActiveBikeProfile } from "../hooks/useActiveBikeProfile";
import { calcVirtualPowerStream } from "../utils/virtualPower";
import { logClientError } from "../services/errorLogger";
import { Button, Card, Text } from "../theme/components";
import {
  formatDuration,
  formatTime,
  getSportCategory,
  type SegmentEffortData,
} from "../features/activity/detail/activityDetailUtils";
import { ActivityStatsGrid } from "../features/activity/detail/ActivityStatsGrid";
import { ActivityMediaPanel } from "../features/activity/detail/ActivityMediaPanel";
import {
  buildChartOverlays,
  buildSampledData,
  buildSummaryStats,
  getAvailableOverlays,
  getChartHighlightRange,
  getSegmentEfforts,
  getStreamPhotos,
} from "../features/activity/detail/activityDetailDerived";
import { extractGpsFromFile } from "../features/activity/detail/photoGps";
import { resizeImageToWebp } from "../features/activity/detail/imageResize";
import { useActivityUnitFormatters, useFormatFullDate, useTimeAgo, type UploadedPhoto } from "../features/activity/detail/activityDisplay";
import { useActivityStreamsLoader } from "../features/activity/detail/useActivityStreamsLoader";

function isPermissionDeniedError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "permission-denied";
}

export default function ActivityPage() {
  const { t } = useTranslation("activity");
  const { t: tCommon } = useTranslation("common");
  const timeAgo = useTimeAgo();
  const formatFullDate = useFormatFullDate();
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { units } = useLocale();
  const { distVal, distUnit, speedVal, speedUnit, elevVal, elevUnit } = useActivityUnitFormatters(units);
  const { showToast } = useToast();
  const { getStreams } = useStrava();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [coRiders, setCoRiders] = useState<Activity[]>([]);
  const [liked, setLiked] = useState(false);
  const [kudosList, setKudosList] = useState<{ userId: string; nickname: string; profileImage?: string | null }[]>([]);
  const [commentsList, setCommentsList] = useState<{ id: string; userId: string; nickname: string; profileImage: string | null; text: string; createdAt: number }[]>([]);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [showAllResults, setShowAllResults] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState<SegmentEffortData | null>(null);
  const [showAllSegments, setShowAllSegments] = useState(false);
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set());
  const {
    streams,
    setStreams,
    showStreamSpinner,
    setShowStreamSpinner,
    streamsError,
    setStreamsError,
    loadingStreams,
    setLoadingStreams,
  } = useActivityStreamsLoader({ activityId, activity, userId: user?.uid, getStreams, t });
  // server-side activity metrics 구독 — movingTimeSec 등 ridingTimeMillis 보완 필드 제공.
  // activity_metrics 는 rules 상 활동 owner 만 read 가능 → 타인의 공개 활동을 볼 땐
  // 구독을 막아 permission-denied 알림 노이즈(client:useActivityMetrics)를 없앤다.
  const isActivityOwner = !!activity && !!user && activity.userId === user.uid;
  const serverMetrics = useActivityMetrics(activityId ?? null, isActivityOwner);
  // 가상 파워 즉석 재계산 미리보기 (Firestore 저장 안 함). 자전거 활동에서만 구독.
  const isRide = activity ? getSportCategory(activity.type) === "ride" : false;
  const { active: activeBike } = useActiveBikeProfile(isRide ? (user?.uid ?? null) : null);
  const [wattsOverride, setWattsOverride] = useState<number[] | null>(null);
  const effectiveStreams = useMemo(() => {
    if (!streams) return streams;
    if (!wattsOverride) return streams;
    return { ...streams, watts: wattsOverride };
  }, [streams, wattsOverride]);
  function recalcPreview() {
    if (!activeBike || !streams) return;
    if (!streams.time || !streams.velocity_smooth) return;
    const w = calcVirtualPowerStream(
      {
        time: streams.time,
        velocity_smooth: streams.velocity_smooth,
        altitude: streams.altitude ?? new Array(streams.time.length).fill(0),
      },
      activeBike.virtualPower,
    );
    setWattsOverride(w);
  }
  // Inline description editing
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionText, setDescriptionText] = useState("");
  // Photo upload/delete
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [flyToPosition, setFlyToPosition] = useState<[number, number] | null>(null);
  // 탭 네비게이션
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!activityId) return;

    // activityId 변경(동일 라우트 내 co-rider 네비게이션 등) 시 이전 활동 상태 리셋.
    // 안 하면 streams effect 가드(`!activity || streams`)가 옛 streams 를 truthy 로 보고
    // 새 활동의 스트림 로드를 영영 막아 이전 활동의 GPS/파워 차트가 고착된다(#534).
    setActivity(null);
    setLoadingActivity(true);

    getDoc(doc(firestore, "activities", activityId)).then((snap) => {
      if (snap.exists()) {
        setActivity({ id: snap.id, ...snap.data() } as Activity);
      }
      setLoadingActivity(false);
    }).catch(() => setLoadingActivity(false));
  }, [activityId]);

  // 첫 활동 상세 진입 마일스톤 — 로그인 사용자가 activity 로드 완료 후 1회.
  // deps 를 primitive identity 로 좁혀 setActivity 가 같은 doc 으로 재할당되어도 useEffect 가 안 돎.
  useEffect(() => {
    if (!user || !activity) return;
    trackActivationStep(user.uid, "first_activity_open", { activity_id: activity.id });
  }, [user?.uid, activity?.id]);

  // Fetch co-riders: activities with the same groupRideId
  useEffect(() => {
    if (!activity?.groupRideId) return;

    const q = query(
      collection(firestore, "activities"),
      where("groupRideId", "==", activity.groupRideId),
      where("deletedAt", "==", null),
    );
    getDocs(q).then((snap) => {
      setCoRiders(
        snap.docs
          .filter((d) => d.id !== activity.id)
          .map((d) => ({ id: d.id, ...d.data() }) as Activity)
          .filter((a) => a.summary != null),
      );
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
    if (!activityId || !user) return;
    const kudosRef = collection(firestore, "activities", activityId, "kudos");
    return onSnapshot(kudosRef, (snap) => {
      const list = snap.docs.map((d) => ({ userId: d.id, ...d.data() } as { userId: string; nickname: string; profileImage?: string | null }));
      setKudosList(list);
      setLiked(list.some((k) => k.userId === user.uid));
    }, (err) => {
      logClientError("ActivityPage.kudos", err, { path: `activities/${activityId}/kudos` });
    });
  }, [activityId, user]);

  // Real-time comments subscription (exclude soft-deleted)
  useEffect(() => {
    if (!activityId || !user) return;
    const commentsRef = query(
      collection(firestore, "activities", activityId, "comments"),
      where("deletedAt", "==", null),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(commentsRef, (snap) => {
      setCommentsList(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as typeof commentsList[0])),
      );
    }, (err) => {
      logClientError("ActivityPage.comments", err, { path: `activities/${activityId}/comments` });
    });
     
  }, [activityId, user]);

  const handleToggleKudos = async () => {
    if (!user || !activityId || !profile) return;
    const kudosDocRef = doc(firestore, "activities", activityId, "kudos", user.uid);
    if (liked) {
      setLiked(false);
      await deleteDoc(kudosDocRef);
    } else {
      setLiked(true);
      await setDoc(kudosDocRef, {
        nickname: profile.nickname ?? user.displayName ?? "User",
        profileImage: user.photoURL ?? null,
        createdAt: Date.now(),
      });
      showToast(t("card.kudosToast"));
    }
  };

  const submittingRef = useRef(false);
  const handleSubmitComment = async () => {
    if (!user || !activityId || !profile || !commentText.trim() || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await addDoc(collection(firestore, "activities", activityId, "comments"), {
        userId: user.uid,
        nickname: profile.nickname ?? user.displayName ?? "User",
        profileImage: user.photoURL ?? null,
        text: commentText.trim(),
        createdAt: Date.now(),
        deletedAt: null,
      });
      track("activity_comment_send", {
        activity_id: activityId,
        text_len: commentText.trim().length,
        activity_sport: activity ? getDiscipline(activity.type) : "unknown",
        distance_km: activity ? Math.round(activity.summary.distance / 100) / 10 : 0,
        is_own_activity: activity?.userId === user.uid ? "true" : "false",
        activity_source: (activity as Activity & { source?: string } | null)?.source ?? "unknown",
      });
      setCommentText("");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!activityId) return;
    await updateDoc(doc(firestore, "activities", activityId, "comments", commentId), { deletedAt: Date.now() });
  };

  const handleSaveEditComment = async () => {
    if (!activityId || !editingCommentId || !editingText.trim()) return;
    await updateDoc(doc(firestore, "activities", activityId, "comments", editingCommentId), {
      text: editingText.trim(),
    });
    setEditingCommentId(null);
    setEditingText("");
  };

  const handleDeleteActivity = async () => {
    if (!activityId || !user || user.uid !== activity?.userId) return;
    if (!window.confirm(t("page.deleteConfirm"))) return;
    await updateDoc(doc(firestore, "activities", activityId), { deletedAt: Date.now() });
    navigate("/", { replace: true });
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
    if (!window.confirm(t("page.photoToast.deleteConfirm"))) return;
    await updateDoc(doc(firestore, "activity_photos", activityId, "photos", photo.id), { deletedAt: Date.now() });
    showToast(t("page.photoToast.deleted"));
  };

  const handleElevHover = useCallback((index: number | null) => {
    setHoverIndex(index);
  }, []);

  const toggleOverlay = useCallback((key: string) => {
    setActiveOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const sampledData = useMemo(() => buildSampledData(streams), [streams]);

  const availableOverlays = useMemo(() => getAvailableOverlays(sampledData), [sampledData]);

  const summaryStats = useMemo(() => {
    return buildSummaryStats(sampledData, activity?.summary.averagePower ?? activity?.avgPower);
  }, [sampledData, activity?.summary.averagePower, activity?.avgPower]);

  const markerPosition = useMemo(() => {
    if (hoverIndex == null || !sampledData[hoverIndex]) return null;
    return sampledData[hoverIndex].latlng;
  }, [hoverIndex, sampledData]);

  const segmentEfforts: SegmentEffortData[] = useMemo(() => getSegmentEfforts(streams), [streams]);

  const chartHighlightRange: [number, number] | undefined = useMemo(() => {
    return getChartHighlightRange(hoveredSegment, streams);
  }, [hoveredSegment, streams]);

  const photos = useMemo(() => getStreamPhotos(streams), [streams]);

  if (loadingActivity) {
    return (
      <div className="space-y-6 max-w-[1440px] mx-auto">
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

  if (!activity) {
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
      <div className="text-center py-16" style={{ color: 'var(--ink-2)' }}>
        <div className="text-[48px] mb-4">🗑️</div>
        <p className="text-[length:var(--fs-lg)]">{t("card.deletedActivity")}</p>
        <Link to="/" className="text-[length:var(--fs-sm)] mt-2 inline-block hover:underline" style={{ color: 'var(--lime)' }}>{t("card.backHome")}</Link>
      </div>
    );
  }

  const s = activity.summary;
  // 가상파워 결과는 백엔드에서 summary.*에 함께 기록되지만, 아직 백필되지 않은
  // 과거 활동을 위해 활동 문서 top-level(`avgPower`, `weightedAvgPower`)을 fallback으로 사용.
  const avgPowerValue = s.averagePower ?? activity.avgPower ?? null;
  const normalizedPowerValue = s.normalizedPower ?? activity.weightedAvgPower ?? null;
  const isStrava = (activity as Activity & { source?: string }).source === "strava";
  const activityProfileImage = activity.profileImage || (user?.uid === activity.userId ? user?.photoURL ?? null : null);
  const hasStreams = sampledData.length > 0;
  const hasTrack = !!(activity.thumbnailTrack || streams?.latlng?.length);
  const sport = getSportCategory(activity.type || (isStrava ? undefined : "Ride"));
  const showElevation = sport === "ride" || sport === "run";

  // activitySanity 가드 — 비현실 속도 노출 차단용. sport "ride" → discipline "bike".
  const discipline = sport === "ride" ? "bike" : sport === "run" ? "run" : "swim";
  const avgSpeedImplausible = isImplausibleAvgSpeed(s.averageSpeed, discipline);
  const maxSpeedImplausible = isImplausibleMaxSpeed(s.maxSpeed, discipline);
  // #236 후속: 라이딩 평균 속도도 이동시간 기준으로 (시간 표시와 일관). serverMetrics(live doc)을
  //  소스로 — 시간 stat 과 동일. run/swim 은 페이스 로직이 별도라 건드리지 않음.
  const speedDur = resolveDuration({
    ridingTimeMillis: s.ridingTimeMillis,
    movingTimeSec: serverMetrics.metrics?.movingTimeSec,
    pauseTimeSec: serverMetrics.metrics?.pauseTimeSec,
  });
  const displayAvgKph = resolveAvgSpeedKph(s.distance, speedDur, s.averageSpeed);
  const displayAvgImplausible = isImplausibleAvgSpeed(displayAvgKph, discipline);

  // Elevation data from streams
  const elevData = hasStreams
    ? sampledData.map((d) => ({ distance: d.distance, elevation: d.altitude }))
    : [];

  // Build chart overlays from active toggles
  const chartOverlays = buildChartOverlays(availableOverlays, activeOverlays, sampledData, (label) => t(`overlay.${label}`));

  const hoverPoint = hoverIndex != null ? sampledData[hoverIndex] ?? null : null;

  const activityComments = commentsList;
  const activityKudos = kudosList;

  // Top results: efforts with PR or KOM achievements
  const topResults = segmentEfforts.filter(
    (e) => (e.prRank != null && e.prRank >= 1 && e.prRank <= 3) || (e.komRank != null && e.komRank >= 1 && e.komRank <= 10),
  );

  return (
    <div className="max-w-[1440px] mx-auto space-y-6">
      {/* 1. Header (제목) */}
      <Card padding="none" style={{ padding: 'var(--space-5)' }}>
        <div className="flex items-start gap-4">
          <Avatar
            name={activity.nickname}
            imageUrl={activityProfileImage}
            size="lg"
            userId={activity.userId}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <Link
                to={`/athlete/${activity.userId}`}
                className="font-semibold text-[length:var(--fs-sm)] hover:underline whitespace-nowrap"
                style={{ color: 'var(--ink-1)' }}
              >
                {activity.nickname}
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
                {getSportIcon(activity.type)}{tCommon(getSportLabelKey(activity.type))}
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
              <input
                type="text"
                value={descriptionText}
                onChange={(e) => setDescriptionText(e.target.value)}
                onBlur={handleSaveDescription}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); handleSaveDescription(); } if (e.key === "Escape") { setEditingDescription(false); } }}
                autoFocus
                className="text-[length:var(--fs-2xl)] font-bold bg-transparent outline-none w-full" style={{ color: 'var(--ink-0)', borderBottom: '2px solid var(--lime)' }}
              />
            ) : (
              <h1
                className={`text-[length:var(--fs-2xl)] font-bold ${user?.uid === activity.userId ? "cursor-pointer transition-colors" : ""}`}
                style={{ color: 'var(--ink-0)' }}
                onClick={() => { if (user?.uid === activity.userId) { setDescriptionText(activity.description || ""); setEditingDescription(true); } }}
              >
                {activity.description || tCommon(getSportLabelKey(activity.type))}
                {user?.uid === activity.userId && (
                  <svg className="inline-block w-4 h-4 ml-1.5 text-[var(--ink-3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                )}
              </h1>
            )}
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[length:var(--fs-sm)]" style={{ color: 'var(--ink-2)' }}>{formatFullDate(activity.startTime)}</span>
              {isStrava && (activity as Activity & { stravaActivityId?: number }).stravaActivityId && (
                <a
                  href={`https://www.strava.com/activities/${(activity as Activity & { stravaActivityId?: number }).stravaActivityId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[length:var(--fs-sm)] font-bold text-[#FC4C02] hover:underline"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                  </svg>
                  View on Strava
                </a>
              )}
            </div>
            {user?.uid === activity.userId && (
              <div className="flex items-center flex-wrap gap-1.5 mt-2">
                {([
                  { value: "everyone", label: t("page.visibility.everyone"), icon: "🌐" },
                  { value: "friends", label: t("page.visibility.friends"), icon: "👥" },
                  { value: "private", label: t("page.visibility.private"), icon: "🔒" },
                ] as { value: Visibility; label: string; icon: string }[]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      updateDoc(doc(firestore, "activities", activity.id), { visibility: opt.value });
                      setActivity({ ...activity, visibility: opt.value });
                    }}
                    className="px-2 py-1 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border transition-colors"
                    style={activity.visibility === opt.value ? {
                      background: 'color-mix(in srgb, var(--lime) 12%, transparent)',
                      borderColor: 'var(--lime)',
                      color: 'var(--lime)',
                    } : {
                      borderColor: 'var(--line-soft)',
                      color: 'var(--ink-2)',
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
                <button
                  onClick={handleDeleteActivity}
                  className="ml-auto px-2 py-1 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                >
                  {t("page.delete")}
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── 지도 또는 인도어 배너 / 수영 풀 시각화 ── */}
      <ActivityMediaPanel
        activity={activity}
        streams={streams}
        sport={sport}
        hasTrack={hasTrack}
        summary={s}
        markerPosition={markerPosition}
        hoveredSegment={hoveredSegment}
        photos={photos}
        uploadedPhotos={uploadedPhotos}
        flyToPosition={flyToPosition}
        t={t}
      />

      {/* ── 탭 네비게이션 ── */}
      {streams && (
        <TabNav
          tabs={[
            { id: "overview", label: t("tab.overview") },
            { id: "analysis", label: t("tab.analysis") },
            ...(segmentEfforts.length > 0 || topResults.length > 0 ? [{ id: "segments", label: t("tab.segments"), count: segmentEfforts.length || undefined }] : []),
            ...(sport === "run" && streams.laps?.length ? [{ id: "splits", label: t("tab.splits"), count: streams.laps.length }] : []),
            ...(streams.laps?.length ? [{ id: "laps", label: sport === "swim" ? t("tab.sets") : t("tab.laps"), count: streams.laps.length }] : []),
            { id: "export", label: t("tab.export") },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      )}

      {/* ── 분석 탭 ── */}
      {activeTab === "analysis" && streams && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          {/* 가상 파워 보정 컨트롤 — 소유자만 노출.
              activeBike 는 뷰어(user.uid)의 자전거 프로필이라, 비소유자에게 보이면
              "라이더/자전거/CdA" 가 뷰어 본인 값으로 잘못 표시되고, "재계산 미리보기" 도
              뷰어의 파라미터로 소유자 스트림을 다시 추정하게 됨 (활동에 stamp 된
              activity.virtualPowerParams 는 소유자 값으로 VirtualPowerBadge 가 별도 표시). */}
          {sport === "ride" && user?.uid === activity.userId && activeBike?.virtualPower.enabled && (
            <div
              className="flex flex-col gap-2 mb-4 pb-4"
              style={{ borderBottom: "1px solid var(--line-soft)" }}
            >
              <div className="flex items-center flex-wrap gap-2">
                <Text variant="eyebrow" tone="tertiary">{t("page.vp.heading")}</Text>
                <Button size="sm" variant="outline" onClick={recalcPreview}>
                  {t("page.vp.recalcBtn")}
                </Button>
                {wattsOverride && (
                  <Button size="sm" variant="ghost" onClick={() => setWattsOverride(null)}>
                    {t("page.vp.revertBtn")}
                  </Button>
                )}
              </div>
              {wattsOverride && (
                <Text variant="caption" tone="tertiary" as="p" mono>
                  {t("page.vp.params", { riderKg: activeBike.virtualPower.riderWeightKg, bikeKg: activeBike.virtualPower.bikeWeightKg, cda: activeBike.virtualPower.cdA })}
                </Text>
              )}
            </div>
          )}
          <AnalysisTab activityId={activityId ?? null} isOwner={isActivityOwner} streams={effectiveStreams ?? streams} summary={activity.summary} sport={sport} isVirtualPower={activity.isVirtualPower} virtualPowerParams={activity.virtualPowerParams} />
        </Card>
      )}

      {/* ── 스플릿 탭 (러닝 전용) ── */}
      {activeTab === "splits" && sport === "run" && streams && (
        <RunLeftCards streams={streams} />
      )}

      {/* ── 랩 탭 ── */}
      {activeTab === "laps" && streams?.laps && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>
            {sport === "swim" ? t("page.swim.setAnalysis") : t("page.lapAnalysis")}
          </h3>
          <LapTable laps={streams.laps} />
        </Card>
      )}

      {/* ── 내보내기 탭 ── */}
      {activeTab === "export" && streams && activity && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <ExportTab activity={activity} streams={streams} />
        </Card>
      )}

      {/* ── Two-column layout: Main | Sidebar (개요 탭) ── */}
      {(activeTab === "overview" || !streams) && (
      <div className="flex flex-col lg:flex-row gap-6">


      {/* ── Left: 분석 / 스탯 / 사진 / 댓글 ── */}
      <div className="flex-1 min-w-0 space-y-6">

      {/* AI 라이딩 분석 — 사이클 활동 + 스트림 준비 시. 비용 가치를 개요 최상단에 노출. */}
      {sport === "ride" && hasStreams && (
        <AiRideAnalysisCard activityId={activityId ?? null} enabled={sport === "ride" && hasStreams} />
      )}

      {/* 분석 (고도 & 성능 차트) — 수영/기타는 고도 차트 숨김 */}
      {showElevation && (showStreamSpinner || loadingStreams) && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("page.elevPerf")}</h3>
          <div className="h-[320px] flex items-center justify-center">
            <div className="flex items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t("page.loadingGps")}
            </div>
          </div>
        </Card>
      )}
      {showElevation && elevData.length > 0 && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>
            {availableOverlays.length > 0 ? t("page.elevTitleWithPerf") : t("page.elevProfile")}
          </h3>

          {/* Overlay toggle buttons */}
          {hasStreams && availableOverlays.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--fs-xs)] font-medium rounded-full cursor-default" style={{ background: 'color-mix(in srgb, var(--lime) 12%, transparent)', color: 'var(--lime)', border: '1px solid color-mix(in srgb, var(--lime) 30%, transparent)' }}>
                <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                {t("page.elevation")}
              </span>
              {availableOverlays.map((cfg) => (
                <button
                  key={cfg.key}
                  onClick={() => toggleOverlay(cfg.key)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--fs-xs)] font-medium rounded-full border transition-colors"
                  style={activeOverlays.has(cfg.key) ? {
                    color: cfg.dotColor,
                    borderColor: cfg.dotColor,
                    backgroundColor: `${cfg.dotColor}15`,
                  } : {
                    background: 'var(--bg-2)',
                    color: 'var(--ink-3)',
                    borderColor: 'var(--line-soft)',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: activeOverlays.has(cfg.key) ? cfg.dotColor : "var(--ink-4)" }}
                  />
                  {t(`overlay.${cfg.label}`)}
                </button>
              ))}
            </div>
          )}

          {/* Hover data panel */}
          {hasStreams && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-xs)] mb-2 min-h-[20px]" style={{ color: 'var(--ink-2)' }}>
              {hoverPoint ? (
                <>
                  <span className="font-medium" style={{ color: 'var(--ink-0)' }}>{formatDistance(hoverPoint.distance, units)}</span>
                  <span style={{ color: 'var(--line)' }}>|</span>
                  <span style={{ color: "var(--color-success)" }}>{t("page.elevationLabel", { value: Math.round(hoverPoint.altitude) })}</span>
                  {availableOverlays.flatMap((cfg) => {
                    if (!activeOverlays.has(cfg.key)) return [];
                    const val = cfg.getValue(hoverPoint);
                    if (val <= 0) return [];
                    return [
                      <span key={`${cfg.key}-sep`} style={{ color: 'var(--line)' }}>|</span>,
                      <span key={cfg.key} style={{ color: cfg.dotColor }}>
                        {t(`overlay.${cfg.label}`)} {cfg.key === "speed" ? val.toFixed(1) : Math.round(val)} {cfg.unit}
                      </span>,
                    ];
                  })}
                </>
              ) : summaryStats ? (
                <>
                  <span style={{ color: "var(--color-success)" }}>{t("page.elevationRange", { min: Math.round(summaryStats.minElev), max: Math.round(summaryStats.maxElev) })}</span>
                  {availableOverlays.flatMap((cfg) => {
                    const stat = summaryStats.overlays[cfg.key];
                    if (!stat || !activeOverlays.has(cfg.key)) return [];
                    return [
                      <span key={`${cfg.key}-sep`} style={{ color: 'var(--line)' }}>|</span>,
                      <span key={cfg.key} style={{ color: cfg.dotColor }}>
                        {t("page.avgPrefix")} {cfg.key === "speed" ? stat.avg.toFixed(1) : Math.round(stat.avg)} {cfg.unit}
                      </span>,
                    ];
                  })}
                </>
              ) : null}
            </div>
          )}

          <ElevationChart
            data={elevData}
            height={chartOverlays.length > 0 ? 320 : 200}
            onHoverIndex={hasStreams ? handleElevHover : undefined}
            overlays={chartOverlays.length > 0 ? chartOverlays : undefined}
            highlightRange={chartHighlightRange}
          />
        </Card>
      )}

      {/* Streams error */}
      {showElevation && !hasStreams && !loadingStreams && !showStreamSpinner && streamsError && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <div className="text-center text-[length:var(--fs-sm)]" style={{ color: 'var(--ink-2)' }}>
            <p>{streamsError}</p>
            <button
              onClick={() => {
                const stravaId = (activity as Activity & { stravaActivityId?: number }).stravaActivityId;
                if (!stravaId) return;
                setLoadingStreams(true);
                setStreamsError(null);
                setShowStreamSpinner(true);
                getStreams(stravaId).then((data) => {
                  setStreams(data as unknown as ActivityStreams);
                }).catch((err) => {
                  setStreamsError(err instanceof Error ? err.message : t("page.streamsErrorFallback"));
                }).finally(() => {
                  setShowStreamSpinner(false);
                  setLoadingStreams(false);
                });
              }}
              className="mt-2 font-medium hover:underline" style={{ color: 'var(--lime)' }}
            >
              {t("page.retry")}
            </button>
          </div>
        </Card>
      )}

      {/* 스탯 — 6-metric strip (프로토타입 매칭) */}
      <Card padding="none" style={{ padding: 0 }}>
        <ActivityStatsGrid
          summary={s}
          sport={sport}
          avgPowerValue={avgPowerValue}
          normalizedPowerValue={normalizedPowerValue}
          movingTimeSec={serverMetrics.metrics?.movingTimeSec}
          pauseTimeSec={serverMetrics.metrics?.pauseTimeSec}
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
      </Card>

      {/* 러닝/수영 전용 상세 카드 (좌측, 개요 탭에서만) */}
      {activeTab === "overview" && sport === "run" && streams && <RunLeftCards streams={streams} />}
      {activeTab === "overview" && sport === "swim" && streams && <SwimLeftCards streams={streams} />}

      {/* 사진 (가로 스크롤) — Strava + 업로드 사진 */}
      {(photos.length > 0 || uploadedPhotos.length > 0 || user?.uid === activity.userId) && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>
            {t("page.photos")} ({photos.length + uploadedPhotos.length})
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin" style={{ '--scrollbar-thumb': 'var(--line)' } as React.CSSProperties}>
            {/* Strava photos */}
            {photos.map((photo) => photo.url && (
              <div
                key={`strava-${photo.id}`}
                className="relative group flex-shrink-0 w-48 h-48 sm:w-56 sm:h-56 snap-start overflow-hidden rounded-[var(--r-lg)] cursor-pointer" style={{ background: 'var(--bg-2)' }}
                onClick={() => {
                  if (photo.location) {
                    setFlyToPosition(null);
                    setTimeout(() => setFlyToPosition(photo.location), 10);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              >
                <img
                  src={photo.url}
                  alt={photo.caption || ""}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                {photo.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-[length:var(--fs-xs)] text-[var(--ink-0)] truncate">{photo.caption}</p>
                  </div>
                )}
              </div>
            ))}
            {/* Uploaded photos */}
            {uploadedPhotos.map((photo) => (
              <div
                key={`upload-${photo.id}`}
                className="relative group flex-shrink-0 w-48 h-48 sm:w-56 sm:h-56 snap-start overflow-hidden rounded-[var(--r-lg)] cursor-pointer" style={{ background: 'var(--bg-2)' }}
                onClick={() => {
                  const loc = photo.location;
                  if (loc) {
                    setFlyToPosition(null);
                    setTimeout(() => setFlyToPosition(loc), 10);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              >
                <img
                  src={photo.url}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                {user?.uid === photo.userId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo); }}
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 hover:bg-red-600 text-[var(--ink-0)] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t("page.delete")}
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
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />
        </Card>
      )}

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

      {/* ── 6. 좋아요 & 댓글 ── */}
      <KudosCommentsCard
        user={user}
        profile={profile}
        liked={liked}
        kudos={activityKudos}
        comments={activityComments}
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
        formatTimeAgo={timeAgo}
      />

      </div>{/* end left column */}

      {/* ── Right sidebar (개요): 종목별 카드만 ── */}
      {(sport === "run" || sport === "swim") && (
      <div className="lg:w-80 flex-shrink-0 space-y-6 lg:pl-6 lg:[border-left:1px_solid_var(--line-soft)]">
      {sport === "run" && <RunRightCards summary={s} activity={activity} />}
      {sport === "swim" && <SwimRightCards summary={s} streams={streams} />}
      </div>
      )}

      </div>
      )}

      {/* ── 세그먼트 탭 — 주요성과 + 세그먼트/코스 등록 ── */}
      {activeTab === "segments" && streams && (
      <div className="space-y-6">

      {/* 주요 성과 */}
      {topResults.length > 0 && (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M7 4h10v7a5 5 0 01-10 0V4z" fill="#FBBF24" />
                <path d="M7 4h10v7a5 5 0 01-10 0V4z" fill="url(#trophy-shine)" />
                <path d="M7 6.5H5.5a2 2 0 00-2 2v0c0 1.66 1.34 3 3 3H7" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M17 6.5h1.5a2 2 0 012 2v0c0 1.66-1.34 3-3 3H17" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
                <rect x="10" y="15" width="4" height="2.5" rx="0.5" fill="#F59E0B" />
                <rect x="8" y="18" width="8" height="2" rx="1" fill="#D97706" />
                <path d="M9.5 7v4" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.45" />
                <defs>
                  <linearGradient id="trophy-shine" x1="7" y1="4" x2="17" y2="11">
                    <stop offset="0%" stopColor="white" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
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
                iconBg = "bg-gradient-to-br from-orange-400 to-orange-600";
                iconContent = (
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
                    <path d="M4 17h16l-2-10-4.5 4L12 5l-1.5 6L6 7l-2 10z" fill="white" />
                    <path d="M4 17h16l-2-10-4.5 4L12 5l-1.5 6L6 7l-2 10z" fill="white" opacity="0.15" />
                    <circle cx="6" cy="7" r="1.5" fill="white" opacity="0.7" />
                    <circle cx="12" cy="4.5" r="1.5" fill="white" opacity="0.7" />
                    <circle cx="18" cy="7" r="1.5" fill="white" opacity="0.7" />
                    <rect x="4" y="18" width="16" height="2.5" rx="0.75" fill="white" opacity="0.85" />
                  </svg>
                );
                badgeText = `KOM #${effort.komRank}`;
                badgeBg = "bg-gradient-to-r from-[var(--lime)] to-[var(--aqua)] text-[var(--bg-0)]";
              } else if (rank === 1) {
                iconBg = "bg-gradient-to-br from-yellow-300 to-amber-500";
                iconContent = (
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
                    <path d="M8 4h8v6.5a4 4 0 01-8 0V4z" fill="#92400E" opacity="0.25" />
                    <path d="M8 4h8v6.5a4 4 0 01-8 0V4z" fill="white" opacity="0.7" />
                    <path d="M8 6H6.5a1.5 1.5 0 00-1.5 1.5v0A2.5 2.5 0 007.5 10H8" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
                    <path d="M16 6h1.5A1.5 1.5 0 0119 7.5v0a2.5 2.5 0 01-2.5 2.5H16" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
                    <rect x="10.5" y="13" width="3" height="3" rx="0.5" fill="white" opacity="0.7" />
                    <rect x="9" y="17" width="6" height="2" rx="1" fill="white" opacity="0.85" />
                    <path d="M10.5 6.5v3" stroke="white" strokeWidth="0.75" strokeLinecap="round" opacity="0.5" />
                  </svg>
                );
                badgeText = "PR";
                badgeBg = "bg-gradient-to-r from-yellow-400 to-amber-500 text-yellow-900";
              } else if (rank === 2) {
                iconBg = "bg-gradient-to-br from-slate-300 to-slate-500";
                iconContent = (
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
                    <path d="M10 3l-1 5h6l-1-5h-4z" fill="white" opacity="0.5" />
                    <circle cx="12" cy="14" r="6" fill="white" opacity="0.25" />
                    <circle cx="12" cy="14" r="6" stroke="white" strokeWidth="1.5" opacity="0.8" />
                    <circle cx="12" cy="14" r="3.5" stroke="white" strokeWidth="1" opacity="0.5" />
                    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold" opacity="0.85">2</text>
                  </svg>
                );
                badgeText = "2nd";
                badgeBg = "bg-gradient-to-r from-slate-400 to-slate-500 text-[var(--ink-0)]";
              } else {
                iconBg = "bg-gradient-to-br from-orange-300 to-orange-500";
                iconContent = (
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
                    <path d="M10 3l-1 5h6l-1-5h-4z" fill="white" opacity="0.5" />
                    <circle cx="12" cy="14" r="6" fill="white" opacity="0.25" />
                    <circle cx="12" cy="14" r="6" stroke="white" strokeWidth="1.5" opacity="0.8" />
                    <circle cx="12" cy="14" r="3.5" stroke="white" strokeWidth="1" opacity="0.5" />
                    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold" opacity="0.85">3</text>
                  </svg>
                );
                badgeText = "3rd";
                badgeBg = "bg-gradient-to-r from-[var(--amber)] to-[var(--amber)] text-[var(--bg-0)]";
              }

              return (
                <Link
                  key={effort.id}
                  to={`/segment/${String(effort.segment.id).startsWith("strava_") ? effort.segment.id : `strava_${effort.segment.id}`}`}
                  className="flex items-center gap-3 p-2 rounded-[var(--r-xl)] transition-colors hover:bg-[var(--bg-2)]"
                  onMouseEnter={() => setHoveredSegment(effort)}
                  onMouseLeave={() => setHoveredSegment(null)}
                >
                  <div className={`w-8 h-8 rounded-[var(--r-lg)] ${iconBg} flex items-center justify-center flex-shrink-0 shadow-md`}>
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
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm ${badgeBg}`}>
                      {badgeText}
                    </span>
                    <div className="font-mono font-bold text-[length:var(--fs-xs)] tabular-nums mt-0.5" style={{ color: 'var(--ink-0)' }}>{formatTime(effort.elapsedTime)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* 세그먼트 목록 (전체) */}
      {segmentEfforts.length > 0 && (
        <SegmentEffortsCard
          efforts={segmentEfforts}
          showAll={showAllSegments}
          setShowAll={setShowAllSegments}
          onHover={setHoveredSegment}
          formatTime={formatTime}
        />
      )}

      {/* 세그먼트 & 코스 만들기 (수영은 세그먼트 없음) */}
      {user && sport !== "swim" && (
        <div className="flex gap-2">
          <Link
            to={`/segment/create?activityId=${activityId}`}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] font-medium transition-colors ds-btn ds-btn--md"
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
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] font-medium transition-colors" style={{ background: 'color-mix(in srgb, var(--aqua) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--aqua) 30%, transparent)', color: 'var(--aqua)' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            {t("page.registerRoute")}
          </Link>
        </div>
      )}
      {/* 세그먼트 효과는 개요의 AI 라이딩 분석 카드(AiRideAnalysisCard)에 구간별로도 녹여 표시.
          매핑: analysis/ride-segments.ts */}

      </div>
      )}{/* end 세그먼트 탭 */}
    </div>
  );
}
