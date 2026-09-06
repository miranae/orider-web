import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ uid: "a", firestore: {}, listeners: [] as Array<{
  next: (snap: { exists: () => boolean; data: () => unknown }) => void;
  error: (error: Error) => void;
}> }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ firestore: mocks.firestore }) }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn(), debugLog: vi.fn() }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), onSnapshot: (_ref: unknown, next: typeof mocks.listeners[number]["next"], error: typeof mocks.listeners[number]["error"]) => {
  mocks.listeners.push({ next, error }); return vi.fn();
} }));
import { useUserFitness } from "./useUserFitness";

describe("legacy current Fitness", () => {
  beforeEach(() => { mocks.uid = "a"; mocks.listeners.length = 0; });
  it("keeps real zero on read failure and ignores late account callbacks", () => {
    const hook = renderHook(() => useUserFitness());
    const a = mocks.listeners[0];
    act(() => a.next({ exists: () => true, data: () => ({ totalCTL: 0 }) }));
    act(() => a.error(new Error("offline")));
    expect(hook.result.current.fitness?.totalCTL).toBe(0);
    expect(hook.result.current.stale).toBe(true);
    mocks.uid = "b";
    hook.rerender();
    act(() => a.next({ exists: () => true, data: () => ({ totalCTL: 999 }) }));
    expect(hook.result.current.fitness).toBeNull();
  });
  it("does not replace a known value with a failed computation marker", () => {
    const hook = renderHook(() => useUserFitness());
    const a = mocks.listeners[0];
    act(() => a.next({ exists: () => true, data: () => ({ totalCTL: 42 }) }));
    act(() => a.next({ exists: () => true, data: () => ({ state: "failed" }) }));
    expect(hook.result.current.fitness?.totalCTL).toBe(42);
  });
});
