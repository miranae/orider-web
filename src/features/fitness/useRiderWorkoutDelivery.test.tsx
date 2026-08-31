import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRiderWorkoutDelivery } from "./useRiderWorkoutDelivery";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), classify: vi.fn(() => "uncertain_network"),
  deviceSubscriptions: [] as Array<(devices: unknown[]) => void>,
  pointerSubscriptions: [] as Array<(pointer: unknown) => void>,
  deliverySubscriptions: [] as Array<(delivery: unknown) => void>,
}));
vi.mock("../../services/riderWorkoutDeliveryClient", () => ({
  createRiderWorkoutDelivery: mocks.create, classifyRiderWorkoutDeliveryError: mocks.classify,
  subscribeRiderWorkoutDevices: vi.fn((_uid, next) => { mocks.deviceSubscriptions.push(next); return vi.fn(); }),
  subscribeRiderWorkoutDeviceState: vi.fn((_uid, _device, next) => { mocks.pointerSubscriptions.push(next); return vi.fn(); }),
  subscribeRiderWorkoutDelivery: vi.fn((_uid, _deliveryId, next) => { mocks.deliverySubscriptions.push(next); return vi.fn(); }),
}));

const device = (deviceId: string) => ({ deviceId, deviceName: deviceId, status: "active" as const,
  lastSeenAtMillis: Date.now(), supportedCapabilities: { workoutBundleVersions: [1] } });
const pointerBundle = { schemaVersion: 1 as const, deliveryId: "delivery-1", targetDeviceId: "recent", generation: 1, workoutType: "recovery" as const,
  targetTss: 20 as const, ftpW: 250, ftpRevision: null, zoneSchemeVersion: "coggan-7-v1" as const,
  templateRevision: "rider-workout-template-v1" as const, contentRevision: "b".repeat(64), issuedAt: 100,
  expiresAt: Date.now() + 60_000, steps: [{ label: "Z1" as const, durationSec: 1800, targetPowerMinW: 125, targetPowerMaxW: 150 }] };
const pointer = { schemaVersion: 1 as const, deviceId: "recent", latestDeliveryId: "delivery-1", latestGeneration: 1,
  bundle: pointerBundle, lastCreatedAt: 100, updatedAt: 100 };
const delivery = (state: "pending" | "received" | "execution_started" | "completed", expiresAt = Date.now() + 60_000) => ({
  schemaVersion: 1 as const, deliveryId: "delivery-1", requestId: "request-0001", requestHash: "a".repeat(64),
  targetDeviceId: "recent", generation: 1, state, failureCode: null, createdAt: 100, updatedAt: 200,
  acknowledgedAt: state === "pending" ? null : 200, expireAt: { seconds: 999, nanoseconds: 0 },
  bundle: { schemaVersion: 1 as const, deliveryId: "delivery-1", targetDeviceId: "recent", generation: 1, workoutType: "recovery" as const,
    targetTss: 20 as const, ftpW: 250, ftpRevision: null, zoneSchemeVersion: "coggan-7-v1" as const,
    templateRevision: "rider-workout-template-v1" as const, contentRevision: "b".repeat(64), issuedAt: 100,
    expiresAt, steps: [{ label: "Z1" as const, durationSec: 1800, targetPowerMinW: 125, targetPowerMaxW: 150 }] },
});

async function selectDevice(result: { current: ReturnType<typeof useRiderWorkoutDelivery> }) {
  act(() => mocks.deviceSubscriptions[0]?.([device("recent")]));
  await waitFor(() => expect(mocks.pointerSubscriptions).toHaveLength(1));
  act(() => mocks.pointerSubscriptions[0]?.(null));
  await waitFor(() => expect(result.current.restoreLoading).toBe(false));
}

