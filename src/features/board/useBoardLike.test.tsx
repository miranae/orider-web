import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useBoardLike } from "./useBoardLike";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import {
  mockDeleteDoc,
  mockSetDoc,
  mockUpdateDoc,
  setCollectionDocs,
  setDocData,
} from "../../__tests__/mocks/firebase";

function LikeHarness({ count = 5 }: { count?: number }) {
  const { isLiked, likeCount, likers, toggleLike } = useBoardLike("post-1", count);
  return (
    <>
      <button type="button" onClick={() => { void toggleLike().catch(() => undefined); }}>
        {isLiked ? "liked" : "not-liked"}:{likeCount}
      </button>
      <output data-testid="likers">{likers.map((l) => l.nickname).join(",")}</output>
    </>
  );
}

describe("useBoardLike", () => {
  beforeEach(() => {
    mockSetDoc.mockClear();
    mockDeleteDoc.mockClear();
    mockUpdateDoc.mockClear();
  });

  it("optimistically likes by creating only the like document", async () => {
    let resolveWrite: (() => void) | undefined;
    mockSetDoc.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveWrite = resolve;
    }));

    renderWithProviders(<LikeHarness />, { authenticated: true });
    await userEvent.click(await screen.findByRole("button", { name: "not-liked:5" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "liked:6" })).toBeInTheDocument();
    });
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "board_posts/post-1/likes/test-uid" }),
      expect.objectContaining({ userId: "test-uid" }),
    );
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    resolveWrite?.();
  });

  it("optimistically unlikes by deleting only the like document", async () => {
    setDocData("board_posts/post-1/likes/test-uid", {
      userId: "test-uid",
      createdAt: 1,
    });

    renderWithProviders(<LikeHarness />, { authenticated: true });
    await userEvent.click(await screen.findByRole("button", { name: "liked:5" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "not-liked:4" })).toBeInTheDocument();
    });
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "board_posts/post-1/likes/test-uid" }),
    );
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("rolls back optimistic like state and count when the write fails", async () => {
    mockSetDoc.mockRejectedValueOnce(new Error("write failed"));

    renderWithProviders(<LikeHarness />, { authenticated: true });
    await userEvent.click(await screen.findByRole("button", { name: "not-liked:5" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "not-liked:5" })).toBeInTheDocument();
    });
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("좋아요 누른 사람 이름을 users_public 에서 채워 노출한다", async () => {
    // 좋아요 문서엔 uid 와 createdAt 뿐 — 닉네임/프로필은 공개 프로필에서 온다.
    setCollectionDocs("board_posts/post-1/likes", [
      { id: "u1", userId: "u1", createdAt: 2 },
      { id: "u2", userId: "u2", createdAt: 1 },
    ]);
    setDocData("users_public/u1", { nickname: "라이더1", photoURL: null });
    setDocData("users_public/u2", { nickname: "라이더2", photoURL: null });

    renderWithProviders(<LikeHarness />, { authenticated: true });

    await waitFor(() => {
      expect(screen.getByTestId("likers")).toHaveTextContent("라이더1,라이더2");
    });
  });

  it("공개 프로필이 없는 사람(탈퇴·비공개)은 아바타에서 제외한다", async () => {
    setCollectionDocs("board_posts/post-1/likes", [
      { id: "u1", userId: "u1", createdAt: 2 },
      { id: "gone", userId: "gone", createdAt: 1 },
    ]);
    setDocData("users_public/u1", { nickname: "라이더1", photoURL: null });

    renderWithProviders(<LikeHarness />, { authenticated: true });

    await waitFor(() => {
      expect(screen.getByTestId("likers")).toHaveTextContent("라이더1");
    });
    expect(screen.getByTestId("likers")).not.toHaveTextContent("gone");
  });

  it("좋아요를 누르면 아바타 목록에도 나를 즉시 넣고, 실패하면 함께 되돌린다", async () => {
    setCollectionDocs("board_posts/post-1/likes", [{ id: "u1", userId: "u1", createdAt: 1 }]);
    setDocData("users_public/u1", { nickname: "라이더1", photoURL: null });
    mockSetDoc.mockRejectedValueOnce(new Error("write failed"));

    renderWithProviders(<LikeHarness />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByTestId("likers")).toHaveTextContent("라이더1");
    });

    await userEvent.click(await screen.findByRole("button", { name: "not-liked:5" }));

    // 실패 롤백 후에는 나(Test User)가 빠지고 원래 목록으로 돌아온다.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "not-liked:5" })).toBeInTheDocument();
    });
    expect(screen.getByTestId("likers")).not.toHaveTextContent("Test User");
    // 남들 목록은 토글과 무관하게 유지돼야 한다(내 아바타만 isLiked 에서 파생).
    expect(screen.getByTestId("likers")).toHaveTextContent("라이더1");
  });

  it("조회가 끝나기 전에 눌러도 남들 목록이 나중에 합류한다", async () => {
    // 과거엔 토글이 진행 중 조회를 무효화해, 먼저 누르면 남들 이름이 다음 진입까지 사라졌다.
    setCollectionDocs("board_posts/post-1/likes", [{ id: "u1", userId: "u1", createdAt: 1 }]);
    setDocData("users_public/u1", { nickname: "라이더1", photoURL: null });

    renderWithProviders(<LikeHarness />, { authenticated: true });
    await userEvent.click(await screen.findByRole("button", { name: "not-liked:5" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "liked:6" })).toBeInTheDocument();
    });
    await waitFor(() => {
      // 내가 맨 앞 + 남들도 유지
      expect(screen.getByTestId("likers")).toHaveTextContent("Test User");
      expect(screen.getByTestId("likers")).toHaveTextContent("라이더1");
    });
  });

  it("좋아요를 취소하면 서버 목록을 다시 읽지 않아도 내 아바타만 빠진다", async () => {
    setDocData("board_posts/post-1/likes/test-uid", { userId: "test-uid", createdAt: 2 });
    setCollectionDocs("board_posts/post-1/likes", [
      { id: "test-uid", userId: "test-uid", createdAt: 2 },
      { id: "u1", userId: "u1", createdAt: 1 },
    ]);
    setDocData("users_public/u1", { nickname: "라이더1", photoURL: null });

    renderWithProviders(<LikeHarness />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByTestId("likers")).toHaveTextContent("Test User");
    });

    await userEvent.click(await screen.findByRole("button", { name: "liked:5" }));

    await waitFor(() => {
      expect(screen.getByTestId("likers")).not.toHaveTextContent("Test User");
    });
    expect(screen.getByTestId("likers")).toHaveTextContent("라이더1");
  });

  it("게시글이 바뀌면 이전 글의 좋아요 목록이 남거나 섞이지 않는다", async () => {
    // 조회는 서브컬렉션 → 공개 프로필 2단계라 이전 요청이 늦게 끝날 수 있다.
    setCollectionDocs("board_posts/post-1/likes", [{ id: "u1", userId: "u1", createdAt: 1 }]);
    setCollectionDocs("board_posts/post-2/likes", [{ id: "u2", userId: "u2", createdAt: 1 }]);
    setDocData("users_public/u1", { nickname: "라이더1", photoURL: null });
    setDocData("users_public/u2", { nickname: "라이더2", photoURL: null });

    function SwitchHarness({ postId }: { postId: string }) {
      const { likers } = useBoardLike(postId, 5);
      return <output data-testid="likers">{likers.map((l) => l.nickname).join(",")}</output>;
    }

    const { rerender } = renderWithProviders(<SwitchHarness postId="post-1" />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByTestId("likers")).toHaveTextContent("라이더1");
    });

    rerender(<SwitchHarness postId="post-2" />);
    await waitFor(() => {
      expect(screen.getByTestId("likers")).toHaveTextContent("라이더2");
    });
    expect(screen.getByTestId("likers")).not.toHaveTextContent("라이더1");
  });

  it("rolls back optimistic unlike state and count when the delete fails", async () => {
    setDocData("board_posts/post-1/likes/test-uid", {
      userId: "test-uid",
      createdAt: 1,
    });
    mockDeleteDoc.mockRejectedValueOnce(new Error("delete failed"));

    renderWithProviders(<LikeHarness />, { authenticated: true });
    await userEvent.click(await screen.findByRole("button", { name: "liked:5" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "liked:5" })).toBeInTheDocument();
    });
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});
