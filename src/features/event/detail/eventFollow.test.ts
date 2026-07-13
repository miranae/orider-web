import { describe, expect, it } from "vitest";
import { buildEventFollowPayload, followerExists } from "./eventFollow";

describe("event follow contract", () => {
  it("uses the backend follow field", () => {
    expect(buildEventFollowPayload("event-1", true)).toEqual({ eventId: "event-1", follow: true });
    expect(buildEventFollowPayload("event-1", false)).not.toHaveProperty("following");
  });

  it("hydrates state from the persisted follower document", () => {
    expect(followerExists({ exists: () => true })).toBe(true);
    expect(followerExists({ exists: () => false })).toBe(false);
  });
});
