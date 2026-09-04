import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("course hero map overlay", () => {
  it("keeps the overlay at one quarter of the previous strength", () => {
    const css = readFileSync(join(process.cwd(), "src/features/courses/course-detail.css"), "utf8");
    const overlay = css.match(/\.course-hero-overlay\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(overlay).toContain("color-mix(in oklch, var(--bg-0) 23%, transparent) 0%");
    expect(overlay).toContain("color-mix(in oklch, var(--bg-0) 15.5%, transparent) 52%");
    expect(overlay).toContain("color-mix(in oklch, var(--bg-0) 5%, transparent) 100%");
    expect(overlay).not.toMatch(/var\(--bg-0\) (?:92|62|20)%, transparent/);
  });
});
