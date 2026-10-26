import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
const f = vi.hoisted(() => ({ services: {} as FirebaseServices, peek: vi.fn(), history: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: f.services.auth.currentUser }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => f.services }));
vi.mock("../services/activityNarrativeApi", () => ({ peekActivityNarrative: f.peek }));
vi.mock("../services/activityNarrativeHistory", () => ({ loadActivityNarrativeHistory: f.history }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
import { useActivityNarrativePeek } from "./useActivityNarrativePeek";
import { useActivityNarrativeHistory } from "./useActivityNarrativeHistory";
function named(name: string) {
  const app = { name };
  return { auth: { app, currentUser: { uid: "same-owner" } }, functions: { app } } as unknown as FirebaseServices;
}
it("separates completed peek caches and saved selection between named apps with the same UID", async () => {
  const a = named("a"), b = named("b"); f.services = a;
  f.peek.mockResolvedValueOnce({ hit: true, summary: "app A" }).mockResolvedValueOnce({ hit: true, summary: "app B" });
  f.history.mockResolvedValue({ items: [], nextCursor: null, selected: { revisionId: "old", narrative: { summary: "A old" } } });
  const hook = renderHook(() => ({ peek: useActivityNarrativePeek("ride", true), history: useActivityNarrativeHistory("ride", "ko", true) }));
  await waitFor(() => expect(hook.result.current.peek.data?.summary).toBe("app A"));
  await act(async () => hook.result.current.history.load("old"));
  expect(hook.result.current.history.selected?.narrative.summary).toBe("A old");
  f.services = b; hook.rerender();
  expect(hook.result.current.peek.data).toBeNull();
  expect(hook.result.current.history.selected).toBeNull();
  await waitFor(() => expect(hook.result.current.peek.data?.summary).toBe("app B"));
  expect(f.peek).toHaveBeenNthCalledWith(1, { activityId: "ride", cacheOnly: true, lang: "ko" }, a);
  expect(f.peek).toHaveBeenNthCalledWith(2, { activityId: "ride", cacheOnly: true, lang: "ko" }, b);
  expect(f.history).toHaveBeenCalledWith("ride", "ko", "old", undefined, a);
});

it("keeps revocation sticky through retry, temporary failure and clear until a successful authorized read", async () => {
  f.services = named("revoked"); f.history.mockReset();
  f.history.mockRejectedValueOnce(Object.assign(Error("denied"), { code: "permission-denied" }));
  const hook = renderHook(() => useActivityNarrativeHistory("revoked-ride", "ko", true));
  await act(async () => hook.result.current.load());
  expect(hook.result.current.accessRevoked).toBe(true);
  let reject!: (error: Error) => void;
  f.history.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  let retry!: Promise<void>;
  act(() => { retry = hook.result.current.load(); });
  expect(hook.result.current.busy).toBe(true);
  expect(hook.result.current.accessRevoked).toBe(true);
  await act(async () => { reject(Error("offline")); await retry; });
  expect(hook.result.current.accessRevoked).toBe(true);
  act(() => hook.result.current.clear());
  expect(hook.result.current.accessRevoked).toBe(true);
  f.history.mockRejectedValueOnce(Object.assign(Error("still denied"), { code: "permission-denied" }));
  await act(async () => hook.result.current.load());
  expect(hook.result.current.accessRevoked).toBe(true);
  f.history.mockResolvedValueOnce({ items: [], nextCursor: null, selected: null });
  await act(async () => hook.result.current.load());
  expect(hook.result.current.accessRevoked).toBe(false);
});
