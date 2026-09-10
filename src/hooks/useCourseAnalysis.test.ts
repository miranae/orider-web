import { describe, expect, it } from "vitest";

import ko from "../i18n/resources/ko/course.json";
import { courseAnalysisNoteKey } from "./useCourseAnalysis";

describe("courseAnalysisNoteKey", () => {
  it("값이 보이는 상태는 안내가 없다", () => {
    expect(courseAnalysisNoteKey("value")).toBeNull();
    expect(courseAnalysisNoteKey(null)).toBeNull();
  });

  it.each([
    ["value_with_stale_hint", "analysis.stale"],
    ["loading", "analysis.processing"],
    ["error", "analysis.error"],
    ["empty", "analysis.empty"],
  ] as const)("%s 는 %s 안내를 쓴다", (display, key) => {
    expect(courseAnalysisNoteKey(display)).toBe(key);
    expect(ko[key as keyof typeof ko]).toBeTruthy();
  });
});
