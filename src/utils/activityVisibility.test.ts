import { describe, expect, it } from "vitest";
import { ACTIVITY_VISIBILITY_VALUES, normalizeActivityVisibility } from "./activityVisibility";

describe("activityVisibility", () => {
  it("uses the shared canonical activity visibility values", () => {
    expect(ACTIVITY_VISIBILITY_VALUES).toEqual(["everyone", "friends", "private"]);
    expect(ACTIVITY_VISIBILITY_VALUES).not.toContain("followers");
  });

  it("normalizes legacy followers to friends", () => {
    expect(normalizeActivityVisibility("followers")).toBe("friends");
    expect(normalizeActivityVisibility("friends")).toBe("friends");
    expect(normalizeActivityVisibility("unknown", "private")).toBe("private");
  });
});

