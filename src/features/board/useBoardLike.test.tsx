import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useBoardLike } from "./useBoardLike";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockSetDoc } from "../../__tests__/mocks/firebase";

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
  });

  it("updates like state and count before the write resolves", async () => {
    let resolveWrite: (() => void) | undefined;
    mockSetDoc.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveWrite = resolve;
    }));

    renderWithProviders(<LikeHarness />, { authenticated: true });
    await userEvent.click(await screen.findByRole("button", { name: "not-liked:5" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "liked:6" })).toBeInTheDocument();
    });
    resolveWrite?.();
  });

  it("rolls back optimistic like state and count when the write fails", async () => {
    mockSetDoc.mockRejectedValueOnce(new Error("write failed"));

    renderWithProviders(<LikeHarness />, { authenticated: true });
    await userEvent.click(await screen.findByRole("button", { name: "not-liked:5" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "not-liked:5" })).toBeInTheDocument();
    });
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });
});
