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
import { getDiscipline } from "../utils/disciplineFilter";
import {
  executeFirestoreSessionRecovery,
  firestoreRecoveryLogContext,
  prepareFirestoreSessionRecovery,
} from "../utils/firestoreSessionRecovery";

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
const FEED_LOAD_TIMEOUT_MS = 12_000;
// 친구 피드는 userId(in)의 각 후보마다 rules의 양방향 친구 exists() 검사를 수행한다.
// 단일 쿼리의 rules 문서 접근 호출 한도(10)를 넘지 않도록 10명씩 나눈다. visibility(in)
// 두 값과 곱해진 DNF 분기도 20개라 Firestore의 30-disjunction 한도 안에 남는다.
const FRIEND_QUERY_CHUNK_SIZE = 10;

class ActivityFeedTimeoutError extends Error {
  constructor() {
    super("activity-feed-timeout");
    this.name = "ActivityFeedTimeoutError";
  }
}

function isActivityFeedTimeoutError(error: unknown): error is ActivityFeedTimeoutError {
  return error instanceof ActivityFeedTimeoutError;
}

function withActivityFeedTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new ActivityFeedTimeoutError());
    }, FEED_LOAD_TIMEOUT_MS);
    request.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function handleActivityFeedError(
  source: string,
  error: unknown,
  context?: Record<string, unknown>,
): boolean {
  const recovery = prepareFirestoreSessionRecovery(error);
  logClientError(source, error, {
    ...context,
    ...firestoreRecoveryLogContext(recovery),
  });
  if (recovery.action === "reload-ready") executeFirestoreSessionRecovery(recovery);
  // 이미 한 번 reload했거나 sessionStorage를 사용할 수 없어도 fatal signature가
  // 확인된 AsyncQueue에서 재시도하면 같은 assertion만 증폭된다.
  return recovery.kind !== null;
}

function logActivityFeedTimeout(source: string, context?: Record<string, unknown>): void {
  logClientError(source, new ActivityFeedTimeoutError(), {
    ...context,
    timeoutMs: FEED_LOAD_TIMEOUT_MS,
  });
}

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

/**
 * 피드 정렬키 — **실제 운동 시각**(startTime). 업로드 시각(createdAt)으로 정렬하면
 * 지난 라이딩을 나중에 올리거나 Strava 동기화·앱 재업로드가 끼는 순간 오래된 활동이
 * 맨 위로 올라와, 카드에 찍힌 날짜와 목록 순서가 어긋난다.
 * 소스 쿼리의 orderBy 와 반드시 같은 키를 써야 한다 — 커서 페이지네이션이 소스별
 * 쿼리 순서와 이 비교자의 병합 순서가 일치한다는 전제로 동작한다.
 */
