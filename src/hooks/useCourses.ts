import { collection, query, where, getDocs, orderBy, limit, startAfter, type QueryDocumentSnapshot, type DocumentData } from "firebase/firestore";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useAuth } from "../contexts/AuthContext";
import { isVisibleCourseDocData } from "../features/courses/courseVisibility";
import { SEARCH_PAGE_SIZE, usePagedSearch } from "./usePagedSearch";
import type { Course } from "@shared/types";

let cacheVersion = 0;
export interface UseCoursesOptions { enabled?: boolean }
type Cursor = Array<{ last: QueryDocumentSnapshot<DocumentData> | null; exhausted: boolean }>;

export function useCourses(options: UseCoursesOptions = {}) {
  const { firestore } = useFirebaseServices();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const page = usePagedSearch(options.enabled === false ? null : JSON.stringify([uid, cacheVersion]), async (cursor: Cursor | null) => {
    const sources = uid ? ["mine", "public"] : ["public"];
    const items = new Map<string, Course>();
    const cursors: Cursor = [];
    for (const [index, source] of sources.entries()) {
      const previous = cursor?.[index];
      if (previous?.exhausted) { cursors.push(previous); continue; }
      const snap = await getDocs(query(collection(firestore, "courses"),
        ...(source === "mine" ? [where("creatorId", "==", uid), orderBy("createdAt", "desc")] : [orderBy("likeCount", "desc")]),
        ...(previous?.last ? [startAfter(previous.last)] : []), limit(SEARCH_PAGE_SIZE),
      ));
      for (const doc of snap.docs) {
        if (isVisibleCourseDocData(doc.data())) items.set(doc.id, { id: doc.id, ...doc.data() } as Course);
      }
      cursors.push({ last: snap.docs[snap.docs.length - 1] ?? previous?.last ?? null, exhausted: snap.docs.length < SEARCH_PAGE_SIZE });
    }
    return { items: [...items.values()], cursor: cursors, hasMore: cursors.some(source => !source.exhausted) };
  });
  const search = (text: string) => {
    const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
    return page.items.filter(course => tokens.every(token => `${course.name} ${course.regions?.join(" ") ?? ""}`.toLowerCase().includes(token)));
  };
  return { ...page, error: !!page.error, courses: page.items, search };
}

export function invalidateCoursesCache() { cacheVersion += 1; }
