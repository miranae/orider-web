import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityOverviewResponse } from "@shared/types/activity-overview";
import { useActivityOverview } from "./useActivityOverview";

const mocks = vi.hoisted(() => ({ uid: "u1", allowed: true, load: vi.fn(), services: {} }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/activityOverview", () => ({ loadActivityOverview: mocks.load }));
vi.mock("./useCanonicalRollout", () => ({ useCanonicalRollout: () => ({ gateEnabled: true, loading: false }), canonicalRolloutAllows: () => mocks.allowed }));
const response = (activityId: string): ActivityOverviewResponse => ({ status: "available", activityId, version: "activity-overview-v1", inputDigest: "d", presentation: { coachSentence: activityId, session: { discipline: "bike" } } });

describe("useActivityOverview ownership and stale response safety", () => {
  beforeEach(() => { mocks.uid = "u1"; mocks.allowed = true; mocks.load.mockReset(); mocks.load.mockResolvedValue(response("a")); });
  it("does not request nonowner or disabled evidence", () => {
    const { rerender } = renderHook(({ owner }) => useActivityOverview("a", owner, "r1"), { initialProps: { owner: false } });
    expect(mocks.load).not.toHaveBeenCalled();
    mocks.allowed = false;
    rerender({ owner: true });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("suppresses late activity results and old-account data synchronously", async () => {
    let resolveA!: (value: ActivityOverviewResponse) => void;
    mocks.load.mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; })).mockResolvedValue(response("b"));
    const { result, rerender } = renderHook(({ id }) => useActivityOverview(id, true, "r1"), { initialProps: { id: "a" } });
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.response?.activityId).toBe("b"));
    await act(async () => resolveA(response("a")));
    expect(result.current.response?.activityId).toBe("b");
    mocks.uid = "u2";
    mocks.load.mockReturnValue(new Promise(() => {}));
    rerender({ id: "b" });
    expect(result.current.response).toBeNull();
  });
  it("retries optional errors without blocking the caller", async () => {
    mocks.load.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(response("a"));
    const { result } = renderHook(() => useActivityOverview("a", true, "r1"));
    await waitFor(() => expect(result.current.error).toBe(true));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.response?.status).toBe("available"));
  });
  it("immediately removes old evidence when privacy or provenance identity changes", async () => {
    const { result, rerender } = renderHook(({ revision }) => useActivityOverview("a", true, revision), { initialProps: { revision: "visible:measured:r1" } });
    await waitFor(() => expect(result.current.response?.status).toBe("available"));
    mocks.load.mockReturnValue(new Promise(() => {}));
    rerender({ revision: "hidden:virtual:r1" });
    expect(result.current.response).toBeNull();
    expect(mocks.load).toHaveBeenLastCalledWith(mocks.services, "u1", "a", "ko", "hidden:virtual:r1", false);
  });
});
