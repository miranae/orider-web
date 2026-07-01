import { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer,
  or,
  and,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { getPublicUserProfiles } from "../services/publicProfiles";
import { useAuth } from "../contexts/AuthContext";
import type { Activity } from "@shared/types";
import type { WeeklyStat } from "../components/WeeklyChart";
import { estimateTSS } from "../utils/estimateTSS";

export type DatePreset = "all" | "7d" | "30d" | "90d" | "year";

// 첫 로드 비용 절감 (perf, 2026-06): 피드 첫 페이지를 10개로. 활동 문서는 thumbnailTrack
// (인코딩 폴리라인) 을 품어 doc 당 수~수십 KB → 20→10 으로 초기 전송량 반감. 더불어
// mapImageUrl 없는 활동이 초기 뷰포트에 끼어 RouteMap(mapbox-gl 1.6MB)을 끌어올 확률도 감소.
// 추가 로드는 loadMore() 무한스크롤로 충당.
const FEED_PAGE_SIZE = 10;
// 첫 카드 노출을 앞당기기 위해 첫 쿼리는 접힘 영역에 필요한 카드만 가져오고,
// 나머지 첫 페이지는 백그라운드에서 이어 붙인다.
const FIRST_FEED_CHUNK_SIZE = 3;

async function hydrateActivityProfileImages(items: Activity[]): Promise<Activity[]> {
  const missingProfileImageUserIds = Array.from(
    new Set(items.filter((activity) => !activity.profileImage).map((activity) => activity.userId)),
  );
  if (missingProfileImageUserIds.length === 0) return items;

  try {
    const profiles = await getPublicUserProfiles(missingProfileImageUserIds);
    return items.map((activity) => {
      if (activity.profileImage) return activity;
      const photoURL = profiles.get(activity.userId)?.photoURL;
      return photoURL ? { ...activity, profileImage: photoURL } : activity;
    });
  } catch (err) {
    logClientError("useActivities.profileImages", err, { userCount: missingProfileImageUserIds.length });
    return items;
  }
}

export function useActivities() {
  const { user } = useAuth();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Total count (경량 메타데이터 쿼리, 문서 데이터 전송 없음).
  // 첫 피드/LCP 경로와 같은 Firestore 연결을 두고 경쟁하지 않도록 idle 이후로 미룬다.
  // 카운트는 보조 표시라 첫 화면 렌더 완료 뒤 갱신돼도 사용자 흐름에 영향이 없다.
  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      if (cancelled) return;
      setTotalCount(0);

    const col = collection(firestore, "activities");
    const q = user
      ? query(col, and(where("deletedAt", "==", null), or(where("userId", "==", user.uid), where("visibility", "==", "everyone"))))
      : query(col, where("deletedAt", "==", null), where("visibility", "==", "everyone"));
    getCountFromServer(q).then((snap) => {
        if (!cancelled) setTotalCount(snap.data().count);
    }).catch((err) => logClientError("useActivities.count", err, {}));
    };

    // requestIdleCallback 은 Firebase/App Check 준비 중에도 너무 일찍 실행될 수 있어
    // 첫 피드 쿼리와 다시 경쟁한다. 보조 카운트는 LCP 이후에 확실히 보낸다.
    timerId = setTimeout(run, 4500);

    return () => {
      cancelled = true;
      if (timerId != null) clearTimeout(timerId);
    };
  }, [user]);

  const fetchPage = useCallback(async (
    uid: string | null,
    cursor: QueryDocumentSnapshot<DocumentData> | null,
    pageSize = FEED_PAGE_SIZE,
  ) => {
    const col = collection(firestore, "activities");
    let q;

    if (uid) {
      const compositeFilter = and(where("deletedAt", "==", null), or(where("userId", "==", uid), where("visibility", "==", "everyone")));
      q = cursor
        ? query(col, compositeFilter, orderBy("createdAt", "desc"), limit(pageSize), startAfter(cursor))
        : query(col, compositeFilter, orderBy("createdAt", "desc"), limit(pageSize));
    } else {
      q = cursor
        ? query(col, where("deletedAt", "==", null), where("visibility", "==", "everyone"), orderBy("createdAt", "desc"), limit(pageSize), startAfter(cursor))
        : query(col, where("deletedAt", "==", null), where("visibility", "==", "everyone"), orderBy("createdAt", "desc"), limit(pageSize));
    }

    const snap = await getDocs(q);

    // summary 필드가 없는 비정상 문서는 다운스트림 통계 계산에서 크래시를 유발하므로 제외.
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Activity)
      .filter((a) => a.summary != null);
    const hydratedItems = await hydrateActivityProfileImages(items);

    return {
      items: hydratedItems,
      last: snap.docs[snap.docs.length - 1] ?? null,
      hasMore: snap.docs.length === pageSize,
    };
  }, []);

  // 초기 로드 + 유저 변경 시 리셋
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setActivities([]);
      setLastDoc(null);
      setHasMore(true);
      setLoadingMore(false);

      try {
        const first = await fetchPage(user?.uid ?? null, null, FIRST_FEED_CHUNK_SIZE);
        if (cancelled) return;
        setActivities(first.items);
        setLastDoc(first.last);
        setHasMore(first.hasMore);
        setLoading(false);

        if (!first.last || !first.hasMore) return;

        setLoadingMore(true);
        const rest = await fetchPage(user?.uid ?? null, first.last, FEED_PAGE_SIZE - FIRST_FEED_CHUNK_SIZE);
        if (cancelled) return;
        setActivities((prev) => {
          const seen = new Set(prev.map((activity) => activity.id));
          return [...prev, ...rest.items.filter((activity) => !seen.has(activity.id))];
        });
        setLastDoc(rest.last ?? first.last);
        setHasMore(rest.hasMore);
      } catch (err) {
        logClientError("useActivities.initialLoad", err);
      } finally {
        if (!cancelled) setLoading(false);
        if (!cancelled) setLoadingMore(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchPage(user?.uid ?? null, lastDoc);
      setActivities((prev) => [...prev, ...result.items]);
      setLastDoc(result.last);
      setHasMore(result.hasMore);
    } catch (err) {
      logClientError("useActivities.loadMore", err);
    } finally {
      setLoadingMore(false);
    }
  }, [lastDoc, loadingMore, user, fetchPage]);

  return {
    activities,
    totalCount,
    loading,
    loadMore,
    hasMore,
    loadingMore,
  };
}

