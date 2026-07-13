import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  type QueryConstraint,
  type QueryCompositeFilterConstraint,
  type QueryNonFilterConstraint,
  type CollectionReference,
} from "firebase/firestore";
import { firestore } from "../services/firebase";
import { debugLog, logClientError } from "../services/errorLogger";
import { getPublicUserProfiles } from "../services/publicProfiles";
import { useAuth } from "../contexts/AuthContext";
import type { Activity } from "@shared/types";
import type { WeeklyStat } from "../components/WeeklyChart";
import { estimateTSS } from "../utils/estimateTSS";
import { isPermissionDeniedError } from "../utils/firebaseErrors";

export type DatePreset = "all" | "7d" | "30d" | "90d" | "year";

// 첫 로드 비용 절감 (perf, 2026-06): 피드 첫 페이지를 10개로. 활동 문서는 thumbnailTrack
// (인코딩 폴리라인) 을 품어 doc 당 수~수십 KB → 20→10 으로 초기 전송량 반감. 더불어
// mapImageUrl 없는 활동이 초기 뷰포트에 끼어 RouteMap(mapbox-gl 1.6MB)을 끌어올 확률도 감소.
// 추가 로드는 loadMore() 무한스크롤로 충당.
const FEED_PAGE_SIZE = 10;
// 첫 카드 노출을 앞당기기 위해 첫 쿼리는 접힘 영역에 필요한 카드만 가져오고,
// 나머지 첫 페이지는 백그라운드에서 이어 붙인다.
const FIRST_FEED_CHUNK_SIZE = 3;
const FEED_LOAD_RETRY_DELAYS_MS = [600, 1600] as const;
// 친구 피드는 userId(in)의 각 후보마다 rules의 양방향 친구 exists() 검사를 수행한다.
// 단일 쿼리의 rules 문서 접근 호출 한도(10)를 넘지 않도록 10명씩 나눈다. visibility(in)
// 두 값과 곱해진 DNF 분기도 20개라 Firestore의 30-disjunction 한도 안에 남는다.
const FRIEND_QUERY_CHUNK_SIZE = 10;

export type ActivityFeedScope = "all" | "friends" | "self";

type BufferedActivity = {
  activity: Activity;
  doc: QueryDocumentSnapshot<DocumentData>;
};

type FeedSourceCursor = {
  ownerIds: string[] | null;
  last: QueryDocumentSnapshot<DocumentData> | null;
  exhausted: boolean;
  buffer: BufferedActivity[];
};

type FeedCursor = {
  sources: FeedSourceCursor[];
};

type ActivityPage = {
  items: Activity[];
  cursor: FeedCursor | null;
  hasMore: boolean;
};

type FeedSourceQuery = {
  ownerIds: string[] | null;
  composite: QueryCompositeFilterConstraint | null;
  filters: QueryConstraint[];
};

function makeSourceQuery(
  col: CollectionReference<DocumentData>,
  source: FeedSourceQuery,
  trailing: QueryNonFilterConstraint[] = [],
) {
  return source.composite
    ? query(col, source.composite, ...trailing)
    : query(col, ...source.filters, ...trailing);
}

function chunkFriendIds(friendIds: readonly string[]): string[][] {
  const uniqueIds = Array.from(new Set(friendIds.filter(Boolean)));
  const chunks: string[][] = [];
  for (let index = 0; index < uniqueIds.length; index += FRIEND_QUERY_CHUNK_SIZE) {
    chunks.push(uniqueIds.slice(index, index + FRIEND_QUERY_CHUNK_SIZE));
  }
  return chunks;
}

function activityCreatedAt(item: BufferedActivity): number {
  const createdAt = item.doc.data().createdAt;
  if (typeof createdAt === "number") return createdAt;
  if (createdAt && typeof createdAt === "object" && "toMillis" in createdAt) {
    return (createdAt as { toMillis: () => number }).toMillis();
  }
  return item.activity.startTime;
}

const activityPageRequests = new Map<string, Promise<ActivityPage>>();

function feedCursorRequestKey(cursor: FeedCursor | null): unknown {
  return cursor?.sources.map((source) => ({
    ownerIds: source.ownerIds,
    lastPath: source.last?.ref.path ?? null,
    exhausted: source.exhausted,
    bufferedActivityIds: source.buffer.map(({ activity }) => activity.id),
  })) ?? null;
}

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
    if (isPermissionDeniedError(err)) return items;
    logClientError("useActivities.profileImages", err, { userCount: missingProfileImageUserIds.length });
    return items;
  }
}

