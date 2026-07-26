import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import parity from "../features/coach/__fixtures__/rider-insight-parity.json";
import { usePdc } from "./usePdc";

const mocks = vi.hoisted(() => ({ callback: null as null | ((snap: any) => void), log: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => "pdc-ref"),
  onSnapshot: vi.fn((_ref, callback) => { mocks.callback = callback; return vi.fn(); }),
}));
vi.mock("../services/firebase", () => ({ firestore: {} }));
vi.mock("../services/errorLogger", () => ({ logClientError: mocks.log }));

describe("usePdc", () => {
  beforeEach(() => { mocks.callback = null; vi.clearAllMocks(); });
  it("publishes only parsed persisted PDC v5 data", () => {
    const { result } = renderHook(() => usePdc("owner"));
    act(() => mocks.callback?.({ exists: () => true, data: () => structuredClone(parity.persistedPdc) }));
    expect(result.current).toMatchObject({ status: "ready", pdc: { version: 5, activityCount: 12 } });
  });
  it("fails closed and logs malformed or legacy documents", () => {
    const { result } = renderHook(() => usePdc("owner"));
    const invalid = structuredClone(parity.persistedPdc) as any; invalid.version = 4;
    act(() => mocks.callback?.({ exists: () => true, data: () => invalid }));
    expect(result.current).toEqual({ status: "missing", pdc: null });
    expect(mocks.log).toHaveBeenCalledWith("usePdc.invalidContract", expect.any(Error), { uid: "owner" });
  });
});
