import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MaintenanceEnvelope } from "../services/maintenanceSnapshotReader";
const mocks = vi.hoisted(() => ({ enabled: false, fetch: vi.fn() }));
vi.mock("./useCanonicalRollout", () => ({ useCanonicalSurfaceEnabled: () => mocks.enabled }));
vi.mock("../services/maintenanceSnapshotReader", () => ({ fetchMaintenanceSnapshot: (...args: unknown[]) => mocks.fetch(...args) }));
import { useMaintenanceSnapshot } from "./useMaintenanceSnapshot";
import { CANONICAL_SCHEMA_VERSION } from "@shared/types/canonical";
function envelope(distance: number): MaintenanceEnvelope { return { schemaVersion: CANONICAL_SCHEMA_VERSION, status: "canonical", algorithmVersion: "maintenance@1", computedAt: 1, inputRevision: "r", inputDigest: "d", period: null, data: { odometerKm: distance, movingTimeSec: 0, components: [], dueCount: 0, pendingActivityCount: 0 }, error: null }; }
beforeEach(() => { mocks.enabled = false; mocks.fetch.mockReset(); });
describe("maintenance snapshot owner/profile binding", () => {
  it("reads nothing when rollout is off and hides any previously loaded value when it switches off", async () => {
    const view = renderHook(() => useMaintenanceSnapshot("u1", "b1"));
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.enabled = true; mocks.fetch.mockResolvedValue(envelope(100)); view.rerender();
    await waitFor(() => expect(view.result.current.envelope?.data?.odometerKm).toBe(100));
    mocks.enabled = false; view.rerender(); expect(view.result.current.envelope).toBeNull();
  });
  it("never renders another owner/profile and ignores a late previous request", async () => {
    mocks.enabled = true;
    let oldResolve!: (value: MaintenanceEnvelope) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<MaintenanceEnvelope>(resolve => { oldResolve = resolve; })).mockResolvedValueOnce(envelope(200));
    const seen: Array<number | undefined> = [];
    const view = renderHook(({ uid, bike }) => { const state = useMaintenanceSnapshot(uid, bike); seen.push(state.envelope?.data?.odometerKm); return state; }, { initialProps: { uid: "u1", bike: "b1" } });
    view.rerender({ uid: "u2", bike: "b2" });
    expect(view.result.current.envelope).toBeNull();
    await waitFor(() => expect(view.result.current.envelope?.data?.odometerKm).toBe(200));
    await act(async () => { oldResolve(envelope(100)); });
    expect(view.result.current.envelope?.data?.odometerKm).toBe(200);
    expect(seen).not.toContain(100);
    mocks.fetch.mockImplementationOnce(() => new Promise(() => {}));
    view.rerender({ uid: "u2", bike: "b3" });
    expect(view.result.current.envelope).toBeNull();
  });
});
