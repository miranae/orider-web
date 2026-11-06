import { useCallback, useEffect, useRef, useState } from "react";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from "../../services/errorLogger";
import type { SortMode } from "./courseCatalog";
import {
  replaceCourseSnapshotDocs,
  type CourseData,
  type LatLngTuple,
} from "./courseSnapshot";
import { isVisibleCourseDocData } from "./courseVisibility";
import { runCourseListQuery, type CourseListCursor, type CourseListServices } from "./courseListRest";

import { SEARCH_PAGE_SIZE } from "../../hooks/usePagedSearch";

const PAGE_SIZE = SEARCH_PAGE_SIZE;
const SEARCH_LIMIT = SEARCH_PAGE_SIZE;

function orderFieldForSort(sortMode: SortMode) {
  return sortMode === "popular" ? "likeCount" : "createdAt";
}

export function useCourseCatalog(sortMode: SortMode = "latest", creatorId?: string, pageSize = PAGE_SIZE, enabled = true) {
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<CourseListCursor | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const requestIdRef = useRef(0);
  const polylineCache = useRef<Map<string, LatLngTuple[]>>(new Map());
  const polylineValueCache = useRef<Map<string, string>>(new Map());

  // 임베드는 별도 Firebase app 을 쓴다 — 싱글턴 대신 주입된 인스턴스(#847).
  const { firestore, auth, getAppCheckToken } = useFirebaseServices();
  const fetchPage = useCallback(async (reset: boolean) => {
    if (reset) {
      setLoading(true);
      setLoadingMore(false);
      setError(null);
      setHasMore(true);
      loadingMoreRef.current = false;
      hasMoreRef.current = true;
      cursorRef.current = null;
    } else {
      if (loadingMoreRef.current || !hasMoreRef.current) return;
      setLoadingMore(true);
      loadingMoreRef.current = true;
    }

    const requestId = ++requestIdRef.current;

    try {
      const pageLimit = Math.min(pageSize, SEARCH_PAGE_SIZE);
      // 목록에 필요한 필드만 받는다(#3235) — 전체 문서는 trackPoints 때문에 페이지당 수십 MB 다.
      const page = await runCourseListQuery({ firestore, auth, getAppCheckToken }, {
        orderField: orderFieldForSort(sortMode),
        direction: "DESCENDING",
        limit: pageLimit,
        creatorId,
        cursor: reset ? null : cursorRef.current,
      });
      if (requestId !== requestIdRef.current) return;
      const docs = page.docs.filter((item) => isVisibleCourseDocData(item.data));
      const nextCourses = replaceCourseSnapshotDocs(docs, polylineCache.current, polylineValueCache.current);
      cursorRef.current = page.cursor ?? cursorRef.current;
      const nextHasMore = page.rawCount === pageLimit;
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
      setCourses((prev) => reset ? nextCourses : [...prev, ...nextCourses]);
    } catch (err) {
      if (reset) {
        setCourses([]);
        setError(err);
      }
      logClientError("CoursesPage.coursePageLoad", err, { sortMode, reset });
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    }
  }, [firestore, auth, getAppCheckToken, sortMode, creatorId, pageSize]);

  useEffect(() => {
    if (enabled) void fetchPage(true);
    else { setLoading(false); setCourses([]); }
  }, [fetchPage, enabled]);

  return {
    courses,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore: () => fetchPage(false),
    retry: () => fetchPage(true),
    polylineCache,
  };
}

export async function searchVisibleCoursesPage(
  services: CourseListServices,
  searchText: string,
  maxCount = SEARCH_LIMIT,
  polylineCache: Map<string, LatLngTuple[]> = new Map(),
  polylineValueCache: Map<string, string> = new Map(),
  creatorId?: string,
  cursor: CourseListCursor | null = null,
): Promise<{ items: CourseData[]; cursor: CourseListCursor | null; hasMore: boolean }> {
  const text = searchText.trim();
  if (!text) return { items: [], cursor: null, hasMore: false };

  const pageLimit = Math.min(maxCount, SEARCH_PAGE_SIZE);
  const page = await runCourseListQuery(services, {
    orderField: "name",
    direction: "ASCENDING",
    limit: pageLimit,
    creatorId,
    namePrefix: text,
    cursor,
  });

  const normalized = text.toLowerCase();
  const docs = page.docs
    .filter((item) => isVisibleCourseDocData(item.data))
    .filter((item) => String(item.data.name ?? "").toLowerCase().includes(normalized));

  return { items: replaceCourseSnapshotDocs(docs, polylineCache, polylineValueCache), cursor: page.cursor, hasMore: page.rawCount === pageLimit };
}

export async function searchVisibleCoursesByName(...args: Parameters<typeof searchVisibleCoursesPage>): Promise<CourseData[]> {
  return (await searchVisibleCoursesPage(...args)).items;
}
