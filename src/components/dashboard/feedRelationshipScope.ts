import type { ActivityFeedScope } from "../../hooks/useActivities";

export type RelationshipScope = "personal" | "club" | "public";

export function parseRelationshipScope(params: URLSearchParams, preference: ActivityFeedScope, signedIn: boolean) {
  const requested = params.get("scope");
  const feedScope: ActivityFeedScope = !signedIn ? "all" : requested === "self" || requested === "friends" || requested === "all" ? requested : preference;
  const scope: RelationshipScope = !signedIn ? "public" : requested === "club" ? "club" : feedScope === "all" ? "public" : "personal";
  return { scope, feedScope, clubId: params.get("club") ?? undefined };
}

export function scopeToFeedScope(scope: RelationshipScope, lastPersonal: ActivityFeedScope): ActivityFeedScope {
  return scope === "public" ? "all" : lastPersonal === "friends" ? "friends" : "self";
}
