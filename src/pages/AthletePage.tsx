import { createGearInspection, inspectGear as runGearInspection } from "../services/athleteGearInspection";
import { planCalendarDate } from "@shared/training/planDate";
import { createYearReadSession } from "../hooks/yearActivitiesRead";
import { parseAthleteProfile, callAthleteProfile, loadAthleteProfilePreview, type AthleteProfileTotals, type AthletePreview, type AthleteHighlight, type AthletePreviewCursor } from "../services/athleteProfile";
import type { AthletePhoto } from "../components/athlete/AthletePhotoGallery";
import { useAthletePublicPeriod } from "../hooks/useAthletePublicPeriod";
import AthletePublicPeriodExplorer from "../components/athlete/AthletePublicPeriodExplorer";
import { loadActivityDiscovery } from "../services/activityDiscovery";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadSegmentMetadataPage } from "../services/segmentMetadata";
import { isSportUiEnabled } from "../config/sportFeatures";
import { acceptedStatsActivities, acceptedTrainingActivities } from "../utils/estimateTSS";
import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { useLocalizedNavigate } from "../hooks/useLocalizedNavigate";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import {
  collection, query, where, orderBy, getDocs, limit, startAfter,
  doc, getDoc,
  type QueryDocumentSnapshot, type DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";

import { useToast } from "../contexts/ToastContext";
import { useDialog } from "../contexts/DialogContext";
import { firestore, functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useDocument } from "../hooks/useFirestore";
import { useMyGroups } from "../hooks/useGroup";
import { cancelFriendRequest, sendFriendRequest } from "../hooks/useFriends";
import { useAuth } from "../contexts/AuthContext";
import { Activity as ActivityIcon, Route, Clock3, Mountain, Search, Pencil, Share2, ArrowUpRight, Trash2 } from "lucide-react";
import TabNav, { RouteTabNav } from "../components/TabNav";
import "./AthletePage.css";
import { CompactActivityCard } from "../components/mobile/MobileFeedPage";
import AthletePhotoGallery, { athletePhotoIdentity } from "../components/athlete/AthletePhotoGallery";
import AthleteRecentSummary from "../components/athlete/AthleteRecentSummary";
import { activityFeedSourceRevision, boundedFeedContent } from "../services/activityFeedContent";
import { isTrivialActivity } from "../utils/activityFilter";
import { resolveDuration } from "../utils/activityTime";
import { loadAthleteChartActivities, athleteProfileYears } from "../services/athleteMonthlyActivities";
import ActivitySubscriptionButton from "../components/profile/ActivitySubscriptionButton";
import Avatar from "../components/Avatar";
import AthleteActivityChart from "../components/athlete/AthleteActivityChart";
import type { AthletePeriod } from "../components/athlete/athleteProfilePeriods";
import { getDiscipline } from "../utils/disciplineFilter";
import type { Activity } from "@shared/types";
import type { PublicUserProfile } from "../services/publicProfiles";
import type { PdcDoc } from "@shared/types/pdc";
import { usePdc } from "../hooks/usePdc";
import { Button, Card, Chip, Text, Input, Select, buttonClass } from "../theme/components";
import SafeImage from "../components/SafeImage";
import { hasDefinitiveRiderProfile } from "@shared/training/pdcRiderGate";
import { ICON_SIZE } from "../theme/tokens/icon";

function uniquePhotos(photos: AthletePhoto[]) {
  const seen = new Set<string>();
  return photos.filter(photo => {
    const key = athletePhotoIdentity(photo);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function mostUrgentGear(activities: Activity[]): Activity["gear"] | null {
  const byName = new Map<string, NonNullable<Activity["gear"]>>();
  for (const activity of activities) {
    const gear = activity.gear;
    if (!gear?.name || !gear.maxDistanceKm) continue;
    const prev = byName.get(gear.name);
    if (!prev || gear.totalDistanceKm > prev.totalDistanceKm) byName.set(gear.name, gear);
  }
  return Array.from(byName.values())
    .sort((a, b) => (a.maxDistanceKm! - a.totalDistanceKm) - (b.maxDistanceKm! - b.totalDistanceKm))[0] ?? null;
}

function AthleteIdentityChips({
  pdc,
  activities,
}: {
  pdc: PdcDoc | null;
  activities: Activity[];
}) {
  const { t } = useTranslation("athlete");
  const { t: tFitness } = useTranslation("fitness");
  const chips: ReactNode[] = [];

  if (hasDefinitiveRiderProfile(pdc)) {
    chips.push(
      <Chip key="riderType" variant="accent" dot>
        {tFitness(`riderType.type.${pdc.riderType.type}.label`)}
      </Chip>,
    );
  }

  if (pdc?.stamina != null && Number.isFinite(pdc.stamina)) {
    const pct = Math.max(0, Math.min(100, Math.round(pdc.stamina * 100)));
    chips.push(
      <span key="stamina" className="inline-flex items-center gap-2 rounded-[var(--r-xl)] border border-[var(--line-soft)] px-2.5 py-1">
        <Text as="span" variant="eyebrow" style={{ color: "var(--ink-2)" }}>{t("identity.stamina")}</Text>
        <span style={{ width: 46, height: 5, borderRadius: "var(--r-xl)", background: "var(--bg-3)", overflow: "hidden" }}>
          <span style={{ display: "block", width: `${pct}%`, height: "100%", background: "var(--aqua)" }} />
        </span>
        <Text as="span" variant="mono" style={{ color: "var(--ink-1)" }}>{pct}</Text>
      </span>,
    );
  }

  const gear = mostUrgentGear(activities);
  if (gear?.maxDistanceKm) {
    const remaining = Math.round(gear.maxDistanceKm - gear.totalDistanceKm);
    chips.push(
      <Chip key="gear" variant={remaining <= 0 ? "warning" : "default"} dot>
        {remaining <= 0
          ? t("identity.gearOverdue", { name: gear.name, distance: Math.abs(remaining).toLocaleString() })
          : t("identity.gearRemaining", { name: gear.name, distance: remaining.toLocaleString() })}
      </Chip>,
    );
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" style={{ marginTop: "var(--space-3)" }}>
      {chips}
    </div>
  );
}

/** meUserId: /athlete/me 라우트가 로그인 uid 로 해석해 넘긴다. 없으면 :userId 파라미터. */
export default function AthletePage({ meUserId }: { meUserId?: string } = {}) {
  const services = useFirebaseServices();
  const { userId: paramUserId } = useParams<{ userId: string }>();
  const userId = meUserId ?? paramUserId;
  const { user: currentUser, profile: currentProfile, loading: authLoading } = useAuth();
  const location = useLocation();
  const localizedNavigate = useLocalizedNavigate();
  const ownRedirectDoneRef = useRef(false);
  // /athlete/<본인 uid> → 인증 확정 뒤 한 번만 /athlete/me 로 replace(쿼리·hash 보존).
  // 공유·복사 주소는 계속 uid 로 만든다.
  useEffect(() => {
    if (meUserId || authLoading || ownRedirectDoneRef.current) return;
    if (!currentUser || !paramUserId || currentUser.uid !== paramUserId) return;
    ownRedirectDoneRef.current = true;
    localizedNavigate(`/athlete/me${location.search}${location.hash}`, { replace: true });
  }, [meUserId, authLoading, currentUser, paramUserId, localizedNavigate, location.search, location.hash]);
  const { showToast } = useToast();
  const dialog = useDialog();
  const { t, i18n } = useTranslation("athlete");
  const [searchParams] = useSearchParams();
  const isOwnProfile = currentUser?.uid === userId && services.auth.currentUser?.uid === userId;
  const { groups: ownGroups, loading: groupsLoading, error: groupsError, retry: retryGroups } = useMyGroups(isOwnProfile ? userId : undefined);

  const { data: firestoreProfile, loading: profileLoading } = useDocument<PublicUserProfile>("users_public", userId);
  const { pdc } = usePdc(isOwnProfile ? userId : null);
  const ownProfileFallback: PublicUserProfile | null = useMemo(() => (
    isOwnProfile && currentProfile && userId
      ? {
          id: userId,
          nickname: currentProfile.nickname,
          photoURL: currentProfile.photoURL ?? null,
          ...(currentProfile.bio ? { bio: currentProfile.bio } : {}),
          ...(currentProfile.stats ? { stats: currentProfile.stats } : {}),
          ...(currentProfile.profilePublic != null ? { profilePublic: currentProfile.profilePublic } : {}),
          ...(currentProfile.friendRequestsAllowed != null ? { friendRequestsAllowed: currentProfile.friendRequestsAllowed } : {}),
          ...(currentProfile.primaryDiscipline ? { primaryDiscipline: currentProfile.primaryDiscipline } : {}),
        }
      : null
  ), [currentProfile, isOwnProfile, userId]);
  const profileForPage = useMemo(() => (firestoreProfile?.id === userId ? firestoreProfile : null) ?? ownProfileFallback, [firestoreProfile, ownProfileFallback, userId]);

  const ACTIVITIES_PAGE_SIZE = 20;
  const [displayActivities, setDisplayActivities] = useState<Activity[]>([]);
  const [activityAttempt, setActivityAttempt] = useState(0);
  const [ownerActivityError, setOwnerActivityError] = useState(false);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const [publicSearchCursor, setPublicSearchCursor] = useState<string | null>(null);
  const [publicSearchError, setPublicSearchError] = useState(false);
  const [publicActivityCursor, setPublicActivityCursor] = useState<string | null>(null);
  const profileReadIdentity = useRef({ userId, viewer: services.auth.currentUser, auth: services.auth, database: services.firestore, functions: services.functions });
  if (profileReadIdentity.current.userId !== userId || profileReadIdentity.current.viewer !== services.auth.currentUser || profileReadIdentity.current.auth !== services.auth || profileReadIdentity.current.database !== services.firestore || profileReadIdentity.current.functions !== services.functions) profileReadIdentity.current = { userId, viewer: services.auth.currentUser, auth: services.auth, database: services.firestore, functions: services.functions };
  const readIdentity = profileReadIdentity.current;
  const [viewIdentity, setViewIdentity] = useState(readIdentity);
  useEffect(() => { setViewIdentity(readIdentity); }, [readIdentity]);
  const [lastActivityDoc, setLastActivityDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [chartScope, setChartScope] = useState<{ identity: typeof readIdentity; year: number } | null>(null);
  const [ownChartActivities, setChartActivities] = useState<Activity[]>([]);
  const [ownChartLoading, setChartLoading] = useState(true);
  const [ownChartError, setChartError] = useState(false);

  const [chartAttempt, setChartAttempt] = useState(0);
  const [chartYear, setChartYear] = useState(() => planCalendarDate(Date.now()).getUTCFullYear());
  const chartSessionRef = useRef(createYearReadSession(userId ?? "", services));
  if (chartSessionRef.current.uid !== (userId ?? "") || chartSessionRef.current.owner !== services.auth.currentUser || chartSessionRef.current.auth !== services.auth || chartSessionRef.current.firestore !== services.firestore || !chartSessionRef.current.valid) {
    chartSessionRef.current.valid = false;
    chartSessionRef.current = createYearReadSession(userId ?? "", services);
  }
  const chartSession = chartSessionRef.current;
  useEffect(() => { chartSession.valid = true; return () => { chartSession.valid = false; }; }, [chartSession]);
  const [profileTotals, setProfileTotals] = useState<{ identity: typeof readIdentity; value: AthleteProfileTotals; attempt: number } | null>(null);
  const [totalsError, setTotalsError] = useState(false);
  const [totalsAttempt, setTotalsAttempt] = useState(0);
  const totalsRetry = useRef<{ identity: typeof readIdentity; epoch: string | undefined; attempt: number } | null>(null);
  const liveTotals = parseAthleteProfile((currentProfile as unknown as { athleteProfile?: unknown } | null)?.athleteProfile, userId ?? "");
  const ensuredTotals = profileTotals?.identity === readIdentity ? profileTotals.value : null;
  const latestTotals = ensuredTotals && (!liveTotals || liveTotals.epoch === ensuredTotals.epoch)
    ? liveTotals && liveTotals.revision >= ensuredTotals.revision ? liveTotals : ensuredTotals : null;
  // 숫자 작업 실패는 같은 세대의 단순 합계 업데이트로 해제하지 않는다.
  const ownerTotals = latestTotals && ensuredTotals?.state === "failed"
    ? { ...latestTotals, state: "failed" as const, integrityFailed: ensuredTotals.integrityFailed } : latestTotals;
  useEffect(() => {
    let cancelled = false;
    if (isOwnProfile && profileTotals?.identity === readIdentity && profileTotals.value.epoch === liveTotals?.epoch && profileTotals.attempt === totalsAttempt) return;
    setProfileTotals(value => value?.identity === readIdentity && (!liveTotals || liveTotals.epoch === value.value.epoch) ? value : null);
    setTotalsError(false);
    if (!isOwnProfile || !userId) return;
    const explicit = totalsRetry.current;
    const retry = explicit?.identity === readIdentity && explicit.attempt === totalsAttempt && explicit.epoch === (ensuredTotals?.epoch ?? liveTotals?.epoch);
    totalsRetry.current = null;
    void callAthleteProfile<unknown>(services, userId, "ensureAthleteProfile", { retry }, () => !cancelled && profileReadIdentity.current === readIdentity)
      .then(value => { if (cancelled) return; const root = parseAthleteProfile(value, userId); if (!root) throw new Error("athlete-profile-invalid-root"); setProfileTotals({ identity: readIdentity, value: root, attempt: totalsAttempt }); })
      .catch(() => { if (!cancelled) setTotalsError(true); });
    return () => { cancelled = true; };
  }, [userId, isOwnProfile, totalsAttempt, readIdentity, liveTotals?.epoch]);
  const [ownerPhotos, setOwnerPhotos] = useState<AthletePhoto[]>([]);
  const [ownerHighlights, setOwnerHighlights] = useState<AthleteHighlight[]>([]);
  const [photoCursor, setPhotoCursor] = useState<AthletePreviewCursor | null>(null);
  const [highlightCursor, setHighlightCursor] = useState<AthletePreviewCursor | null>(null);
  type MediaKind = "photos" | "highlights";
  const [mediaVisible, setMediaVisible] = useState({ photos: 6, highlights: 12 });
  const [mediaOrders, setMediaOrders] = useState<Record<MediaKind, "recent" | "all">>({ photos: "recent", highlights: "recent" });
  const [mediaComplete, setMediaComplete] = useState({ photos: false, highlights: false });
  const [mediaLoading, setMediaLoading] = useState({ photos: false, highlights: false });
  const [mediaPending, setMediaPending] = useState({ photos: 0, highlights: 0 });
  type MediaPage = { input: AthletePreviewCursor | null; page: AthletePreview<AthletePhoto | AthleteHighlight> };
  const [mediaErrors, setMediaErrors] = useState({ photos: false, highlights: false });
  const mediaScopeRef = useRef({ identity: readIdentity, epoch: ownerTotals?.epoch, active: true, busy: new Set<MediaKind>(), pages: { photos: new Map<string, MediaPage>(), highlights: new Map<string, MediaPage>() } });
  if (mediaScopeRef.current.identity !== readIdentity || mediaScopeRef.current.epoch !== ownerTotals?.epoch)
    mediaScopeRef.current = { identity: readIdentity, epoch: ownerTotals?.epoch, active: true, busy: new Set<MediaKind>(), pages: { photos: new Map<string, MediaPage>(), highlights: new Map<string, MediaPage>() } };
  const mediaScope = mediaScopeRef.current;
  const [loadedMediaScope, setLoadedMediaScope] = useState<typeof mediaScope | null>(null);
  const mediaCurrent = loadedMediaScope === mediaScope;
  const lastMediaRequest = useRef<Partial<Record<MediaKind, { cursor: AthletePreviewCursor | null; all: boolean; replace: boolean }>>>({});
  const fetchPreview = async (kind: MediaKind, cursor: AthletePreviewCursor | null, all: boolean, replace: boolean, revealFrom?: number) => {
    if (!userId || !isOwnProfile || !ownerTotals?.epoch || !mediaScope.epoch || mediaScope.busy.has(kind)) return;
    const scope = mediaScope;
    const current = () => scope.active && mediaScopeRef.current === scope;
    scope.busy.add(kind);
    lastMediaRequest.current[kind] = { cursor, all, replace };
    setMediaLoading(value => ({ ...value, [kind]: true }));
    setMediaErrors(value => ({ ...value, [kind]: false }));
    try {
      const page = await loadAthleteProfilePreview<AthletePhoto | AthleteHighlight>(services, userId, kind, scope.epoch!, cursor, all, current);
      if (!current()) return;
      const inputKey = JSON.stringify(cursor);
      const pages = scope.pages[kind];
      if (!replace) {
        const previous = pages.get(inputKey);
        if (previous && JSON.stringify(previous.page.nextCursor) !== JSON.stringify(page.nextCursor)) throw new Error("athlete-preview-inventory-changed");
        if (page.nextCursor && [...pages].some(([key, entry]) => key !== inputKey && JSON.stringify(entry.page.nextCursor) === JSON.stringify(page.nextCursor))) throw new Error("athlete-preview-cursor-repeated");
      }
      if (replace) {
        const previousOrder = pages.values().next().value?.page.scope;
        if (previousOrder !== page.scope) setMediaVisible(value => ({ ...value, [kind]: kind === "photos" ? 6 : 12 }));
        pages.clear();
      }
      pages.set(inputKey, { input: cursor, page });
      const snapshots = [...pages.values()];
      const items = snapshots.flatMap(entry => entry.page.items);
      const frontier = snapshots[snapshots.length - 1]!.page;
      if (revealFrom !== undefined) setMediaVisible(value => ({ ...value, [kind]: Math.max(value[kind], revealFrom + (kind === "photos" ? 6 : 12)) }));
      if (kind === "photos") { setOwnerPhotos(items as AthletePhoto[]); setPhotoCursor(frontier.nextCursor); }
      else { setOwnerHighlights(items as AthleteHighlight[]); setHighlightCursor(frontier.nextCursor); }
      setMediaOrders(value => ({ ...value, [kind]: page.scope }));
      setMediaComplete(value => ({ ...value, [kind]: frontier.complete && snapshots.every(entry => entry.page.coverageComplete) }));
      setMediaPending(value => ({ ...value, [kind]: snapshots.reduce((sum, entry) => sum + entry.page.pendingCount, 0) }));
      setLoadedMediaScope(scope);
    } catch (error) {
      if (current()) { logClientError("AthletePage.preview", error, { kind }); setMediaErrors(value => ({ ...value, [kind]: true })); }
    } finally {
      scope.busy.delete(kind);
      if (current()) setMediaLoading(value => ({ ...value, [kind]: false }));
    }
  };
  const loadOlderPreview = (kind: MediaKind) => {
    const count = kind === "photos" ? uniquePhotos(ownerPhotos).length : ownerHighlights.length;
    if (mediaVisible[kind] < count) {
      setMediaVisible(value => ({ ...value, [kind]: Math.min(count, value[kind] + (kind === "photos" ? 6 : 12)) }));
      return;
    }
    const cursor = kind === "photos" ? photoCursor : highlightCursor;
    if (cursor) void fetchPreview(kind, cursor, mediaOrders[kind] === "all", false, count);
  };
  const retryPreview = (kind: MediaKind) => {
    const pending = [...mediaScope.pages[kind].values()].find(entry => !entry.page.coverageComplete);
    const request = pending ? { cursor: pending.input, all: pending.page.scope === "all", replace: false } : lastMediaRequest.current[kind];
    if (request) void fetchPreview(kind, request.cursor, request.all, request.replace);
  };
  const gearSessionRef = useRef(createGearInspection(userId ?? "", services));
  if (gearSessionRef.current.uid !== (userId ?? "") || gearSessionRef.current.owner !== services.auth.currentUser || gearSessionRef.current.auth !== services.auth || gearSessionRef.current.database !== services.firestore || gearSessionRef.current.functions !== services.functions) {
    gearSessionRef.current.valid = false;
    gearSessionRef.current = createGearInspection(userId ?? "", services);
  }
  const gearSession = gearSessionRef.current;
  useEffect(() => {
    gearSession.valid = true;
    setGearBusy(false); setGearError(false); setGearLimited(false);
    return () => { gearSession.valid = false; gearSession.paused = true; };
  }, [gearSession]);
  const [gearBusy, setGearBusy] = useState(false);
  const [gearError, setGearError] = useState(false);
  const [gearLimited, setGearLimited] = useState(false);
  const [, setGearVersion] = useState(0);
  const inspectGear = async (all = false) => {
    if (!isOwnProfile || gearBusy) return;
    const session = gearSessionRef.current;
    setGearBusy(true); setGearError(false); setGearLimited(false);
    try { const result = await runGearInspection(session, services, () => gearSessionRef.current === session, all); if (gearSessionRef.current === session) setGearLimited(result.limited); }
    catch { if (gearSessionRef.current === session) setGearError(true); }
    finally { if (gearSessionRef.current === session) { setGearBusy(false); setGearVersion(value => value + 1); } }
  };

  useEffect(() => {
    mediaScope.active = true;
    setOwnerPhotos([]); setOwnerHighlights([]); setPhotoCursor(null); setHighlightCursor(null);
    setLoadedMediaScope(null); setMediaVisible({ photos: 6, highlights: 12 }); setMediaComplete({ photos: false, highlights: false }); setMediaPending({ photos: 0, highlights: 0 });
    setMediaLoading({ photos: false, highlights: false }); setMediaErrors({ photos: false, highlights: false });
    setMediaOrders({ photos: "recent", highlights: "recent" }); lastMediaRequest.current = {};
    if (!isOwnProfile || !ownerTotals?.epoch) return;
    void fetchPreview("photos", null, false, true);
    void fetchPreview("highlights", null, false, true);
    return () => { mediaScope.active = false; };
  }, [isOwnProfile, mediaScope]);

  // My segments
  const [mySegments, setMySegments] = useState<{ id: string; name: string; distance: number; status: string; createdAt: number }[]>([]);
  const [segmentCursor, setSegmentCursor] = useState<string | null>(null);
  const [segmentsMore, setSegmentsMore] = useState(false);
  const [segmentsBusy, setSegmentsBusy] = useState(false);
  const segmentScope = useRef(userId);
  segmentScope.current = userId;
  const loadMoreSegments = async () => {
    if (!userId || !segmentCursor || segmentsBusy) return;
    const scope = userId;
    setSegmentsBusy(true);
    try {
      const page = await loadSegmentMetadataPage({ mode: "creator", creatorUid: scope, cursor: segmentCursor });
      if (segmentScope.current !== scope) return;
      setMySegments(previous => [...previous, ...page.items.map(data => ({ id: data.id, name: String(data.name ?? ""), distance: Number(data.distance ?? 0), status: String(data.status ?? "active"), createdAt: Number(data.createdAt ?? 0) }))]);
      setSegmentCursor(page.cursor); setSegmentsMore(page.hasMore);
    } catch (error) { logClientError("AthletePage.moreSegments", error); }
    finally { if (segmentScope.current === scope) setSegmentsBusy(false); }
  };


  // Friend state: 'none' | 'request_sent' | 'request_received' | 'friends'
  const [friendStatus, setFriendStatus] = useState<"none" | "request_sent" | "request_received" | "friends">("none");
  const profileReadReady = isOwnProfile || !profileLoading;
  const activityAccessAllowed = isOwnProfile || profileForPage?.profilePublic !== false || friendStatus === "friends";
  const publicGlobal = useAthletePublicPeriod(userId ?? "", "", "", !!userId && !isOwnProfile && !profileLoading && (profileForPage?.profilePublic !== false || friendStatus === "friends"), true);
  const chartCurrent = chartScope?.identity === readIdentity && chartScope.year === chartYear;
  const chartActivities = isOwnProfile ? chartCurrent ? ownChartActivities : [] : publicGlobal.items;
  const chartLoading = isOwnProfile ? ownChartLoading || !chartCurrent && !ownChartError : publicGlobal.status === "loading";
  const chartError = isOwnProfile ? ownChartError : publicGlobal.status !== "complete";
  const chartLimited = !isOwnProfile && publicGlobal.status === "limit";

  const [relationshipLoading, setRelationshipLoading] = useState(true);
  const [friendLoading, setFriendLoading] = useState(false);
  const autoInviteAttemptRef = useRef<string | null>(null);
  const [friendCount, setFriendCount] = useState(0);

  // Friend list
  const [friends, setFriends] = useState<{ userId: string; nickname: string; profileImage: string | null }[]>([]);

  // Activity filter & search
  const [filterType, setFilterType] = useState<"all" | "ride" | "strava">("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Activity[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const isSearchActive = searchQuery.length > 0;
  const [profileTab, setProfileTab] = useState<"overview" | "activities" | "photos" | "achievements" | "segments">("overview");
  const [sport, setSport] = useState("all");
  const [selectedPeriod, setSelectedPeriod] = useState<AthletePeriod | null>(null);
  const [periodLimit, setPeriodLimit] = useState(20);
  useEffect(() => { setProfileTab("overview"); setSelectedPeriod(null); setSport("all"); setSearchInput(""); setSearchQuery(""); setSearchResults([]); setFilterType("all"); }, [userId]);
  useEffect(() => setPeriodLimit(20), [selectedPeriod, sport]);

  // summary 필드가 없는 비정상 문서는 다운스트림 통계 계산에서 크래시를 유발하므로 제외.
  const docsToActivities = (
    docs: import("firebase/firestore").QueryDocumentSnapshot<import("firebase/firestore").DocumentData>[],
  ): Activity[] =>
    docs
      .map((d) => ({ id: d.id, ...d.data() }) as Activity)
      .filter((a) => a.summary != null);

  // 월간 누적 로더(loadAthleteChartActivities)는 summary 가 없는 활동도 건수에 넣어 돌려주므로
  // 합계는 summary 가 있는 활동만 더한다. 본인 프로필(/athlete/me)에서 실제로 크래시가 났던 지점.
  const aggregateActivityStats = (items: Activity[]) => {
    return {
      count: items.length,
      distance: items.reduce((sumDistance, a) => sumDistance + (Number.isFinite(a.summary?.distance) ? a.summary.distance : 0), 0),
      time: items.reduce((sumTime, a) => {
        const duration = a.summary ? resolveDuration(a.summary).displayMs : NaN;
        return sumTime + (Number.isFinite(duration) ? duration : 0);
      }, 0),
      elevation: items.reduce((sumElevation, a) => sumElevation + (Number.isFinite(a.summary?.elevationGain) ? a.summary.elevationGain : 0), 0),
    };
  };

  useEffect(() => {
    if (!userId) return;
    if (!profileReadReady) return;
    if (!activityAccessAllowed) {
      setActivitiesLoading(false);
      setDisplayActivities([]);
      setLastActivityDoc(null);
      setHasMoreActivities(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setActivitiesLoading(true);
      setOwnerActivityError(false);
      setDisplayActivities([]);
      setLastActivityDoc(null);
      setPublicActivityCursor(null);
      setHasMoreActivities(true);

      try {
        if (!isOwnProfile) {
          const page = await loadActivityDiscovery(services, { scope: "athlete", targetUid: userId, limit: ACTIVITIES_PAGE_SIZE });
          if (cancelled) return;
          setDisplayActivities(page.items); setPublicActivityCursor(page.nextCursor); setHasMoreActivities(!page.exhausted);
          return;
        }
        const constraints = [
          where("userId", "==", userId),
          where("deletedAt", "==", null),
          ...(!isOwnProfile ? [where("visibility", "==", "everyone")] : []),
          // 목록 순서는 업로드 시각이 아니라 실제 운동 시각 기준 — 카드에 찍힌 날짜와
          // 순서가 어긋나지 않게 한다. 더보기(startAfter)도 같은 키를 쓴다.
          // 인덱스: 본인 프로필은 `deletedAt, userId, startTime DESC`,
          // 타인 프로필(visibility 필터 추가)은 `userId, deletedAt, visibility, startTime DESC`.
          // 둘 다 orider-g1-web `firestore/firestore.indexes.json` 에 있다(후자는 #2362 로 추가).
          orderBy("startTime", "desc"),
          limit(ACTIVITIES_PAGE_SIZE),
        ];
        const q = query(collection(services.firestore, "activities"), ...constraints);
        const snap = await getDocs(q);
        if (cancelled) return;
        setDisplayActivities(docsToActivities(snap.docs));
        setLastActivityDoc(snap.docs[snap.docs.length - 1] ?? null);
        setHasMoreActivities(snap.docs.length === ACTIVITIES_PAGE_SIZE);
      } catch (err) {
        logClientError("AthletePage.loadActivities", err, { userId, isOwnProfile });
        if (!cancelled && isOwnProfile) setOwnerActivityError(true);
      } finally {
        if (!cancelled) setActivitiesLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [userId, isOwnProfile, profileReadReady, activityAccessAllowed, readIdentity, activityAttempt]);

  // 본인 차트는 선택한 연도와 최근 28일의 검증된 범위만 읽는다.
  useEffect(() => {
    let cancelled = false;
    setChartActivities([]);
    setChartError(false);
    setChartLoading(true);
    if (!isOwnProfile || !userId) return;
    if (!activityAccessAllowed) {
      setChartLoading(false);
      return;
    }
    void loadAthleteChartActivities(userId, isOwnProfile, () => cancelled || !chartSession.valid || profileReadIdentity.current !== readIdentity, services, chartYear, chartSession)
      .then((items) => {
        if (cancelled || !items) return;
        setChartActivities(items);
        setChartScope({ identity: readIdentity, year: chartYear });
      })
      .catch((err) => {
        if (cancelled) return;
        logClientError("AthletePage.loadChartActivities", err, { userId, isOwnProfile });
        setChartError(true);
      })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [userId, isOwnProfile, chartAttempt, chartYear, chartSession, readIdentity]);

  // 4. 서버 검색: keywords array-contains 쿼리
  const handleSearch = () => {
    const kw = searchInput.trim();
    if (!kw) return;
    setSearchQuery(kw);
  };

  // searchQuery 변경 시 서버 검색 실행
  useEffect(() => {
    if (!searchQuery || !userId) return;
    if (!profileReadReady) return;
    if (!activityAccessAllowed) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setPublicSearchCursor(null); setPublicSearchError(false);

    const token = searchQuery
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/gu)
      .filter(Boolean)[0] ?? "";

    if (!token) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const constraints = [
      where("userId", "==", userId),
      where("deletedAt", "==", null),
      ...(!isOwnProfile ? [where("visibility", "==", "everyone")] : []),
      where("keywords", "array-contains", token),
      orderBy("startTime", "desc"),
      limit(50),
    ];

    const read = isOwnProfile
      ? getDocs(query(collection(services.firestore, "activities"), ...constraints)).then(snap => docsToActivities(snap.docs))
      : loadActivityDiscovery(services, { scope: "athlete", targetUid: userId, keyword: token, limit: 20 }).then(page => { if (!cancelled) setPublicSearchCursor(page.nextCursor); return page.items; });
    read.then(items => { if (!cancelled) setSearchResults(items); }).catch(err => {
      logClientError("AthletePage.searchActivities", err, { userId }); if (!cancelled) { setSearchResults([]); setPublicSearchError(true); }
    }).finally(() => { if (!cancelled) setSearchLoading(false); });

    return () => { cancelled = true; };
  }, [searchQuery, userId, isOwnProfile, profileReadReady, activityAccessAllowed, readIdentity]);

  const loadMorePublicSearch = async () => {
    if (!userId || !publicSearchCursor || searchLoading || isOwnProfile) return;
    const identity = profileReadIdentity.current;
    setSearchLoading(true); setPublicSearchError(false);
    try {
      const keyword = searchQuery.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(Boolean)[0];
      const page = await loadActivityDiscovery(services, { scope: "athlete", targetUid: userId, keyword, limit: 20, cursor: publicSearchCursor });
      if (profileReadIdentity.current !== identity) return;
      setSearchResults(previous => [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))]); setPublicSearchCursor(page.nextCursor);
    } catch { if (profileReadIdentity.current === identity) { setSearchResults([]); setPublicSearchCursor(null); setPublicSearchError(true); } }
    finally { if (profileReadIdentity.current === identity) setSearchLoading(false); }
  };

  const handleResetSearch = () => {
    setSearchQuery("");
    setSearchInput("");
  };

  const handleLoadMoreActivities = async () => {
    if (!userId || (!lastActivityDoc && !publicActivityCursor) || loadingMore) return;
    if (!profileReadReady) return;
    if (profileForPage?.profilePublic === false && !isOwnProfile && friendStatus !== "friends") return;
    setLoadingMore(true);
    if (isOwnProfile) setOwnerActivityError(false);
    const identity = profileReadIdentity.current;
    try {
      if (!isOwnProfile) {
        const page = await loadActivityDiscovery(services, { scope: "athlete", targetUid: userId, limit: 20, ...(publicActivityCursor ? { cursor: publicActivityCursor } : {}) });
        if (profileReadIdentity.current !== identity) return;
        setDisplayActivities(previous => [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))]);
        setPublicActivityCursor(page.nextCursor); setHasMoreActivities(!page.exhausted); return;
      }
      const constraints = [
        where("userId", "==", userId),
        where("deletedAt", "==", null),
        ...(!isOwnProfile ? [where("visibility", "==", "everyone")] : []),
        orderBy("startTime", "desc"),
        limit(ACTIVITIES_PAGE_SIZE),
        startAfter(lastActivityDoc),
      ];
      const q = query(collection(services.firestore, "activities"), ...constraints);
      const snap = await getDocs(q);
      if (profileReadIdentity.current !== identity) return;
      setDisplayActivities((prev) => [...prev, ...docsToActivities(snap.docs)]);
      setLastActivityDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMoreActivities(snap.docs.length === ACTIVITIES_PAGE_SIZE);
    } catch (err) {
      logClientError("AthletePage.loadMoreActivities", err, { userId, isOwnProfile });
      if (profileReadIdentity.current === identity && isOwnProfile) setOwnerActivityError(true);
      if (profileReadIdentity.current === identity && !isOwnProfile) { setDisplayActivities([]); setPublicActivityCursor(null); setHasMoreActivities(false); }
    } finally {
      if (profileReadIdentity.current === identity) setLoadingMore(false);
    }
  };

  // Fetch my segments
  useEffect(() => {
    if (!userId) return;
    if (!profileReadReady) return;
    if (!activityAccessAllowed) {
      setMySegments([]); setSegmentsMore(false); setSegmentCursor(null);
      return;
    }
    let active = true;
    setMySegments([]); setSegmentsMore(false); setSegmentCursor(null); setSegmentsBusy(false);
    loadSegmentMetadataPage({ mode: "creator", creatorUid: userId }).then((page) => {
      if (!active) return;
      setSegmentCursor(page.cursor); setSegmentsMore(page.hasMore);
      setMySegments(page.items.map(data => ({ id: data.id, name: String(data.name ?? ""), distance: Number(data.distance ?? 0), status: String(data.status ?? "active"), createdAt: Number(data.createdAt ?? 0) })));
    }).catch((err) => logClientError("AthletePage.bg", err, {}));
    return () => { active = false; };
  }, [userId, profileReadReady, activityAccessAllowed, readIdentity]);

  // Check friend relationship
  useEffect(() => {
    if (!currentUser || !userId || currentUser.uid === userId) {
      setFriendStatus("none");
      setRelationshipLoading(false);
      return;
    }

    setRelationshipLoading(true);
    // 1. 이미 친구인지 확인
    getDoc(doc(firestore, "friends", currentUser.uid, "users", userId))
      .then((snap) => {
        if (snap.exists()) {
          setFriendStatus("friends");
          return;
        }
        // 2. 내가 요청을 보냈는지 확인
        return getDoc(doc(firestore, "friend_requests", userId, "items", currentUser.uid))
          .then((reqSnap) => {
            if (reqSnap.exists()) {
              setFriendStatus("request_sent");
              return;
            }
            // 3. 상대가 나에게 요청을 보냈는지 확인
            return getDoc(doc(firestore, "friend_requests", currentUser.uid, "items", userId))
              .then((recvSnap) => {
                setFriendStatus(recvSnap.exists() ? "request_received" : "none");
              });
          });
      })
      .catch((err) => logClientError("AthletePage.bg", err, {}))
      .finally(() => setRelationshipLoading(false));
  }, [currentUser, userId]);

  // Handle auto-friend request from invite link
  useEffect(() => {
    if (
      !currentUser ||
      !userId ||
      currentUser.uid === userId ||
      searchParams.get("action") !== "invite" ||
      profileForPage?.friendRequestsAllowed === false ||
      friendStatus !== "none" ||
      friendLoading
    ) return;

    const attemptKey = `${currentUser.uid}:${userId}`;
    if (autoInviteAttemptRef.current === attemptKey) return;
    autoInviteAttemptRef.current = attemptKey;

    handleSendFriendRequest().then((sent) => {
      if (sent) {
        showToast(t("friend.autoSent"));
      }
    });
  }, [currentUser, userId, profileForPage?.friendRequestsAllowed, friendStatus, friendLoading, searchParams, t]);

  // Fetch friend list + count
  useEffect(() => {
    if (!userId) return;
    if (!isOwnProfile) {
      setFriendCount(0);
      setFriends([]);
      return;
    }

    setFriendCount(0); setFriends([]);
    const identity = readIdentity;
    getDocs(collection(services.firestore, "friends", userId, "users"))
      .then((snap) => {
        if (profileReadIdentity.current !== identity) return;
        setFriendCount(snap.size);
        setFriends(snap.docs.map((d) => {
          const data = d.data();
          return {
            userId: d.id,
            nickname: data.nickname || "",
            profileImage: data.profileImage || null,
          };
        }));
      })
      .catch((err) => logClientError("AthletePage.bg", err, {}));
  }, [userId, isOwnProfile, readIdentity]);

  const handleSendFriendRequest = async (): Promise<boolean> => {
    if (!currentUser || !userId || friendLoading) return false;
    setFriendLoading(true);
    try {
      await sendFriendRequest({
        uid: currentUser.uid,
        nickname: currentProfile?.nickname || currentUser.displayName || "",
        profileImage: currentProfile?.photoURL || currentUser.photoURL || null,
      }, userId, services.firestore);
      setFriendStatus("request_sent");
      return true;
    } catch (err) {
      logClientError("AthletePage.handleSendFriendRequest", err, { targetUserId: userId });
      return false;
    } finally {
      setFriendLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!currentUser || !userId || friendLoading) return;
    if (!await dialog.confirm(t("friends:cancelConfirm"))) return;
    setFriendLoading(true);
    try {
      await cancelFriendRequest(currentUser.uid, userId, services.firestore);
      setFriendStatus("none");
    } catch (err) {
      logClientError("AthletePage.handleCancelRequest", err, { targetUserId: userId });
    } finally {
      setFriendLoading(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (!currentUser || !userId || friendLoading) return;
    setFriendLoading(true);
    try {
      const accept = httpsCallable(functions, "acceptFriendRequest");
      await accept({ requesterId: userId });
      setFriendStatus("friends");
      setFriendCount((c) => c + 1);
    } catch (err) {
      logClientError("AthletePage.handleAcceptRequest", err, { requesterId: userId });
    } finally {
      setFriendLoading(false);
    }
  };

  const handleRemoveFriend = async (targetId?: string) => {
    const removeId = targetId || userId;
    if (!currentUser || !removeId || friendLoading) return;
    setFriendLoading(true);
    try {
      const remove = httpsCallable<{ friendId: string }, { success?: boolean; friendId?: string }>(
        functions,
        "removeFriend",
      );
      await remove({ friendId: removeId });
      if (!targetId || targetId === userId) {
        setFriendStatus("none");
      }
      setFriendCount((c) => Math.max(0, c - 1));
      setFriends((prev) => prev.filter((f) => f.userId !== removeId));
    } catch (err) {
      logClientError("AthletePage.handleRemoveFriend", err, { targetUserId: removeId });
    } finally {
      setFriendLoading(false);
    }
  };

  const handleDeleteSegment = async (segmentId: string, segName: string) => {
    if (!(await dialog.confirm(t("segments.deleteConfirm", { name: segName }), { destructive: true }))) return;
    try {
      const fn = httpsCallable(functions, "deleteMySegment");
      await fn({ segmentId });
      setMySegments((prev) => prev.filter((s) => s.id !== segmentId));
      showToast(t("segments.deleteSuccess"));
    } catch (err) {
      const msg = (err as { message?: string }).message ?? t("segments.deleteFailed");
      void dialog.alert(msg, { variant: "danger" });
    }
  };

  const nickname = profileForPage?.nickname;
  const photoURL = profileForPage?.photoURL ?? null;
  // 프로필은 기본 공개 — 공개를 직접 끈 사용자만 비공개(설정 화면·서버 투영과 같은 기준)
  const canViewProfile = isOwnProfile || profileForPage?.profilePublic !== false || friendStatus === "friends";
  const canViewFriends = isOwnProfile;
  const canSendFriendRequest = profileForPage?.friendRequestsAllowed !== false;
  const activities = displayActivities.map((a) =>
    !a.profileImage && photoURL ? { ...a, profileImage: photoURL } : a,
  );
  const isMe = isOwnProfile;

  const acceptedChartActivities = useMemo(() => acceptedStatsActivities(chartActivities.filter(activity => activity.userId === userId)), [chartActivities, userId]);
  const acceptedLoadActivities = useMemo(() => isOwnProfile ? acceptedTrainingActivities(chartActivities.filter(activity => activity.userId === userId)) : [], [chartActivities, userId, isOwnProfile]);
  const scopedStats = useMemo(() => aggregateActivityStats(acceptedChartActivities), [acceptedChartActivities]);
  const stats = isOwnProfile && ownerTotals ? { count: ownerTotals.count, distance: ownerTotals.distance, time: ownerTotals.timeDisplayMillis, elevation: ownerTotals.elevation } : scopedStats;
  const statsReady = isOwnProfile ? ownerTotals?.state === "ready" && !totalsError : !chartLoading && !chartError;
  const ownerPhotoItems = useMemo(() => uniquePhotos(mediaCurrent ? ownerPhotos : []), [mediaCurrent, ownerPhotos]);
  const ownerHighlightItems = mediaCurrent ? ownerHighlights : [];
  const photosBuffered = isOwnProfile && ownerPhotoItems.length > mediaVisible.photos;
  const highlightsBuffered = isOwnProfile && ownerHighlightItems.length > mediaVisible.highlights;
  const recentPhotos = useMemo(() => {
    const seen = new Set<string>();
    if (isOwnProfile) return ownerPhotoItems.slice(0, mediaVisible.photos);
    return chartActivities.filter(activity => activity.userId === userId).sort((a, b) => b.startTime - a.startTime).flatMap(activity => {
      if (activity.feedContentV1?.sourceRevision !== activityFeedSourceRevision(activity)) return [];
      return (boundedFeedContent(activity.feedContentV1)?.photos ?? []).flatMap(photo => {
        const identity = athletePhotoIdentity(photo);
        if (seen.has(identity)) return [];
        seen.add(identity);
        return [{ ...photo, activityId: activity.id }];
      });
    }).slice(0, 6);
  }, [chartActivities, userId, isOwnProfile, ownerPhotoItems, mediaVisible.photos]);
  const highlights = useMemo(() => isOwnProfile ? ownerHighlightItems.slice(0, mediaVisible.highlights) : [...acceptedChartActivities].sort((a, b) => b.startTime - a.startTime).flatMap(activity => (activity.topAchievements ?? []).slice(0, 3).map(achievement => ({ ...achievement, activityId: activity.id }))).slice(0, 12), [acceptedChartActivities, isOwnProfile, ownerHighlights, mediaCurrent, mediaVisible.highlights]);

  // 검색 활성 시: 서버 검색 결과 사용
  // 비활성 시: 페이지네이션된 displayActivities 사용
  const baseActivities = useMemo(() => {
    if (!isSearchActive) return selectedPeriod || !isOwnProfile && (sport !== "all" || filterType !== "all") ? [...acceptedChartActivities].sort((a, b) => b.startTime - a.startTime) : activities;
    return searchResults.map((a) =>
      !a.profileImage && photoURL ? { ...a, profileImage: photoURL } : a,
    );
  }, [isSearchActive, activities, searchResults, photoURL, selectedPeriod, acceptedChartActivities, sport, filterType, isOwnProfile]);

  const hasLocalFilter = !!selectedPeriod || sport !== "all" || filterType !== "all";
  const filteredActivities = baseActivities.filter((a) => {
    // 측정 오류로 보이는 trivial 활동(거리<100m 또는 시간<60s) 항상 숨김.
    if (isTrivialActivity(a)) return false;
    if (selectedPeriod && (a.startTime < selectedPeriod.start || a.startTime >= selectedPeriod.end)) return false;
    if (sport !== "all" && getDiscipline(a.type) !== sport) return false;
    if (filterType === "all") return true;
    const isStrava = (a as Activity & { source?: string }).source === "strava";
    return filterType === "strava" ? isStrava : !isStrava;
  });

  if (viewIdentity !== readIdentity || profileLoading && !ownProfileFallback) {
    return (
      <div data-testid="P0.loading" className="space-y-6">
        <Card className="h-32 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} padding="none" className="rounded-[var(--r-lg)] p-4 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (profileForPage?.profilePublic === false && !canViewProfile && relationshipLoading) {
    return (
      <div className="space-y-6">
        <Card padding="none" className="rounded-[var(--r-lg)] p-8 text-center text-[var(--ink-3)]">
          {t("privacy.checking")}
        </Card>
      </div>
    );
  }

  if (!nickname) {
    return (
      <div className="text-center py-12 text-[var(--ink-3)]">
        {t("notFound")}
      </div>
    );
  }

  if (!canViewProfile) {
    return (
      <div data-testid="P0.private" className="space-y-6">
        <Card padding="none" className="rounded-[var(--r-lg)] p-8 text-center">
          {/* 사진·닉네임은 기본 공개 — 누구의 프로필인지는 보여 준다 */}
          {nickname && <div data-testid="P0.private-identity" className="mb-4 flex flex-col items-center gap-2">
            {photoURL ? <SafeImage src={photoURL} alt={nickname} fallbackLabel={nickname} className="athlete-identity__photo" referrerPolicy="no-referrer" /> : <Avatar name={nickname} size="lg" />}
            <h1 className="text-[length:var(--fs-xl)] font-bold text-[var(--ink-0)]">{nickname}</h1>
          </div>}
          <div className="text-[length:var(--fs-lg)] font-semibold text-[var(--ink-0)]">
            {t("privacy.privateTitle")}
          </div>
          <div className="mt-2 text-[length:var(--fs-sm)] text-[var(--ink-3)]">
            {t("privacy.privateDesc")}
          </div>
          {currentUser && (
            <div className="mt-5 flex justify-center gap-2">
              {friendStatus === "none" && canSendFriendRequest && (
                <Button
                  onClick={handleSendFriendRequest}
                  disabled={friendLoading}
                  className={friendLoading ? 'cursor-wait' : undefined}
                >
                  {friendLoading ? t("friend.requesting") : t("friend.request")}
                </Button>
              )}
              {friendStatus === "request_sent" && (
                <Button variant="secondary" onClick={handleCancelRequest} disabled={friendLoading}>{friendLoading ? t("friend.cancelling") : t("friend.cancelRequest")}</Button>
              )}
              {friendStatus === "request_received" && (
                <Button
                  onClick={handleAcceptRequest}
                  disabled={friendLoading}
                  className={friendLoading ? 'cursor-wait' : undefined}
                >
                  {friendLoading ? t("friend.accepting") : t("friend.accept")}
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className={`athlete-profile${recentPhotos.length ? "" : " athlete-profile--no-cover"}`} data-testid={isOwnProfile ? "P0.self" : "P0.other"}>
      <AthletePhotoGallery photos={recentPhotos.slice(0, 6)} cover />
      <div className="athlete-profile-heading">
      <section className="athlete-identity" data-testid="P0-0">
        <div className="athlete-identity__avatar">
          {photoURL ? <SafeImage src={photoURL} alt={nickname} fallbackLabel={nickname} className="athlete-identity__photo" referrerPolicy="no-referrer" /> : <Avatar name={nickname} size="lg" className="athlete-identity__photo athlete-identity__fallback" />}
        </div>
        <div>
          <h1 data-testid="P0-0-1" className="athlete-identity__name">
            {nickname}
          </h1>
          {profileForPage?.bio && <Text as="p" variant="body" tone="secondary">{profileForPage.bio}</Text>}
          {isOwnProfile && currentProfile?.stravaConnected && <Chip>Strava</Chip>}
          {profileForPage?.team && <Text as="p" variant="caption" tone="secondary">{profileForPage.team}</Text>}
          {isOwnProfile && <div className="flex flex-wrap gap-2 mt-3">
            <Link data-testid="P0-0-2" className={buttonClass({variant: "secondary"})} to="/settings/account"><Pencil size={ICON_SIZE.md} aria-hidden="true" />{t("self.edit")}</Link>
            <Button data-testid="P0-0-3" leadingIcon={<Share2 size={ICON_SIZE.md} aria-hidden="true" />} variant="secondary" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}${location.pathname.replace(/athlete\/me$/, `athlete/${userId}`)}`).then(() => showToast(t("self.shared"))).catch(() => showToast(t("self.shareFailed"), "error")); }}>{t("self.share")}</Button>
          </div>}
          {isOwnProfile && (
            <div data-testid="P0-6"><AthleteIdentityChips pdc={pdc} activities={isOwnProfile ? gearSessionRef.current.complete ? [...gearSessionRef.current.gears.values()].map(gear => ({ gear }) as Activity) : [] : chartActivities} />{isOwnProfile && <><Text as="p" variant="caption">{t(gearSession.complete ? "profile.gearComplete" : "profile.gearIncomplete", { count: gearSession.loaded })}</Text>{!gearSession.complete && <><Button disabled={gearBusy} onClick={() => void inspectGear()}>{t("profile.inspectGear")}</Button><Button disabled={gearBusy} onClick={() => void inspectGear(true)}>{t("profile.inspectAllGear")}</Button>{gearBusy && <Button onClick={() => { gearSession.paused = true; }}>{t("profile.pauseInspection")}</Button>}</>}{gearLimited && <p role="status">{t("profile.inspectionLimit")}</p>}{gearError && <p role="alert">{t("profile.inspectionError")}</p>}</>}</div>
          )}
        </div>
        {!isMe && currentUser && (
          <div data-testid="P0-0-4" className="athlete-friend-actions">
            <ActivitySubscriptionButton targetUid={userId} />
            {friendStatus === "none" && canSendFriendRequest && (
              <Button
                onClick={handleSendFriendRequest}
                disabled={friendLoading}
                className={friendLoading ? 'cursor-wait' : undefined}
              >
                {friendLoading ? t("friend.requesting") : t("friend.request")}
              </Button>
            )}
            {friendStatus === "request_sent" && (
              <Button variant="secondary" onClick={handleCancelRequest} disabled={friendLoading}>{friendLoading ? t("friend.cancelling") : t("friend.cancelRequest")}</Button>
            )}
            {friendStatus === "request_received" && (
              <Button
                onClick={handleAcceptRequest}
                disabled={friendLoading}
                className={friendLoading ? 'cursor-wait' : undefined}
              >
                {friendLoading ? t("friend.accepting") : t("friend.accept")}
              </Button>
            )}
            {friendStatus === "friends" && (
              <Button variant="secondary" onClick={async () => {
                if (!(await dialog.confirm(t("friend.confirmRemove", { nickname }), { destructive: true }))) return;
                handleRemoveFriend();
              }} disabled={friendLoading}>{friendLoading ? t("friend.removing") : t("friend.removeAction")}</Button>
            )}
          </div>
        )}
      </section>

      {isOwnProfile && !chartLimited && <AthleteRecentSummary activities={acceptedChartActivities} loading={chartLoading} error={chartError} />}

      </div>
      <div className="athlete-profile-layout">
      <aside className="athlete-profile-sidebar">
      <section aria-label={t("stats.title")}>
        <h2 className="athlete-sidebar-title">{t("stats.title")}</h2>
        <div data-testid="P0-1" className="athlete-stats">
          {[
            { label: t(isOwnProfile ? "stats.activities" : "stats.publicActivities"), value: statsReady ? t("stats.activitiesValue", { count: stats.count }) : "—", Icon: ActivityIcon },
            { label: t("stats.distance"), value: statsReady && (isOwnProfile ? ownerTotals?.unknownDistanceCount === 0 : acceptedChartActivities.every(a => Number.isFinite(a.summary?.distance))) ? <span>{Math.round(stats.distance / 1000).toLocaleString(i18n.language)} <small>km</small></span> : "—", Icon: Route },
            { label: t("stats.time"), value: statsReady && (isOwnProfile ? ownerTotals?.unknownTimeCount === 0 : acceptedChartActivities.every(a => Number.isFinite(resolveDuration(a.summary ?? {}).displayMs))) ? <><span>{new Intl.NumberFormat(i18n.language, {style: "unit", unit: "hour", unitDisplay: "narrow"}).format(Math.floor(stats.time / 3600000))}</span>{" "}<span>{new Intl.NumberFormat(i18n.language, {style: "unit", unit: "minute", unitDisplay: "narrow"}).format(Math.floor((stats.time % 3600000) / 60000))}</span></> : "—", Icon: Clock3 },
            { label: t("stats.elevation"), value: statsReady && (isOwnProfile ? ownerTotals?.unknownElevationCount === 0 : acceptedChartActivities.every(a => Number.isFinite(a.summary?.elevationGain))) ? <span>{Math.round(stats.elevation).toLocaleString(i18n.language)} <small>m</small></span> : "—", Icon: Mountain },
          ].map(({label, value, Icon}) => <div key={label} className="athlete-stat"><span className="athlete-stat__label"><Icon size={ICON_SIZE.md} aria-hidden="true" />{label}</span><strong className="athlete-stat__value">{value}</strong></div>)}
        </div>
      {!isOwnProfile && <div className="athlete-query-status">
        {publicGlobal.status !== "complete" && <Text as="p" role="status">{t(chartLimited ? "publicDiscoveryLimit" : `publicGlobal.${publicGlobal.status}`, { count: publicGlobal.items.length })}</Text>}
        {publicGlobal.status !== "loading" && <Button onClick={publicGlobal.status === "partial" || publicGlobal.status === "error" ? publicGlobal.more : publicGlobal.refresh}>{t(publicGlobal.status === "partial" ? "publicPeriod.globalMore" : publicGlobal.status === "error" ? "monthly.retry" : "publicPeriod.refresh")}</Button>}
      </div>}
        {isOwnProfile && !statsReady && <p role="status">{t(totalsError || ownerTotals?.state === "failed" ? "profile.totalsFailed" : "profile.totalsPending")}<Text as="span" variant="caption">{t(ownerTotals?.integrityFailed ? "profile.totalsRestartScope" : "profile.totalsContinueScope")}</Text><Button onClick={() => { totalsRetry.current = { identity: readIdentity, epoch: ownerTotals?.epoch, attempt: totalsAttempt + 1 }; setTotalsAttempt(totalsAttempt + 1); }}>{t(ownerTotals?.integrityFailed ? "profile.restartTotals" : "profile.continueTotals")}</Button></p>}
        <Text as="p" variant="caption" tone="secondary" className="mt-2">{t(isOwnProfile ? "stats.scopeOwn" : "stats.scopePublic")}</Text>
      </section>
          {isOwnProfile && <section><h2 className="athlete-sidebar-title">{t("profile.clubs")}</h2>{groupsLoading ? <p role="status">{t("activities.loading")}</p> : groupsError ? <div role="alert"><p>{t("profile.clubsError")}</p><Button variant="ghost" onClick={retryGroups}>{t("monthly.retry")}</Button></div> : <div className="athlete-clubs">{ownGroups.map(group => <Link key={group.id} to={`/club/${group.id}`}><span className="athlete-club-badge">{group.badge || group.name.slice(0, 3)}</span><span>{group.name}</span></Link>)}{!ownGroups.length && <Link to="/clubs">{t("profile.findClubs")}</Link>}</div>}</section>}
          {/* Friends List */}
          {canViewFriends && <Card data-testid="P0-4" padding="none" className="rounded-[var(--r-lg)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--line-soft)] flex items-center justify-between">
              <h3 className="text-[length:var(--fs-md)] font-semibold text-[var(--ink-0)]">{t("friends.title", { count: friendCount })}</h3>
              <Link to="/athlete/me/friends" className="text-[length:var(--fs-xs)] text-[var(--lime)] hover:opacity-80 font-medium">
                {t("friends.viewAll")}
              </Link>
            </div>

            {/* Scrollable container for friends (max height for ~8 items) */}
            <div>
              {friends.length === 0 ? (
                <div className="p-8 text-center text-[length:var(--fs-sm)] text-[var(--ink-3)]">
                  {t("friends.empty")}
                </div>
              ) : (
                <div className="divide-y divide-[var(--line-soft)]">
                  {friends.map((friend) => (
                    <Link
                      key={friend.userId}
                      to={`/athlete/${friend.userId}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-2)] transition-colors"
                    >
                      {friend.profileImage ? (
                        <SafeImage
                          src={friend.profileImage}
                          alt={friend.nickname}
                          fallbackLabel={friend.nickname}
                          className="w-10 h-10 rounded-full object-cover border border-[var(--line-soft)]"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <Avatar name={friend.nickname} size="sm" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[length:var(--fs-sm)] font-medium text-[var(--ink-0)] truncate">
                          {friend.nickname}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Card>}

          {/* My Segments */}
          {mySegments.length > 0 && (
            <Card data-testid="P0-5" padding="none" className="rounded-[var(--r-lg)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--line-soft)]">
                <h3 className="text-[length:var(--fs-md)] font-semibold text-[var(--ink-0)]">
                  {t("segments.titleWithCount", {
                    label: isMe ? t("segments.mineTitle") : t("segments.othersTitle"),
                    count: mySegments.length,
                  })}
                </h3>
              </div>
              <div className="divide-y divide-[var(--line-soft)]">
                {mySegments.map((seg) => (
                  <div key={seg.id} className="flex items-center px-4 py-3 hover:bg-[var(--bg-2)] transition-colors">
                    <Link to={`/segment/${seg.id}`} className="min-w-0 flex-1">
                      <p className="text-[length:var(--fs-sm)] font-medium text-[var(--ink-0)] truncate">{seg.name}</p>
                      <p className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">{(seg.distance / 1000).toFixed(2)} km</p>
                    </Link>
                    <span className={`ml-2 px-2 py-0.5 text-[length:var(--fs-xs)] font-semibold rounded-[var(--r-sm)] shrink-0 ${
                      seg.status === "active" ? "bg-[var(--lime)]/10 text-[var(--lime)]" :
                      seg.status === "pending" ? "bg-[var(--amber)]/10 text-[var(--amber)]" :
                      seg.status === "rejected" ? "bg-[var(--rose)]/10 text-[var(--rose)]" :
                      "bg-[var(--bg-3)] text-[var(--ink-2)]"
                    }`}>
                      {seg.status === "active" ? t("segments.status.active") : seg.status === "pending" ? t("segments.status.pending") : seg.status === "rejected" ? t("segments.status.rejected") : seg.status}
                    </span>
                    {isMe && (
                      <Button variant="ghost" iconOnly onClick={() => handleDeleteSegment(seg.id, seg.name)} aria-label={t("segments.deleteTitle")}><Trash2 size={ICON_SIZE.md} aria-hidden="true" /></Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

        </aside>
        <div data-testid="P0-2" className="athlete-profile-main">
          <nav aria-label={t("profile.sections")}>
            <TabNav appearance="segmented" tabs={(["overview", "activities", "photos", "achievements", "segments"] as const).map(id => ({ id, label: t(`profile.tabs.${id}`) }))} activeTab={profileTab} onChange={id => setProfileTab(id as typeof profileTab)} />
          </nav>
          {(profileTab === "overview" || profileTab === "photos") && <section className="athlete-profile-section"><h2>{t("profile.recentPhotos")}</h2>{isOwnProfile && recentPhotos.length === 0 ? <p>{t("profile.noMediaInPages")}</p> : <AthletePhotoGallery photos={recentPhotos} />}{isOwnProfile && <>{mediaLoading.photos && <p role="status">{t("profile.mediaLoading")}</p>}{mediaErrors.photos && <p role="alert">{t("profile.mediaError")}<Button onClick={() => retryPreview("photos")}>{t("monthly.retry")}</Button></p>}<Text as="p" variant="caption">{t(mediaOrders.photos === "all" ? mediaComplete.photos ? "profile.mediaAllComplete" : "profile.mediaAllScope" : "profile.mediaRecentScope")}</Text>{mediaCurrent && (photosBuffered || photoCursor) && <Button disabled={mediaLoading.photos} onClick={() => loadOlderPreview("photos")}>{t(photosBuffered ? "profile.moreCachedPhotos" : "profile.olderPhotoActivities")}</Button>}{(mediaOrders.photos !== "all" || mediaErrors.photos) && <Button disabled={mediaLoading.photos || !ownerTotals?.epoch} onClick={() => void fetchPreview("photos", null, true, true)}>{t("profile.inspectAllPhotos")}</Button>}</>}</section>}
          {(profileTab === "overview" || profileTab === "achievements") && <section className="athlete-profile-section"><h2>{t("profile.highlights")}</h2><p className="athlete-section-note">{t("profile.highlightsScope")}</p>{highlights.length ? <ul className="athlete-highlights">{highlights.map((item, index) => <li key={`${item.activityId}-${item.segmentId}-${index}`}><Link to={`/activity/${item.activityId}?tab=segments`}>{item.segmentName} <strong>{item.type}</strong> <span>({item.time})</span></Link></li>)}</ul> : <p>{t(isOwnProfile ? "profile.noMediaInPages" : "profile.noHighlights")}</p>}{isOwnProfile && <>{mediaLoading.highlights && <p role="status">{t("profile.mediaLoading")}</p>}{mediaPending.highlights > 0 && <p role="status">{t("profile.mediaPending", { count: mediaPending.highlights })}<Button disabled={mediaLoading.highlights} onClick={() => retryPreview("highlights")}>{t("monthly.retry")}</Button></p>}{mediaErrors.highlights && <p role="alert">{t("profile.mediaError")}<Button onClick={() => retryPreview("highlights")}>{t("monthly.retry")}</Button></p>}<Text as="p" variant="caption">{t(mediaOrders.highlights === "all" ? mediaComplete.highlights ? "profile.mediaAllComplete" : "profile.mediaAllScope" : "profile.mediaRecentScope")}</Text>{mediaCurrent && (highlightsBuffered || highlightCursor) && <Button disabled={mediaLoading.highlights} onClick={() => loadOlderPreview("highlights")}>{t(highlightsBuffered ? "profile.moreCachedHighlights" : "profile.olderHighlightActivities")}</Button>}{(mediaOrders.highlights !== "all" || mediaErrors.highlights) && <Button disabled={mediaLoading.highlights || !ownerTotals?.epoch} onClick={() => void fetchPreview("highlights", null, true, true)}>{t("profile.inspectAllHighlights")}</Button>}</>}</section>}
          {segmentsMore && <button type="button" disabled={segmentsBusy} onClick={loadMoreSegments}>{t("common:button.more")}</button>}
          {profileTab === "segments" && <section className="athlete-profile-section"><h2>{t("segments.othersTitle")}</h2>{mySegments.length ? <ul className="athlete-highlights">{mySegments.map(segment => <li key={segment.id}><Link to={`/segment/${segment.id}`}>{segment.name} · {(segment.distance / 1000).toFixed(2)} km</Link></li>)}</ul> : <p>{t("profile.noSegments")}</p>}</section>}
          {(profileTab === "overview" || profileTab === "activities") && <>
          <div className="athlete-section-heading"><label htmlFor="athlete-sport">{t("profile.sport")}</label><Select id="athlete-sport" value={sport} onChange={event => setSport(event.target.value)}>{["all", "bike", "run", "swim"].filter(isSportUiEnabled).map(value => <option key={value} value={value}>{t(`profile.sports.${value}`)}</option>)}</Select></div>
          {!isOwnProfile ? <AthletePublicPeriodExplorer key={userId} targetUid={userId!} /> : chartLoading ? <p role="status">{t("monthly.loading")}</p> : chartError ? <div role="alert"><p>{t(chartLimited ? "publicDiscoveryLimit" : "monthly.error")}</p>{!chartLimited && <Button onClick={() => setChartAttempt(attempt => attempt + 1)}>{t("monthly.retry")}</Button>}</div> : <AthleteActivityChart selectedYear={chartYear} availableYears={athleteProfileYears(chartSession, chartYear)} onYearChange={setChartYear} loadActivities={sport === "all" ? acceptedLoadActivities : acceptedLoadActivities.filter(activity => getDiscipline(activity.type) === sport)} activities={sport === "all" ? acceptedChartActivities : acceptedChartActivities.filter(activity => getDiscipline(activity.type) === sport)} selected={selectedPeriod} onSelect={setSelectedPeriod} />}

      {isOwnProfile && <div data-testid="P0-3"><RouteTabNav revealActive tabs={[
        { to: "/athlete/me", label: t("self.overview"), end: true },
        ...(["activities", "records", "friends", "gear"] as const).map((target) => ({to: `/athlete/me/${target}`, label: t(`self.${target}`), specId: "P0-3-1"})),
      ]} /></div>}


          <div data-testid="P0-2-1" className="pb-4 border-b border-[var(--line-soft)] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[length:var(--fs-xl)] font-bold text-[var(--ink-0)]">
                {t("activities.title")}
                {isSearchActive && (
                  <span className="ml-2 text-[length:var(--fs-sm)] font-normal text-[var(--lime)]">{t("activities.searchResultCount", { count: filteredActivities.length })}</span>
                )}
              </h2>
              {isOwnProfile ? <Link className={buttonClass({variant: "ghost"})} to="/athlete/me/activities">{t("activities.viewAll")}<ArrowUpRight size={ICON_SIZE.md} aria-hidden="true" /></Link> : <div className="flex flex-wrap gap-1">
                <Button variant={filterType === "all" ? "secondary" : "ghost"} aria-pressed={filterType === "all"} onClick={() => setFilterType("all")}>{t("activities.filter.all")}</Button>
                <Button variant={filterType === "ride" ? "secondary" : "ghost"} aria-pressed={filterType === "ride"} onClick={() => setFilterType("ride")}>{t("activities.filter.ride")}</Button>
                <Button variant={filterType === "strava" ? "secondary" : "ghost"} aria-pressed={filterType === "strava"} onClick={() => setFilterType("strava")}>{t("activities.filter.strava")}</Button>
              </div>}
            </div>

            {!isOwnProfile && !isSearchActive && (sport !== "all" || filterType !== "all") && publicGlobal.status !== "complete" && <div><Text as="p">{t("publicPeriod.filterPartial")}</Text>{publicGlobal.status === "partial" && <Button onClick={publicGlobal.more}>{t("publicPeriod.globalMore")}</Button>}</div>}
            {isSearchActive && <p className="athlete-section-note">{t("profile.searchScope")}</p>}
            {/* Search bar */}
            {!isOwnProfile && <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  aria-label={t("activities.search")}
                  type="text"
                  placeholder={t("activities.searchPlaceholder")}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch(); }}
                  leadingIcon={<Search />}
                  textAlign="end"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={!searchInput.trim()} variant="secondary"
              >
                {t("activities.search")}
              </Button>
              {isSearchActive && (
                <Button variant="ghost" iconOnly
                  onClick={handleResetSearch}
                  aria-label={t("activities.resetSearch")}
                >
                  <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              )}
            </div>}
          </div>

          {isOwnProfile && ownerActivityError && <div role="alert"><Text as="p">{t("profile.activitiesReadError")}</Text><Button onClick={() => lastActivityDoc ? void handleLoadMoreActivities() : setActivityAttempt(value => value + 1)}>{t("monthly.retry")}</Button></div>}
          {isOwnProfile && !isSearchActive && <Text as="p" variant="caption">{t(selectedPeriod ? "profile.periodFilterScope" : hasMoreActivities ? "profile.loadedFilterScope" : "profile.loadedFilterComplete", { count: activities.length })}</Text>}
          <div className="relative z-0 space-y-4">
            {(activitiesLoading || searchLoading) ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} padding="none" className="h-40 rounded-[var(--r-xl)] animate-pulse" />
                ))}
              </div>
            ) : filteredActivities.length === 0 ? (
              <Card padding="none" className="text-center py-12 rounded-[var(--r-xl)]">
                <p className="text-[var(--ink-3)]">
                  {isSearchActive ? t("activities.emptySearch") : isOwnProfile && !selectedPeriod && hasMoreActivities ? t("profile.noMatchesInLoaded") : t("activities.empty")}
                </p>
                {isSearchActive && (
                  <Button variant="ghost"
                    onClick={handleResetSearch}
                    className="mt-2"
                  >
                    {t("activities.resetSearch")}
                  </Button>
                )}
              </Card>
            ) : (
              <>
                {(hasLocalFilter && (!isOwnProfile || selectedPeriod) ? filteredActivities.slice(0, periodLimit) : filteredActivities).map((activity, index) => <CompactActivityCard key={activity.id} activity={activity} priority={index === 0} />)}
                {(!hasLocalFilter || isOwnProfile && !selectedPeriod) && !isSearchActive && hasMoreActivities && (
                  <Card variant="bare" padding="none" className="rounded-[var(--r-lg)] overflow-hidden">
                    <Button variant="ghost" block
                      onClick={handleLoadMoreActivities}
                      disabled={loadingMore}
                    >
                    {loadingMore ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
                        {t("activities.loading")}
                      </span>
                    ) : !isOwnProfile && stats.count > displayActivities.length ? (
                      t("activities.loadMoreRemaining", { count: stats.count - displayActivities.length })
                    ) : (
                      t("activities.loadMore")
                    )}
                    </Button>
                  </Card>
                )}
              </>
            )}
          </div>
          {!isOwnProfile && isSearchActive && publicSearchError && <Text role="alert">{t("monthly.error")}</Text>}
          {!isOwnProfile && isSearchActive && publicSearchCursor && <Button variant="ghost" disabled={searchLoading} onClick={() => void loadMorePublicSearch()}>{t("activities.loadMore")}</Button>}
          {!isSearchActive && (!hasLocalFilter || isOwnProfile && !selectedPeriod) && filteredActivities.length === 0 && hasMoreActivities && <Button variant="ghost" disabled={loadingMore} onClick={() => void handleLoadMoreActivities()}>{t("activities.loadMore")}</Button>}
          {hasLocalFilter && (!isOwnProfile || selectedPeriod) && filteredActivities.length > periodLimit && <Button variant="ghost" onClick={() => setPeriodLimit(count => count + 20)}>{t("activities.loadMore")}</Button>}
          </>}
        </div>
      </div>
    </div>
  );
}
