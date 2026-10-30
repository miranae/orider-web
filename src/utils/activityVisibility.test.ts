import { describe, expect, it } from "vitest";
import { ACTIVITY_VISIBILITY_VALUES, normalizeActivityVisibility } from "./activityVisibility";

describe("activityVisibility", () => {
  it("uses the shared canonical activity visibility values", () => {
    expect(ACTIVITY_VISIBILITY_VALUES).toEqual(["everyone", "friends", "followers", "private"]);
  });

  it("preserves followers separately from mutual friends", () => {
    expect(normalizeActivityVisibility("followers")).toBe("followers");
    expect(normalizeActivityVisibility("friends")).toBe("friends");
    expect(normalizeActivityVisibility("unknown", "private")).toBe("private");
  });
});

