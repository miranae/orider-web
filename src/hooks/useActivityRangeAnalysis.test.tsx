import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRangeAnalysisResponse } from "@shared/types/activity-range-analysis";
import { useActivityRangeAnalysis, type ActivityRangeAnalysisOptions } from "./useActivityRangeAnalysis";
const mocks = vi.hoisted(() => ({ uid: "owner" as string | null, anonymous: false, services: { auth: { currentUser: { uid: "owner", isAnonymous: false } } }, authListener: null as null | ((user: { uid: string; isAnonymous: boolean } | null) => void), load: vi.fn() }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn((_auth, callback) => { mocks.authListener = callback; return () => { mocks.authListener = null; }; }) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.uid ? { uid: mocks.uid, isAnonymous: mocks.anonymous } : null }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/activityRangeAnalysis", async importOriginal => ({ ...await importOriginal<typeof import("../services/activityRangeAnalysis")>(), loadActivityRangeAnalysis: mocks.load }));
const revision = "a".repeat(64);
const options: ActivityRangeAnalysisOptions = { activityId: "a", ownerUid: "owner", selection: { startOffsetSec: 10, endOffsetSec: 20, requestId: "selection-1" },
  inputIdentity: "r1", expectedInputRevision: revision, callableEnabled: true };
const response = (id = "a", state: ActivityRangeAnalysisResponse["state"] = "available") => ({ state, activityId: id,
  selection: { startOffsetSec: 10, endOffsetSec: 20 }, inputRevision: revision, computedAt: 1, algorithmVersion: "activity-range-v1",
  sourceLayer: "raw_parts", inputCoverage: "complete", reason: null, metrics: state === "available" ? { elapsedSec: 10, averagePowerW: 200 } : null }) as ActivityRangeAnalysisResponse;
beforeEach(() => { mocks.uid = "owner"; mocks.anonymous = false; mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } }; mocks.load.mockReset().mockResolvedValue(response()); });
describe("owner lazy range analysis", () => {
  it("makes no call before user selection, for another/anonymous owner, or before deployment enablement", () => {
    const { result, rerender } = renderHook(props => useActivityRangeAnalysis(props), { initialProps: { ...options, selection: null } });
    expect(result.current.state).toBe("idle"); expect(mocks.load).not.toHaveBeenCalled();
    rerender({ ...options, callableEnabled: false });
    expect(result.current.state).toBe("unavailable"); expect(result.current.reason).toBe("api_unavailable");
    mocks.uid = "other"; rerender(options); expect(result.current.state).toBe("idle");
    mocks.uid = "owner"; mocks.anonymous = true; rerender(options); expect(result.current.state).toBe("idle");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("sends elapsed selection and opaque server revision only, without local identity or request ID", async () => {
    const { result } = renderHook(() => useActivityRangeAnalysis(options));
    await waitFor(() => expect(result.current.state).toBe("available"));
    expect(mocks.load).toHaveBeenCalledWith(mocks.services, "owner", { activityId: "a", startOffsetSec: 10, endOffsetSec: 20, expectedInputRevision: revision });
  });
  it("requests optional power input in the same single selected-range call and ignores client duration changes", async () => {
    const { result, rerender } = renderHook(props => useActivityRangeAnalysis(props), { initialProps: { ...options, includePowerWindowInput: true } });
    await waitFor(() => expect(result.current.state).toBe("available"));
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(mocks.load).toHaveBeenCalledWith(mocks.services, "owner", { activityId: "a", startOffsetSec: 10, endOffsetSec: 20, expectedInputRevision: revision, includePowerWindowInput: true });
    rerender({ ...options, includePowerWindowInput: true });
    expect(mocks.load).toHaveBeenCalledOnce();
  });
  it.each(["pending", "unavailable", "changed_input"] as const)("exposes %s and clears the old metrics when the new selection is unresolved", async state => {
    const { result, rerender } = renderHook(props => useActivityRangeAnalysis(props), { initialProps: options });
    await waitFor(() => expect(result.current.metrics?.averagePowerW).toBe(200));
    mocks.load.mockResolvedValueOnce(response("a", state));
    rerender({ ...options, selection: { ...options.selection!, requestId: "selection-2" } });
    expect(result.current.metrics).toBeNull();
    await waitFor(() => expect(result.current.state).toBe(state));
    expect(result.current.metrics).toBeNull();
  });
  it.each(["activity", "owner", "selection", "revision", "services"])("ignores old responses after %s identity changes, including ABA", async field => {
    let resolveOld!: (value: ActivityRangeAnalysisResponse) => void;
    mocks.load.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(response());
    const { result, rerender } = renderHook(props => useActivityRangeAnalysis(props), { initialProps: options });
    let changed = options;
    if (field === "activity") changed = { ...options, activityId: "b" };
    if (field === "selection") changed = { ...options, selection: { ...options.selection!, requestId: "selection-2" } };
    if (field === "revision") changed = { ...options, inputIdentity: "r2" };
    if (field === "owner") mocks.uid = "other";
    if (field === "services") mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } };
    rerender(changed);
    // 같은 ID 화면으로 돌아와도 옛 요청을 재사용하지 않는다.
    mocks.uid = "owner";
    if (field === "services") mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } };
    rerender(options);
    await waitFor(() => expect(result.current.metrics?.averagePowerW).toBe(200));
    await act(async () => resolveOld({ ...response(), metrics: { ...response().metrics!, averagePowerW: 999 } }));
    expect(result.current.metrics?.averagePowerW).toBe(200);
  });
  it.each(["activity", "owner", "selection", "revision", "services"])("does not resurrect completed A after %s changes A→B→A", async field => {
    const { result, rerender } = renderHook(props => useActivityRangeAnalysis(props), { initialProps: options });
    await waitFor(() => expect(result.current.metrics?.averagePowerW).toBe(200));
    mocks.load.mockImplementation(() => new Promise(() => {}));
    let changed = options;
    if (field === "activity") changed = { ...options, activityId: "b" };
    if (field === "selection") changed = { ...options, selection: { ...options.selection!, requestId: "selection-2" } };
    if (field === "revision") changed = { ...options, inputIdentity: "r2" };
    if (field === "owner") mocks.uid = "other";
    if (field === "services") mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } };
    rerender(changed);
    expect(result.current.metrics).toBeNull();
    mocks.uid = "owner";
    if (field === "services") mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } };
    rerender(options);
    expect(result.current.metrics).toBeNull();
    expect(result.current.state).toBe("loading");
  });
  it("cancels response presentation on clear and explicitly retries undeployed/error states", async () => {
    mocks.load.mockRejectedValueOnce({ code: "functions/not-found" });
    const { result, rerender } = renderHook(props => useActivityRangeAnalysis(props), { initialProps: options });
    await waitFor(() => expect(result.current.reason).toBe("api_unavailable"));
    expect(result.current.metrics).toBeNull();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toBe("available"));
    rerender({ ...options, selection: null });
    expect(result.current.state).toBe("idle"); expect(result.current.response).toBeNull();
  });
});

