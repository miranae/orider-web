import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("course stage profile responsive boundary", () => {
  const css = readFileSync(join(process.cwd(), "src/features/courses/course-detail.css"), "utf8");

  it("uses the compact profile through 839px and preserves 44px ridge targets", () => {
    expect(css).toContain("@media (max-width: 52.4375rem)");
    expect(css).toContain("width: 2.75rem;");
    expect(css).toContain("height: 2.75rem;");
  });

  it("offsets mobile ridge numbers and keeps a stem to the exact point", () => {
    expect(css).toContain("transform: translate(-50%, calc(-50% - var(--space-2)))");
    expect(css).toContain(".course-stage-profile__ridge-hit::before");
  });
});
