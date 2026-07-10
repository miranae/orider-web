import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mobile input zoom guard", () => {
  it("keeps touch/mobile text controls at least 16px to prevent iOS focus zoom", () => {
    const css = readFileSync(join(process.cwd(), "src/theme/components/components.css"), "utf8");

    expect(css).toContain("@media (hover: none) and (pointer: coarse), (max-width: 767px)");
    expect(css).toContain(".ds-input,");
    expect(css).toContain('input:not([type="button"])');
    expect(css).toContain("textarea,");
    expect(css).toContain("select {");
    expect(css).toContain("font-size: max(16px, 1em);");
  });
});