function activitySortTime(item: BufferedActivity): number {
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

export interface UseActivitiesOptions {
  enabled?: boolean;
}

export function useActivities(
  scope: ActivityFeedScope = "all",
  friendIds: readonly string[] = [],
  options: UseActivitiesOptions = {},
) {
  const enabled = options.enabled ?? true;
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
  const mountedRef = useRef(true);
  if (feedRequestKeyRef.current !== feedRequestKey) {
    feedRequestKeyRef.current = feedRequestKey;
    feedRequestGenerationRef.current += 1;
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      feedRequestGenerationRef.current += 1;
    };
  }, []);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(enabled);
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
    if (!enabled) {
      setTotalCount(0);
      return;
    }
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
  }, [enabled, authLoading, user, buildSourceQueries, scope]);

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
          // 정렬키를 바꿀 때는 위 activitySortTime 과 인덱스를 함께 확인할 것.
          // 인덱스(orider-g1-web `firestore/firestore.indexes.json`):
          //   본인   `deletedAt, userId, startTime DESC`
          //   공개   `deletedAt, visibility, startTime DESC`
          //   친구   `userId, deletedAt, visibility, startTime DESC` (#2362 로 추가)
          orderBy("startTime", "desc"),
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
      // 같은 startTime에서는 각 Firestore 쿼리가 돌려준 순서를 유지한다. Array#sort의
      // stable ordering 덕분에 단일 소스는 원래 쿼리 순서가 바뀌지 않고, 여러 친구
      // 소스도 임의의 activity id 정렬로 카드가 재배치되지 않는다.
      .sort((left, right) => activitySortTime(right.item) - activitySortTime(left.item));
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

    // Firestore의 poisoned AsyncQueue는 getDocs Promise를 resolve/reject하지 않은 채
    // 남길 수 있다. 공유 Map에는 deadline이 적용된 Promise를 저장해 timeout 뒤 반드시
    // 제거하고, 이후 auth generation이 같은 멈춘 요청에 다시 합류하지 않게 한다.
    const request = withActivityFeedTimeout(fetchPageRequest(uid, cursor, pageSize));
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
    if (!enabled) {
      setActivities([]);
      setFeedCursor(null);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
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
          if (cancelled) return null;
          if (isActivityFeedTimeoutError(retryErr)) {
            logActivityFeedTimeout("useActivities.initialLoad.timeout", {
              context,
              scope,
            });
            return null;
          }
          const recoveryAborted = handleActivityFeedError("useActivities.initialLoad.retry", retryErr, {
            context,
            delayMs,
          });
          debugLog("useActivities.initialLoad.retry", {
            context,
            delayMs,
            message: retryErr instanceof Error ? retryErr.message : String(retryErr),
          });
          if (recoveryAborted) return null;
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
        if (cancelled) return;
        if (isActivityFeedTimeoutError(err)) {
          logActivityFeedTimeout("useActivities.initialLoad.timeout", {
            context: "first",
            scope,
          });
          if (!cancelled) {
            setHasMore(false);
            setLoading(false);
          }
          return;
        }
        if (handleActivityFeedError("useActivities.initialLoad.first", err, { scope })) {
          if (!cancelled) {
            setHasMore(false);
            setLoading(false);
          }
          return;
        }
        first = await retryFetchPage(null, FIRST_FEED_CHUNK_SIZE, "first");
      }

      try {
        if (!first) {
          if (!cancelled) setHasMore(false);
          return;
        }
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
          if (cancelled) return;
          if (isActivityFeedTimeoutError(err)) {
            logActivityFeedTimeout("useActivities.initialLoad.timeout", {
              context: "rest",
              scope,
            });
            setHasMore(false);
            return;
          }
          if (handleActivityFeedError("useActivities.initialLoad.rest", err, { scope })) return;
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
  }, [enabled, authLoading, user, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!enabled || !feedCursor || loadingMore) return;
    const requestKey = feedRequestKey;
    const requestGeneration = feedRequestGenerationRef.current;
    const isCurrentRequest = () => (
      mountedRef.current
      && feedRequestKeyRef.current === requestKey
      && feedRequestGenerationRef.current === requestGeneration
    );
    setLoadingMore(true);
    try {
      const result = await fetchPage(user?.uid ?? null, feedCursor);
      // 필터/사용자/친구 목록이 바뀐 동안 끝난 이전 요청은 새 피드에 섞지 않는다.
      // A→B→A처럼 키가 되돌아와도 단조 증가 generation으로 옛 A 요청을 구분한다.
      if (!isCurrentRequest()) return;
      setActivities((prev) => [...prev, ...result.items]);
      setFeedCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (err) {
      if (!isCurrentRequest()) return;
      if (isActivityFeedTimeoutError(err)) {
        logActivityFeedTimeout("useActivities.loadMore.timeout", { scope });
        setHasMore(false);
      } else {
        handleActivityFeedError("useActivities.loadMore", err, { scope });
      }
    } finally {
      if (isCurrentRequest()) {
        setLoadingMore(false);
      }
    }
  }, [enabled, feedCursor, loadingMore, user, fetchPage, feedRequestKey]);

  return {
    activities,
    totalCount,
    loading,
    loadMore,
    hasMore,
    loadingMore,
  };
}

type WeeklyStatsOptions = {
  includeMonthlyDistance?: boolean;
  now?: Date;
};

