import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePagedSearch } from "./usePagedSearch";

describe("usePagedSearch", () => {
  it("only fetches the next cursor on demand and ignores duplicate clicks", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ items: [{ id: "a" }], cursor: "first", hasMore: true })
      .mockResolvedValueOnce({ items: [{ id: "a" }, { id: "b" }], cursor: "second", hasMore: false });
    const { result } = renderHook(() => usePagedSearch("query", fetch));
    await waitFor(() => expect(result.current.items).toEqual([{ id: "a" }]));
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => { void result.current.loadMore(); void result.current.loadMore(); });
    await waitFor(() => expect(result.current.items).toEqual([{ id: "a" }, { id: "b" }]));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith("first");
    act(() => { void result.current.loadMore(); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("hides old scopes and discards a late response after filters change", async () => {
    let resolve!: (page: { items: { id: string }[]; cursor: null; hasMore: false }) => void;
    const fetch = vi.fn().mockResolvedValueOnce({ items: [{ id: "old" }], cursor: "first", hasMore: true })
      .mockImplementationOnce(() => new Promise(done => { resolve = done; }))
      .mockResolvedValueOnce({ items: [{ id: "new" }], cursor: null, hasMore: false });
    const { result, rerender } = renderHook(({ key }) => usePagedSearch(key, fetch), { initialProps: { key: "old" } });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => { void result.current.loadMore(); });
    rerender({ key: "new" });
    expect(result.current.items).toEqual([]);
    await waitFor(() => expect(result.current.items).toEqual([{ id: "new" }]));
    await act(async () => resolve({ items: [{ id: "stale" }], cursor: null, hasMore: false }));
    expect(result.current.items).toEqual([{ id: "new" }]);
  });
  it("does not query when disabled and keeps the same cursor available after a next-page failure", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ items: [{ id: "a" }], cursor: "first", hasMore: true })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [{ id: "b" }], cursor: null, hasMore: false });
    const { result, rerender } = renderHook(({ key }: { key: string | null }) => usePagedSearch(key, fetch), { initialProps: { key: null as string | null } });
    expect(fetch).not.toHaveBeenCalled();
    rerender({ key: "active" });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => { void result.current.loadMore(); });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.items).toEqual([{ id: "a" }]);
    act(() => { void result.current.loadMore(); });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(fetch).toHaveBeenLastCalledWith("first");
  });
});
