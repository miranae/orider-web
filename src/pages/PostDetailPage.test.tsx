import { renderHook, waitFor } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardPost } from "@shared/types";
import { resolveBoardReturnTo } from "./PostDetailPage";
import { useBoardPostView } from "./useBoardPostView";

const mocks = vi.hoisted(() => ({
  callable: vi.fn(),
  httpsCallable: vi.fn(),
  logClientError: vi.fn(),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: mocks.httpsCallable,
}));
vi.mock("../services/firebase", () => ({ functions: {} }));
vi.mock("../services/errorLogger", () => ({ logClientError: mocks.logClientError }));

function post(id: string, deletedAt?: number): Pick<BoardPost, "id" | "deletedAt"> {
  return { id, deletedAt };
}

describe("useBoardPostView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.httpsCallable.mockReturnValue(mocks.callable);
    mocks.callable.mockResolvedValue({ data: { counted: true } });
  });

  it("waits for authentication, then records through the callable", async () => {
    const { rerender } = renderHook(
      ({ uid }) => useBoardPostView("post-a", uid, post("post-a")),
      { initialProps: { uid: undefined as string | undefined } },
    );

    expect(mocks.callable).not.toHaveBeenCalled();
    rerender({ uid: "user-a" });

    await waitFor(() => expect(mocks.callable).toHaveBeenCalledWith({ postId: "post-a" }));
    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, "recordBoardPostView");
  });

  it("records each uid and route once while skipping stale or deleted data", async () => {
    const { rerender } = renderHook(
      ({ postId, uid, loadedPost }) => useBoardPostView(postId, uid, loadedPost),
      {
        initialProps: {
          postId: "post-a",
          uid: "user-a",
          loadedPost: post("post-a"),
        },
      },
    );
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(1));

    rerender({ postId: "post-a", uid: "user-a", loadedPost: post("post-a") });
    expect(mocks.callable).toHaveBeenCalledTimes(1);

    rerender({ postId: "post-b", uid: "user-a", loadedPost: post("post-a") });
    expect(mocks.callable).toHaveBeenCalledTimes(1);
    rerender({ postId: "post-b", uid: "user-a", loadedPost: post("post-b") });
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(2));

    rerender({ postId: "post-b", uid: "user-b", loadedPost: post("post-b") });
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(3));
    rerender({ postId: "post-c", uid: "user-b", loadedPost: post("post-c", Date.now()) });
    expect(mocks.callable).toHaveBeenCalledTimes(3);
  });

  it("logs a transient rejection and retries successfully", async () => {
    const error = new Error("temporary failure");
    mocks.callable.mockRejectedValueOnce(error).mockResolvedValueOnce({ data: { counted: true } });

    renderHook(() => useBoardPostView("post-a", "user-a", post("post-a")));

    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(2));
    expect(mocks.logClientError).toHaveBeenCalledWith(
      "PostDetailPage.viewCount",
      error,
      { postId: "post-a" },
    );
  });

  it("bounds repeated failures to two total attempts", async () => {
    mocks.callable.mockRejectedValue(new Error("persistent failure"));

    renderHook(() => useBoardPostView("post-a", "user-a", post("post-a")));

    await waitFor(() => expect(mocks.logClientError).toHaveBeenCalledTimes(2));
    expect(mocks.callable).toHaveBeenCalledTimes(2);
  });

  it("contains no direct Firestore view counter update", async () => {
    const source = await readFile(`${process.cwd()}/src/pages/useBoardPostView.ts`, "utf8");

    expect(source).not.toContain("firebase/firestore");
    expect(source).not.toContain("updateDoc(");
    expect(source).not.toContain("increment(");
  });
});


describe("resolveBoardReturnTo", () => {
  it("preserves the full board query for supported localized routes", () => {
    for (const lang of ["ko", "en"]) {
      const boardReturnTo = `/${lang}/community/board?type=archive&q=ride&tag=road&exclude=AI&page=3`;
      expect(resolveBoardReturnTo({ boardReturnTo })).toBe(boardReturnTo);
    }
  });

  it.each([
    undefined, null, {}, { boardReturnTo: 4 },
    ...[
      "https://example.com/ko/community/board", "//example.com/ko/community/board",
      "/fr/community/board", "/ko/community/board/post-1", "/ko/community/board/",
      "/ko/community/board/../settings", "/ko/community/board%3Fpage=3",
      "/ko/community/board#content", "/ko/community/board?x=1#content",
      "/ko/community/board?x=\\evil", "/ko/community/board?x=\ninvalid",
    ].map(boardReturnTo => ({ boardReturnTo })),
  ])("falls back safely for an absent or unsupported return target: %j", state => {
    expect(resolveBoardReturnTo(state)).toBe("/community/board");
  });
});
