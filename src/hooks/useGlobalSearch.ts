import { useMemo } from "react";
import { useActivities } from "./useActivities";
import { useCourses } from "./useCourses";
import type { Activity, Course } from "@shared/types";

interface SearchResults {
  activities: Activity[];
  courses: Course[];
}

export function useGlobalSearch(query: string): { results: SearchResults; loading: boolean } {
  const normalizedQuery = query.trim().toLowerCase();
  const enabled = normalizedQuery.length > 0;
  const { activities, loading: activitiesLoading } = useActivities("all", [], { enabled });
  const { courses, loading: coursesLoading } = useCourses({ enabled });

  const results = useMemo(() => {
    if (!enabled) return { activities: [], courses: [] };
    return {
      activities: activities
        .filter(a => (a.description || "").toLowerCase().includes(normalizedQuery) || (a.nickname || "").toLowerCase().includes(normalizedQuery))
        .slice(0, 3),
      courses: courses
        .filter(c => c.name.toLowerCase().includes(normalizedQuery) || (c.regions?.join(" ") || "").toLowerCase().includes(normalizedQuery))
        .slice(0, 3),
    };
  }, [enabled, normalizedQuery, activities, courses]);

  return { results, loading: enabled && (activitiesLoading || coursesLoading) };
}
