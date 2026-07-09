import type { CourseData } from "./courseSnapshot";
import { courseTagLabel, uniqueCourseTags } from "./courseTags";

export type SortMode = "latest" | "popular";
export type SurfaceFilter = "" | "paved" | "gravel" | "mixed";

export interface CourseCatalogFilters {
  searchQuery: string;
  sortMode: SortMode;
  surfaceFilter: SurfaceFilter;
  difficultyFilter: number | null;
  myLoc: { lat: number; lng: number } | null;
  radiusKm: number | null;
}

/** 두 좌표 간 거리(km) — Haversine. 위치+반경 필터용. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function filterAndSortCourses(courses: CourseData[], filters: CourseCatalogFilters): CourseData[] {
  let filtered = courses;
  const queryTokens = filters.searchQuery.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(Boolean);

  if (queryTokens.length > 0) {
    filtered = filtered.filter((course) => {
      const text = [
        course.name,
        ...course.regions,
        ...course.tags,
        ...course.autoTags,
        ...uniqueCourseTags(course).map(courseTagLabel),
        ...course.segmentNames,
        course.distanceBand,
        course.elevationBand,
        course.difficultyBand,
      ].filter(Boolean).join(" ").toLowerCase();
      return queryTokens.every((token) => text.includes(token));
    });
  }

  if (filters.surfaceFilter) {
    filtered = filtered.filter((course) => course.surface === filters.surfaceFilter);
  }

  if (filters.difficultyFilter != null) {
    filtered = filtered.filter((course) => course.difficulty === filters.difficultyFilter);
  }

  if (filters.myLoc && filters.radiusKm != null) {
    filtered = filtered.filter((course) =>
      course.startLat !== 0 &&
      course.startLon !== 0 &&
      distanceKm(filters.myLoc!.lat, filters.myLoc!.lng, course.startLat, course.startLon) <= filters.radiusKm!,
    );
  }

  const sorted = [...filtered];
  if (filters.sortMode === "popular") {
    sorted.sort((a, b) => b.likeCount - a.likeCount);
  } else {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}
