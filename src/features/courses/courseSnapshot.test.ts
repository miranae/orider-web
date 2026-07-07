import { describe, expect, it } from "vitest";
import { applyCourseDocChanges, replaceCourseSnapshotDocs, type CourseData } from "./courseSnapshot";

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

  it("refreshes cached points when a course polyline changes in place", () => {
    const polylineCache = new Map([["course-a", [[1, 1] as [number, number]]]]);
    const polylineValueCache = new Map([["course-a", "old-polyline"]]);

    applyCourseDocChanges([course("course-a")], [
      { type: "modified", id: "course-a", data: { name: "course-a", polyline: "_p~iF~ps|U" } },
    ], polylineCache, polylineValueCache);

    expect(polylineCache.get("course-a")).not.toEqual([[1, 1]]);
    expect(polylineValueCache.get("course-a")).toBe("_p~iF~ps|U");
  });
});

describe("replaceCourseSnapshotDocs", () => {
  it("rebuilds from the current docs instead of keeping removed previous courses", () => {
    const polylineCache = new Map([
      ["stale-course", [[37, 127] as [number, number]]],
    ]);

    const next = replaceCourseSnapshotDocs([
      { id: "course-a", data: { name: "course-a", createdAt: 10 } },
      { id: "course-b", data: { name: "course-b", createdAt: 20 } },
    ], polylineCache);

    expect(next.map((item) => item.id)).toEqual(["course-a", "course-b"]);
    expect(polylineCache.has("stale-course")).toBe(false);
  });

  it("keeps cached points only when the polyline value is unchanged", () => {
    const cachedPoints = [[37, 127] as [number, number]];
    const polylineCache = new Map([["course-a", cachedPoints]]);
    const polylineValueCache = new Map([["course-a", "_p~iF~ps|U"]]);

    replaceCourseSnapshotDocs([
      { id: "course-a", data: { name: "course-a", polyline: "_p~iF~ps|U" } },
    ], polylineCache, polylineValueCache);

    expect(polylineCache.get("course-a")).toBe(cachedPoints);

    replaceCourseSnapshotDocs([
      { id: "course-a", data: { name: "course-a", polyline: "_ulLnnqC" } },
    ], polylineCache, polylineValueCache);

    expect(polylineCache.get("course-a")).not.toBe(cachedPoints);
    expect(polylineValueCache.get("course-a")).toBe("_ulLnnqC");
  });
});
