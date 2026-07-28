import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn((...segments: unknown[]) => ({ kind: "collection", segments })),
  doc: vi.fn((...segments: unknown[]) => ({ kind: "doc", segments })),
  updateDoc: vi.fn(),
  track: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  addDoc: mocks.addDoc,
  collection: mocks.collection,
  doc: mocks.doc,
  updateDoc: mocks.updateDoc,
}));

vi.mock("../../services/firebase", () => ({ firestore: { name: "firestore" } }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "user-1", displayName: "Rider", photoURL: null },
    profile: { nickname: "라이더", photoURL: null },
  }),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../services/analytics", () => ({ track: mocks.track }));

import { softDeleteBoardComment, useCreateComment } from "./useComment";

describe("board comment mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addDoc.mockResolvedValue({ id: "comment-1" });
    mocks.updateDoc.mockResolvedValue(undefined);
  });

  it("creates only the comment document and preserves internal newlines", async () => {
    const { result } = renderHook(() => useCreateComment("post-1"));

    await act(async () => {
      await expect(result.current.createComment("  첫 줄\n둘째 줄  ")).resolves.toBe("comment-1");
    });

    expect(mocks.collection).toHaveBeenCalledWith(
      { name: "firestore" },
      "board_posts/post-1/comments",
    );
    expect(mocks.addDoc).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "collection" }),
      expect.objectContaining({ text: "첫 줄\n둘째 줄", userId: "user-1" }),
    );
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith("board_comment_send", {
      post_id: "post-1",
      text_len: 8,
    });
  });

  it("soft-deletes only the comment document", async () => {
    await softDeleteBoardComment("post-1", "comment-1");

    expect(mocks.doc).toHaveBeenCalledWith(
      { name: "firestore" },
      "board_posts/post-1/comments",
      "comment-1",
    );
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "doc" }),
      { deletedAt: expect.any(Number) },
    );
  });

  it("rejects only when the core comment write fails", async () => {
    mocks.addDoc.mockRejectedValueOnce(new Error("permission denied"));
    const { result } = renderHook(() => useCreateComment("post-1"));

    await act(async () => {
      await expect(result.current.createComment("댓글")).rejects.toThrow("permission denied");
    });

    expect(result.current.submitting).toBe(false);
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
