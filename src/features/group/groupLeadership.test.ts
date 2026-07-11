import { beforeEach, describe, expect, it } from "vitest";
import { mockCallableInvocations, setCallableResult } from "../../__tests__/mocks/firebase";
import { transferGroupLeadership } from "./groupLeadership";

describe("transferGroupLeadership", () => {
  beforeEach(() => { mockCallableInvocations.length = 0; });

  it("delegates ownership transfer and optional departure to one server transaction", async () => {
    setCallableResult("transferGroupLeadership", { data: { success: true, leftGroup: true } });
    await expect(transferGroupLeadership({
      groupId: "group-1",
      targetUserId: "member-1",
      leaveAfterTransfer: true,
    })).resolves.toEqual({ success: true, leftGroup: true });
    expect(mockCallableInvocations).toEqual([{
      name: "transferGroupLeadership",
      data: { groupId: "group-1", targetUserId: "member-1", leaveAfterTransfer: true },
    }]);
  });

  it("rejects malformed responses instead of assuming ownership changed", async () => {
    setCallableResult("transferGroupLeadership", { data: { success: true } });
    await expect(transferGroupLeadership({
      groupId: "group-1",
      targetUserId: "member-1",
    })).rejects.toThrow("invalid-transfer-group-leadership-response");
  });
});
