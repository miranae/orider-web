import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("site shell CSS contract", () => {
  const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

  it("defines one centered 1440px shell token for web pages", () => {
    expect(css).toContain("--site-shell-max: 1440px");
    expect(css).toMatch(/\.site-shell\s*{[^}]*width:\s*100%/s);
    expect(css).toMatch(/\.site-shell\s*{[^}]*max-width:\s*var\(--site-shell-max\)/s);
    expect(css).toMatch(/\.site-shell\s*{[^}]*margin-inline:\s*auto/s);
  });
});
