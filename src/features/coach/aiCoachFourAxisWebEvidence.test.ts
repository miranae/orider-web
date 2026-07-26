import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("four-axis web evidence", () => {
  it("enforces 320px and 200% reflow constraints for all four surfaces", () => {
    const pmc = readFileSync("src/features/coach/coach-pmc-insight.css", "utf8");
    const rider = readFileSync("src/features/coach/coach-rider-insight.css", "utf8");
    const progress = readFileSync("src/features/coach/coach-question.css", "utf8");
    const ride = readFileSync("src/features/courses/course-ride-plan.css", "utf8");
    for (const css of [pmc, rider, progress, ride]) expect(css).toContain("min-width: 0");
    expect(pmc).toContain("overflow-wrap: anywhere");
    expect(rider).toContain("overflow-wrap: anywhere");
    expect(progress).toContain("overflow-wrap: anywhere");
    expect(ride).toContain("minmax(min(100%, 9rem), 1fr)");
    expect(pmc).toContain("@media (max-width: 32rem)");
    expect(rider).toContain("@media (max-width: 32rem)");
    expect(progress).toContain("@media (max-width: 360px), (min-resolution: 2dppx)");
    expect(ride).toContain("@media (max-width: 24rem)");
  });
});
