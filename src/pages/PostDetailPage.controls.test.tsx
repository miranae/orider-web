import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import PostDetailPage from "./PostDetailPage";

const mutations = vi.hoisted(() => ({ like: vi.fn(), report: vi.fn(), block: vi.fn(), deleteComment: vi.fn(), commentOwner: "commenter", content: "Post body" }));
vi.mock("./useBoardPostView", () => ({ useBoardPostView: vi.fn() }));
vi.mock("../hooks/useFirestore", async original => ({
  ...await original<typeof import("../hooks/useFirestore")>(),
  useDocument: (path: string) => ({ data: path === "board_posts" ? {
    id: "post", userId: "other", nickname: "Author", title: "Public post", content: mutations.content, boardType: "all",
    createdAt: 1, likeCount: 3, commentCount: 1, viewCount: 2,
  } : null, loading: false, error: null }),
  useCollection: () => ({ data: [{ id: "comment", userId: mutations.commentOwner, nickname: "Commenter", content: "Public comment", createdAt: 2 }], loading: false, error: null }),
}));
vi.mock("../features/board/useBoardLike", () => ({ useBoardLike: () => ({ isLiked: false, likeCount: 3, likers: [], toggleLike: mutations.like }) }));
vi.mock("../features/board/useBoard", () => ({ useDeletePost: () => ({ deletePost: vi.fn(), deleting: false }), useReportBoardContent: () => ({ report: mutations.report, submitting: false }) }));
vi.mock("../features/board/useComment", () => ({ softDeleteBoardComment: mutations.deleteComment, useCreateComment: () => ({ createComment: vi.fn(), submitting: false }) }));
vi.mock("../features/board/useBoardBlocks", () => ({ setBoardAuthorBlocked: mutations.block, useBoardBlocks: () => ({ blockedUsers: [], loading: false, error: null }) }));

describe("post detail action presentation", () => {
  beforeEach(() => { mutations.content = "Post body"; mutations.commentOwner = "commenter"; mutations.deleteComment.mockClear(); });
  it("renders report, block and like as standard DS buttons without invoking mutations", () => {
    renderWithProviders(<Routes><Route path="/ko/community/board/:postId" element={<PostDetailPage />} /></Routes>, { authenticated: true, route: "/ko/community/board/post" });
    const post = screen.getByTestId("M2-P-1");
    const postActions = within(post.querySelector(".board-post-actions")!);
    const reactions = within(post.querySelector(".board-post-reactions")!);
    const commentActions = within(screen.getByTestId("M2-C").querySelector(".board-comment-meta")!);
    const reports = [...postActions.getAllByRole("button", { name: "신고" }), ...commentActions.getAllByRole("button", { name: "신고" })];
    expect(reports).toHaveLength(2);
    for (const button of [...reports, postActions.getByRole("button", { name: "차단" }), reactions.getByRole("button", { name: /좋아요 3/ })]) {
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
  const commentActions = within(screen.getByTestId("M2-C").querySelector(".board-comment-meta")!);
  const remove = commentActions.getByRole("button", { name: "삭제" });
  expect(remove).toHaveClass("ds-btn", "ds-btn--md");
  expect(remove.querySelector(":scope > .ds-btn__icon svg")).not.toBeNull();
  expect(mutations.deleteComment).not.toHaveBeenCalled();
});


it("renders GFM content through the real Markdown renderer without executing unsafe links", () => {
  mutations.content = "## Saved ride notes\n\n| Segment | Time |\n| --- | --- |\n| Climb | 20:00 |\n\n~~Old note~~\n\n[Unsafe](javascript:alert(1))";
  renderWithProviders(<Routes><Route path="/ko/community/board/:postId" element={<PostDetailPage />} /></Routes>, { authenticated: true, route: "/ko/community/board/post" });
  expect(screen.getByRole("heading", { name: "Saved ride notes", level: 2 })).toBeInTheDocument();
  expect(within(screen.getByRole("table")).getByRole("cell", { name: "20:00" })).toBeInTheDocument();
  expect(screen.getByText("Old note").tagName).toBe("DEL");
  expect(screen.getByText("Unsafe")).not.toHaveAttribute("href", expect.stringContaining("javascript:"));
});