export function useWeeklyStats() {
  const { user } = useAuth();

  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        // 차트는 최근 12주만 표시하므로 그 윈도우만 가져온다 (perf, 2026-06). 옛 limit(200) 은
        // 활동 많은 유저에게 ~40주치 문서(각 thumbnailTrack 포함)를 끌어와 첫 로드 전송량을
        // 키웠다. createdAt >= startTime 이므로 startTime 이 12주 내인 활동은 createdAt 도 12주
        // 내 → 이 윈도우가 차트에 필요한 활동을 모두 포함. limit(200) 은 안전 상한으로 유지.
        // 기존 인덱스(userId, deletedAt, createdAt) 그대로 사용 — 새 인덱스 불필요.
        const TWELVE_WEEKS_MS = 12 * 7 * 86400000;
        const cutoff = Date.now() - TWELVE_WEEKS_MS;
        const q = query(
          collection(firestore, "activities"),
          where("userId", "==", user.uid),
          where("deletedAt", "==", null),
          where("createdAt", ">=", cutoff),
          orderBy("createdAt", "desc"),
          limit(200),
        );
        const snap = await getDocs(q);
        // summary 누락 문서는 통계 계산에서 크래시를 유발하므로 제외
        setActivities(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Activity)
            .filter((a) => a.summary != null),
        );
      } catch (err) {
        logClientError("useWeeklyStats.load", err);
      }
    };

    load();
  }, [user]);

  const emptyWeeks: WeeklyStat[] = [];
  const emptyThisWeek = { rides: 0, distance: 0, time: 0, elevation: 0 };

  if (!user) {
    return { weeklyStats: emptyWeeks, thisWeek: emptyThisWeek };
  }

  const all = activities;
  const now = new Date();
  const weeks: WeeklyStat[] = [];
  for (let w = 11; w >= 0; w--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - w * 7 - weekStart.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekActivities = all.filter(
      (a) => a.startTime >= weekStart.getTime() && a.startTime < weekEnd.getTime(),
    );

    weeks.push({
      week: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
      distance: Math.round(weekActivities.reduce((s, a) => s + a.summary.distance, 0) / 1000),
      time: Math.round(weekActivities.reduce((s, a) => s + a.summary.ridingTimeMillis, 0) / 3600000 * 10) / 10,
      elevation: Math.round(weekActivities.reduce((s, a) => s + a.summary.elevationGain, 0)),
      rides: weekActivities.length,
      tss: Math.round(weekActivities.reduce((s, a) => s + estimateTSS(a), 0)),
    });
  }

  // 이번 주 = 오늘부터 7일 전
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const thisWeekActivities = all.filter((a) => a.startTime >= sevenDaysAgo.getTime());

  return {
    weeklyStats: weeks,
    thisWeek: {
      rides: thisWeekActivities.length,
      distance: thisWeekActivities.reduce((s, a) => s + a.summary.distance, 0),
      time: thisWeekActivities.reduce((s, a) => s + a.summary.ridingTimeMillis, 0),
      elevation: Math.round(thisWeekActivities.reduce((s, a) => s + a.summary.elevationGain, 0)),
    },
  };
}

function getDateFrom(preset: DatePreset): number | null {
  if (preset === "all") return null;
  const now = new Date();
  switch (preset) {
    case "7d":
      return now.getTime() - 7 * 86400000;
    case "30d":
      return now.getTime() - 30 * 86400000;
    case "90d":
      return now.getTime() - 90 * 86400000;
    case "year": {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return yearStart.getTime();
    }
  }
}

import { useFriends } from "./useFriends";

export type OwnerPreset = "all" | "friends" | "me";

const SEARCH_LIMIT = 50;

