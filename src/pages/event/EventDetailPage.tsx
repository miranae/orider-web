import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { firestore, functions } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { getPublicUserProfile } from "../../services/publicProfiles";
import { useAuth } from "../../contexts/AuthContext";
import { useDialog } from "../../contexts/DialogContext";
import { Course } from "@shared/types";
import RouteMap, { type WaypointMarker } from "../../components/RouteMap";
import { EmptyState, LoadingSkeleton } from "../../components/redesign";
import { isRegistrationTimeOpen, normalizeStartTime } from "../../utils/event-time";
import { Button, Card, Chip, Text } from "../../theme/components";
import { isEventHost } from "../../features/event/eventHost";
import { parseGpxFull, type CourseData } from "../../features/event/detail/courseGpx";
import type { EventDetail, RecentParticipant } from "../../features/event/detail/eventDetailTypes";
import {
  buildElevationProfile,
  classifyElevationQuality,
  classifyLane,
  cumulativeDistances,
  isProfileMarkerLane,
  laneLabelKey,
  lanesForContext,
  readLaneColor,
  resolveWaypointsOnTrack,
  toElevationChartData,
  LANE_DEFS,
  type WpLane,
} from "../../features/courseEngine";
import ElevationChart from "../../components/ElevationChart";
import { waypointPipAnchorStyle } from "../../features/courses/courseWaypoints";
import "../../features/event/detail/event-profile.css";
import { cancelEventRegistration } from "../../features/event/detail/cancelRegistration";
import { buildOriderSharePayload, shareOrCopy } from "../../features/share/oriderShareText";
import { buildEventIcs, downloadIcsFile, icsFileName } from "../../features/event/detail/generateIcs";
import { createEventShareImage, shareEventImage } from "../../features/event/share/eventShareCard";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import { buildEventFollowPayload, followerExists } from "../../features/event/detail/eventFollow";
import { useGroup } from "../../hooks/useGroup";
import { useGroupNextEvents } from "../../hooks/useGroupNextEvents";

/** 이보다 트랙에서 멀리 떨어진 웨이포인트는 프로필·지도에 찍지 않는다(m). */
const OFF_TRACK_LIMIT_M = 2_000;

