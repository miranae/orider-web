import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { getEffectiveListTotal } from "./BoardPage";

describe("getEffectiveListTotal", () => {
  it("uses server total for paginated search results", () => {
    expect(getEffectiveListTotal({
      submittedQuery: "검색어",
      clientExcludedCount: 0,
      displayedCount: 20,
      listTotal: 83,
    })).toBe(83);
  });

  it("uses displayed count only for client-side tag exclusions without server search", () => {
    expect(getEffectiveListTotal({
      submittedQuery: "",
      clientExcludedCount: 1,
      displayedCount: 7,
      listTotal: 20,
    })).toBe(7);
  });
});

describe("BoardPage source defaults", () => {
  it("defaults the public board away from AI-only seed posts", async () => {
    const source = await readFile(`${process.cwd()}/src/pages/BoardPage.tsx`, "utf8");

    expect(source).toContain('new Set(["AI"])');
    expect(source).toContain("activeTag !== 'AI'");
  });
});
