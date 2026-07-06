import { describe, expect, it } from "vitest";
import { applyCourseDocChanges, type CourseData } from "./courseSnapshot";

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

describe("applyCourseDocChanges", () => {
  it("merges delta snapshots into previous courses instead of replacing the list", () => {
    const prev = [
      course("course-a", { likeCount: 1 }),
      course("course-b", { likeCount: 2 }),
    ];

    const next = applyCourseDocChanges(prev, [
      {
        type: "modified",
        id: "course-b",
        data: { name: "course-b", likeCount: 3, createdAt: 2 },
      },
    ], new Map());

    expect(next).toHaveLength(2);
    expect(next.find((item) => item.id === "course-a")?.likeCount).toBe(1);
    expect(next.find((item) => item.id === "course-b")?.likeCount).toBe(3);
  });

  it("removes deleted courses and clears their cached polyline", () => {
    const polylineCache = new Map([["course-a", [[37, 127] as [number, number]]]]);

    const next = applyCourseDocChanges([course("course-a")], [
      { type: "removed", id: "course-a", data: {} },
    ], polylineCache);

    expect(next).toEqual([]);
    expect(polylineCache.has("course-a")).toBe(false);
  });
});
