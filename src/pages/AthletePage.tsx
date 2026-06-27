import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import {
  collection, query, where, orderBy, getDocs, limit, startAfter,
  doc, getDoc, setDoc, deleteDoc,
  type QueryDocumentSnapshot, type DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";

import { useToast } from "../contexts/ToastContext";
import { firestore, functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useDocument } from "../hooks/useFirestore";
import { useAuth } from "../contexts/AuthContext";
import StatCard from "../components/StatCard";
import ActivityCard from "../components/ActivityCard";
import { isTrivialActivity } from "../utils/activityFilter";
import { estimateTSS } from "../utils/estimateTSS";
import Avatar from "../components/Avatar";
import WeeklyChart from "../components/WeeklyChart";
import type { Activity, UserProfile } from "@shared/types";
import { Button, Card } from "../theme/components";

function formatHours(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function AthletePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user: currentUser, profile: currentProfile } = useAuth();
  const { showToast } = useToast();
  const { t } = useTranslation("athlete");
  const [searchParams] = useSearchParams();

  const { data: firestoreProfile, loading: profileLoading } = useDocument<UserProfile>("users", userId);

  const ACTIVITIES_PAGE_SIZE = 20;
  const [displayActivities, setDisplayActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const [lastActivityDoc, setLastActivityDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [stats, setStats] = useState({ count: 0, distance: 0, time: 0, elevation: 0 });
  const [chartActivities, setChartActivities] = useState<Activity[]>([]);

  // My segments
  const [mySegments, setMySegments] = useState<{ id: string; name: string; distance: number; status: string; createdAt: number }[]>([]);

  const [friendCode, setFriendCode] = useState<string | null>(null);

  // Friend state: 'none' | 'request_sent' | 'request_received' | 'friends'
  const [friendStatus, setFriendStatus] = useState<"none" | "request_sent" | "request_received" | "friends">("none");
  const [friendLoading, setFriendLoading] = useState(false);
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

  useEffect(() => {
    if (!userId) return;
    getDoc(doc(firestore, "users", userId)).then((snap) => {
      if (snap.exists()) {
        const code = snap.data()?.friendCode;
        if (code) setFriendCode(code);
      }
    });
  }, [userId]);

  // 1. 활동 목록: 빠른 첫 화면 (limit 20 + cursor 페이지네이션)
  const isOwnProfile = currentUser?.uid === userId;

  // summary 필드가 없는 비정상 문서는 다운스트림 통계 계산에서 크래시를 유발하므로 제외.
  const docsToActivities = (
    docs: import("firebase/firestore").QueryDocumentSnapshot<import("firebase/firestore").DocumentData>[],
  ): Activity[] =>
    docs
      .map((d) => ({ id: d.id, ...d.data() }) as Activity)
      .filter((a) => a.summary != null);

  useEffect(() => {
    if (!userId) return;
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
          orderBy("createdAt", "desc"),
          limit(ACTIVITIES_PAGE_SIZE),
        ];
        const q = query(collection(firestore, "activities"), ...constraints);
        const snap = await getDocs(q);
        if (cancelled) return;
        setDisplayActivities(docsToActivities(snap.docs));
        setLastActivityDoc(snap.docs[snap.docs.length - 1] ?? null);
        setHasMoreActivities(snap.docs.length === ACTIVITIES_PAGE_SIZE);
      } catch (err) {
        console.error("Failed to fetch activities:", err);
      } finally {
        if (!cancelled) setActivitiesLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [userId, isOwnProfile]);

  // 2. 통계 카드: 프로필의 사전 집계 stats 사용
  useEffect(() => {
    if (!firestoreProfile?.stats) return;
    const s = firestoreProfile.stats;
    setStats({
      count: s.activityCount ?? 0,
      distance: s.totalDistance ?? 0,
      time: s.totalRidingTime ?? 0,
      elevation: s.totalElevationGain ?? 0,
    });
  }, [firestoreProfile]);

  // 3. 월간 차트: 백그라운드 (limit 200)
  useEffect(() => {
    if (!userId) return;

    const constraints = [
      where("userId", "==", userId),
      where("deletedAt", "==", null),
      ...(!isOwnProfile ? [where("visibility", "==", "everyone")] : []),
      orderBy("createdAt", "desc"),
      limit(200),
    ];
    getDocs(query(collection(firestore, "activities"), ...constraints))
      .then((snap) => {
        setChartActivities(docsToActivities(snap.docs));
      }).catch((err) => console.error("Failed to fetch chart activities:", err));
  }, [userId, isOwnProfile]);

  // 4. 서버 검색: keywords array-contains 쿼리
  const handleSearch = () => {
    const kw = searchInput.trim();
    if (!kw) return;
    setSearchQuery(kw);
  };

  // searchQuery 변경 시 서버 검색 실행
  useEffect(() => {
    if (!searchQuery || !userId) return;

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
      console.error("Failed to search activities:", err);
      if (!cancelled) setSearchResults([]);
    }).finally(() => {
      if (!cancelled) setSearchLoading(false);
    });

    return () => { cancelled = true; };
  }, [searchQuery, userId, isOwnProfile]);

  const handleResetSearch = () => {
    setSearchQuery("");
    setSearchInput("");
  };

  const handleLoadMoreActivities = async () => {
    if (!userId || !lastActivityDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const constraints = [
        where("userId", "==", userId),
        where("deletedAt", "==", null),
        ...(!isOwnProfile ? [where("visibility", "==", "everyone")] : []),
        orderBy("createdAt", "desc"),
        limit(ACTIVITIES_PAGE_SIZE),
        startAfter(lastActivityDoc),
      ];
      const q = query(collection(firestore, "activities"), ...constraints);
      const snap = await getDocs(q);
      setDisplayActivities((prev) => [...prev, ...docsToActivities(snap.docs)]);
      setLastActivityDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMoreActivities(snap.docs.length === ACTIVITIES_PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load more activities:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Fetch my segments
  useEffect(() => {
    if (!userId) return;
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
  }, [userId]);

  // Check friend relationship
  useEffect(() => {
    if (!currentUser || !userId || currentUser.uid === userId) return;

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
      .catch((err) => logClientError("AthletePage.bg", err, {}));
  }, [currentUser, userId]);

  // Handle auto-friend request from invite link
  useEffect(() => {
    if (
      !currentUser ||
      !userId ||
      currentUser.uid === userId ||
      searchParams.get("action") !== "invite" ||
      friendStatus !== "none" ||
      friendLoading
    ) return;

    handleSendFriendRequest().then(() => {
        showToast(t("friend.autoSent"));
    });
  }, [currentUser, userId, friendStatus, friendLoading, searchParams]);

  // Fetch friend list + count
  useEffect(() => {
    if (!userId) return;

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
  }, [userId]);

  const handleSendFriendRequest = async () => {
    if (!currentUser || !userId || friendLoading) return;
    setFriendLoading(true);
    try {
      await setDoc(doc(firestore, "friend_requests", userId, "items", currentUser.uid), {
        requesterId: currentUser.uid,
        nickname: currentProfile?.nickname || currentUser.displayName || "",
        profileImage: currentProfile?.photoURL || currentUser.photoURL || null,
        createdAt: Date.now(),
      });
      setFriendStatus("request_sent");
    } catch (err) {
      console.error("Friend request failed:", err);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!currentUser || !userId || friendLoading) return;
    setFriendLoading(true);
    try {
      await deleteDoc(doc(firestore, "friend_requests", userId, "items", currentUser.uid));
      setFriendStatus("none");
    } catch (err) {
      console.error("Cancel request failed:", err);
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
      console.error("Accept request failed:", err);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleRemoveFriend = async (targetId?: string) => {
    const removeId = targetId || userId;
    if (!currentUser || !removeId || friendLoading) return;
    setFriendLoading(true);
    try {
      await deleteDoc(doc(firestore, "friends", currentUser.uid, "users", removeId));
      if (!targetId || targetId === userId) {
        setFriendStatus("none");
      }
      setFriendCount((c) => Math.max(0, c - 1));
      setFriends((prev) => prev.filter((f) => f.userId !== removeId));
    } catch (err) {
      console.error("Remove friend failed:", err);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleDeleteSegment = async (segmentId: string, segName: string) => {
    if (!confirm(t("segments.deleteConfirm", { name: segName }))) return;
    try {
      const fn = httpsCallable(functions, "deleteMySegment");
      await fn({ segmentId });
      setMySegments((prev) => prev.filter((s) => s.id !== segmentId));
      showToast(t("segments.deleteSuccess"));
    } catch (err) {
      const msg = (err as { message?: string }).message ?? t("segments.deleteFailed");
      alert(msg);
    }
  };

  const nickname = firestoreProfile?.nickname;
  const photoURL = firestoreProfile?.photoURL ?? null;
  const activities = displayActivities.map((a) =>
    !a.profileImage && photoURL ? { ...a, profileImage: photoURL } : a,
  );
  const isMe = isOwnProfile;

  const monthlyStats = useMemo(() => {
    const months = new Map<string, { distance: number; time: number; elevation: number; rides: number; tss: number }>();
    for (const a of chartActivities) {
      const d = new Date(a.createdAt);
      const key = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = months.get(key) ?? { distance: 0, time: 0, elevation: 0, rides: 0, tss: 0 };
      existing.distance += a.summary.distance / 1000;
      existing.time += a.summary.ridingTimeMillis / 3600000;
      existing.elevation += a.summary.elevationGain;
      existing.rides += 1;
      // TSS 추정: 정본 폴백 체인(사전계산 TSS → relativeEffort → 시간factor)에 위임 (P0 단일화)
      existing.tss += estimateTSS(a);
      months.set(key, existing);
    }
    return Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([week, data]) => ({ week, ...data }));
  }, [chartActivities]);

  // 검색 활성 시: 서버 검색 결과 사용
  // 비활성 시: 페이지네이션된 displayActivities 사용
  const baseActivities = useMemo(() => {
    if (!isSearchActive) return activities;
    return searchResults.map((a) =>
      !a.profileImage && photoURL ? { ...a, profileImage: photoURL } : a,
    );
  }, [isSearchActive, activities, searchResults, photoURL]);

  const filteredActivities = baseActivities.filter((a) => {
    // 측정 오류로 보이는 trivial 활동(거리<100m 또는 시간<60s) 항상 숨김.
    if (isTrivialActivity(a)) return false;
    if (filterType === "all") return true;
    const isStrava = (a as Activity & { source?: string }).source === "strava";
    return filterType === "strava" ? isStrava : !isStrava;
  });

  if (profileLoading) {
    return (
      <div className="space-y-6">
        <div className="relative">
          <div className="bg-[var(--bg-3)] rounded-[var(--r-xl)] h-40 animate-pulse" />
          <div className="absolute -bottom-10 left-6">
            <div className="w-20 h-20 rounded-full bg-[var(--bg-4)] ring-4 ring-[var(--bg-1)] animate-pulse" />
          </div>
        </div>
        <div className="pt-8 space-y-2">
          <div className="h-8 bg-[var(--bg-3)] rounded-[var(--r-sm)] w-40 animate-pulse" />
          <div className="h-4 bg-[var(--bg-3)] rounded-[var(--r-sm)] w-32 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} padding="none" className="rounded-[var(--r-lg)] p-4 h-20 animate-pulse" />
          ))}
        </div>
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

  return (
    <div className="space-y-6">
      {/* Cover + Profile */}
      <div className="relative">
        <div className="bg-gradient-to-br from-orange-400 via-amber-500 to-orange-600 rounded-[var(--r-xl)] h-40 relative overflow-hidden shadow-sm">
          {/* Decorative pattern */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="cover-pattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1.5" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cover-pattern)" />
          </svg>
        </div>
        <div className="absolute -bottom-10 left-6 flex items-end gap-4">
          <div className="ring-4 ring-[var(--bg-1)] rounded-full bg-[var(--bg-1)]">
            {photoURL ? (
              <img
                src={photoURL}
                alt=""
                className="w-20 h-20 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Avatar name={nickname} size="xl" />
            )}
          </div>
        </div>
      </div>

      {/* Profile info */}
      <div className="pt-8 flex items-start justify-between">
        <div>
          <h1 className="text-[length:var(--fs-2xl)] font-bold text-[var(--ink-0)]">
            {nickname}
            {friendCode && <span className="text-[length:var(--fs-sm)] font-normal text-[var(--aqua)] ml-2">({friendCode})</span>}
          </h1>
          <div className="flex gap-4 mt-2 text-[length:var(--fs-sm)] text-[var(--ink-2)]">
            {/* Friend count removed */}
          </div>
        </div>
        {!isMe && currentUser && (
          <div className="flex gap-2">
            {friendStatus === "none" && (
              <button
                onClick={handleSendFriendRequest}
                disabled={friendLoading}
                className={`ds-btn ds-btn--md px-4 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] disabled:opacity-50${friendLoading ? 'cursor-wait' : ''}`}
              >
                {friendLoading ? t("friend.requesting") : t("friend.request")}
              </button>
            )}
            {friendStatus === "request_sent" && (
              <button
                onClick={handleCancelRequest}
                disabled={friendLoading}
                className={`px-4 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] text-[var(--ink-1)] hover:bg-[var(--bg-3)] transition-colors disabled:opacity-50 ${friendLoading ? 'cursor-wait' : ''}`}
                style={{ background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}
              >
                {friendLoading ? t("friend.cancelling") : t("friend.cancelRequest")}
              </button>
            )}
            {friendStatus === "request_received" && (
              <button
                onClick={handleAcceptRequest}
                disabled={friendLoading}
                className={`ds-btn ds-btn--md px-4 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] disabled:opacity-50${friendLoading ? 'cursor-wait' : ''}`}
              >
                {friendLoading ? t("friend.accepting") : t("friend.accept")}
              </button>
            )}
            {friendStatus === "friends" && (
              <button
                onClick={() => {
                  if (!window.confirm(t("friend.confirmRemove", { nickname }))) return;
                  handleRemoveFriend();
                }}
                disabled={friendLoading}
                className="group px-4 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] transition-colors disabled:opacity-50 border border-[var(--lime)]/40 text-[var(--lime)] hover:border-[var(--rose)]/40 hover:text-[var(--rose)]"
                style={{ background: 'var(--lime)/10' }}
              >
                {friendLoading ? t("friend.removing") : (
                  <>
                    <span className="group-hover:hidden">{t("friend.connected")}</span>
                    <span className="hidden group-hover:inline">{t("friend.removeAction")}</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={t("stats.activities")}
          value={t("stats.activitiesValue", { count: stats.count })}
          icon="🚴"
        />
        <StatCard
          label={t("stats.distance")}
          value={`${(stats.distance / 1000).toFixed(0)} km`}
          icon="📏"
        />
        <StatCard
          label={t("stats.time")}
          value={formatHours(stats.time)}
          icon="⏱"
        />
        <StatCard
          label={t("stats.elevation")}
          value={`${Math.round(stats.elevation).toLocaleString()} m`}
          icon="⛰"
        />
      </div>

      {/* Friend list */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Friends & Chart */}
        <div className="space-y-6 sticky top-0 self-start">
          {/* Friends List (Always visible) */}
          <Card padding="none" className="rounded-[var(--r-lg)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--line-soft)] flex items-center justify-between">
              <h3 className="text-[length:var(--fs-sm)] font-semibold text-[var(--ink-0)]">{t("friends.title", { count: friendCount })}</h3>
              <Link to="/friends" className="text-[length:var(--fs-xs)] text-[var(--lime)] hover:opacity-80 font-medium">
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
                        <img
                          src={friend.profileImage}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover border border-[var(--line-soft)]"
                          referrerPolicy="no-referrer"
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
          </Card>

          {/* My Segments */}
          {mySegments.length > 0 && (
            <Card padding="none" className="rounded-[var(--r-lg)] overflow-hidden">
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
                      seg.status === "active" ? "bg-green-900/30 text-green-400" :
                      seg.status === "pending" ? "bg-[var(--amber)]/10 text-[var(--amber)]" :
                      seg.status === "rejected" ? "bg-[var(--rose)]/10 text-[var(--rose)]" :
                      "bg-[var(--bg-3)] text-[var(--ink-2)]"
                    }`}>
                      {seg.status === "active" ? t("segments.status.active") : seg.status === "pending" ? t("segments.status.pending") : seg.status === "rejected" ? t("segments.status.rejected") : seg.status}
                    </span>
                    {isMe && (
                      <button
                        onClick={() => handleDeleteSegment(seg.id, seg.name)}
                        className="ml-2 p-1 hover:text-red-500 transition-colors shrink-0" style={{ color: "var(--ink-3)" }}
                        title={t("segments.deleteTitle")}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <WeeklyChart data={monthlyStats} dataKey="distance" height={180} rich />
        </div>

        {/* Right Column: Activities */}
        <div className="md:col-span-2 space-y-4">
          <div className="sticky top-0 z-20 bg-[var(--bg-0)] pb-4 border-b border-[var(--line-soft)] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">
                {t("activities.title")}
                {isSearchActive && (
                  <span className="ml-2 text-[length:var(--fs-sm)] font-normal text-[var(--lime)]">{t("activities.searchResultCount", { count: filteredActivities.length })}</span>
                )}
              </h2>
              <div className="flex bg-[var(--bg-2)] rounded-[var(--r-lg)] p-1">
                <button
                  onClick={() => setFilterType("all")}
                  className={`px-3 py-1 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-md)] transition-colors ${
                    filterType === "all"
                      ? "bg-[var(--bg-3)] text-[var(--ink-0)]"
                      : "text-[var(--ink-3)] hover:text-[var(--ink-1)]"
                  }`}
                >
                  {t("activities.filter.all")}
                </button>
                <button
                  onClick={() => setFilterType("ride")}
                  className={`px-3 py-1 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-md)] transition-colors ${
                    filterType === "ride"
                      ? "bg-[var(--bg-3)] text-[var(--ink-0)]"
                      : "text-[var(--ink-3)] hover:text-[var(--ink-1)]"
                  }`}
                >
                  {t("activities.filter.ride")}
                </button>
                <button
                  onClick={() => setFilterType("strava")}
                  className={`px-3 py-1 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-md)] transition-colors ${
                    filterType === "strava"
                      ? "bg-[var(--bg-3)] text-[var(--ink-0)]"
                      : "text-[var(--ink-3)] hover:text-[var(--ink-1)]"
                  }`}
                >
                  {t("activities.filter.strava")}
                </button>
              </div>
            </div>

            {/* Search bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={t("activities.searchPlaceholder")}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch(); }}
                  className="w-full pl-9 pr-3 py-2 text-[length:var(--fs-sm)] rounded-[var(--r-lg)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)] focus:border-transparent"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--ink-1)' }}
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={!searchInput.trim()} variant="secondary" className="px-4 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("activities.search")}
              </Button>
              {isSearchActive && (
                <button
                  onClick={handleResetSearch}
                  className="p-2 text-[var(--ink-3)] hover:text-[var(--ink-1)] rounded-[var(--r-lg)] hover:bg-[var(--bg-2)] transition-colors"
                  title={t("activities.resetSearch")}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
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
                  <button
                    onClick={handleResetSearch}
                    className="text-[var(--lime)] hover:underline text-[length:var(--fs-sm)] font-medium mt-2"
                  >
                    {t("activities.resetSearch")}
                  </button>
                )}
              </Card>
            ) : (
              <>
                {filteredActivities.map((activity) => (
                  <div key={activity.id} className="relative group">
                    {/* athlete 페이지는 컨텍스트 자체가 작성자라 카드 내 작성자 헤더 중복 — 숨김. */}
                    <ActivityCard activity={activity} hideAuthor />
                    {isMe && (
                      <Link
                        to={`/segment/create?activityId=${activity.id}`}
                        className="absolute top-3 right-3 px-2.5 py-1 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-md)] bg-[var(--bg-2)]/90 text-[var(--lime)] border border-[var(--lime)]/30 opacity-0 group-hover:opacity-100 hover:bg-[var(--lime)]/10 transition-all"
                      >
                        {t("activities.addSegment")}
                      </Link>
                    )}
                  </div>
                ))}
                {!isSearchActive && hasMoreActivities && filterType === "all" && (
                  <button
                    onClick={handleLoadMoreActivities}
                    disabled={loadingMore}
                    className="w-full py-3 text-[length:var(--fs-sm)] font-medium text-[var(--lime)] ds-card ds-card--bare rounded-[var(--r-lg)] hover:bg-[var(--lime)]/10 transition-colors disabled:opacity-50"
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
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
