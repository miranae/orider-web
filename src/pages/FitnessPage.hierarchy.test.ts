import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FitnessPage desktop hierarchy", () => {
  const source = readFileSync(join(process.cwd(), "src/pages/FitnessPage.tsx"), "utf8");
  it("uses the site shell and lets KPI cards wrap at intermediate widths", () => {
    expect(source).toContain('className="site-shell"');
    expect(source).not.toContain("maxWidth: 1120");
    expect(source).toContain('repeat(auto-fit, minmax(180px, 1fr))');
    expect(source).toContain('gap: "var(--space-3)"');
    expect(source).not.toContain("borderRight: i < arr.length - 1");
    expect(source).toContain('border: "1px solid var(--line-soft)"');
    expect(source).toContain('borderRadius: "var(--r-lg)"');
  });
});
