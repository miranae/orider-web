import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import type { SortMode } from "./courseCatalog";
import {
  replaceCourseSnapshotDocs,
  type CourseData,
  type LatLngTuple,
} from "./courseSnapshot";
import { isVisibleCourseDocData } from "./courseVisibility";

const PAGE_SIZE = 80;
const SEARCH_LIMIT = 80;

function orderFieldForSort(sortMode: SortMode) {
  return sortMode === "popular" ? "likeCount" : "createdAt";
}

export function useCourseCatalog(sortMode: SortMode = "latest") {
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const requestIdRef = useRef(0);
  const polylineCache = useRef<Map<string, LatLngTuple[]>>(new Map());
  const polylineValueCache = useRef<Map<string, string>>(new Map());

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
      const constraints: QueryConstraint[] = [
        orderBy(orderFieldForSort(sortMode), "desc"),
        limit(PAGE_SIZE),
      ];
      if (!reset && cursorRef.current) {
        constraints.splice(1, 0, startAfter(cursorRef.current));
      }
      const snapshot = await getDocs(query(collection(firestore, "courses"), ...constraints));
      if (requestId !== requestIdRef.current) return;
      const docs = snapshot.docs
        .map((doc) => ({ id: doc.id, data: doc.data() }))
        .filter((item) => isVisibleCourseDocData(item.data));
      const nextCourses = replaceCourseSnapshotDocs(docs, polylineCache.current, polylineValueCache.current);
      cursorRef.current = snapshot.docs[snapshot.docs.length - 1] ?? cursorRef.current;
      const nextHasMore = snapshot.docs.length === PAGE_SIZE;
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
  }, [sortMode]);

  useEffect(() => {
    void fetchPage(true);
  }, [fetchPage]);

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

export async function searchVisibleCoursesByName(
  searchText: string,
  maxCount = SEARCH_LIMIT,
  polylineCache: Map<string, LatLngTuple[]> = new Map(),
  polylineValueCache: Map<string, string> = new Map(),
): Promise<CourseData[]> {
  const text = searchText.trim();
  if (!text) return [];

  const snapshot = await getDocs(query(
    collection(firestore, "courses"),
    where("name", ">=", text),
    where("name", "<=", `${text}\uf8ff`),
    orderBy("name"),
    limit(maxCount),
  ));

  const normalized = text.toLowerCase();
  const docs = snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter((item) => isVisibleCourseDocData(item.data))
    .filter((item) => String(item.data.name ?? "").toLowerCase().includes(normalized));

  return replaceCourseSnapshotDocs(docs, polylineCache, polylineValueCache);
}
