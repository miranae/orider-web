import { FirebaseError } from "firebase/app";
import { describe, expect, it, vi } from "vitest";
import {
  activitySocialErrorMessageKey,
  classifyActivitySocialError,
  createActivitySocialMutationClient,
} from "./activitySocialMutations";

describe("activity social mutation client", () => {
  it("uses canonical callable names and exact payloads", async () => {
    const invoke = vi.fn().mockResolvedValue({});
    const client = createActivitySocialMutationClient(invoke);
    await client.setKudos("a1", true);
    await client.postComment("a1", "hello", "parent");
    await client.editComment("a1", "c1", "edited");
    await client.deleteComment("a1", "c1");
    expect(invoke.mock.calls).toEqual([
      ["setActivityKudos", { activityId: "a1", enabled: true }],
      ["postActivityComment", { activityId: "a1", text: "hello", parentId: "parent" }],
      ["editActivityComment", { activityId: "a1", commentId: "c1", text: "edited" }],
      ["deleteActivityComment", { activityId: "a1", commentId: "c1" }],
    ]);
  });

  it.each([
    ["functions/unauthenticated", "auth"],
    ["functions/permission-denied", "access"],
    ["functions/not-found", "missing"],
    ["functions/resource-exhausted", "rate_limited"],
    ["functions/invalid-argument", "invalid"],
  ])("normalizes %s", (code, expected) => {
    expect(classifyActivitySocialError(new FirebaseError(code, "failed"))).toBe(expected);
  });

  it("distinguishes App Check failures and returns an i18n key", () => {
    const error = new FirebaseError("functions/unauthenticated", "App Check token rejected");
    expect(classifyActivitySocialError(error)).toBe("app_check");
    expect(activitySocialErrorMessageKey(error)).toBe("socialErrors.app_check");
  });
});
