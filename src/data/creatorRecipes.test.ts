import { describe, expect, it } from "vitest";
import { creatorRecipes, hasShareCardPreview } from "./creatorRecipes";

describe("creatorRecipes", () => {
  it("defines unique recipe ids", () => {
    const ids = creatorRecipes.map((recipe) => recipe.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("limits the commute diary to the current private email report", () => {
    const recipe = creatorRecipes.find((item) => item.id === "commute-diary");

    expect(recipe).toBeDefined();
    expect(recipe?.kind).toBe("diary");
    expect(recipe?.scopes).toEqual(["activities:read"]);
    expect(recipe?.channels).toEqual(["weekly-review", "email-report"]);
    expect(recipe?.ko.labels).toEqual(expect.arrayContaining(["최근 7일", "본인 이메일", "회고 질문"]));
    expect(recipe?.en.labels).toEqual(expect.arrayContaining(["Last 7 days", "Email to self", "Reflection prompts"]));
    expect(recipe?.ko.shareMode).toBe("private email");
    expect(recipe?.en.shareMode).toBe("private email");
    expect(recipe?.ko.scopeLabel).toBe("Scopes · 직접 만드는 확장판");
    expect(recipe?.en.scopeLabel).toBe("Scopes · extension only");
    expect(recipe?.ko.status).toBe("이메일 리포트");
    expect(recipe?.en.status).toBe("Email report");
    expect(recipe?.ko.deployMode).toContain("직접 요청하면");
    expect(recipe?.ko.deployMode).toContain("답변은 저장하지 않으며");
    expect(recipe?.ko.deployMode).toContain("Personal Data API key가 필요하지 않고");
    expect(recipe?.en.deployMode).toContain("Request it inside Orider");
    expect(recipe?.en.deployMode).toContain("answers are not stored");
    expect(recipe?.en.deployMode).toContain("requires no Personal Data API key");
    expect(recipe?.ko.detail).toContain("현재 제공하지 않습니다");
    expect(recipe?.en.detail).toContain("currently provides no diary entry");
    expect(recipe?.showShareCardPreview).toBe(false);
    expect(hasShareCardPreview(recipe!)).toBe(false);
  });

  it("keeps share-card recipes on the existing preview action", () => {
    const shareCardRecipes = creatorRecipes.filter((recipe) => recipe.channels.includes("share-card"));

    expect(shareCardRecipes.length).toBeGreaterThan(0);
    expect(shareCardRecipes.every(hasShareCardPreview)).toBe(true);
  });
});
