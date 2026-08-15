import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { getEffectiveListTotal, getTagExclusion } from "./BoardPage";

describe("getTagExclusion", () => {
  it("excludes nothing when no chip is unchecked", () => {
    const { clientExcluded, clientOnlyExcludedCount } = getTagExclusion({
      uncheckedTags: new Set(),
      activeTag: undefined,
    });

    expect(clientExcluded.size).toBe(0);
    expect(clientOnlyExcludedCount).toBe(0);
  });

  it("filters the AI chip by tag but leaves the total to the server query", () => {
    const { clientExcluded, clientOnlyExcludedCount } = getTagExclusion({
      uncheckedTags: new Set(["AI"]),
      activeTag: undefined,
    });

    expect(clientExcluded.has("AI")).toBe(true);
    expect(clientOnlyExcludedCount).toBe(0);
  });

  it("counts non-AI chips as page-local exclusions needing a total correction", () => {
    const { clientExcluded, clientOnlyExcludedCount } = getTagExclusion({
      uncheckedTags: new Set(["AI", "유머", "중고거래"]),
      activeTag: undefined,
    });

    expect(clientExcluded.size).toBe(3);
    expect(clientOnlyExcludedCount).toBe(2);
  });

  it("never excludes the tag the user is currently browsing", () => {
    const { clientExcluded } = getTagExclusion({
      uncheckedTags: new Set(["AI", "유머"]),
      activeTag: "AI",
    });

    expect(clientExcluded.has("AI")).toBe(false);
    expect(clientExcluded.has("유머")).toBe(true);
  });
});

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

describe("BoardPage tag filter defaults", () => {
  it("starts with no tag excluded so the filter chips reflect the actual list", async () => {
    const source = await readFile(`${process.cwd()}/src/pages/BoardPage.tsx`, "utf8");

    expect(source).toContain("useState<Set<string>>(() => new Set())");
    expect(source).not.toContain('new Set(["AI"])');
  });

  it("filters every unchecked chip by the post tags, never by the source site alone", async () => {
    const source = await readFile(`${process.cwd()}/src/pages/BoardPage.tsx`, "utf8");

    // 제외 집합은 활성 태그만 빼고 전부 tags 기준으로 판정한다(AI 특례 없음).
    expect(source).toContain("getTagExclusion({ uncheckedTags, activeTag })");
    expect(source).toContain("listPosts.filter(p => !p.tags?.some(tag => clientExcluded.has(tag)))");
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
    expect(detailSource).not.toContain("max-w-[896px]");
    expect(createSource).toContain('className="mx-auto max-w-[1120px] space-y-6"');
  });
});
