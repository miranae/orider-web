import { act, renderHook, waitFor } from "@testing-library/react";
import { onSnapshot } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { useCollection, useDocument, where } from "./useFirestore";
import * as errorLogger from "../services/errorLogger";

describe("useCollection", () => {
  it("does not resubscribe when inline constraints serialize to the same query", () => {
    setCollectionDocs("comments", [{ id: "comment-1", deletedAt: null }]);

    const { rerender } = renderHook(
      ({ tick }) => {
        void tick;
        return useCollection("comments", [where("deletedAt", "==", null)]);
      },
      { initialProps: { tick: 1 } },
    );

    expect(vi.mocked(onSnapshot)).toHaveBeenCalledTimes(1);

    rerender({ tick: 2 });

    expect(vi.mocked(onSnapshot)).toHaveBeenCalledTimes(1);
  });
});

// 읽기 실패 문구를 누르면 다시 구독한다(PostDetailPage 의 글·댓글 불러오기 실패).
describe("retry", () => {
  const failFirst = (path: string) => {
    const original = vi.mocked(onSnapshot).getMockImplementation()!;
    let reads = 0;
    vi.mocked(onSnapshot).mockImplementation(((ref: { path: string }, next: unknown, error: (failure: Error) => void) => {
      if (ref.path === path) { reads++; error(new Error(`offline-${reads}`)); return () => {}; }
      return (original as (...args: unknown[]) => () => void)(ref, next, error);
    }) as never);
    return { reads: () => reads, restore: () => vi.mocked(onSnapshot).mockImplementation(original) };
  };

  it("useCollection 의 retry 는 오류를 내리고 다시 구독하며, 다시 읽은 실패만 기록한다", async () => {
    const logged = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => {});
    const stub = failFirst("board_posts/p/comments");
    const { result } = renderHook(() => useCollection("board_posts/p/comments"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(logged).not.toHaveBeenCalled();
    act(() => { result.current.retry(); });
    expect(stub.reads()).toBe(2);
    expect(logged).toHaveBeenCalledWith("useCollection.retry", expect.any(Error), expect.objectContaining({ attempt: 1 }), expect.anything());
    stub.restore(); logged.mockRestore();
  });

  it("useDocument 의 retry 도 다시 구독한다", async () => {
    const logged = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => {});
    const stub = failFirst("board_posts/p");
    const { result } = renderHook(() => useDocument("board_posts", "p"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    act(() => { result.current.retry(); });
    expect(stub.reads()).toBe(2);
    expect(logged).toHaveBeenCalledWith("useDocument.retry", expect.any(Error), expect.objectContaining({ attempt: 1 }), expect.anything());
    stub.restore(); logged.mockRestore();
  });
});
