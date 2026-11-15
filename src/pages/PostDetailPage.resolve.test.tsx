import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import PostDetailPage from "./PostDetailPage";

const state = vi.hoisted(() => ({ postError: null as Error | null, commentsError: null as Error | null, retryPost: vi.fn(), retryComments: vi.fn() }));
vi.mock("./useBoardPostView", () => ({ useBoardPostView: vi.fn() }));
vi.mock("../hooks/useFirestore", async original => ({
  ...await original<typeof import("../hooks/useFirestore")>(),
  useDocument: () => ({ data: state.postError ? null : { id: "post", userId: "other", nickname: "Author", title: "Public post", content: "Body", boardType: "all", createdAt: 1, likeCount: 0, commentCount: 0, viewCount: 0 },
    loading: false, error: state.postError, retry: state.retryPost }),
  useCollection: () => ({ data: [], loading: false, error: state.commentsError, retry: state.retryComments }),
}));
vi.mock("../features/board/useBoardLike", () => ({ useBoardLike: () => ({ isLiked: false, likeCount: 0, likers: [], toggleLike: vi.fn() }) }));
vi.mock("../features/board/useBoard", () => ({ useDeletePost: () => ({ deletePost: vi.fn(), deleting: false }), useReportBoardContent: () => ({ report: vi.fn(), submitting: false }) }));
vi.mock("../features/board/useComment", () => ({ softDeleteBoardComment: vi.fn(), useCreateComment: () => ({ createComment: vi.fn(), submitting: false }) }));
vi.mock("../features/board/useBoardBlocks", () => ({ setBoardAuthorBlocked: vi.fn(), useBoardBlocks: () => ({ blockedUsers: [], loading: false, error: null }) }));

const render = () => renderWithProviders(<Routes><Route path="/ko/community/board/:postId" element={<PostDetailPage />} /></Routes>,
  { authenticated: true, route: "/ko/community/board/post" });

// 불러오기 실패 문구 자체를 누르면 다시 읽는다 — 「다시 시도」 버튼을 새로 두지 않는다.
describe("게시글 불러오기 실패 문구를 누르면 다시 읽는다", () => {
  beforeEach(() => { state.postError = null; state.commentsError = null; state.retryPost.mockClear(); state.retryComments.mockClear(); });

  it("댓글 실패 문구를 누르면 댓글만 다시 읽는다", () => {
    state.commentsError = new Error("offline");
    render();
    fireEvent.click(screen.getByRole("button", { name: "데이터를 불러오지 못했습니다" }));
    expect(state.retryComments).toHaveBeenCalledTimes(1);
    expect(state.retryPost).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });

  it("글 실패 문구를 누르면 글을 다시 읽고, 기존 「게시판으로」 버튼만 남는다", () => {
    state.postError = new Error("offline");
    render();
    fireEvent.click(screen.getByRole("button", { name: /데이터를 불러오지 못했습니다/ }));
    expect(state.retryPost).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual([expect.stringContaining("데이터를 불러오지 못했습니다"), expect.stringMatching(/게시판/)]);
  });
});