describe("stored elevation request privacy", () => {
  it("initial selection0 then same request1 with elevation and power; rerenders create0 more calls", async () => {
    const { result, rerender } = renderHook(props => useActivityRangeAnalysis(props), { initialProps: { ...options, selection: null, includeElevation: true, includePowerWindowInput: true } });
    expect(mocks.load).not.toHaveBeenCalled();
    rerender({ ...options, includeElevation: true, includePowerWindowInput: true });
    await waitFor(() => expect(result.current.state).toBe("available"));
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(mocks.load.mock.lastCall?.[2]).toMatchObject({ includeElevation: true, includePowerWindowInput: true });
    rerender({ ...options, includeElevation: true, includePowerWindowInput: true });
    expect(mocks.load).toHaveBeenCalledOnce();
  });
  it("flag changes immediately hide prior elevation, and late ABA output stays discarded", async () => {
    let settle!: (value: ActivityRangeAnalysisResponse) => void;
    mocks.load.mockReturnValueOnce(new Promise(resolve => { settle = resolve; })).mockResolvedValue(response());
    const { result, rerender } = renderHook(props => useActivityRangeAnalysis(props), { initialProps: { ...options, includeElevation: true } });
    rerender({ ...options, includeElevation: false });
    rerender({ ...options, includeElevation: true });
    await waitFor(() => expect(result.current.state).toBe("available"));
    await act(async () => settle({ ...response(), elevation: {} } as ActivityRangeAnalysisResponse));
    expect(result.current.response?.elevation).toBeUndefined();
  });
  it("SDK-only auth change clears completed evidence and SDK ABA rejects an in-flight response", async () => {
    const { result, rerender } = renderHook(() => useActivityRangeAnalysis({ ...options, includeElevation: true }));
    await waitFor(() => expect(result.current.state).toBe("available"));
    mocks.services.auth.currentUser.uid = "other";
    act(() => mocks.authListener?.(mocks.services.auth.currentUser));
    expect(result.current.response).toBeNull(); expect(result.current.state).toBe("idle");
    mocks.services.auth.currentUser.uid = "owner";
    act(() => mocks.authListener?.(mocks.services.auth.currentUser));
    rerender();
    expect(result.current.response).toBeNull();
    let settle!: (value: ActivityRangeAnalysisResponse) => void;
    mocks.load.mockReturnValueOnce(new Promise(resolve => { settle = resolve; }));
    act(() => result.current.retry());
    mocks.services.auth.currentUser.uid = "other"; act(() => mocks.authListener?.(mocks.services.auth.currentUser));
    mocks.services.auth.currentUser.uid = "owner"; act(() => mocks.authListener?.(mocks.services.auth.currentUser));
    await act(async () => settle(response()));
    expect(result.current.response).toBeNull();
  });
  it("SDK nonowner and anonymous current users make zero requests", () => {
    mocks.services.auth.currentUser.uid = "other";
    const { result, rerender } = renderHook(() => useActivityRangeAnalysis({ ...options, includeElevation: true }));
    expect(result.current.state).toBe("idle"); expect(mocks.load).not.toHaveBeenCalled();
    mocks.services.auth.currentUser = { uid: "owner", isAnonymous: true }; rerender();
    expect(result.current.state).toBe("idle"); expect(mocks.load).not.toHaveBeenCalled();
  });
  it("unmount cancels late evidence and unsubscribes the SDK account listener", async () => {
    let settle!: (value: ActivityRangeAnalysisResponse) => void;
    mocks.load.mockReturnValueOnce(new Promise(resolve => { settle = resolve; }));
    const { unmount } = renderHook(() => useActivityRangeAnalysis({ ...options, includeElevation: true }));
    unmount(); expect(mocks.authListener).toBeNull();
    await act(async () => settle(response())); expect(mocks.load).toHaveBeenCalledOnce();
  });
});
