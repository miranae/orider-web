import { describe, expect, it } from "vitest";
import { filterAndSortCourses, type CourseCatalogFilters } from "./courseCatalog";
import type { CourseData } from "./courseSnapshot";

function course(id: string, overrides: Partial<CourseData> = {}): CourseData {
  return {
    id,
    name: id,
    polyline: "",
    distance: 0,
    elevationGain: 0,
    climbs: [],
    regions: [],
    likeCount: 0,
    createdAt: 0,
    surface: null,
    difficulty: null,
    startLat: 0,
    startLon: 0,
    ...overrides,
  };
}

const baseFilters: CourseCatalogFilters = {
  searchQuery: "",
  sortMode: "latest",
  surfaceFilter: "",
  difficultyFilter: null,
  myLoc: null,
  radiusKm: null,
};

describe("filterAndSortCourses", () => {
  it("matches every search token across course name and regions", () => {
    const result = filterAndSortCourses([
      course("a", { name: "남한강 자전거길", regions: ["양평"] }),
      course("b", { name: "북한강", regions: ["춘천"] }),
    ], { ...baseFilters, searchQuery: "남한강 양평" });

    expect(result.map((item) => item.id)).toEqual(["a"]);
  });

  it("filters by surface and difficulty, then sorts by popularity", () => {
    const result = filterAndSortCourses([
      course("a", { surface: "gravel", difficulty: 3, likeCount: 2 }),
      course("b", { surface: "paved", difficulty: 3, likeCount: 100 }),
      course("c", { surface: "gravel", difficulty: 3, likeCount: 8 }),
      course("d", { surface: "gravel", difficulty: 2, likeCount: 20 }),
    ], { ...baseFilters, surfaceFilter: "gravel", difficultyFilter: 3, sortMode: "popular" });

    expect(result.map((item) => item.id)).toEqual(["c", "a"]);
  });

  it("filters courses within the selected radius", () => {
    const result = filterAndSortCourses([
      course("near", { startLat: 37.5665, startLon: 126.9780 }),
      course("far", { startLat: 35.1796, startLon: 129.0756 }),
    ], {
      ...baseFilters,
      myLoc: { lat: 37.5665, lng: 126.9780 },
      radiusKm: 10,
    });

    expect(result.map((item) => item.id)).toEqual(["near"]);
  });
});
