import { isSportUiEnabled } from "../config/sportFeatures";
import { acceptedStatsActivities, acceptedTrainingActivities } from "../utils/estimateTSS";
import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { useLocalizedNavigate } from "../hooks/useLocalizedNavigate";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import {
  collection, query, where, orderBy, getDocs, limit, startAfter,
  doc, getDoc, setDoc,
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
import { cancelFriendRequest } from "../hooks/useFriends";
import { useAuth } from "../contexts/AuthContext";
import { Activity as ActivityIcon, Route, Clock3, Mountain, Pencil, Share2, ArrowUpRight, Trash2 } from "lucide-react";
import TabNav, { RouteTabNav } from "../components/TabNav";
import "./AthletePage.css";
import { CompactActivityCard } from "../components/mobile/MobileFeedPage";
import AthletePhotoGallery from "../components/athlete/AthletePhotoGallery";
import AthleteRecentSummary from "../components/athlete/AthleteRecentSummary";
import { activityFeedSourceRevision, boundedFeedContent } from "../services/activityFeedContent";
import { isTrivialActivity } from "../utils/activityFilter";
import { resolveDuration } from "../utils/activityTime";
import { loadAthleteChartActivities } from "../services/athleteMonthlyActivities";
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
  const isOwnProfile = currentUser?.uid === userId;
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
  const profileForPage = useMemo(() => firestoreProfile ?? ownProfileFallback, [firestoreProfile, ownProfileFallback]);

  const ACTIVITIES_PAGE_SIZE = 20;
  const [displayActivities, setDisplayActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const [lastActivityDoc, setLastActivityDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [chartActivities, setChartActivities] = useState<Activity[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);
  const [chartAttempt, setChartAttempt] = useState(0);

  // My segments
  const [mySegments, setMySegments] = useState<{ id: string; name: string; distance: number; status: string; createdAt: number }[]>([]);

  // Friend state: 'none' | 'request_sent' | 'request_received' | 'friends'
  const [friendStatus, setFriendStatus] = useState<"none" | "request_sent" | "request_received" | "friends">("none");
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
    if (profileLoading && !ownProfileFallback) return;
    if (profileForPage?.profilePublic === false && !isOwnProfile && friendStatus !== "friends") {
      setActivitiesLoading(false);
      setDisplayActivities([]);
      setLastActivityDoc(null);
      setHasMoreActivities(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setActivitiesLoading(true);
      setDisplayActivities([]);
      setLastActivityDoc(null);
      setHasMoreActivities(true);

      try {
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
        const q = query(collection(firestore, "activities"), ...constraints);
        const snap = await getDocs(q);
        if (cancelled) return;
        setDisplayActivities(docsToActivities(snap.docs));
        setLastActivityDoc(snap.docs[snap.docs.length - 1] ?? null);
        setHasMoreActivities(snap.docs.length === ACTIVITIES_PAGE_SIZE);
      } catch (err) {
        logClientError("AthletePage.loadActivities", err, { userId, isOwnProfile });
      } finally {
        if (!cancelled) setActivitiesLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [userId, isOwnProfile, profileLoading, ownProfileFallback, profileForPage?.profilePublic, friendStatus]);

  // 월간 누적은 접근 가능한 전체 활동을 모두 읽은 뒤에만 표시한다.
  useEffect(() => {
    let cancelled = false;
    setChartActivities([]);
    setChartError(false);
    setChartLoading(true);
    if (!userId || (profileLoading && !ownProfileFallback)) return;
    if (profileForPage?.profilePublic === false && !isOwnProfile && friendStatus !== "friends") {
      setChartLoading(false);
      return;
    }
    void loadAthleteChartActivities(userId, isOwnProfile, () => cancelled)
      .then((items) => {
        if (cancelled || !items) return;
        setChartActivities(items);
      })
      .catch((err) => {
        if (cancelled) return;
        logClientError("AthletePage.loadChartActivities", err, { userId, isOwnProfile });
        setChartError(true);
      })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [userId, isOwnProfile, profileLoading, ownProfileFallback, profileForPage?.profilePublic, friendStatus, chartAttempt]);

  // 4. 서버 검색: keywords array-contains 쿼리
  const handleSearch = () => {
    const kw = searchInput.trim();
    if (!kw) return;
    setSearchQuery(kw);
  };

  // searchQuery 변경 시 서버 검색 실행
  useEffect(() => {
    if (!searchQuery || !userId) return;
    if (profileLoading && !ownProfileFallback) return;
    if (profileForPage?.profilePublic === false && !isOwnProfile && friendStatus !== "friends") {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);

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

    getDocs(query(collection(firestore, "activities"), ...constraints)).then((snap) => {
      if (cancelled) return;
      const items = docsToActivities(snap.docs);
      // 비공개 필터 (본인이 아닌 경우)
      setSearchResults(isOwnProfile ? items : items.filter((a) => a.visibility === "everyone"));
    }).catch((err) => {
      logClientError("AthletePage.searchActivities", err, { userId, token });
      if (!cancelled) setSearchResults([]);
    }).finally(() => {
      if (!cancelled) setSearchLoading(false);
    });

    return () => { cancelled = true; };
  }, [searchQuery, userId, isOwnProfile, profileLoading, ownProfileFallback, profileForPage?.profilePublic, friendStatus]);

  const handleResetSearch = () => {
    setSearchQuery("");
    setSearchInput("");
  };

  const handleLoadMoreActivities = async () => {
    if (!userId || !lastActivityDoc || loadingMore) return;
    if (profileLoading && !ownProfileFallback) return;
    if (profileForPage?.profilePublic === false && !isOwnProfile && friendStatus !== "friends") return;
    setLoadingMore(true);
    try {
      const constraints = [
        where("userId", "==", userId),
        where("deletedAt", "==", null),
        ...(!isOwnProfile ? [where("visibility", "==", "everyone")] : []),
        orderBy("startTime", "desc"),
        limit(ACTIVITIES_PAGE_SIZE),
        startAfter(lastActivityDoc),
      ];
      const q = query(collection(firestore, "activities"), ...constraints);
      const snap = await getDocs(q);
      setDisplayActivities((prev) => [...prev, ...docsToActivities(snap.docs)]);
      setLastActivityDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMoreActivities(snap.docs.length === ACTIVITIES_PAGE_SIZE);
    } catch (err) {
      logClientError("AthletePage.loadMoreActivities", err, { userId, isOwnProfile });
    } finally {
      setLoadingMore(false);
    }
  };

  // Fetch my segments
  useEffect(() => {
    if (!userId) return;
    if (profileLoading && !ownProfileFallback) return;
    if (profileForPage?.profilePublic === false && !isOwnProfile && friendStatus !== "friends") {
      setMySegments([]);
      return;
    }
    getDocs(query(
      collection(firestore, "segments"),
      where("createdByUid", "==", userId),
      where("deletedAt", "==", null),
      orderBy("createdAt", "desc"),
    )).then((snap) => {
      setMySegments(snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, name: data.name, distance: data.distance, status: data.status ?? "active", createdAt: data.createdAt };
      }));
    }).catch((err) => logClientError("AthletePage.bg", err, {}));
  }, [userId, isOwnProfile, profileLoading, ownProfileFallback, profileForPage?.profilePublic, friendStatus]);

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
    if (profileLoading && !ownProfileFallback) return;
    if (!isOwnProfile) {
      setFriendCount(0);
      setFriends([]);
      return;
    }

    getDocs(collection(firestore, "friends", userId, "users"))
      .then((snap) => {
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
  }, [userId, isOwnProfile, profileLoading, ownProfileFallback, friendStatus]);

  const handleSendFriendRequest = async (): Promise<boolean> => {
    if (!currentUser || !userId || friendLoading) return false;
    setFriendLoading(true);
    try {
      await setDoc(doc(firestore, "friend_requests", userId, "items", currentUser.uid), {
        requesterId: currentUser.uid,
        nickname: currentProfile?.nickname || currentUser.displayName || "",
        profileImage: currentProfile?.photoURL || currentUser.photoURL || null,
        createdAt: Date.now(),
      });
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
      await cancelFriendRequest(currentUser.uid, userId);
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
  const canViewProfile = isOwnProfile || profileForPage?.profilePublic !== false || friendStatus === "friends";
  const canViewFriends = isOwnProfile;
  const canSendFriendRequest = profileForPage?.friendRequestsAllowed !== false;
  const activities = displayActivities.map((a) =>
    !a.profileImage && photoURL ? { ...a, profileImage: photoURL } : a,
  );
  const isMe = isOwnProfile;

  const acceptedChartActivities = useMemo(() => acceptedStatsActivities(chartActivities.filter(activity => activity.userId === userId)), [chartActivities, userId]);
  const acceptedLoadActivities = useMemo(() => acceptedTrainingActivities(chartActivities.filter(activity => activity.userId === userId)), [chartActivities, userId]);
  const stats = useMemo(() => aggregateActivityStats(acceptedChartActivities), [acceptedChartActivities]);
  const statsReady = !chartLoading && !chartError;
  const recentPhotos = useMemo(() => {
    const seen = new Set<string>();
    return chartActivities.filter(activity => activity.userId === userId).sort((a, b) => b.startTime - a.startTime).flatMap(activity => {
      if (activity.feedContentV1?.sourceRevision !== activityFeedSourceRevision(activity)) return [];
      return (boundedFeedContent(activity.feedContentV1)?.photos ?? []).flatMap(photo => {
        if (seen.has(photo.url)) return [];
        seen.add(photo.url);
        return [{ ...photo, activityId: activity.id }];
      });
    }).slice(0, 6);
  }, [chartActivities, userId]);
  const highlights = useMemo(() => [...acceptedChartActivities].sort((a, b) => b.startTime - a.startTime).flatMap(activity => (activity.topAchievements ?? []).slice(0, 3).map(achievement => ({ ...achievement, activityId: activity.id }))).slice(0, 12), [acceptedChartActivities]);

  // 검색 활성 시: 서버 검색 결과 사용
  // 비활성 시: 페이지네이션된 displayActivities 사용
  const baseActivities = useMemo(() => {
    if (!isSearchActive) return selectedPeriod || sport !== "all" || filterType !== "all" ? [...acceptedChartActivities].sort((a, b) => b.startTime - a.startTime) : activities;
    return searchResults.map((a) =>
      !a.profileImage && photoURL ? { ...a, profileImage: photoURL } : a,
    );
  }, [isSearchActive, activities, searchResults, photoURL, selectedPeriod, acceptedChartActivities, sport, filterType]);

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

  if (profileLoading && !ownProfileFallback) {
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
          <div className="text-[length:var(--fs-lg)] font-semibold text-[var(--ink-0)]">
            {t("privacy.privateTitle")}
          </div>
          <div className="mt-2 text-[length:var(--fs-sm)] text-[var(--ink-3)]">
            {t("privacy.privateDesc")}
          </div>
          {currentUser && canSendFriendRequest && friendStatus === "none" && (
            <Button
              onClick={handleSendFriendRequest}
              disabled={friendLoading}
              className={`mt-5 ${friendLoading ? 'cursor-wait' : ''}`}
            >
              {friendLoading ? t("friend.requesting") : t("friend.request")}
            </Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className={`athlete-profile${recentPhotos.length ? "" : " athlete-profile--no-cover"}`} data-testid={isOwnProfile ? "P0.self" : "P0.other"}>
      <AthletePhotoGallery photos={recentPhotos} cover />
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
            <div data-testid="P0-6"><AthleteIdentityChips pdc={pdc} activities={chartActivities} /></div>
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

      <AthleteRecentSummary activities={acceptedChartActivities} loading={chartLoading} error={chartError} />
      </div>
      <div className="athlete-profile-layout">
      <aside className="athlete-profile-sidebar">
      <section aria-label={t("stats.title")}>
        <h2 className="athlete-sidebar-title">{t("stats.title")}</h2>
        <div data-testid="P0-1" className="athlete-stats">
          {[
            { label: t(isOwnProfile ? "stats.activities" : "stats.publicActivities"), value: statsReady ? t("stats.activitiesValue", { count: stats.count }) : "—", Icon: ActivityIcon },
            { label: t("stats.distance"), value: statsReady ? <span>{Math.round(stats.distance / 1000).toLocaleString(i18n.language)} <small>km</small></span> : "—", Icon: Route },
            { label: t("stats.time"), value: statsReady ? <><span>{new Intl.NumberFormat(i18n.language, {style: "unit", unit: "hour", unitDisplay: "narrow"}).format(Math.floor(stats.time / 3600000))}</span>{" "}<span>{new Intl.NumberFormat(i18n.language, {style: "unit", unit: "minute", unitDisplay: "narrow"}).format(Math.floor((stats.time % 3600000) / 60000))}</span></> : "—", Icon: Clock3 },
            { label: t("stats.elevation"), value: statsReady ? <span>{Math.round(stats.elevation).toLocaleString(i18n.language)} <small>m</small></span> : "—", Icon: Mountain },
          ].map(({label, value, Icon}) => <div key={label} className="athlete-stat"><span className="athlete-stat__label"><Icon size={ICON_SIZE.md} aria-hidden="true" />{label}</span><strong className="athlete-stat__value">{value}</strong></div>)}
        </div>
        <Text as="p" variant="caption" tone="secondary" className="mt-2">{t(isOwnProfile ? "stats.scopeOwn" : "stats.scopePublic")}</Text>
      </section>
          {isOwnProfile && <section><h2 className="athlete-sidebar-title">{t("profile.clubs")}</h2>{groupsLoading ? <p role="status">{t("activities.loading")}</p> : groupsError ? <div role="alert"><p>{t("profile.clubsError")}</p><Button variant="ghost" onClick={retryGroups}>{t("monthly.retry")}</Button></div> : <div className="athlete-clubs">{ownGroups.map(group => <Link key={group.id} to={`/club/${group.id}`}><span className="athlete-club-badge">{group.badge || group.name.slice(0, 3)}</span><span>{group.name}</span></Link>)}{!ownGroups.length && <Link to="/clubs">{t("profile.findClubs")}</Link>}</div>}</section>}
          {/* Friends List */}
          {canViewFriends && <Card data-testid="P0-4" padding="none" className="rounded-[var(--r-lg)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--line-soft)] flex items-center justify-between">
              <h3 className="text-[length:var(--fs-sm)] font-semibold text-[var(--ink-0)]">{t("friends.title", { count: friendCount })}</h3>
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
                <h3 className="text-[length:var(--fs-sm)] font-semibold text-[var(--ink-0)]">
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
          {(profileTab === "overview" || profileTab === "photos") && <section className="athlete-profile-section"><h2>{t("profile.recentPhotos")}</h2><AthletePhotoGallery photos={recentPhotos} /></section>}
          {(profileTab === "overview" || profileTab === "achievements") && <section className="athlete-profile-section"><h2>{t("profile.highlights")}</h2><p className="athlete-section-note">{t("profile.highlightsScope")}</p>{highlights.length ? <ul className="athlete-highlights">{highlights.map((item, index) => <li key={`${item.activityId}-${item.segmentId}-${index}`}><Link to={`/activity/${item.activityId}?tab=segments`}>{item.segmentName} <strong>{item.type}</strong> <span>({item.time})</span></Link></li>)}</ul> : <p>{t("profile.noHighlights")}</p>}</section>}
          {profileTab === "segments" && <section className="athlete-profile-section"><h2>{t("segments.othersTitle")}</h2>{mySegments.length ? <ul className="athlete-highlights">{mySegments.map(segment => <li key={segment.id}><Link to={`/segment/${segment.id}`}>{segment.name} · {(segment.distance / 1000).toFixed(2)} km</Link></li>)}</ul> : <p>{t("profile.noSegments")}</p>}</section>}
          {(profileTab === "overview" || profileTab === "activities") && <>
          <div className="athlete-section-heading"><label htmlFor="athlete-sport">{t("profile.sport")}</label><Select id="athlete-sport" value={sport} onChange={event => setSport(event.target.value)}>{["all", "bike", "run", "swim"].filter(isSportUiEnabled).map(value => <option key={value} value={value}>{t(`profile.sports.${value}`)}</option>)}</Select></div>
          {chartLoading ? <p role="status">{t("monthly.loading")}</p> : chartError ? <div role="alert"><p>{t("monthly.error")}</p><Button onClick={() => setChartAttempt(attempt => attempt + 1)}>{t("monthly.retry")}</Button></div> : <AthleteActivityChart loadActivities={sport === "all" ? acceptedLoadActivities : acceptedLoadActivities.filter(activity => getDiscipline(activity.type) === sport)} activities={sport === "all" ? acceptedChartActivities : acceptedChartActivities.filter(activity => getDiscipline(activity.type) === sport)} selected={selectedPeriod} onSelect={setSelectedPeriod} />}

      {isOwnProfile && <div data-testid="P0-3"><RouteTabNav revealActive tabs={[
        { to: "/athlete/me", label: t("self.overview"), end: true },
        ...(["activities", "records", "friends", "gear"] as const).map((target) => ({to: `/athlete/me/${target}`, label: t(`self.${target}`), specId: "P0-3-1"})),
      ]} /></div>}


          <div data-testid="P0-2-1" className="pb-4 border-b border-[var(--line-soft)] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">
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

            {isSearchActive && <p className="athlete-section-note">{t("profile.searchScope")}</p>}
            {/* Search bar */}
            {!isOwnProfile && <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <Input
                  aria-label={t("activities.search")}
                  type="text"
                  placeholder={t("activities.searchPlaceholder")}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch(); }}
                  className="w-full pl-9"
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
                  {isSearchActive ? t("activities.emptySearch") : t("activities.empty")}
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
                {(hasLocalFilter ? filteredActivities.slice(0, periodLimit) : filteredActivities).map((activity, index) => <CompactActivityCard key={activity.id} activity={activity} priority={index === 0} />)}
                {!hasLocalFilter && !isSearchActive && hasMoreActivities && (
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
                    ) : stats.count > displayActivities.length ? (
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
          {hasLocalFilter && filteredActivities.length > periodLimit && <Button variant="ghost" onClick={() => setPeriodLimit(count => count + 20)}>{t("activities.loadMore")}</Button>}
          </>}
        </div>
      </div>
    </div>
  );
}