describe("useRiderWorkoutDelivery", () => {
  beforeEach(() => {
    mocks.create.mockReset(); mocks.classify.mockReturnValue("uncertain_network");
    mocks.deviceSubscriptions.length = 0; mocks.pointerSubscriptions.length = 0; mocks.deliverySubscriptions.length = 0;
  });

  it("restores the latest pointer and blocks replacement while G1 is executing it", async () => {
    const { result } = renderHook(() => useRiderWorkoutDelivery("uid-1", "recovery"));
    act(() => mocks.deviceSubscriptions[0]?.([device("recent")]));
    await waitFor(() => expect(mocks.pointerSubscriptions).toHaveLength(1));
    act(() => mocks.pointerSubscriptions[0]?.(pointer));
    await waitFor(() => expect(mocks.deliverySubscriptions).toHaveLength(1));
    act(() => mocks.deliverySubscriptions[0]?.(delivery("execution_started")));
    expect(result.current.deliveryState).toBe("execution_started");
    expect(result.current.canCreate).toBe(false);
    await act(() => result.current.submit());
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("allows a new request after completed without regressing on a stale snapshot", async () => {
    const { result } = renderHook(() => useRiderWorkoutDelivery("uid-1", "recovery"));
    act(() => mocks.deviceSubscriptions[0]?.([device("recent")]));
    await waitFor(() => expect(mocks.pointerSubscriptions).toHaveLength(1));
    act(() => mocks.pointerSubscriptions[0]?.(pointer));
    await waitFor(() => expect(mocks.deliverySubscriptions).toHaveLength(1));
    act(() => mocks.deliverySubscriptions[0]?.(delivery("completed")));
    expect(result.current.canCreate).toBe(true);
    act(() => mocks.deliverySubscriptions[0]?.(delivery("pending", Date.now() - 1)));
    expect(result.current.deliveryState).toBe("completed");
  });

  it("ignores a stale pointer whose delivery document no longer exists", async () => {
    mocks.create.mockResolvedValue({ ok: true, deliveryId: "delivery-2", generation: 2, state: "pending", idempotent: false });
    const { result } = renderHook(() => useRiderWorkoutDelivery("uid-1", "recovery"));
    act(() => mocks.deviceSubscriptions[0]?.([device("recent")]));
    await waitFor(() => expect(mocks.pointerSubscriptions).toHaveLength(1));
    act(() => mocks.pointerSubscriptions[0]?.(pointer));
    await waitFor(() => expect(mocks.deliverySubscriptions).toHaveLength(1));
    act(() => mocks.deliverySubscriptions[0]?.(null));
    expect(result.current.restoreLoading).toBe(false);
    expect(result.current.canCreate).toBe(true);
    await act(() => result.current.submit());
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("uses a new request id when the same completed workout is sent again", async () => {
    mocks.create
      .mockResolvedValueOnce({ ok: true, deliveryId: "delivery-1", generation: 1, state: "pending", idempotent: false })
      .mockResolvedValueOnce({ ok: true, deliveryId: "delivery-2", generation: 2, state: "pending", idempotent: false });
    const { result } = renderHook(() => useRiderWorkoutDelivery("uid-1", "recovery"));
    await selectDevice(result);
    await act(() => result.current.submit());
    act(() => mocks.pointerSubscriptions[0]?.(pointer));
    await waitFor(() => expect(mocks.deliverySubscriptions).toHaveLength(1));
    act(() => mocks.deliverySubscriptions[0]?.(delivery("completed")));
    await waitFor(() => expect(result.current.canCreate).toBe(true));
    await act(() => result.current.submit());
    expect(mocks.create.mock.calls[1][0].requestId).not.toBe(mocks.create.mock.calls[0][0].requestId);
  });

  it("reuses a request id only for an uncertain create result", async () => {
    mocks.create.mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "functions/unavailable" }))
      .mockResolvedValueOnce({ ok: true, deliveryId: "delivery-2", generation: 1, state: "pending", idempotent: true });
    const { result } = renderHook(() => useRiderWorkoutDelivery("uid-1", "recovery"));
    await selectDevice(result);
    await act(() => result.current.submit());
    expect(result.current.canSafelyReplay).toBe(true);
    await act(() => result.current.submit());
    expect(mocks.create.mock.calls[1][0].requestId).toBe(mocks.create.mock.calls[0][0].requestId);
  });

  it("keeps an authoritative delivery snapshot that arrives before create resolves", async () => {
    let resolveCreate: ((value: unknown) => void) | undefined;
    mocks.create.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const { result } = renderHook(() => useRiderWorkoutDelivery("uid-1", "recovery"));
    await selectDevice(result);

    act(() => { void result.current.submit(); });
    act(() => mocks.pointerSubscriptions[0]?.(pointer));
    await waitFor(() => expect(mocks.deliverySubscriptions).toHaveLength(1));
    act(() => mocks.deliverySubscriptions[0]?.(delivery("received")));
    expect(result.current.deliveryState).toBe("received");

    await act(async () => resolveCreate?.({
      ok: true, deliveryId: "delivery-1", generation: 1, state: "pending", idempotent: false,
    }));
    expect(result.current.deliveryState).toBe("received");
    expect(result.current.delivery?.deliveryId).toBe("delivery-1");
  });

  it("converges an uncertain replay to a newer delivery superseded by another tab", async () => {
    mocks.create
      .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "functions/unavailable" }))
      .mockResolvedValueOnce({ ok: true, deliveryId: "delivery-1", generation: 1, state: "pending", idempotent: true });
    const newerPointer = {
      ...pointer,
      latestDeliveryId: "delivery-2",
      latestGeneration: 2,
      bundle: { ...pointer.bundle, deliveryId: "delivery-2", generation: 2 },
    };
    const newerDelivery = {
      ...delivery("received"),
      deliveryId: "delivery-2",
      generation: 2,
      bundle: { ...delivery("received").bundle, deliveryId: "delivery-2", generation: 2 },
    };
    const { result } = renderHook(() => useRiderWorkoutDelivery("uid-1", "recovery"));
    await selectDevice(result);

    await act(() => result.current.submit());
    expect(result.current.canSafelyReplay).toBe(true);
    await act(() => result.current.submit());
    expect(result.current.deliveryState).toBe("pending");
    expect(mocks.create.mock.calls[1][0].requestId).toBe(mocks.create.mock.calls[0][0].requestId);

    act(() => mocks.pointerSubscriptions[0]?.(pointer));
    await waitFor(() => expect(mocks.deliverySubscriptions).toHaveLength(1));
    act(() => mocks.deliverySubscriptions[0]?.(delivery("received")));
    expect(result.current.delivery?.deliveryId).toBe("delivery-1");

    act(() => mocks.pointerSubscriptions[0]?.(newerPointer));
    await waitFor(() => expect(mocks.deliverySubscriptions).toHaveLength(2));
    act(() => mocks.deliverySubscriptions[1]?.(newerDelivery));
    expect(result.current.delivery?.deliveryId).toBe("delivery-2");
    expect(result.current.deliveryState).toBe("received");
    act(() => mocks.deliverySubscriptions[0]?.(delivery("completed")));
    expect(result.current.delivery?.deliveryId).toBe("delivery-2");
    expect(result.current.deliveryState).toBe("received");
  });

  it("drops an in-flight create response after the workout type changes", async () => {
    let resolveCreate: ((value: unknown) => void) | undefined;
    mocks.create.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const { result, rerender } = renderHook(({ type }) => useRiderWorkoutDelivery("uid-1", type), {
      initialProps: { type: "recovery" as "recovery" | "endurance" },
    });
    act(() => mocks.deviceSubscriptions[0]?.([device("recent")]));
    await waitFor(() => expect(mocks.pointerSubscriptions).toHaveLength(1));
    act(() => mocks.pointerSubscriptions[0]?.(null));
    await waitFor(() => expect(result.current.canCreate).toBe(true));
    act(() => { void result.current.submit(); });
    rerender({ type: "endurance" });
    await act(async () => resolveCreate?.({ ok: true, deliveryId: "stale", generation: 1, state: "pending", idempotent: false }));
    expect(result.current.deliveryState).toBeNull();
  });

  it("clears a deterministic failure before starting a new request", async () => {
    mocks.classify.mockReturnValue("cooldown");
    mocks.create.mockRejectedValueOnce(Object.assign(new Error("wait"), { code: "functions/resource-exhausted" }))
      .mockResolvedValueOnce({ ok: true, deliveryId: "delivery-2", generation: 1, state: "pending", idempotent: false });
    const { result } = renderHook(() => useRiderWorkoutDelivery("uid-1", "recovery"));
    await selectDevice(result);
    await act(() => result.current.submit());
    const firstId = mocks.create.mock.calls[0][0].requestId;
    expect(result.current.canSafelyReplay).toBe(false);
    act(() => result.current.prepareNewRequest());
    expect(result.current.submitError).toBeNull();
    await act(() => result.current.submit());
    expect(mocks.create.mock.calls[1][0].requestId).not.toBe(firstId);
  });
});
