import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { onSnapshot } from "firebase/firestore";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { useActivitySafety } from "./useActivitySafety";
afterEach(cleanup);
it("loads persisted hides/blocks and responds to server deletion (unhide/unblock)", async () => {
  setCollectionDocs("users/a/hidden_activities", [{ id: "hidden" }]);
  setCollectionDocs("users/a/blocks", [{ id: "blocked" }, { id: "removed", deletedAt: 1 }]);
  const { result } = renderHook(() => useActivitySafety("a"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.allows({ id: "hidden", userId: "normal" })).toBe(false);
  expect(result.current.allows({ id: "ride", userId: "blocked" })).toBe(false);
  expect(result.current.allows({ id: "ride", userId: "removed" })).toBe(true);
  act(() => { setCollectionDocs("users/a/hidden_activities", []); setCollectionDocs("users/a/blocks", []); });
  expect(result.current.allows({ id: "hidden", userId: "blocked" })).toBe(true);
});
it("does not reuse another viewer's lists and ignores old callbacks", async () => {
  const { result, rerender } = renderHook(({ uid }) => useActivitySafety(uid), { initialProps: { uid: "a" } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  setCollectionDocs("users/b/blocks", [{ id: "author" }]);
  rerender({ uid: "b" });
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => setCollectionDocs("users/a/blocks", []));
  expect(result.current.allows({ id: "ride", userId: "author" })).toBe(false);
});
it("fails closed on preference read failure and retry reads persisted state", async () => {
  vi.mocked(onSnapshot).mockImplementationOnce(((_ref: unknown, _options: unknown, _next: unknown, error: (error: Error) => void) => {
    error(new Error("permission-denied")); return () => {};
  }) as typeof onSnapshot);
  const { result } = renderHook(() => useActivitySafety("a"));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.allows({ id: "ride", userId: "normal" })).toBe(false);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.error).toBe(false));
  expect(result.current.loading).toBe(false);
});
it("keeps anonymous public browsing available without owner preference queries", () => {
  vi.mocked(onSnapshot).mockClear();
  const { result } = renderHook(() => useActivitySafety(null));
  expect(result.current.allows({ id: "ride", userId: "normal" })).toBe(true);
  expect(onSnapshot).not.toHaveBeenCalled();
});
