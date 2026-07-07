import { describe, expect, it } from "vitest";
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
