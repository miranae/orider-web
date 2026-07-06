import { describe, expect, it } from "vitest";
import { deriveSegmentCategory } from "./category";

describe("deriveSegmentCategory", () => {
  it("derives climb, sprint, and flat categories from segment stats", () => {
    expect(deriveSegmentCategory({ avgGrade: 4, distance: 1500 })).toBe("climb");
    expect(deriveSegmentCategory({ avgGrade: 0.5, distance: 800 })).toBe("sprint");
    expect(deriveSegmentCategory({ avgGrade: 1.5, distance: 3000 })).toBe("flat");
  });
});
