import { describe, expect, it } from "vitest";
import { parseRelationshipScope, scopeToFeedScope } from "./feedRelationshipScope";

describe("relationship scope URL contract", () => {
  it("uses existing preference only when the URL has no activity scope", () => {
    expect(parseRelationshipScope(new URLSearchParams(), "friends", true)).toMatchObject({ scope: "personal", feedScope: "friends" });
    expect(parseRelationshipScope(new URLSearchParams(), "all", true).scope).toBe("public");
  });
  it("restores club and activity scopes from shared URLs", () => {
    expect(parseRelationshipScope(new URLSearchParams("scope=club&club=club-a"), "self", true)).toEqual({ scope: "club", clubId: "club-a", feedScope: "self" });
    expect(parseRelationshipScope(new URLSearchParams("scope=friends"), "all", true)).toMatchObject({ scope: "personal", feedScope: "friends" });
    expect(parseRelationshipScope(new URLSearchParams("scope=all"), "self", true)).toMatchObject({ scope: "public", feedScope: "all" });
  });
  it("keeps guests in public scope even with a club URL", () => {
    expect(parseRelationshipScope(new URLSearchParams("scope=club&club=a"), "friends", false)).toMatchObject({ scope: "public", feedScope: "all" });
  });
  it("maps personal scope to the last personal filter or self", () => {
    expect(scopeToFeedScope("personal", "all")).toBe("self");
    expect(scopeToFeedScope("personal", "friends")).toBe("friends");
    expect(scopeToFeedScope("public", "self")).toBe("all");
  });
});