/** Server-side keyword search for activities using array-contains */
async function fetchActivitySearchResults(
  keyword: string,
  uid: string | null,
  dateFrom: number | null,
): Promise<Activity[]> {
  const tokens = keyword
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .filter(Boolean);
  if (tokens.length === 0) return [];
  const token = tokens[0]!;

  const col = collection(firestore, "activities");

  // Build queries based on auth state
  const queries: Promise<import("firebase/firestore").QuerySnapshot<DocumentData>>[] = [];

  if (uid) {
    // 1. My activities
    const myConstraints = [
      where("userId", "==", uid),
      where("deletedAt", "==", null),
      where("keywords", "array-contains", token),
      orderBy("startTime", "desc"),
      limit(SEARCH_LIMIT),
    ];
    if (dateFrom !== null) {
      myConstraints.splice(3, 0, where("startTime", ">=", dateFrom));
    }
    queries.push(getDocs(query(col, ...myConstraints)));

    // 2. Public activities (excluding mine)
    const pubConstraints = [
      where("deletedAt", "==", null),
      where("visibility", "==", "everyone"),
      where("keywords", "array-contains", token),
      orderBy("startTime", "desc"),
      limit(SEARCH_LIMIT),
    ];
    if (dateFrom !== null) {
      pubConstraints.splice(3, 0, where("startTime", ">=", dateFrom));
    }
    queries.push(getDocs(query(col, ...pubConstraints)));
  } else {
    // Guest: public only
    const pubConstraints = [
      where("deletedAt", "==", null),
      where("visibility", "==", "everyone"),
      where("keywords", "array-contains", token),
      orderBy("startTime", "desc"),
      limit(SEARCH_LIMIT),
    ];
    if (dateFrom !== null) {
      pubConstraints.splice(3, 0, where("startTime", ">=", dateFrom));
    }
    queries.push(getDocs(query(col, ...pubConstraints)));
  }

  const snaps = await Promise.all(queries);

  // Merge and deduplicate, preserving sort order by startTime desc
  const seen = new Set<string>();
  const merged: Activity[] = [];

  // Interleave results by startTime descending
  const iterators = snaps.map((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }) as Activity));
  const indices = iterators.map(() => 0);

  while (true) {
    let bestIdx = -1;
    let bestTime = -1;

    for (let i = 0; i < iterators.length; i++) {
      if (indices[i]! < iterators[i]!.length) {
        const item = iterators[i]![indices[i]!]!;
        if (item.startTime > bestTime) {
          bestTime = item.startTime;
          bestIdx = i;
        }
      }
    }

    if (bestIdx === -1) break;

    const item = iterators[bestIdx]![indices[bestIdx]!]!;
    indices[bestIdx]!++;

    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  return hydrateActivityProfileImages(merged);
}

export function useActivitySearch() {
  const { user } = useAuth();
  const { friends } = useFriends();

  const [searchResults, setSearchResults] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(false);
  const [searchedKeyword, setSearchedKeyword] = useState("");

  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [ownerPreset, setOwnerPreset] = useState<OwnerPreset>("all");

  const [displayCount, setDisplayCount] = useState(20);

  // Server search: keyword + datePreset triggers new fetch
  const search = useCallback((keyword: string) => {
    const kw = keyword.trim();
    if (!kw) return;

    setActive(true);
    setSearchedKeyword(kw);
    setDatePreset("all");
    setOwnerPreset("all");
    setDisplayCount(20);
  }, []);

  // Re-fetch when keyword or datePreset changes
  useEffect(() => {
    if (!active || !searchedKeyword) return;

    let cancelled = false;
    setLoading(true);

    const dateFrom = getDateFrom(datePreset);

    fetchActivitySearchResults(searchedKeyword, user?.uid ?? null, dateFrom)
      .then((results) => {
        if (!cancelled) setSearchResults(results);
      })
      .catch((err) => {
        logClientError("useActivitySearch.search", err, { datePreset });
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [active, searchedKeyword, datePreset, user]);

  // Reset displayCount when filters change
  useEffect(() => {
    setDisplayCount(20);
  }, [searchedKeyword, datePreset, ownerPreset]);

  // Client-side owner filter (server can't do friends filter efficiently)
  const results = useMemo(() => {
    if (!active) return [];

    let filtered = searchResults;

    if (user && ownerPreset !== "all") {
      if (ownerPreset === "me") {
        filtered = filtered.filter((a) => a.userId === user.uid);
      } else if (ownerPreset === "friends") {
        const friendIds = new Set(friends.map(f => f.userId));
        filtered = filtered.filter((a) => friendIds.has(a.userId));
      }
    }

    return filtered;
  }, [active, searchResults, ownerPreset, user, friends]);

  const loadMore = useCallback(() => setDisplayCount((prev) => prev + 20), []);
  const hasMore = displayCount < results.length;

  const reset = useCallback(() => {
    setActive(false);
    setSearchedKeyword("");
    setDatePreset("all");
    setOwnerPreset("all");
    setSearchResults([]);
  }, []);

  return {
    search,
    datePreset,
    setDatePreset,
    ownerPreset,
    setOwnerPreset,
    results: results.slice(0, displayCount),
    totalResults: results.length,
    loading,
    loadMore,
    hasMore,
    active,
    reset,
  };
}
