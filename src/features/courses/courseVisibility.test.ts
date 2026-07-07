import { describe, expect, it } from "vitest";
import { isVisibleCourseDocData } from "./courseVisibility";

describe("isVisibleCourseDocData", () => {
  it("treats missing and null deletedAt as visible", () => {
    expect(isVisibleCourseDocData({ name: "legacy" })).toBe(true);
    expect(isVisibleCourseDocData({ name: "live", deletedAt: null })).toBe(true);
  });

  it("treats timestamp deletedAt as deleted", () => {
    expect(isVisibleCourseDocData({ name: "deleted", deletedAt: 123 })).toBe(false);
  });
});
