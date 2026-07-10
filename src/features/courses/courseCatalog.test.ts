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
    tags: [],
    autoTags: [],
    segmentNames: [],
    distanceBand: null,
    elevationBand: null,
    difficultyBand: null,
    bikeLaneRatioStatus: null,
    likeCount: 0,
    createdAt: 0,
    surface: null,
    difficulty: null,
    startLat: 0,
    startLon: 0,
    visibility: null,
    curated: false,
    creatorId: null,
    ...overrides,
  };
}

const baseFilters: CourseCatalogFilters = {
  searchQuery: "",
  sortMode: "latest",
  surfaceFilter: "",
  difficultyFilter: null,
  distanceMinKm: null,
  distanceMaxKm: null,
  elevationMinM: null,
  elevationMaxM: null,
  regionFilter: "",
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

  it("matches search tokens against tags and segment names", () => {
    const result = filterAndSortCourses([
      course("a", { name: "추천 코스", tags: ["distance:ultra"], segmentNames: ["하오고개"] }),
      course("b", { name: "추천 코스", tags: ["distance:medium"], segmentNames: ["남산"] }),
    ], { ...baseFilters, searchQuery: "하오고개 초장거리" });

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

  it("filters by distance, elevation, and region metadata", () => {
    const result = filterAndSortCourses([
      course("weekend-fit", { distance: 42_000, elevationGain: 420, regions: ["서울", "남양주"] }),
      course("too-short", { distance: 18_000, elevationGain: 200, regions: ["서울"] }),
      course("too-hilly", { distance: 45_000, elevationGain: 900, regions: ["서울"] }),
      course("wrong-region", { distance: 38_000, elevationGain: 300, regions: ["부산"] }),
    ], {
      ...baseFilters,
      distanceMinKm: 30,
      distanceMaxKm: 50,
      elevationMaxM: 500,
      regionFilter: "서울",
    });

    expect(result.map((item) => item.id)).toEqual(["weekend-fit"]);
  });
});
