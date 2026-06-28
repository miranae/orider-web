import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import type { Course } from "@shared/types";

// 모듈 레벨 캐시 — 한 번 로드하면 페이지 간 공유
let cachedCourses: Course[] | null = null;
let cacheUid: string | null = null;

export function useCourses() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>(cachedCourses ?? []);
  const [loading, setLoading] = useState(cachedCourses === null);

  useEffect(() => {
    // 같은 유저의 캐시가 있으면 스킵
    if (cachedCourses && cacheUid === (user?.uid ?? null)) {
      setCourses(cachedCourses);
      setLoading(false);
      return;
    }

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
              where("deletedAt", "==", null),
              orderBy("createdAt", "desc"),
              limit(50),
            ),
          );
          mySnap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() } as Course));
        }

        // 공개 코스 (인기순)
        // NOTE: 기존 코스에 visibility 필드가 채워지지 않아 필터링 시 빈 결과 발생.
        // visibility 필드 백필 완료 전까지 deletedAt만으로 필터링.
        const publicSnap = await getDocs(
          query(
            collection(firestore, "courses"),
            where("deletedAt", "==", null),
            orderBy("likeCount", "desc"),
            limit(100),
          ),
        );
        publicSnap.docs.forEach((d) => {
          if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() } as Course);
        });

        const result = Array.from(map.values());
        cachedCourses = result;
        cacheUid = user?.uid ?? null;
        setCourses(result);
      } catch (err) {
        logClientError("useCourses.load", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

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
