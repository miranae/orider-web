import { beforeEach, describe, expect, it } from "vitest";
import { mockCallableInvocations, setCallableResult } from "../__tests__/mocks/firebase";
import { createGroupPost, normalizeGroupPostContent } from "./useGroupPosts";

describe("normalizeGroupPostContent", () => {
  it("trims valid content", () => {
    expect(normalizeGroupPostContent("  모임 공지  ")).toBe("모임 공지");
  });

  it("rejects empty and oversized posts", () => {
    expect(() => normalizeGroupPostContent("   ")).toThrow("empty-content");
    expect(() => normalizeGroupPostContent("x".repeat(1_001))).toThrow("content-too-long");
  });
});

describe("createGroupPost", () => {
  beforeEach(() => {
    mockCallableInvocations.length = 0;
    setCallableResult("createGroupPost", { data: { postId: "post-1" } });
  });

  it("delegates identity, role enforcement, and timestamps to the server", async () => {
    await createGroupPost({ groupId: "group-1", content: "  공지  ", kind: "announcement" });
    expect(mockCallableInvocations).toContainEqual({
      name: "createGroupPost",
      data: { groupId: "group-1", content: "공지", kind: "announcement" },
    });
  });
});
