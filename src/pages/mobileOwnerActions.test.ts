import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile owner actions", () => {
  it("keeps uploaded photo delete visible without hover on mobile", () => {
    const activity = source("src/pages/ActivityPage.tsx");
    expect(activity).toContain("opacity-100 md:opacity-0 md:group-hover:opacity-100");
  });

  it("keeps add-segment visible without hover on mobile owner profile", () => {
    const athlete = source("src/pages/AthletePage.tsx");
    expect(athlete).toContain("opacity-100 md:opacity-0 md:group-hover:opacity-100");
  });
});
