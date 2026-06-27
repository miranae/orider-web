import { useMemo } from "react";
import { useActivities } from "./useActivities";
import { useCourses } from "./useCourses";
import type { Activity, Course } from "@shared/types";

interface SearchResults {
  activities: Activity[];
  courses: Course[];
}

export function useGlobalSearch(query: string): { results: SearchResults; loading: boolean } {
  const { activities } = useActivities();
  const { courses } = useCourses();

  const results = useMemo(() => {
    if (!query.trim()) return { activities: [], courses: [] };
    const q = query.toLowerCase();
    return {
      activities: activities
        .filter(a => (a.description || "").toLowerCase().includes(q) || (a.nickname || "").toLowerCase().includes(q))
        .slice(0, 3),
      courses: courses
        .filter(c => c.name.toLowerCase().includes(q) || (c.regions?.join(" ") || "").toLowerCase().includes(q))
        .slice(0, 3),
    };
  }, [query, activities, courses]);

  return { results, loading: false };
}
