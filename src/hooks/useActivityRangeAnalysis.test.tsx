import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRangeAnalysisResponse } from "@shared/types/activity-range-analysis";
import { useActivityRangeAnalysis, type ActivityRangeAnalysisOptions } from "./useActivityRangeAnalysis";
const mocks = vi.hoisted(() => ({ uid: "owner" as string | null, anonymous: false, services: {}, load: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.uid ? { uid: mocks.uid, isAnonymous: mocks.anonymous } : null }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/activityRangeAnalysis", async importOriginal => ({ ...await importOriginal<typeof import("../services/activityRangeAnalysis")>(), loadActivityRangeAnalysis: mocks.load }));
const revision = "a".repeat(64);
const options: ActivityRangeAnalysisOptions = { activityId: "a", ownerUid: "owner", selection: { startOffsetSec: 10, endOffsetSec: 20, requestId: "selection-1" },
  inputIdentity: "r1", expectedInputRevision: revision, callableEnabled: true };
const response = (id = "a", state: ActivityRangeAnalysisResponse["state"] = "available") => ({ state, activityId: id,
  selection: { startOffsetSec: 10, endOffsetSec: 20 }, inputRevision: revision, computedAt: 1, algorithmVersion: "activity-range-v1",
  sourceLayer: "raw_parts", inputCoverage: "complete", reason: null, metrics: state === "available" ? { elapsedSec: 10, averagePowerW: 200 } : null }) as ActivityRangeAnalysisResponse;
beforeEach(() => { mocks.uid = "owner"; mocks.anonymous = false; mocks.services = {}; mocks.load.mockReset().mockResolvedValue(response()); });
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
    if (field === "services") mocks.services = {};
    rerender(changed);
    // 같은 ID 화면으로 돌아와도 옛 요청을 재사용하지 않는다.
    mocks.uid = "owner";
    if (field === "services") mocks.services = {};
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
    if (field === "services") mocks.services = {};
    rerender(changed);
    expect(result.current.metrics).toBeNull();
    mocks.uid = "owner";
    if (field === "services") mocks.services = {};
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
