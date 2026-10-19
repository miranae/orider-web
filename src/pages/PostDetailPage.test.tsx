import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
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

  it("records anonymous visits and counts a fresh visit to the same post", async () => {
    const first = renderHook(() => useBoardPostView("post-a", "default", post("post-a")));
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(1));
    first.unmount();

    renderHook(() => useBoardPostView("post-a", "default", post("post-a")));
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(2));
    const [firstRequest, secondRequest] = mocks.callable.mock.calls.map(([request]) => request);
    expect(firstRequest).toEqual({ postId: "post-a", viewId: expect.any(String) });
    expect(secondRequest.viewId).not.toBe(firstRequest.viewId);
    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, "recordBoardPostView");
  });

  it("records each SPA visit, including back navigation to the same history entry", async () => {
    const { result } = renderHook(() => {
      const location = useLocation();
      const navigate = useNavigate();
      const postId = location.pathname.slice(1);
      useBoardPostView(postId, location.key, post(postId));
      return navigate;
    }, { wrapper: ({ children }) => <MemoryRouter initialEntries={["/post-a"]}>{children}</MemoryRouter> });

    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(1));
    await act(async () => result.current("/post-b"));
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(2));
    await act(async () => result.current(-1));
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(3));
    await act(async () => result.current("/post-a"));
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(4));
    expect(mocks.callable.mock.calls.map(([request]) => request.postId))
      .toEqual(["post-a", "post-b", "post-a", "post-a"]);
    expect(new Set(mocks.callable.mock.calls.map(([request]) => request.viewId)).size).toBe(4);
  });

  it("does not recount StrictMode, snapshots, rerenders or authentication transitions", async () => {
    const { rerender } = renderHook(
      ({ loadedPost }) => useBoardPostView("post-a", "entry-a", loadedPost),
      {
        initialProps: { loadedPost: post("post-a"), uid: undefined as string | undefined },
        wrapper: StrictMode,
      },
    );
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(1));
    rerender({ loadedPost: post("post-a"), uid: "user-a" });
    rerender({ loadedPost: post("post-a"), uid: "user-b" });
    rerender({ loadedPost: post("post-a"), uid: undefined });
    expect(mocks.callable).toHaveBeenCalledTimes(1);
  });

  it("waits for the matching loaded post and skips deleted posts", async () => {
    const { rerender } = renderHook(
      ({ postId, loadedPost }) => useBoardPostView(postId, "entry", loadedPost),
      { initialProps: { postId: "post-b", loadedPost: null as Pick<BoardPost, "id" | "deletedAt"> | null } },
    );
    expect(mocks.callable).not.toHaveBeenCalled();
    rerender({ postId: "post-b", loadedPost: post("post-a") });
    expect(mocks.callable).not.toHaveBeenCalled();
    rerender({ postId: "post-b", loadedPost: post("post-b", Date.now()) });
    expect(mocks.callable).not.toHaveBeenCalled();
    rerender({ postId: "post-c", loadedPost: post("post-b") });
    expect(mocks.callable).not.toHaveBeenCalled();
    rerender({ postId: "post-c", loadedPost: post("post-c") });
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(1));
    expect(mocks.callable).toHaveBeenCalledWith({ postId: "post-c", viewId: expect.any(String) });
  });

  it("retries a transient rejection with the same view ID", async () => {
    const error = new Error("temporary failure");
    mocks.callable.mockRejectedValueOnce(error).mockResolvedValueOnce({ data: { counted: true } });

    renderHook(() => useBoardPostView("post-a", "entry-a", post("post-a")));

    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(2));
    expect(mocks.callable.mock.calls[1]).toEqual(mocks.callable.mock.calls[0]);
    expect(mocks.logClientError).toHaveBeenCalledWith(
      "PostDetailPage.viewCount", error, { postId: "post-a" },
    );
  });

  it("keeps a pending old visit separate from a return visit and ignores its late failure", async () => {
    let rejectFirst!: (error: Error) => void;
    mocks.callable.mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }));
    const { rerender } = renderHook(
      ({ postId }) => useBoardPostView(postId, postId, post(postId)),
      { initialProps: { postId: "post-a" } },
    );
    rerender({ postId: "post-b" });
    rerender({ postId: "post-a" });
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(3));
    await act(async () => rejectFirst(new Error("late failure")));
    expect(mocks.callable).toHaveBeenCalledTimes(3);
    expect(mocks.callable.mock.calls[2]![0].viewId).not.toBe(mocks.callable.mock.calls[0]![0].viewId);
  });

  it("bounds repeated failures to two total attempts", async () => {
    mocks.callable.mockRejectedValue(new Error("persistent failure"));

    renderHook(() => useBoardPostView("post-a", "entry-a", post("post-a")));

    await waitFor(() => expect(mocks.logClientError).toHaveBeenCalledTimes(2));
    expect(mocks.callable).toHaveBeenCalledTimes(2);
    expect(mocks.callable.mock.calls[1]).toEqual(mocks.callable.mock.calls[0]);
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