export function useWeeklyStats(nowOrOptions: Date | WeeklyStatsOptions = new Date()) {
  const { user } = useAuth();
  const options = nowOrOptions instanceof Date ? null : nowOrOptions;
  const now = nowOrOptions instanceof Date ? nowOrOptions : (nowOrOptions.now ?? new Date());
  const includeMonthlyDistance = options?.includeMonthlyDistance ?? false;

  const [activities, setActivities] = useState<Activity[]>([]);
  const year = now.getFullYear();
  const month = now.getMonth();
  const statsKey = user ? `${user.uid}:${year}-${month}` : null;
  const [monthlyDistanceState, setMonthlyDistanceState] = useState<{ key: string; distance: number } | null>(null);

  useEffect(() => {
    if (!user) {
      setActivities([]);
      setMonthlyDistanceState(null);
      return;
    }
    let cancelled = false;
    const uid = user.uid;
    const requestStatsKey = `${uid}:${year}-${month}`;

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
          where("userId", "==", uid),
          where("deletedAt", "==", null),
          where("createdAt", ">=", cutoff),
          orderBy("createdAt", "desc"),
          limit(200),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const loadedActivities = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Activity);
        // summary 누락 문서는 통계 계산에서 크래시를 유발하므로 제외
        setActivities(
          loadedActivities
            // 쿼리 자체도 userId 로 제한하지만, 집계 경계에서도 소유자를 확인해 공개 피드나
            // 잘못 합쳐진 응답이 개인 주간 통계에 섞이지 않게 한다.
            .filter((a) => a.userId === uid && a.summary != null),
        );

        if (!includeMonthlyDistance) return;

        const monthStart = new Date(year, month, 1).getTime();
        const monthEnd = new Date(year, month + 1, 1).getTime();
        if (snap.docs.length < 200) {
          // 현재 달은 12주 창 안에 있으므로 상한에 닿지 않은 응답은 월간 거리에도 완전하다.
          // 대시보드의 별도 월간 쿼리를 없애고 같은 문서로 정확히 집계한다.
          setMonthlyDistanceState({ key: requestStatsKey, distance: loadedActivities.reduce((sum, activity) => (
            activity.userId === uid &&
            activity.startTime >= monthStart &&
            activity.startTime < monthEnd
              ? sum + (activity.summary?.distance ?? 0)
              : sum
          ), 0) });
          return;
        }

        // 200개 상한에 닿은 고활동 계정은 12주 응답이 잘렸을 수 있다. 이 경우에만 기존
        // 월간 쿼리를 실행해 월간 목표 진행률의 정확도를 그대로 보존한다.
        const monthlyQuery = query(
          collection(firestore, "activities"),
          where("deletedAt", "==", null),
          where("userId", "==", uid),
          where("startTime", ">=", monthStart),
          where("startTime", "<", monthEnd),
          orderBy("startTime", "desc"),
        );
        const monthlySnap = await getDocs(monthlyQuery);
        if (cancelled) return;
        setMonthlyDistanceState({ key: requestStatsKey, distance: monthlySnap.docs.reduce((sum, d) => {
          const activity = { id: d.id, ...d.data() } as Activity;
          return sum + (activity.summary?.distance ?? 0);
        }, 0) });
      } catch (err) {
        if (!cancelled) logClientError("useWeeklyStats.load", err, { userId: uid });
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user, year, month, includeMonthlyDistance]);

  const emptyWeeks: WeeklyStat[] = [];
  const emptyThisWeek = { rides: 0, distance: 0, time: 0, elevation: 0 };
  const emptyRecent7DayDistances = { bike: 0, run: 0, swim: 0 };

  if (!user) {
    return {
      weeklyStats: emptyWeeks,
      thisWeek: emptyThisWeek,
      recent7DayDistances: emptyRecent7DayDistances,
      monthlyActivityDistance: 0,
    };
  }

  // 계정 전환 직후 이전 effect 결과가 잠깐 남아도 새 사용자의 통계로 노출하지 않는다.
  const all = activities.filter((activity) => activity.userId === user.uid);
  const monthlyActivityDistance = includeMonthlyDistance && monthlyDistanceState?.key === statsKey
    ? monthlyDistanceState.distance
    : 0;
  const summaryNumber = (value: unknown): number => (
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
  );
  const activityDistance = (activity: Activity): number => summaryNumber(activity.summary.distance);
  const activityDurationMillis = (activity: Activity): number => {
    const ridingTime = summaryNumber(activity.summary.ridingTimeMillis);
    if (ridingTime > 0) return ridingTime;
    const elapsedTime = summaryNumber(activity.summary.elapsedTimeMillis);
    if (elapsedTime > 0) return elapsedTime;
    return summaryNumber(activity.summary.movingTimeSec) * 1000;
  };
  const activityElevation = (activity: Activity): number => summaryNumber(activity.summary.elevationGain);
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
      distance: Math.round(weekActivities.reduce((s, a) => s + activityDistance(a), 0) / 1000),
      time: Math.round(weekActivities.reduce((s, a) => s + activityDurationMillis(a), 0) / 3600000 * 10) / 10,
      elevation: Math.round(weekActivities.reduce((s, a) => s + activityElevation(a), 0)),
      rides: weekActivities.length,
      tss: Math.round(weekActivities.reduce((s, a) => s + estimateTSS(a), 0)),
    });
  }

  // 이번 주 = 오늘부터 7일 전
  const sevenDaysAgo = now.getTime() - 7 * 86400000;
  const thisWeekActivities = all.filter(
    (a) => a.startTime >= sevenDaysAgo && a.startTime <= now.getTime(),
  );
  const recent7DayDistances = thisWeekActivities.reduce(
    (distances, activity) => {
      const discipline = getDiscipline(activity.type);
      if (discipline === "bike" || discipline === "run" || discipline === "swim") {
        distances[discipline] += activityDistance(activity);
      }
      return distances;
    },
    { ...emptyRecent7DayDistances },
  );

  return {
    weeklyStats: weeks,
    thisWeek: {
      rides: thisWeekActivities.length,
      distance: thisWeekActivities.reduce((s, a) => s + activityDistance(a), 0),
      time: thisWeekActivities.reduce((s, a) => s + activityDurationMillis(a), 0),
      elevation: Math.round(thisWeekActivities.reduce((s, a) => s + activityElevation(a), 0)),
    },
    recent7DayDistances,
    monthlyActivityDistance,
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

export function useActivitySearch(friendIds: ReadonlySet<string>) {
  const { user } = useAuth();

  const searchOwnerKey = user?.uid ?? "anonymous";
  const [searchResultState, setSearchResultState] = useState<{ ownerKey: string; results: Activity[] } | null>(null);
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
        if (!cancelled) setSearchResultState({ ownerKey: searchOwnerKey, results });
      })
      .catch((err) => {
        logClientError("useActivitySearch.search", err, { datePreset });
        if (!cancelled) setSearchResultState({ ownerKey: searchOwnerKey, results: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [active, searchedKeyword, datePreset, user, searchOwnerKey]);

  // Reset displayCount when filters change
  useEffect(() => {
    setDisplayCount(20);
  }, [searchedKeyword, datePreset, ownerPreset]);

  // Client-side owner filter (server can't do friends filter efficiently)
  const results = useMemo(() => {
    if (!active) return [];

    let filtered = searchResultState?.ownerKey === searchOwnerKey ? searchResultState.results : [];

    if (user && ownerPreset !== "all") {
      if (ownerPreset === "me") {
        filtered = filtered.filter((a) => a.userId === user.uid);
      } else if (ownerPreset === "friends") {
        filtered = filtered.filter((a) => friendIds.has(a.userId));
      }
    }

    return filtered;
  }, [active, searchResultState, searchOwnerKey, ownerPreset, user, friendIds]);

  const loadMore = useCallback(() => setDisplayCount((prev) => prev + 20), []);
  const hasMore = displayCount < results.length;

  const reset = useCallback(() => {
    setActive(false);
    setSearchedKeyword("");
    setDatePreset("all");
    setOwnerPreset("all");
    setSearchResultState(null);
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
