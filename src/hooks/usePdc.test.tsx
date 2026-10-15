import { act, renderHook } from "@testing-library/react";
import { doc } from "firebase/firestore";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import parity from "../features/coach/__fixtures__/rider-insight-parity.json";
import { FirebaseServicesProvider, type FirebaseServices } from "../contexts/FirebaseServicesContext";
import { usePdc } from "./usePdc";
import { sufficiencySet } from "../features/sufficiency/__fixtures__";

const mocks = vi.hoisted(() => ({ callback: null as null | ((snap: any) => void), log: vi.fn() }));
const v6Fixture = () => {
  const value = structuredClone(parity.persistedPdc) as any;
  value.version = 6; value.status = "final"; value.inputDigest = "a".repeat(64);
  value.asOf = value.computedAt;
  value.coverage = { state: "complete", candidateActivityCount: value.activityCount,
    includedActivityCount: value.activityCount, excludedActivityCount: 0,
    excludedActivityIds: [], excludedActivityIdsTruncated: false, excludedReasonCounts: {},
    carriedForwardDurationCount: 0 };
  return value;
};
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => "pdc-ref"),
  onSnapshot: vi.fn((_ref, callback) => { mocks.callback = callback; return vi.fn(); }),
}));
vi.mock("../services/firebase", () => ({
  auth: {},
  ensureAppCheckReady: vi.fn(),
  getAppCheckToken: vi.fn().mockResolvedValue(null),
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
  it("publishes a validated v6 final document", () => {
    const { result } = renderHook(() => usePdc("owner"));
    act(() => mocks.callback?.({ exists: () => true, data: v6Fixture }));
    expect(result.current).toMatchObject({ status: "ready", pdc: { version: 6, status: "final" } });
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("holds a valid v6 partial document without an invalid-contract error", () => {
    const { result } = renderHook(() => usePdc("owner"));
    const partial = v6Fixture(); partial.status = "partial";
    partial.coverage = { ...partial.coverage, state: "partial", candidateActivityCount: partial.activityCount + 1,
      excludedActivityCount: 1, excludedActivityIds: ["pending-ride"],
      excludedReasonCounts: { metrics_missing: 1 } };
    partial.inputExclusions = { reason: "input_pending", count: 1,
      activityIds: ["pending-ride"], mergedWithLastKnownGood: true };
    act(() => mocks.callback?.({ exists: () => true, data: () => partial }));
    expect(result.current).toEqual({ status: "partial", pdc: null });
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("값 없는 PDC 는 missing 으로 두고 충분도 블록만 싣는다", () => {
    const { result } = renderHook(() => usePdc("owner"));
    const empty = { discipline: "bike", version: 6, status: "empty", asOf: 1, activityCount: 0, computedAt: 2,
      coverage: { state: "complete" }, sufficiency: sufficiencySet() };
    act(() => mocks.callback?.({ exists: () => true, data: () => structuredClone(empty) }));
    expect(result.current).toMatchObject({ status: "missing", pdc: null,
      sufficiency: { ownerOutput: "pdc_bike", blocks: [{ featureId: "vo2max" }] } });
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("확정 문서의 충분도 블록을 함께 싣고 모르는 키로 보고하지 않는다", () => {
    const { result } = renderHook(() => usePdc("owner"));
    act(() => mocks.callback?.({ exists: () => true, data: () => ({ ...v6Fixture(), sufficiency: sufficiencySet() }) }));
    expect(result.current).toMatchObject({ status: "ready", pdc: { status: "final" }, sufficiency: { digest: "b".repeat(64) } });
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("모양이 틀린 블록은 버리고 PDC 는 그대로 보여 준다", () => {
    const { result } = renderHook(() => usePdc("owner"));
    act(() => mocks.callback?.({ exists: () => true, data: () => ({ ...v6Fixture(), sufficiency: { schemaVersion: 9 } }) }));
    expect(result.current).toMatchObject({ status: "ready", pdc: { status: "final" } });
    expect("sufficiency" in result.current).toBe(false);
    expect(mocks.log).toHaveBeenCalledWith("usePdc.invalidSufficiency", expect.any(Error), { uid: "owner" });
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


it.each(["owner-b", undefined])("숨은 계정 변경(%s)은 이전 PDC와 늦은 콜백을 무효화한다", uid => {
  const hook = renderHook(({ uid, active }) => usePdc(uid, active),
    { initialProps: { uid: "owner" as string | undefined, active: true } });
  const stale = mocks.callback;
  act(() => stale?.({ exists: () => true, data: () => structuredClone(parity.persistedPdc) }));
  expect(hook.result.current.status).toBe("ready");
  hook.rerender({ uid, active: false });
  act(() => stale?.({ exists: () => true, data: () => structuredClone(parity.persistedPdc) }));
  expect(hook.result.current.pdc).toBeNull();
});

it("fences state and late callbacks when the same uid changes Firebase identity, including A→B→A", () => {
  const projectA = {} as FirebaseServices["firestore"];
  const projectB = {} as FirebaseServices["firestore"];
  let selectedProject = projectA;
  const wrapper = ({ children }: { children: ReactNode }) => <FirebaseServicesProvider services={{ auth: {} as FirebaseServices["auth"], firestore: selectedProject, functions: {} as FirebaseServices["functions"], ensureAppCheckReady: vi.fn() }}>{children}</FirebaseServicesProvider>;
  const hook = renderHook(({ active }) => usePdc("owner", active), { wrapper, initialProps: { active: true } });
  const staleA = mocks.callback;
  act(() => staleA?.({ exists: () => true, data: v6Fixture }));
  expect(hook.result.current.status).toBe("ready");
  selectedProject = projectB;
  hook.rerender({ active: true });
  const staleB = mocks.callback;
  expect(hook.result.current.pdc).toBeNull();
  act(() => staleA?.({ exists: () => true, data: v6Fixture }));
  expect(hook.result.current.pdc).toBeNull();
  selectedProject = projectA;
  hook.rerender({ active: true });
  expect(hook.result.current.pdc).toBeNull();
  act(() => staleB?.({ exists: () => true, data: v6Fixture }));
  expect(hook.result.current.pdc).toBeNull();
  act(() => mocks.callback?.({ exists: () => true, data: v6Fixture }));
  expect(hook.result.current.status).toBe("ready");
  hook.rerender({ active: false });
  const stopped = mocks.callback;
  hook.rerender({ active: true });
  expect(hook.result.current.pdc).toBeNull();
  act(() => stopped?.({ exists: () => true, data: v6Fixture }));
  expect(hook.result.current.pdc).toBeNull();
});
