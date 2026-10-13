import { renderHook, waitFor } from "@testing-library/react";
import { onSnapshot } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCallableInvocations, setCallableResult, setCollectionDocs } from "../__tests__/mocks/firebase";
import { createGroupPost, updateGroupPost, normalizeGroupPostContent, useGroupPosts } from "./useGroupPosts";

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


it("resubscribes denied posts after membership approval", async () => {
  setCollectionDocs("groups/approval/posts", [{ id: "post-1", content: "Member post" }]);
  vi.mocked(onSnapshot).mockImplementationOnce((...args) => {
    const onError = args[2];
    if (typeof onError === "function") onError(new Error("denied"));
    return () => {};
  });
  const { result, rerender } = renderHook(({ accessKey }) => useGroupPosts("approval", accessKey), { initialProps: { accessKey: "user:" } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.posts).toEqual([]);
  rerender({ accessKey: "user:member" });
  await waitFor(() => expect(result.current.posts[0]?.content).toBe("Member post"));
});

it("updates only normalized content with the existing group/post identity", async () => {
  mockCallableInvocations.length = 0;
  setCallableResult("updateGroupPost", { data: { success: true } });
  await updateGroupPost({ groupId: "group-1", postId: "post-1", content: "  Edited content  " });
  expect(mockCallableInvocations).toEqual([{
    name: "updateGroupPost", data: { groupId: "group-1", postId: "post-1", content: "Edited content" },
  }]);
});