export function useActivities(scope: ActivityFeedScope = "all", friendIds: readonly string[] = []) {
  const { user, loading: authLoading } = useAuth();
  const friendIdsKey = useMemo(
    () => Array.from(new Set(friendIds.filter(Boolean))).sort().join("\u0000"),
    [friendIds],
  );
  // 전체/본인 피드는 친구 목록을 사용하지 않는다. 로그인 직후 useFriends가 []에서
  // 실제 목록으로 바뀌어도 이 두 범위의 피드·커서가 불필요하게 초기화되지 않게 한다.
  const activeFriendIdsKey = scope === "friends" ? friendIdsKey : "";
  const stableFriendIds = useMemo(
    () => activeFriendIdsKey ? activeFriendIdsKey.split("\u0000") : [],
    [activeFriendIdsKey],
  );
  const feedRequestKey = JSON.stringify([
    user == null ? "anonymous" : "authenticated",
    user?.uid ?? null,
    scope,
    activeFriendIdsKey,
  ]);
  const feedRequestKeyRef = useRef(feedRequestKey);
  const feedRequestGenerationRef = useRef(0);
  if (feedRequestKeyRef.current !== feedRequestKey) {
    feedRequestKeyRef.current = feedRequestKey;
    feedRequestGenerationRef.current += 1;
  }

  const [activities, setActivities] = useState<Activity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [feedCursor, setFeedCursor] = useState<FeedCursor | null>(null);

  const buildSourceQueries = useCallback((uid: string | null): FeedSourceQuery[] => {
    if (scope === "self") {
      return uid
        ? [{ ownerIds: null, composite: null, filters: [where("deletedAt", "==", null), where("userId", "==", uid)] }]
        : [];
    }
    if (scope === "friends") {
      if (!uid) return [];
      return chunkFriendIds(stableFriendIds).map((ownerIds) => ({
        ownerIds,
        composite: null,
        filters: [
          where("deletedAt", "==", null),
          where("userId", "in", ownerIds),
          where("visibility", "in", ["everyone", "friends"]),
        ],
      }));
    }
    return [{
      ownerIds: null,
      composite: uid
        ? and(where("deletedAt", "==", null), or(where("userId", "==", uid), where("visibility", "==", "everyone")))
        : null,
      filters: uid ? [] : [where("deletedAt", "==", null), where("visibility", "==", "everyone")],
    }];
  }, [scope, stableFriendIds]);

  // Total count (경량 메타데이터 쿼리, 문서 데이터 전송 없음).
  // 첫 피드/LCP 경로와 같은 Firestore 연결을 두고 경쟁하지 않도록 idle 이후로 미룬다.
  // 카운트는 보조 표시라 첫 화면 렌더 완료 뒤 갱신돼도 사용자 흐름에 영향이 없다.
  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    // 범위가 바뀐 직후 이전 범위의 건수를 새 라벨로 보여주지 않는다.
    setTotalCount(0);

    const run = () => {
      if (cancelled) return;

      const col = collection(firestore, "activities");
      const sourceQueries = buildSourceQueries(user?.uid ?? null);
      Promise.all(sourceQueries.map((source) => getCountFromServer(makeSourceQuery(col, source))))
        .then((snaps) => {
          if (!cancelled) setTotalCount(snaps.reduce((sum, snap) => sum + snap.data().count, 0));
        })
        .catch((err) => logClientError("useActivities.count", err, { scope }));
    };

    // requestIdleCallback 은 Firebase/App Check 준비 중에도 너무 일찍 실행될 수 있어
    // 첫 피드 쿼리와 다시 경쟁한다. 보조 카운트는 LCP 이후에 확실히 보낸다.
    timerId = setTimeout(run, 4500);

    return () => {
      cancelled = true;
      if (timerId != null) clearTimeout(timerId);
    };
  }, [authLoading, user, buildSourceQueries, scope]);

  const fetchPageRequest = useCallback(async (
    uid: string | null,
    cursor: FeedCursor | null,
    pageSize = FEED_PAGE_SIZE,
  ): Promise<ActivityPage> => {
    const col = collection(firestore, "activities");
    const sourceQueries = buildSourceQueries(uid);
    const previousSources = cursor?.sources ?? sourceQueries.map((source) => ({
      ownerIds: source.ownerIds,
      last: null,
      exhausted: false,
      buffer: [],
    }));

    const sources = await Promise.all(previousSources.map(async (source, index): Promise<FeedSourceCursor> => {
      if (source.buffer.length >= pageSize || source.exhausted) return source;
      const sourceQuery = sourceQueries[index];
      if (!sourceQuery) return { ...source, exhausted: true };
      let nextSource = source;

      // 각 소스가 pageSize개의 유효 문서 또는 실제 끝에 도달할 때까지 frontier를
      // 전진시킨다. summary 없는 비정상 문서를 제외한 뒤 buffer가 짧은 상태에서 다른
      // 소스의 오래된 항목을 먼저 내보내면 다음 페이지에 더 최신 항목이 나타날 수 있다.
      while (nextSource.buffer.length < pageSize && !nextSource.exhausted) {
        const constraints = [
          orderBy("createdAt", "desc"),
          limit(pageSize),
          ...(nextSource.last ? [startAfter(nextSource.last)] : []),
        ];
        const snap = await getDocs(makeSourceQuery(col, sourceQuery, constraints));
        nextSource = {
          ...nextSource,
          last: snap.docs[snap.docs.length - 1] ?? nextSource.last,
          exhausted: snap.docs.length < pageSize,
          buffer: [
            ...nextSource.buffer,
            ...snap.docs
              .map((doc) => ({ doc, activity: ({ id: doc.id, ...doc.data() }) as Activity }))
              .filter(({ activity }) => activity.summary != null),
          ],
        };
      }
      return nextSource;
    }));

    const merged = sources
      .flatMap((source, sourceIndex) => source.buffer.map((item) => ({ item, sourceIndex })))
      // 같은 createdAt에서는 각 Firestore 쿼리가 돌려준 순서를 유지한다. Array#sort의
      // stable ordering 덕분에 단일 소스는 원래 쿼리 순서가 바뀌지 않고, 여러 친구
      // 소스도 임의의 activity id 정렬로 카드가 재배치되지 않는다.
      .sort((left, right) => activityCreatedAt(right.item) - activityCreatedAt(left.item));
    const selected = merged.slice(0, pageSize);
    const consumedBySource = new Map<number, Set<string>>();
    selected.forEach(({ item, sourceIndex }) => {
      const consumed = consumedBySource.get(sourceIndex) ?? new Set<string>();
      consumed.add(item.activity.id);
      consumedBySource.set(sourceIndex, consumed);
    });
    const nextSources = sources.map((source, sourceIndex) => ({
      ...source,
      buffer: source.buffer.filter((item) => !consumedBySource.get(sourceIndex)?.has(item.activity.id)),
    }));
    const hydratedItems = await hydrateActivityProfileImages(selected.map(({ item }) => item.activity));
    const hasMore = nextSources.some((source) => source.buffer.length > 0 || !source.exhausted);

    return {
      items: hydratedItems,
      cursor: hasMore ? { sources: nextSources } : null,
      hasMore,
    };
  }, [buildSourceQueries]);

  const fetchPage = useCallback((
    uid: string | null,
    cursor: FeedCursor | null,
    pageSize = FEED_PAGE_SIZE,
  ): Promise<ActivityPage> => {
    const key = JSON.stringify([
      uid == null ? "anonymous" : "authenticated",
      uid,
      scope,
      activeFriendIdsKey,
      feedCursorRequestKey(cursor),
      pageSize,
    ]);
    const existing = activityPageRequests.get(key);
    if (existing) return existing;

    const request = fetchPageRequest(uid, cursor, pageSize);
    activityPageRequests.set(key, request);
    void request.finally(() => {
      if (activityPageRequests.get(key) === request) activityPageRequests.delete(key);
    }).catch(() => {
      // 원래 request의 rejection은 호출자가 처리한다. finally 파생 Promise만 흡수한다.
    });
    return request;
  }, [activeFriendIdsKey, fetchPageRequest, scope]);

  // 초기 로드 + 유저 변경 시 리셋
  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    const retryFetchPage = async (
      cursor: FeedCursor | null,
      pageSize: number,
      context: "first" | "rest",
    ): Promise<ActivityPage | null> => {
      for (const delayMs of FEED_LOAD_RETRY_DELAYS_MS) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (cancelled) return null;

        try {
          return await fetchPage(user?.uid ?? null, cursor, pageSize);
        } catch (retryErr) {
          debugLog("useActivities.initialLoad.retry", {
            context,
            delayMs,
            message: retryErr instanceof Error ? retryErr.message : String(retryErr),
          });
        }
      }

      logClientError("useActivities.initialLoad.retryExhausted", new Error("activity feed retry exhausted"), { context });
      return null;
    };

    const load = async () => {
      setLoading(true);
      setActivities([]);
      setFeedCursor(null);
      setHasMore(true);
      setLoadingMore(false);

      let first: ActivityPage | null = null;
      try {
        first = await fetchPage(user?.uid ?? null, null, FIRST_FEED_CHUNK_SIZE);
      } catch (err) {
        logClientError("useActivities.initialLoad.first", err);
        first = await retryFetchPage(null, FIRST_FEED_CHUNK_SIZE, "first");
      }

      try {
        if (!first) return;
        if (cancelled) return;
        setActivities(first.items);
        setFeedCursor(first.cursor);
        setHasMore(first.hasMore);
        setLoading(false);

        if (!first.cursor || !first.hasMore) return;

        setLoadingMore(true);
        let rest: ActivityPage | null = null;
        try {
          rest = await fetchPage(user?.uid ?? null, first.cursor, FEED_PAGE_SIZE - FIRST_FEED_CHUNK_SIZE);
        } catch (err) {
          logClientError("useActivities.initialLoad.rest", err);
          rest = await retryFetchPage(first.cursor, FEED_PAGE_SIZE - FIRST_FEED_CHUNK_SIZE, "rest");
        }
        if (!rest) return;
        if (cancelled) return;
        setActivities((prev) => {
          const seen = new Set(prev.map((activity) => activity.id));
          return [...prev, ...rest.items.filter((activity) => !seen.has(activity.id))];
        });
        setFeedCursor(rest.cursor);
        setHasMore(rest.hasMore);
      } finally {
        if (!cancelled) setLoading(false);
        if (!cancelled) setLoadingMore(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [authLoading, user, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!feedCursor || loadingMore) return;
    const requestKey = feedRequestKey;
    const requestGeneration = feedRequestGenerationRef.current;
    setLoadingMore(true);
    try {
      const result = await fetchPage(user?.uid ?? null, feedCursor);
      // 필터/사용자/친구 목록이 바뀐 동안 끝난 이전 요청은 새 피드에 섞지 않는다.
      // A→B→A처럼 키가 되돌아와도 단조 증가 generation으로 옛 A 요청을 구분한다.
      if (feedRequestKeyRef.current !== requestKey || feedRequestGenerationRef.current !== requestGeneration) return;
      setActivities((prev) => [...prev, ...result.items]);
      setFeedCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (err) {
      logClientError("useActivities.loadMore", err);
    } finally {
      if (feedRequestKeyRef.current === requestKey && feedRequestGenerationRef.current === requestGeneration) {
        setLoadingMore(false);
      }
    }
  }, [feedCursor, loadingMore, user, fetchPage, feedRequestKey]);

  return {
    activities,
    totalCount,
    loading,
    loadMore,
    hasMore,
    loadingMore,
  };
}

export function useWeeklyStats(now: Date = new Date()) {
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
  const weeks: WeeklyStat[] = [];
  for (let w = 11; w >= 0; w--) {
    const weekStart = new Date(now);
    const daysSinceMonday = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - w * 7 - daysSinceMonday);
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

export function useMonthlyActivityDistance(now: Date = new Date()) {
  const { user } = useAuth();
  const [distance, setDistance] = useState(0);
  const year = now.getFullYear();
  const month = now.getMonth();

  useEffect(() => {
    if (!user) {
      setDistance(0);
      return;
    }

    let cancelled = false;
    const start = new Date(year, month, 1).getTime();
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();

    const load = async () => {
      try {
        const q = query(
          collection(firestore, "activities"),
          where("deletedAt", "==", null),
          where("userId", "==", user.uid),
          where("startTime", ">=", start),
          where("startTime", "<=", end),
          orderBy("startTime", "desc"),
        );
        const snap = await getDocs(q);
        const totalDistance = snap.docs.reduce((sum, d) => {
          const activity = { id: d.id, ...d.data() } as Activity;
          return sum + (activity.summary?.distance ?? 0);
        }, 0);
        if (!cancelled) setDistance(totalDistance);
      } catch (err) {
        logClientError("useMonthlyActivityDistance.load", err, { userId: user.uid, start, end });
        if (!cancelled) setDistance(0);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user, year, month]);

  return distance;
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
