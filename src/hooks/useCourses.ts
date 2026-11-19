import { collection, query, where, getDocs, orderBy, limit, startAfter, type QueryDocumentSnapshot, type DocumentData } from "firebase/firestore";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useAuth } from "../contexts/AuthContext";
import { isVisibleCourseDocData } from "../features/courses/courseVisibility";
import { indexedCourseQueries } from "../features/courses/catalogQueryMode";
import { SEARCH_PAGE_SIZE, usePagedSearch } from "./usePagedSearch";
import type { Course } from "@shared/types";

let cacheVersion = 0;
export interface UseCoursesOptions { enabled?: boolean }
type Cursor = Array<{ last: QueryDocumentSnapshot<DocumentData> | null; exhausted: boolean }>;

export function useCourses(options: UseCoursesOptions = {}) {
  const services = useFirebaseServices();
  const { firestore } = services;
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const page = usePagedSearch(options.enabled === false ? null : JSON.stringify([uid, cacheVersion]), async (cursor: Cursor | null) => {
    const sources = uid ? ["mine", "public"] : ["public"];
    const items = new Map<string, Course>();
    const indexed = await indexedCourseQueries(firestore, services);
    const pages = await Promise.all(sources.map(async (source, index) => {
      const previous = cursor?.[index];
      if (previous?.exhausted) return { previous, docs: [] };
      const snap = await getDocs(query(collection(firestore, "courses"),
        ...(indexed ? [where("hidden", "==", false), where("deletedAt", "==", null)] : []),
        ...(source === "mine" ? [where("creatorId", "==", uid), orderBy("createdAt", "desc")] : [orderBy("likeCount", "desc")]),
        ...(previous?.last ? [startAfter(previous.last)] : []), limit(SEARCH_PAGE_SIZE),
      ));
      return { previous, docs: snap.docs };
    }));
    const cursors: Cursor = pages.map(({ previous, docs }) => {
      for (const doc of docs) {
        if (isVisibleCourseDocData(doc.data())) items.set(doc.id, { id: doc.id, ...doc.data() } as Course);
      }
      return previous?.exhausted ? previous : { last: docs[docs.length - 1] ?? previous?.last ?? null, exhausted: docs.length < SEARCH_PAGE_SIZE };
    });
    return { items: [...items.values()], cursor: cursors, hasMore: cursors.some(source => !source.exhausted) };
  });
  const search = (text: string) => {
    const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
    return page.items.filter(course => tokens.every(token => `${course.name} ${course.regions?.join(" ") ?? ""}`.toLowerCase().includes(token)));
  };
  return { ...page, error: !!page.error, courses: page.items, search };
}

export function invalidateCoursesCache() { cacheVersion += 1; }
