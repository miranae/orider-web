import { describe, expect, it } from "vitest";
import { getEffectiveListTotal, getTagExclusion } from "./BoardPage";
import { parseUserTags } from "./CreatePostPage";

describe("parseUserTags", () => {
  it("keeps user tags in order", () => {
    expect(parseUserTags(" 로드바이크 , 훈련 ,, ")).toEqual(["로드바이크", "훈련"]);
  });

  it("drops the reserved AI tag regardless of casing", () => {
    expect(parseUserTags("ai, 훈련, Ai, AI")).toEqual(["훈련"]);
  });
});

describe("getTagExclusion", () => {
  it("excludes nothing when no chip is unchecked", () => {
    const { clientExcluded, clientOnlyExcludedCount } = getTagExclusion({
      uncheckedTags: new Set(),
      activeTag: undefined,
      serverFiltersAiTag: true,
    });

    expect(clientExcluded.size).toBe(0);
    expect(clientOnlyExcludedCount).toBe(0);
  });

  it("filters the AI chip by tag but leaves the total to the Firestore query", () => {
    const { clientExcluded, clientOnlyExcludedCount } = getTagExclusion({
      uncheckedTags: new Set(["AI"]),
      activeTag: undefined,
      serverFiltersAiTag: true,
    });

    expect(clientExcluded.has("AI")).toBe(true);
    expect(clientOnlyExcludedCount).toBe(0);
  });

  it("counts AI as a client exclusion while the search function ignores it", () => {
    const { clientExcluded, clientOnlyExcludedCount } = getTagExclusion({
      uncheckedTags: new Set(["AI"]),
      activeTag: undefined,
      serverFiltersAiTag: false,
    });

    expect(clientExcluded.has("AI")).toBe(true);
    expect(clientOnlyExcludedCount).toBe(1);
  });

  it("counts non-AI chips as page-local exclusions needing a total correction", () => {
    const { clientExcluded, clientOnlyExcludedCount } = getTagExclusion({
      uncheckedTags: new Set(["AI", "유머", "중고거래"]),
      activeTag: undefined,
      serverFiltersAiTag: true,
    });

    expect(clientExcluded.size).toBe(3);
    expect(clientOnlyExcludedCount).toBe(2);
  });

  it("never excludes the tag the user is currently browsing", () => {
    const { clientExcluded } = getTagExclusion({
      uncheckedTags: new Set(["AI", "유머"]),
      activeTag: "AI",
      serverFiltersAiTag: true,
    });

    expect(clientExcluded.has("AI")).toBe(false);
    expect(clientExcluded.has("유머")).toBe(true);
  });
});

describe("getEffectiveListTotal", () => {
  it("uses the server total when nothing was excluded on the client", () => {
    expect(getEffectiveListTotal({
      clientExcludedCount: 0,
      displayedCount: 20,
      listTotal: 83,
    })).toBe(83);
  });

  it("uses the displayed count for client-side tag exclusions", () => {
    expect(getEffectiveListTotal({
      clientExcludedCount: 1,
      displayedCount: 7,
      listTotal: 20,
    })).toBe(7);
  });

});
