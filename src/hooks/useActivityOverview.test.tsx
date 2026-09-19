import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityOverviewResponse } from "@shared/types/activity-overview";
import { useActivityOverview } from "./useActivityOverview";

const mocks = vi.hoisted(() => ({ uid: "u1" as string | null, load: vi.fn(), services: {} }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.uid == null ? null : { uid: mocks.uid } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/activityOverview", () => ({ loadActivityOverview: mocks.load }));
const response = (activityId: string): ActivityOverviewResponse => ({ status: "available", activityId, version: "activity-overview-v1", inputDigest: "d", presentation: { coachSentence: activityId, session: { discipline: "bike" } } });

describe("useActivityOverview visibility and stale response safety", () => {
  beforeEach(() => { mocks.uid = "u1"; mocks.load.mockReset(); mocks.load.mockResolvedValue(response("a")); });
  it("asks the server regardless of who is looking, signed in or not", () => {
    renderHook(() => useActivityOverview("a", true, "r1"));
    expect(mocks.load).toHaveBeenLastCalledWith(mocks.services, "u1", "a", "ko", "r1", false);
    mocks.uid = null;
    renderHook(() => useActivityOverview("a", true, "r1"));
    expect(mocks.load).toHaveBeenLastCalledWith(mocks.services, null, "a", "ko", "r1", false);
  });
  it("waits for the activity document before asking", () => {
    const { result, rerender } = renderHook(({ ready }) => useActivityOverview("a", ready, "r1"), { initialProps: { ready: false } });
    expect(result.current.enabled).toBe(false);
    expect(mocks.load).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(mocks.load).toHaveBeenCalledOnce();
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
