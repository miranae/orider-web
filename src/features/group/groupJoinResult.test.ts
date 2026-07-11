import { describe, expect, it } from "vitest";
import { isPendingGroupJoinResult } from "./groupJoinResult";

describe("isPendingGroupJoinResult", () => {
  it("recognizes the deployed code-join pending status", () => {
    expect(isPendingGroupJoinResult({ groupId: "g1", status: "pending" })).toBe(true);
  });

  it("keeps the deployed active status out of pending state", () => {
    expect(isPendingGroupJoinResult({ groupId: "g1", status: "active" })).toBe(false);
  });
});
