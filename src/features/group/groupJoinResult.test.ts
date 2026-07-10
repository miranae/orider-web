import { describe, expect, it } from "vitest";
import { isPendingGroupJoinResult } from "./groupJoinResult";

describe("isPendingGroupJoinResult", () => {
  it("recognizes pending join responses across supported response shapes", () => {
    expect(isPendingGroupJoinResult({ pending: true })).toBe(true);
    expect(isPendingGroupJoinResult({ status: "pending" })).toBe(true);
    expect(isPendingGroupJoinResult({ memberStatus: "requested" })).toBe(true);
    expect(isPendingGroupJoinResult({ joinStatus: "approval_required" })).toBe(true);
    expect(isPendingGroupJoinResult({ requestStatus: "manual_approval" })).toBe(true);
  });

  it("does not treat active join responses as pending", () => {
    expect(isPendingGroupJoinResult({ groupId: "g1" })).toBe(false);
    expect(isPendingGroupJoinResult({ status: "active" })).toBe(false);
    expect(isPendingGroupJoinResult(null)).toBe(false);
  });
});
