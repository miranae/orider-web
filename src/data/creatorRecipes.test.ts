import { describe, expect, it } from "vitest";
import { creatorRecipes } from "./creatorRecipes";

describe("creatorRecipes", () => {
  it("defines unique recipe ids", () => {
    const ids = creatorRecipes.map((recipe) => recipe.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the commute diary private and shares aggregates only", () => {
    const recipe = creatorRecipes.find((item) => item.id === "commute-diary");

    expect(recipe).toBeDefined();
    expect(recipe?.kind).toBe("diary");
    expect(recipe?.scopes).toEqual(["activities:read"]);
    expect(recipe?.channels).toContain("email-report");
    expect(recipe?.channels).toContain("aggregate-share-card");
    expect(recipe?.ko.labels).toEqual(expect.arrayContaining(["집·직장 숨김", "집계만 공유"]));
    expect(recipe?.en.labels).toEqual(expect.arrayContaining(["Home/work hidden", "Aggregates only"]));
    expect(recipe?.ko.shareMode).toContain("aggregate-only");
    expect(recipe?.en.shareMode).toContain("aggregate-only");
  });
});
