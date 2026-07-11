import { beforeEach, describe, expect, it } from "vitest";
import { mockCallableInvocations, setCallableResult } from "../../__tests__/mocks/firebase";
import { getGroupInviteCode, regenerateGroupInviteCode } from "./groupInviteAdmin";

describe("group invite manager callables", () => {
  beforeEach(() => { mockCallableInvocations.length = 0; });

  it("loads the server-owned invite secret", async () => {
    setCallableResult("getGroupInviteCode", { data: { inviteCode: "ABC123", expiresAt: 123, useLimit: 10, useCount: 2 } });
    await expect(getGroupInviteCode("group-1")).resolves.toEqual(expect.objectContaining({ inviteCode: "ABC123" }));
    expect(mockCallableInvocations).toContainEqual({ name: "getGroupInviteCode", data: { groupId: "group-1" } });
  });

  it("rotates through the callable instead of writing the public group doc", async () => {
    setCallableResult("regenerateGroupInviteCode", { data: { inviteCode: "NEW123", expiresAt: 456, useLimit: 100, useCount: 0 } });
    await expect(regenerateGroupInviteCode("group-1")).resolves.toEqual(expect.objectContaining({ inviteCode: "NEW123", useCount: 0 }));
    expect(mockCallableInvocations).toContainEqual({ name: "regenerateGroupInviteCode", data: { groupId: "group-1" } });
  });
});
