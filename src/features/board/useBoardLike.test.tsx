import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useBoardLike } from "./useBoardLike";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import {
  mockDeleteDoc,
  mockSetDoc,
  mockUpdateDoc,
  setDocData,
} from "../../__tests__/mocks/firebase";

function LikeHarness({ count = 5 }: { count?: number }) {
  const { isLiked, likeCount, toggleLike } = useBoardLike("post-1", count);
  return (
    <button type="button" onClick={() => { void toggleLike().catch(() => undefined); }}>
      {isLiked ? "liked" : "not-liked"}:{likeCount}
    </button>
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
