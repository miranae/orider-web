import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import PostDetailPage from "./PostDetailPage";

const mutations = vi.hoisted(() => ({ like: vi.fn(), report: vi.fn(), block: vi.fn(), deleteComment: vi.fn(), commentOwner: "commenter" }));
vi.mock("./useBoardPostView", () => ({ useBoardPostView: vi.fn() }));
vi.mock("../hooks/useFirestore", async original => ({
  ...await original<typeof import("../hooks/useFirestore")>(),
  useDocument: (path: string) => ({ data: path === "board_posts" ? {
    id: "post", userId: "other", nickname: "Author", title: "Public post", content: "Post body", boardType: "all",
    createdAt: 1, likeCount: 3, commentCount: 1, viewCount: 2,
  } : null, loading: false, error: null }),
  useCollection: () => ({ data: [{ id: "comment", userId: mutations.commentOwner, nickname: "Commenter", content: "Public comment", createdAt: 2 }], loading: false, error: null }),
}));
vi.mock("../features/board/useBoardLike", () => ({ useBoardLike: () => ({ isLiked: false, likeCount: 3, likers: [], toggleLike: mutations.like }) }));
vi.mock("../features/board/useBoard", () => ({ useDeletePost: () => ({ deletePost: vi.fn(), deleting: false }), useReportBoardContent: () => ({ report: mutations.report, submitting: false }) }));
vi.mock("../features/board/useComment", () => ({ softDeleteBoardComment: mutations.deleteComment, useCreateComment: () => ({ createComment: vi.fn(), submitting: false }) }));
vi.mock("../features/board/useBoardBlocks", () => ({ setBoardAuthorBlocked: mutations.block, useBoardBlocks: () => ({ blockedUsers: [], loading: false, error: null }) }));

describe("post detail action presentation", () => {
  beforeEach(() => { mutations.commentOwner = "commenter"; mutations.deleteComment.mockClear(); });
  it("renders report, block and like as standard DS buttons without invoking mutations", () => {
    renderWithProviders(<Routes><Route path="/ko/community/board/:postId" element={<PostDetailPage />} /></Routes>, { authenticated: true, route: "/ko/community/board/post" });
    const reports = screen.getAllByRole("button", { name: "신고" });
    expect(reports).toHaveLength(2);
    for (const button of [...reports, screen.getByRole("button", { name: "차단" }), screen.getByRole("button", { name: /좋아요 3/ })]) {
      expect(button).toHaveClass("ds-btn", "ds-btn--md");
      expect(button.querySelector(":scope > .ds-btn__icon svg")).not.toBeNull();
      expect(within(button).queryByRole("img")).toBeNull();
    }
    expect(mutations.like).not.toHaveBeenCalled();
    expect(mutations.report).not.toHaveBeenCalled();
    expect(mutations.block).not.toHaveBeenCalled();
  });
});


it("renders own-comment deletion as a standard icon action without deleting anything", () => {
  mutations.commentOwner = "test-uid";
  renderWithProviders(<Routes><Route path="/ko/community/board/:postId" element={<PostDetailPage />} /></Routes>, { authenticated: true, route: "/ko/community/board/post" });
  const remove = screen.getByRole("button", { name: "삭제" });
  expect(remove).toHaveClass("ds-btn", "ds-btn--md");
  expect(remove.querySelector(":scope > .ds-btn__icon svg")).not.toBeNull();
  expect(mutations.deleteComment).not.toHaveBeenCalled();
});
