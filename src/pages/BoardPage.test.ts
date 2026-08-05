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

describe("BoardPage desktop width contract", () => {
  it("fills the shared content shell while preserving the popular-tags sidebar", async () => {
    const source = await readFile(`${process.cwd()}/src/pages/BoardPage.tsx`, "utf8");

    expect(source).toContain('className="relative z-0 xl:flex xl:gap-6"');
    expect(source).toContain('className="min-w-0 w-full xl:flex-1"');
    expect(source).toContain('className="hidden xl:block xl:w-[240px] xl:flex-none"');
    expect(source).not.toContain("md:max-w-[840px]");
    expect(source).not.toContain("xl:w-[840px]");
  });

  it("keeps the shared reading width and authoring width", async () => {
    const [detailSource, createSource] = await Promise.all([
      readFile(`${process.cwd()}/src/pages/PostDetailPage.tsx`, "utf8"),
      readFile(`${process.cwd()}/src/pages/CreatePostPage.tsx`, "utf8"),
    ]);

    expect(detailSource).toContain('className="mx-auto max-w-[1440px] space-y-6"');
    expect(createSource).toContain('className="mx-auto max-w-[1120px] space-y-6"');
  });
});
