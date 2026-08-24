import { act, renderHook } from "@testing-library/react";
import { doc } from "firebase/firestore";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import parity from "../features/coach/__fixtures__/rider-insight-parity.json";
import { FirebaseServicesProvider, type FirebaseServices } from "../contexts/FirebaseServicesContext";
import { usePdc } from "./usePdc";

const mocks = vi.hoisted(() => ({ callback: null as null | ((snap: any) => void), log: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => "pdc-ref"),
  onSnapshot: vi.fn((_ref, callback) => { mocks.callback = callback; return vi.fn(); }),
}));
vi.mock("../services/firebase", () => ({
  auth: {},
  ensureAppCheckReady: vi.fn(),
  firestore: {},
  functions: {},
}));
vi.mock("../services/errorLogger", () => ({ logClientError: mocks.log }));

describe("usePdc", () => {
  beforeEach(() => { mocks.callback = null; vi.clearAllMocks(); });
  it("publishes only parsed persisted PDC v5 data", () => {
    const { result } = renderHook(() => usePdc("owner"));
    act(() => mocks.callback?.({ exists: () => true, data: () => structuredClone(parity.persistedPdc) }));
    expect(result.current).toMatchObject({ status: "ready", pdc: { version: 5, activityCount: 12 } });
  });
  it("subscribes with the Firestore instance supplied by the services context", () => {
    const injectedFirestore = {} as FirebaseServices["firestore"];
    const services: FirebaseServices = {
      auth: {} as FirebaseServices["auth"],
      ensureAppCheckReady: vi.fn(),
      firestore: injectedFirestore,
      functions: {} as FirebaseServices["functions"],
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <FirebaseServicesProvider services={services}>{children}</FirebaseServicesProvider>
    );

    renderHook(() => usePdc("owner"), { wrapper });

    expect(doc).toHaveBeenCalledWith(
      injectedFirestore,
      "users",
      "owner",
      "fitness",
      "pdc_bike",
    );
  });
  it("publishes safely migrated persisted PDC v1 data", () => {
    const { result } = renderHook(() => usePdc("owner"));
    const legacy = structuredClone(parity.persistedPdc) as any;
    legacy.version = 1; delete legacy.provenance;
    for (const entry of Object.values(legacy.mmpAll) as any[]) {
      delete entry.source; delete entry.cohortEligible;
    }
    act(() => mocks.callback?.({ exists: () => true, data: () => legacy }));
    expect(result.current).toMatchObject({ status: "ready", pdc: { version: 5, activityCount: 12,
      cp: { value: 270 }, pdcModel: null, riderType: null, ability: null, vo2maxEst: null,
      provenance: { version: 2, power: "unknown", excludesVirtualPower: false, migration: "legacy_v1" } } });
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("fails closed and logs malformed or unsupported documents", () => {
    const { result } = renderHook(() => usePdc("owner"));
    const invalid = structuredClone(parity.persistedPdc) as any; invalid.version = 4;
    act(() => mocks.callback?.({ exists: () => true, data: () => invalid }));
    expect(result.current).toEqual({ status: "missing", pdc: null });
    expect(mocks.log).toHaveBeenCalledWith("usePdc.invalidContract", expect.any(Error), { uid: "owner" });
  });
});
