import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { isVisibleCourseDocData } from "../features/courses/courseVisibility";
import type { Course } from "@shared/types";

// 모듈 레벨 캐시 — 한 번 로드하면 페이지 간 공유
let cachedCourses: Course[] | null = null;
let cacheUid: string | null = null;

export interface UseCoursesOptions {
  enabled?: boolean;
}

export function useCourses(options: UseCoursesOptions = {}) {
  const enabled = options.enabled ?? true;
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const hasUsableCache = cachedCourses !== null && cacheUid === uid;
  const [courses, setCourses] = useState<Course[]>(() => (hasUsableCache ? cachedCourses ?? [] : []));
  const [loading, setLoading] = useState(enabled && !hasUsableCache);

  useEffect(() => {
    if (!enabled) {
      setCourses([]);
      setLoading(false);
      return;
    }

    if (cacheUid !== uid) {
      cachedCourses = null;
      cacheUid = null;
      setCourses([]);
    }

    // 같은 유저의 캐시가 있으면 스킵
    if (cachedCourses && cacheUid === uid) {
      setCourses(cachedCourses);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const map = new Map<string, Course>();

        // 내 코스
        if (user) {
          const mySnap = await getDocs(
            query(
              collection(firestore, "courses"),
              where("creatorId", "==", user.uid),
              orderBy("createdAt", "desc"),
              limit(50),
            ),
          );
          mySnap.docs.forEach((d) => {
            const data = d.data();
            if (isVisibleCourseDocData(data)) map.set(d.id, { id: d.id, ...data } as Course);
          });
        }

        // 공개 코스 (인기순)
        // NOTE: 기존 코스에 visibility 필드가 채워지지 않아 필터링 시 빈 결과 발생.
        // visibility 필드 백필 완료 전까지 deletedAt만으로 필터링.
        // deletedAt 필드가 없는 legacy 코스도 live 로 취급해야 하므로 쿼리 조건이 아니라 클라 필터로 처리.
        const publicSnap = await getDocs(
          query(
            collection(firestore, "courses"),
            orderBy("likeCount", "desc"),
            limit(100),
          ),
        );
        publicSnap.docs.forEach((d) => {
          const data = d.data();
          if (isVisibleCourseDocData(data) && !map.has(d.id)) map.set(d.id, { id: d.id, ...data } as Course);
        });

        const result = Array.from(map.values());
        if (cancelled) return;
        cachedCourses = result;
        cacheUid = uid;
        setCourses(result);
      } catch (err) {
        logClientError("useCourses.load", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [enabled, user, uid]);

  /** 이름+지역 텍스트 검색 */
  function search(q: string): Course[] {
    if (!q.trim()) return courses;
    const tokens = q.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
    return courses.filter((c) => {
      const text = `${c.name} ${c.regions?.join(" ") ?? ""}`.toLowerCase();
      return tokens.every((t) => text.includes(t));
    });
  }

  return { courses, loading, search };
}

export function invalidateCoursesCache() {
  cachedCourses = null;
  cacheUid = null;
}