export function shouldShowHostGroupCard(
  groupId: string | undefined,
  loadedGroupId: string | undefined,
  loading: boolean,
  inactive: boolean,
  hasError: boolean,
): boolean {
  return !!groupId && !loading && loadedGroupId === groupId && !inactive && !hasError;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { t, i18n } = useTranslation("event");
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const dialog = useDialog();

  // 이벤트 상세는 대회 문맥 — 컷오프를 포함한 4레인을 쓰고, 보급은 "보급"으로 부른다.
  const LANE_ORDER = lanesForContext("event");
  const LANE_META = Object.fromEntries(
    (Object.keys(LANE_DEFS) as WpLane[]).map((lane) => [lane, {
      label: t(laneLabelKey(lane, "event")),
      color: LANE_DEFS[lane].color,
      icon: LANE_DEFS[lane].icon,
    }]),
  ) as Record<WpLane, { label: string; color: string; icon: string }>;
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isParticipant, setIsParticipant] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [starting, setStarting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [sending, setSending] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [recentParticipants, setRecentParticipants] = useState<RecentParticipant[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [followingEvent, setFollowingEvent] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [followLoading, setFollowLoading] = useState(true);
  const groupId = event?.groupId || undefined;
  const { group, loading: groupLoading, error: groupError, inactive: groupInactive } = useGroup(groupId);
  const { byGroup: nextEventLabels, eventByGroup: nextEvents } = useGroupNextEvents(groupId ? [groupId] : [], eventId, true);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (groupError) logClientError("EventDetailPage.loadHostGroup", groupError, { eventId, groupId });
  }, [eventId, groupError, groupId]);

  useEffect(() => {
    let cancelled = false;
    if (!eventId || !user) {
      setFollowingEvent(false);
      setFollowLoading(false);
      return;
    }
    setFollowLoading(true);
    void getDoc(doc(firestore, "events", eventId, "followers", user.uid)).then((snapshot) => {
      if (!cancelled) setFollowingEvent(followerExists(snapshot));
    }).catch((err) => {
      logClientError("EventDetailPage.loadEventFollow", err, { eventId });
    }).finally(() => {
      if (!cancelled) setFollowLoading(false);
    });
    return () => { cancelled = true; };
  }, [eventId, user]);

  const handleStartEvent = useCallback(async () => {
    if (!eventId || !event) return;
    setShowStartConfirm(false);
    setStarting(true);
    try {
      const startEvent = httpsCallable(functions, "startEvent");
      await startEvent({ eventId });
      navigate(`/event/${eventId}/dashboard`);
    } catch (err: unknown) {
      logClientError("EventDetailPage.startEvent", err, { eventId });
      const fbErr = err as { code?: string };
      const msg = fbErr?.code === "functions/failed-precondition"
        ? t("detail.error.alreadyStarted")
        : t("detail.error.startFailed");
      showToast(msg);
      setStarting(false);
    }
  }, [eventId, event, navigate, showToast, t]);

  const handleCancelRegistration = useCallback(async () => {
    if (!eventId || !user || withdrawing) return;
    if (!(await dialog.confirm(t("detail.confirm.cancelRegistration"), {
      destructive: true,
      confirmLabel: t("detail.button.cancelRegistration"),
    }))) return;

    setWithdrawing(true);
    try {
      await cancelEventRegistration(eventId);
      setIsParticipant(false);
      // `withdrawing` prevents duplicate requests; a successful server transaction
      // therefore decrements this optimistic count exactly once.
      setParticipantCount((count) => Math.max(0, count - 1));
      setRecentParticipants((items) => items.filter((participant) => participant.uid !== user.uid));
      showToast(t("detail.toast.registrationCancelled"));
    } catch (err) {
      logClientError("EventDetailPage.cancelRegistration", err, { eventId });
      const code = (err as { code?: string } | null)?.code;
      void dialog.alert(
        code === "functions/failed-precondition"
          ? t("detail.error.registrationCancellationClosed")
          : t("detail.error.cancelRegistrationFailed"),
        { variant: "danger" },
      );
    } finally {
      setWithdrawing(false);
    }
  }, [dialog, eventId, showToast, t, user, withdrawing]);

  const handleAddToCalendar = useCallback(() => {
    if (!event) return;
    try {
      const ics = buildEventIcs({
        id: event.id,
        name: event.name,
        description: event.description,
        startTime: event.startTime,
        durationMs: event.cutoffMs,
        location: event.meetLocation || event.region,
        url: window.location.href,
      });
      downloadIcsFile(icsFileName(event.name), ics);
    } catch (err) {
      logClientError("EventDetailPage.addToCalendar", err, { eventId });
      showToast(t("detail.toast.shareFailed"));
    }
  }, [event, eventId, showToast, t]);
  const [linkedCourses, setLinkedCourses] = useState<Course[]>([]);
  const [selectedCourseIdx, setSelectedCourseIdx] = useState(0);
  const [courseDataMap, setCourseDataMap] = useState<Record<number, CourseData>>({});
  const [hoveredWpIdx, setHoveredWpIdx] = useState<number | null>(null);
  const [selectedWpIdx, setSelectedWpIdx] = useState<number | null>(null);
  const [flyToPos, setFlyToPos] = useState<[number, number] | null>(null);
   

  // Fetch event data
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      try {
        const docRef = doc(firestore, "events", eventId);
        const docSnap = await getDoc(docRef);
        let hostSource: Pick<EventDetail, "creatorId" | "hostIds"> | null = null;
        if (docSnap.exists()) {
          const d = docSnap.data();
          const info = d.info || {};
          const creatorId = info.creatorId || "";
          const hostIds = Array.isArray(info.hostIds) ? info.hostIds : [];
          hostSource = { creatorId, hostIds };
          let creatorName = "";
          if (creatorId) {
            try {
              const creator = await getPublicUserProfile(creatorId);
              creatorName = creator?.nickname ?? "";
            } catch {
              creatorName = "";
            }
          }
          setEvent({
            id: docSnap.id,
            name: info.name || t("noName"),
            type: info.type || "TOUR",
            status: info.status || "UNKNOWN",
            startTime: normalizeStartTime(info.startTime),
            closeAt: typeof info.closeAt === "string" ? info.closeAt : undefined,
            creatorId,
            hostIds,
            creatorName,
            groupId: info.groupId || "",
            maxParticipants: info.settings?.maxParticipants || info.maxParticipants || 0,
            courseGpx: info.courseGpx || "",
            courses: info.courses || [],
            courseIds: info.courseIds || [],
            description: info.description || "",
            region: info.region || "",
            meetLocation: info.meetLocation || d.schedule?.meetLocation || "",
            seriesId: typeof info.seriesId === "string" ? info.seriesId : undefined,
            round: typeof info.round === "number" ? info.round : undefined,
            categories: Array.isArray(info.categories) ? info.categories : [],
            entryFee: typeof info.entryFee === "number" ? info.entryFee : undefined,
            cutoffMs: typeof info.cutoffMs === "number" ? info.cutoffMs : undefined,
            bibStartTime: typeof info.bibStartTime === "string" ? info.bibStartTime : undefined,
          });
        }
        const participantsSnap = await getDocs(collection(firestore, `events/${eventId}/participants`));
        setParticipantCount(participantsSnap.size);
        if (user) {
          const myDoc = participantsSnap.docs.find((d) => d.id === user.uid);
          const participantRole = typeof myDoc?.data()?.role === "string" ? myDoc.data().role : null;
          setIsParticipant(!!myDoc);
          setIsHost(isEventHost(user.uid, hostSource, participantRole));
        } else {
          setIsParticipant(false);
          setIsHost(false);
        }
      } catch (err) {
        logClientError("EventDetailPage.loadEvent", err, { eventId });
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId, user]);

  // Fetch GPX and parse course data
  const fetchCourse = useCallback(async (url: string, idx: number) => {
    if (courseDataMap[idx]) return;
    try {
      let gpxXml: string;
      if (url.startsWith("http")) {
        // storage.googleapis.com 는 CORS 미설정 시 직접 fetch 실패 가능 →
        // Firebase Storage SDK로 토큰화된 URL을 받아 fetch.
        const m = url.match(/^https?:\/\/storage\.googleapis\.com\/[^/]+\/(.+)$/i);
        let fetchUrl = url;
        if (m && m[1]) {
          try {
            const path = decodeURIComponent(m[1]);
            fetchUrl = await getDownloadURL(ref(getStorage(), path));
          } catch {
            // SDK 실패 시 원본 URL로 폴백
            fetchUrl = url;
          }
        }
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`GPX fetch failed: ${res.status}`);
        gpxXml = await res.text();
      } else {
        gpxXml = url;
      }
      const data = parseGpxFull(gpxXml);
      setCourseDataMap((prev) => ({ ...prev, [idx]: data }));
    } catch (err) {
      logClientError("EventDetailPage.loadGpx", err, { eventId, idx });
    }
  }, [courseDataMap, eventId]);

  useEffect(() => {
    if (!event) return;
    if (event.courses && event.courses.length > 0) {
      const c = event.courses[selectedCourseIdx];
      if (c) fetchCourse(c.gpxUrl, selectedCourseIdx);
    } else if (event.courseGpx) {
      fetchCourse(event.courseGpx, 0);
    }
  }, [event, selectedCourseIdx, fetchCourse]);

  // Fetch linked courses from courses collection
  useEffect(() => {
    if (!event?.courseIds?.length) return;
    const fetchLinkedCourses = async () => {
      const courseDocs = await Promise.all(
        event.courseIds!.map(id => getDoc(doc(firestore, "courses", id)))
      );
      setLinkedCourses(
        courseDocs
          .filter(d => d.exists())
          .map(d => ({ id: d.id, ...d.data() } as Course))
      );
    };
    fetchLinkedCourses();
  }, [event?.courseIds]);

  // Fetch top 5 recent participants with denormalized nicknames
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(firestore, `events/${eventId}/participants`),
          orderBy("joinedAt", "desc"),
          limit(5)
        );
        const snap = await getDocs(q);
        const items: RecentParticipant[] = [];
        for (const d of snap.docs) {
          const data = d.data() as { userId?: string; category?: string | null; joinedAt?: { _seconds?: number; seconds?: number } | number };
          const uid = data.userId || d.id;
          const ts = data.joinedAt;
          const joinedAt =
            typeof ts === "number"
              ? ts
              : ts && typeof ts === "object"
                ? ((ts as { _seconds?: number; seconds?: number })._seconds ?? (ts as { _seconds?: number; seconds?: number }).seconds ?? 0) * 1000
                : 0;
          let nickname = t("detail.defaultNickname");
          try {
            const profile = await getPublicUserProfile(uid);
            nickname = profile?.nickname ?? t("detail.defaultNickname");
          } catch {
            // ignore
          }
          items.push({ uid, nickname, category: data.category ?? null, joinedAt });
        }
        if (!cancelled) setRecentParticipants(items);
      } catch (err) {
        logClientError("EventDetailPage.loadRecentParticipants", err, { eventId });
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  const handleSendCourseToParticipants = async (course: Course) => {
    if (!user || sending) return;
    if (!(await dialog.confirm(t("detail.confirm.sendCourse", { name: course.name })))) return;
    setSending(true);
    try {
      const fn = httpsCallable(functions, "sendCourseToApp");
      await fn({ courseId: course.id, eventId: event?.id });
      showToast(t("detail.toast.courseSent"));
    } catch (err) {
      logClientError("EventDetailPage.sendCourseToApp", err, { eventId: event?.id, courseId: course.id });
      showToast(t("detail.toast.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const courseData = courseDataMap[selectedCourseIdx] || null;

  // 웨이포인트 거리 계산 — 조기 반환 위에서 호출해야 hooks 순서 유지.
  // 투영·정렬은 코스엔진이 담당한다(GPX 파일의 wpt 는 파일 내 순서가 코스 순서와 무관해
  // ordered 를 켜지 않고, 결과를 거리순으로 정렬한 것을 그대로 쓴다).
  const waypointRows = useMemo(() => {
    if (!courseData || courseData.waypoints.length === 0) return [];
    const cumulative = cumulativeDistances(courseData.points);
    return resolveWaypointsOnTrack(courseData.waypoints, courseData.points, cumulative).map((item) => ({
      name: item.waypoint.name,
      km: item.distanceFromStartM / 1000,
      ele: Math.round(item.waypoint.ele),
      lane: classifyLane(item.waypoint),
    }));
  }, [courseData]);

  // ── Elevation chart ──
  /**
   * 고도 프로필 — 축약·분류를 코스엔진에 맡기고 렌더는 공유 ElevationChart 로 넘긴다.
   * 예전에는 이 화면만 react-chartjs-2 를 직접 써서 색을 hex 로 박았고(테마 전환에 무반응),
   * 등간격 추출로 봉우리를 잘라냈다.
   */
  const elevationProfile = useMemo(
    () => (courseData ? buildElevationProfile(courseData.points, 300) : []),
    [courseData],
  );

  const elevationData = useMemo(
    () => toElevationChartData(elevationProfile),
    [elevationProfile],
  );

  const hasUsableElevation = useMemo(() => {
    if (!courseData) return false;
    return courseData.hasElevation
      && classifyElevationQuality(courseData.points.map((point) => point.ele), "measured") !== "none";
  }, [courseData]);

  /** 프로필 위에 찍을 지점 — 구간(SEG)은 수가 많아 차트를 뒤덮으므로 코스엔진이 걸러낸다. */
  const profileMarkers = useMemo(() => {
    if (!courseData || elevationProfile.length === 0) return [];
    const cumulative = cumulativeDistances(courseData.points);
    return resolveWaypointsOnTrack(courseData.waypoints, courseData.points, cumulative)
      .filter((item) => isProfileMarkerLane(classifyLane(item.waypoint)))
      // 코스에서 멀리 떨어진 웨이포인트는 트랙에 억지로 투영되어 엉뚱한 거리·고도로 찍히고,
      // 선택하면 지도가 코스 밖으로 날아간다. 이관 전과 같은 2km 기준을 유지한다.
      .filter((item) => item.offTrackM < OFF_TRACK_LIMIT_M)
      .map((item) => ({
        name: item.waypoint.name,
        lane: classifyLane(item.waypoint),
        distanceM: item.distanceFromStartM,
        elevationM: courseData.points[item.trackIndex]?.ele ?? item.waypoint.ele,
        location: [item.waypoint.lat, item.waypoint.lon] as [number, number],
      }));
  }, [courseData, elevationProfile.length]);

  const totalDistanceM = courseData?.distance ?? 0;

  // ── Render helpers ──

  const formatDateTime = (ts: number) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString("ko-KR", {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="py-8">
        <LoadingSkeleton kind="chart" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="py-16">
        <EmptyState
          icon="🗓️"
          title={t("empty.noResults")}
          description={t("detail.notFound.description")}
          actions={[
            { label: t("detail.button.eventList"), variant: "primary", onClick: () => navigate("/events") },
          ]}
        />
      </div>
    );
  }

  const isGranFondo = event.type === "GRANFONDO";
  const courses = event.courses || [];

  const activeWpIdx = hoveredWpIdx ?? selectedWpIdx;
  const activeWpName = activeWpIdx == null ? null : profileMarkers[activeWpIdx]?.name ?? null;

  const mapWaypoints: WaypointMarker[] = (courseData?.waypoints || []).map((w) => ({
    lat: w.lat,
    lon: w.lon,
    name: w.name,
    icon: LANE_META[classifyLane(w)].icon,
    active: activeWpName === w.name,
  }));

  const statusMeta = (() => {
    switch (event.status) {
      case "OPEN": return { label: t("status.open"), color: "var(--aqua)" };
      case "LIVE": return { label: t("status.live"), color: "var(--lime)" };
      case "FINISHED": return { label: t("status.finished"), color: "var(--ink-3)" };
      case "CANCELLED": return { label: t("status.cancelled"), color: "var(--rose)" };
      case "DRAFT": return { label: t("status.draft"), color: "var(--ink-3)" };
      default: return { label: event.status, color: "var(--ink-3)" };
    }
  })();

  const fillPct = event.maxParticipants
    ? Math.min(100, Math.round((participantCount / event.maxParticipants) * 100))
    : null;
  const activeGroupId = shouldShowHostGroupCard(groupId, group?.id, groupLoading, groupInactive, !!groupError) ? groupId : undefined;

  return (
    <>
      {/* Breadcrumb */}
      <div className="site-shell flex items-center" style={{ padding: "14px 24px 0", gap: 'var(--space-2)', fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
        <Link to="/events" style={{ color: "var(--ink-3)" }}>{t("title")}</Link>
        <span style={{ color: "var(--ink-4)" }}>›</span>
        <span className="truncate" style={{ color: "var(--ink-2)" }}>{event.name}</span>
      </div>

      {/* 히어로 카드 */}
      <div className="site-shell" style={{ padding: "14px 24px 0" }}>
        <Card padding="none" style={{ padding: 0, overflow: "hidden" }}>
          {courseData ? (
            <RouteMap
              latlng={courseData.latlng}
              height="h-80"
              interactive={false}
              rounded={false}
              waypoints={mapWaypoints}
              flyToPosition={flyToPos}
            />
          ) : (
            <div className="h-64" style={{ background: "linear-gradient(135deg, var(--bg-3), var(--bg-4))" }} />
          )}
          <div style={{ padding: "22px 28px" }}>
            {/* 칩 행 */}
            <div className="flex flex-wrap" style={{ gap: "var(--space-1-5)", marginBottom: "var(--space-2)" }}>
              <Chip style={{ fontSize: "var(--fs-xs)", color: "var(--amber)", display: "inline-flex", alignItems: "center", gap: 'var(--space-1)' }}>
                <span aria-hidden="true">🏔️</span> {isGranFondo ? t("type.granfondo") : t("type.tour")}
              </Chip>
              <Chip
                style={{
                  fontSize: "var(--fs-xs)",
                  color: statusMeta.color,
                  borderColor: statusMeta.color === "var(--ink-3)" ? "var(--line-soft)" : `color-mix(in oklch, ${statusMeta.color} 40%, var(--line-soft))`,
                }}
              >
                {statusMeta.label}
              </Chip>
              {event.region && <Chip style={{ fontSize: "var(--fs-xs)" }}>{event.region}</Chip>}
              {isGranFondo && <Chip style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)" }}>Cat HC</Chip>}
            </div>

            {/* 제목 + 메타 + 액션 */}
            <div className="flex flex-wrap items-end justify-between" style={{ gap: 'var(--space-5)' }}>
              <div className="flex-1 min-w-0">
                <Text as="h1" variant="pageTitle" style={{ marginBottom: "var(--space-1-5)" }}>{event.name}</Text>
                <div className="flex flex-wrap items-center" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", gap: 'var(--space-4)' }}>
                  <span className="inline-flex items-center" style={{ gap: "var(--space-1)" }}>
                    <span aria-hidden="true">📅</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{formatDateTime(event.startTime)}</span>
                  </span>
                  {event.creatorName && (
                    <span className="inline-flex items-center" style={{ gap: "var(--space-1)" }}>
                      <span aria-hidden="true">👥</span> {t("detail.hostedBy", { name: event.creatorName })}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
                <Button
                  type="button" variant="secondary" size="sm"
                  onClick={async () => {
                    const payload = buildOriderSharePayload({ title: event.name, body: event.name, url: window.location.href, language: i18n.language });
                    const result = await shareOrCopy(payload);
                    if (result === "copied") showToast(t("detail.toast.linkCopied"));
                    else if (result === "failed") {
                      logClientError("EventDetailPage.share", new Error("Share unavailable or failed"), { eventId });
                      showToast(t("detail.toast.shareFailed"));
                    }
                  }}
                >
                  🔗 {t("button.share")}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleAddToCalendar}>
                  📅 {t("detail.button.addToCalendar")}
                </Button>
                {event.status === "OPEN" && !isParticipant && isRegistrationTimeOpen(event.startTime, event.closeAt) && (
                  <><Button type="button" variant="secondary" size="sm" disabled={followPending || followLoading} onClick={async () => {
                    if (!user || !eventId) { navigate("/login"); return; }
                    const next = !followingEvent;
                    setFollowPending(true);
                    try {
                      await httpsCallable(functions, "setEventFollow")(buildEventFollowPayload(eventId, next));
                      setFollowingEvent(next);
                      showToast(t(next ? "follow.enabled" : "follow.disabled"));
                    } catch (err) { logClientError("EventDetailPage.setEventFollow", err, { eventId }); showToast(t("follow.failed")); }
                    finally { setFollowPending(false); }
                  }}>🔔 {t(followingEvent ? "follow.unfollow" : "follow.action")}</Button><Button
                    type="button"
                    onClick={() => navigate(`/event/${eventId}/register`)} variant="primary" size="sm"
                  >
                    + {t("button.register")}
                  </Button></>
                )}
                {event.status === "OPEN" && isParticipant && (
                  <><Button type="button" variant="secondary" size="sm" onClick={async () => {
                    try {
                      const file = await createEventShareImage({ eventName: event.name, riderName: user?.displayName || t("detail.defaultNickname"), date: formatDateTime(event.startTime), kind: "registered" });
                      const result = await shareEventImage(file, event.name);
                      if (result === "downloaded") showToast(t("shareCard.downloaded"));
                    } catch (err) {
                      logClientError("EventDetailPage.shareRegistrationCard", err, { eventId });
                      showToast(t("detail.toast.shareFailed"));
                    }
                  }}>🖼️ {t("shareCard.registration")}</Button><Button
                    type="button" variant="secondary" size="sm"
                    disabled={withdrawing}
                    onClick={() => { void handleCancelRegistration(); }}
                    style={{ color: "var(--amber)", borderColor: "color-mix(in oklch, var(--amber) 40%, transparent)" }}
                  >
                    {withdrawing ? t("detail.button.cancellingRegistration") : t("detail.button.cancelRegistration")}
                  </Button></>
                )}
                {event.status === "OPEN" && isHost && (
                  <Button
                    type="button"
                    onClick={() => setShowStartConfirm(true)} variant="primary" size="sm"
                  >
                    ▶ {t("button.start")}
                  </Button>
                )}
                {event.status === "LIVE" && (
                  <Button
                    type="button"
                    onClick={() => navigate(`/event/${eventId}/dashboard`)} variant="primary" size="sm"
                  >
                    📊 {t("detail.button.liveDashboard")}
                  </Button>
                )}
                {event.status === "FINISHED" && (
                  <Button
                    type="button"
                    onClick={() => navigate(`/event/${eventId}/results`)} variant="primary" size="sm"
                  >
                    🏆 {t("resultsTitle")}
                  </Button>
                )}
              </div>
            </div>

            {/* 핵심 수치 5컬럼 strip */}
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 1,
                background: "var(--line-soft)",
                border: "1px solid var(--line-soft)",
                borderRadius: "var(--r-md)",
                overflow: "hidden",
              }}
            >
              {[
                [t("label.totalDistance"), courseData ? (courseData.distance / 1000).toFixed(1) : "—", "km"],
                [t("label.totalElevation"), courseData ? Math.round(courseData.elevationGain).toString() : "—", "m"],
                [t("label.maxElevation"), courseData ? Math.round(courseData.maxElevation).toString() : "—", "m"],
                [t("participants"), event.maxParticipants ? `${participantCount}/${event.maxParticipants}` : `${participantCount}`, t("detail.unit.person")],
                [t("label.fillRate"), fillPct != null ? fillPct.toString() : "—", "%"],
              ].map(([k, v, u]) => (
                <div key={k} style={{ padding: "14px 16px", background: "var(--bg-1)" }}>
                  <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1-5)" }}>{k}</Text>
                  <div>
                    <Text variant="dataMedium">{v}</Text>
                    {u && <Text variant="unit">{u}</Text>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* 본문 */}
      <div
        className="site-shell event-detail-body"
        style={{
          padding: "20px 24px 40px",
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 'var(--space-5)',
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-4)', minWidth: 0 }}>
          {/* 코스 선택 */}
          {courses.length > 1 && (
            <div className="flex flex-wrap" style={{ gap: "var(--space-1-5)" }}>
              {courses.map((c, i) => {
                const cd = courseDataMap[i];
                const active = selectedCourseIdx === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setSelectedCourseIdx(i); setSelectedWpIdx(null); setHoveredWpIdx(null); setFlyToPos(null); }}
                    aria-pressed={active}
                    style={{
                      padding: "8px 14px",
                      fontSize: "var(--fs-xs)",
                      fontWeight: 500,
                      borderRadius: "var(--r-sm)",
                      background: active ? "color-mix(in oklch, var(--lime) 10%, var(--bg-2))" : "var(--bg-2)",
                      color: active ? "var(--ink-0)" : "var(--ink-2)",
                      border: `1px solid ${active ? "var(--lime)" : "var(--line-soft)"}`,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 'var(--space-2)',
                      cursor: "pointer",
                    }}
                  >
                    <span aria-hidden="true">🛣️</span>
                    <span>{c.name}</span>
                    {cd && (
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>
                        {(cd.distance / 1000).toFixed(1)}km · ↑{Math.round(cd.elevationGain)}m
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* 고도 프로필 카드 */}
          {courseData && elevationData.length > 0 && (
            <Card padding="none" style={{ padding: 'var(--space-5)' }}>
              <div className="flex items-start justify-between flex-wrap" style={{ marginBottom: 'var(--space-3)', gap: "var(--space-2)" }}>
                <div>
                  <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)", margin: 0 }}>{t("label.elevationProfile")}</h2>
                  <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-0-5)", fontFamily: "var(--font-mono)" }}>
                    {(courses[selectedCourseIdx]?.name) ?? ""} · {(courseData.distance / 1000).toFixed(1)}km · ↑{Math.round(courseData.elevationGain)}m
                  </div>
                </div>
                <div className="flex flex-wrap" style={{ gap: "var(--space-2)", fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
                  {LANE_ORDER.map((lane) => (
                    <span key={lane} className="inline-flex items-center" style={{ gap: 'var(--space-1)' }}>
                      <span aria-hidden="true" className="event-lane-swatch" style={{ background: LANE_META[lane].color }} />
                      {LANE_META[lane].label}
                    </span>
                  ))}
                </div>
              </div>

              {!hasUsableElevation ? (
                <div
                  className="h-52 flex items-center justify-center"
                  style={{
                    color: "var(--ink-3)",
                    fontSize: "var(--fs-xs)",
                    background: "var(--bg-2)",
                    border: "1px solid var(--line-soft)",
                    borderRadius: "var(--r-md)",
                  }}
                >
                  {t("detail.elevationChart.noElevation")}
                </div>
              ) : (
                <>
                  <ElevationChart
                    data={elevationData}
                    height={200}
                    colorByGrade
                    markers={profileMarkers.map((marker, index) => ({
                      distance: marker.distanceM,
                      elevation: marker.elevationM,
                      color: readLaneColor(marker.lane),
                      label: marker.name,
                      active: activeWpIdx === index,
                    }))}
                  />
                  {profileMarkers.length > 0 && (
                    <div className="event-lanes">
                      {LANE_ORDER.map((lane) => {
                        const items = profileMarkers
                          .map((marker, index) => ({ ...marker, index }))
                          .filter((marker) => marker.lane === lane);
                        if (items.length === 0) return null;
                        return (
                          <div key={lane} className="event-lane-row">
                            <span className="event-lane-name">
                              <i aria-hidden="true" style={{ background: LANE_META[lane].color }} />
                              {LANE_META[lane].label}
                            </span>
                            <span className="event-lane-track">
                              {items.map((marker) => {
                                const ratio = totalDistanceM > 0 ? marker.distanceM / totalDistanceM : 0;
                                const selected = selectedWpIdx === marker.index;
                                return (
                                  <button
                                    key={marker.index}
                                    type="button"
                                    className="event-pip"
                                    aria-pressed={selected}
                                    data-hover={hoveredWpIdx === marker.index ? "1" : undefined}
                                    data-selected={selected ? "1" : undefined}
                                    style={waypointPipAnchorStyle(ratio)}
                                    onMouseEnter={() => setHoveredWpIdx(marker.index)}
                                    onMouseLeave={() => setHoveredWpIdx(null)}
                                    onFocus={() => setHoveredWpIdx(marker.index)}
                                    onBlur={() => setHoveredWpIdx(null)}
                                    onClick={() => {
                                      if (selected) {
                                        setSelectedWpIdx(null);
                                        setFlyToPos(null);
                                        return;
                                      }
                                      setSelectedWpIdx(marker.index);
                                      setFlyToPos(marker.location);
                                    }}
                                  >
                                    <i aria-hidden="true" style={{ background: LANE_META[lane].color }} />
                                    <span>{marker.name}</span>
                                    <span className="event-pip-km">{(marker.distanceM / 1000).toFixed(1)}</span>
                                  </button>
                                );
                              })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {/* 웨이포인트 테이블 */}
          {waypointRows.length > 0 && (
            <Card padding="none" style={{ padding: 0 }}>
              <div className="flex items-center justify-between" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line-soft)" }}>
                <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("label.waypoints")}</div>
                <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{t("create.itemCount", { count: waypointRows.length })}</div>
              </div>
              <div style={{ overflowX: "auto", overscrollBehavior: "contain" }}>
              <table style={{ minWidth: 560, width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                <thead>
                  <tr style={{ background: "var(--bg-2)" }}>
                    {["#", t("detail.col.name"), t("detail.col.type"), t("distance"), t("detail.col.elevation")].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          textAlign: i === 0 || i >= 3 ? "right" : "left",
                          padding: "10px 16px",
                          fontSize: "var(--fs-xs)",
                          letterSpacing: "0.06em",
                          color: "var(--ink-3)",
                          fontWeight: 500,
                          textTransform: "uppercase",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {waypointRows.map((w, i) => {
                    const m = LANE_META[w.lane];
                    return (
                      <tr key={`${w.name}-${i}`} style={{ borderTop: "1px solid var(--line-soft)" }}>
                        <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", color: "var(--ink-3)", textAlign: "right" }}>
                          {String(i + 1).padStart(2, "0")}
                        </td>
                        <td style={{ padding: "10px 16px", color: "var(--ink-0)" }}>{w.name}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", color: m.color, fontSize: "var(--fs-xs)", fontWeight: 500 }}>
                            <span aria-hidden="true">{m.icon}</span> {m.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
                          {w.km.toFixed(1)} km
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
                          {w.ele} m
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </Card>
          )}

          {/* 연결된 코스 */}
          {linkedCourses.length > 0 && (
            <Card padding="none" style={{ padding: 'var(--space-5)' }}>
              <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("field.course")}</h2>
              <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
                {linkedCourses.map((course) => (
                  <div
                    key={course.id}
                    className="flex items-center justify-between"
                    style={{ padding: "var(--space-3)", background: "var(--bg-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md, 6px)" }}
                  >
                    <div>
                      <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{course.name}</div>
                      <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-0-5)", fontFamily: "var(--font-mono)" }}>
                        {(course.distance / 1000).toFixed(1)}km · ↑{Math.round(course.elevationGain)}m
                      </div>
                    </div>
                    <div className="flex" style={{ gap: 'var(--space-2)' }}>
                      <Button type="button" onClick={() => navigate(`/course/${course.id}`)} variant="secondary" size="sm">
                        {t("action.viewDetails")}
                      </Button>
                      {isHost && (
                        <Button
                          type="button"
                          onClick={() => handleSendCourseToParticipants(course)}
                          disabled={sending} variant="primary" size="sm" className="disabled:opacity-50"
                        >
                          {t("detail.button.sendToParticipants")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 대회 안내 */}
          {event.description && (
            <Card padding="none" style={{ padding: 'var(--space-5)' }}>
              <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("label.eventGuide")}</h2>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "var(--fs-sm)", color: "var(--ink-1)", lineHeight: 1.7, margin: 0 }}>
                {event.description}
              </pre>
            </Card>
          )}
        </div>

        {/* 사이드바 */}
        <aside className="event-detail-aside" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", alignSelf: "start", position: "sticky", top: 68 }}>
          {activeGroupId && (
            <Card padding="none" style={{ padding: "var(--space-4)", borderColor: "color-mix(in oklch, var(--aqua) 30%, var(--line-soft))" }}>
              <Text as="div" variant="eyebrow">{t("group.hostLabel")}</Text>
              <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)", marginTop: "var(--space-1)" }}>{group?.name || t("group.fallbackName")}</div>
              {nextEventLabels.get(activeGroupId) && (
                <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-2)" }}>
                  {t("group.nextEvent")}: {nextEventLabels.get(activeGroupId)}
                </div>
              )}
              <div className="flex flex-wrap" style={{ gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                <Link to={`/group/${activeGroupId}`}>
                  <Button type="button" variant="primary" size="sm">{t("group.viewAndJoin")}</Button>
                </Link>
                {nextEvents.get(activeGroupId) && (
                  <Link to={`/event/${nextEvents.get(activeGroupId)!.id}`}>
                    <Button type="button" variant="secondary" size="sm">{t("group.viewNextEvent")}</Button>
                  </Link>
                )}
                <a href={`https://${getRuntimeConfig().firebaseFunctionsRegion || "us-central1"}-${getRuntimeConfig().firebaseProjectId}.cloudfunctions.net/groupEventCalendar?groupId=${encodeURIComponent(activeGroupId)}`}>
                  <Button type="button" variant="secondary" size="sm">📅 {t("group.subscribeCalendar")}</Button>
                </a>
              </div>
            </Card>
          )}
          {/* 참가 현황 */}
          <Card padding="none" style={{ padding: "var(--space-4)" }}>
            <h2 className="text-[length:var(--fs-sm)] font-semibold mb-2" style={{ color: "var(--ink-1)" }}>{t("label.recruitmentStatus")}</h2>
            <div className="flex items-baseline" style={{ gap: "var(--space-1-5)" }}>
              <span style={{ fontSize: "var(--fs-3xl)", fontWeight: 600, color: "var(--ink-0)" }}>{participantCount}</span>
              {event.maxParticipants ? (
                <Text variant="unit" style={{ color: "var(--ink-3)" }}>/ {event.maxParticipants}{t("detail.unit.person")}</Text>
              ) : (
                <Text variant="unit" style={{ color: "var(--ink-3)" }}>{t("detail.unit.person")}</Text>
              )}
            </div>
            {fillPct != null && event.maxParticipants && (
              <>
                <div style={{ marginTop: "var(--space-2)", height: 4, background: "var(--bg-3)", borderRadius: "var(--r-xs)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${fillPct}%`,
                      height: "100%",
                      background: fillPct > 80 ? "var(--amber)" : "var(--lime)",
                    }}
                  />
                </div>
                <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-1-5)", fontFamily: "var(--font-mono)" }}>
                  {t("label.fillRate")} {fillPct}% · {t("label.remaining")} {Math.max(0, event.maxParticipants - participantCount)}{t("detail.unit.person")}
                </div>
              </>
            )}
            <div
              className="flex flex-col"
              style={{ borderTop: "1px solid var(--line-soft)", marginTop: "var(--space-3)", paddingTop: 14, gap: 'var(--space-2)', fontSize: "var(--fs-xs)" }}
            >
              <div className="flex justify-between">
                <span style={{ color: "var(--ink-3)" }}>{t("label.categories")}</span>
                <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
                  {event.categories && event.categories.length > 0
                    ? event.categories.map((c) => c.name).join(" / ")
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--ink-3)" }}>{t("label.entryFee")}</span>
                <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
                  {event.entryFee != null ? `₩ ${event.entryFee.toLocaleString("ko-KR")}` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--ink-3)" }}>{t("label.cutoff")}</span>
                <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
                  {event.cutoffMs ? t("detail.cutoffHours", { count: Math.round(event.cutoffMs / 3_600_000) }) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--ink-3)" }}>{t("label.bibDistribution")}</span>
                <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>{event.bibStartTime ?? "—"}</span>
              </div>
            </div>
          </Card>

          {/* 최근 참가자 */}
          <Card padding="none" style={{ padding: "var(--space-4)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("label.recentParticipants")}</h2>
              <button
                type="button"
                onClick={() => navigate(`/event/${eventId}/participants`)}
                style={{ background: "none", border: "none", fontSize: "var(--fs-xs)", color: "var(--ink-3)", cursor: "pointer", padding: 0 }}
              >
                {t("action.viewAll")}
              </button>
            </div>
            {recentParticipants.length === 0 ? (
              <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("empty.noParticipants")}</p>
            ) : (
              <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
                {recentParticipants.map((p) => (
                  <div key={p.uid} className="flex items-center" style={{ gap: "var(--space-2)" }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "var(--bg-3)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "var(--fs-xs)",
                        color: "var(--ink-2)",
                        fontWeight: 500,
                      }}
                    >
                      {p.nickname.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[length:var(--fs-xs)] truncate" style={{ color: "var(--ink-1)" }}>{p.nickname}</div>
                      {p.category && <div style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>{p.category}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Host menu */}
          {isHost && (
            <Card padding="none"
              style={{ padding: "var(--space-4)", borderColor: "color-mix(in oklch, var(--amber) 30%, var(--line-soft))" }}
            >
              <div className="flex items-center" style={{ gap: "var(--space-1-5)", marginBottom: "var(--space-2)" }}>
                <span aria-hidden="true">⚙️</span>
                <Text variant="eyebrow" style={{ color: "var(--amber)" }}>{t("label.hostMenu")}</Text>
              </div>
              <div className="flex flex-col" style={{ gap: "var(--space-1-5)" }}>
                {(event.status === "DRAFT" || event.status === "OPEN") && (
                  <Button
                    type="button"
                    onClick={() => navigate(`/event/${eventId}/edit`)} variant="secondary" size="sm"
                    style={{ justifyContent: "flex-start", width: "100%" }}
                  >
                    ✏️ {t("action.editEvent")}
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => linkedCourses[0] && handleSendCourseToParticipants(linkedCourses[0])}
                  disabled={sending || linkedCourses.length === 0} variant="secondary" size="sm" className="disabled:opacity-50"
                  style={{ justifyContent: "flex-start", width: "100%" }}
                >
                  📤 {t("action.sendCourse")}
                </Button>
                <Button
                  type="button"
                  onClick={() => navigate(`/event/${eventId}/participants`)} variant="secondary" size="sm"
                  style={{ justifyContent: "flex-start", width: "100%" }}
                >
                  👥 {t("action.manageParticipants")}
                </Button>
                {event.status === "OPEN" && (
                  <Button
                    type="button"
                    onClick={() => setShowStartConfirm(true)}
                    disabled={starting} variant="primary" size="sm" className="disabled:opacity-50"
                    style={{ justifyContent: "flex-start", width: "100%" }}
                  >
                    {starting ? t("detail.button.starting") : `▶ ${t("button.start")}`}
                  </Button>
                )}
              </div>
            </Card>
          )}
        </aside>
      </div>

      {/* 좁은 뷰포트: 사이드바 아래로 stack */}
      <style>{`
        @media (max-width: 1024px) {
          .event-detail-body { grid-template-columns: 1fr !important; }
          .event-detail-aside { position: static !important; }
        }
      `}</style>

      {/* 이벤트 시작 확인 모달 */}
      {showStartConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--bg-0) 60%, transparent)", display: "grid", placeItems: "center", zIndex: 100 }}
          onClick={() => setShowStartConfirm(false)}
        >
          <Card padding="none"
            style={{ padding: 'var(--space-6)', maxWidth: 440, width: "90%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex" style={{ gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "color-mix(in oklch, var(--lime) 15%, var(--bg-2))",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  fontSize: "var(--fs-lg)",
                  color: "var(--lime)",
                }}
              >
                ▶
              </div>
              <div>
                <div className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: "var(--space-1-5)" }}>
                  {t("confirm.startEvent")}
                </div>
                <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", lineHeight: 1.5 }}>
                  {t("detail.confirm.startEventWithCount", { count: participantCount })}
                </div>
              </div>
            </div>
            <div className="flex justify-end" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <Button type="button" onClick={() => setShowStartConfirm(false)} variant="secondary" size="sm">
                {t("detail.button.goBack")}
              </Button>
              <Button
                type="button"
                onClick={handleStartEvent}
                disabled={starting} variant="primary" size="sm" className="disabled:opacity-50"
              >
                {starting ? t("detail.button.starting") : `▶ ${t("button.start")}`}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Toast — 우상단 */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 72,
            right: 24,
            maxWidth: 400,
            padding: "var(--space-3) var(--space-4)",
            background: "color-mix(in oklch, var(--lime) 12%, var(--bg-2))",
            border: "1px solid var(--lime)",
            borderRadius: "var(--r-sm)",
            fontSize: "var(--fs-xs)",
            color: "var(--ink-0)",
            display: "flex",
            gap: "var(--space-2)",
            alignItems: "flex-start",
            boxShadow: "var(--shadow-lg)",
            zIndex: 200,
          }}
        >
          <span aria-hidden="true">✓</span>
          {toast}
        </div>
      )}
    </>
  );
}
