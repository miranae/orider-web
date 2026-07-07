import type { Visibility } from "@shared/types";

export const ACTIVITY_VISIBILITY_VALUES: readonly Visibility[] = ["everyone", "friends", "private"];

export function normalizeActivityVisibility(value: unknown, fallback: Visibility = "everyone"): Visibility {
  if (value === "followers") return "friends";
  return ACTIVITY_VISIBILITY_VALUES.includes(value as Visibility) ? (value as Visibility) : fallback;
}

