import { describe, expect, it } from "vitest";
import { canAdvanceRiderWorkoutDeliveryState, canCreateAfterDelivery, createRiderWorkoutDeliveryResponseSchema, deliveryPresentationState, parseRiderWorkoutDelivery, parseRiderWorkoutDeviceRegistration, parseRiderWorkoutDeviceState } from "./riderWorkoutDeliveryContract";

const bundle = {
  schemaVersion: 1, deliveryId: "delivery-1", targetDeviceId: "device-1", generation: 2, workoutType: "recovery", targetTss: 20,
  ftpW: 250, ftpRevision: "ftp-r2", zoneSchemeVersion: "coggan-7-v1",
  templateRevision: "rider-workout-template-v1", contentRevision: "a".repeat(64),
  steps: [{ label: "Z1", durationSec: 1800, targetPowerMinW: 125, targetPowerMaxW: 150 }],
  issuedAt: 100, expiresAt: 10_000,
};

describe("rider workout delivery contract", () => {
  it("accepts only active registrations advertising workout bundle v1", () => {
    expect(parseRiderWorkoutDeviceRegistration("g1", {
      status: "active", supportedCapabilities: { workoutBundleVersions: [1] }, lastSeenAt: 123,
    })).toMatchObject({ deviceId: "g1", lastSeenAtMillis: 123 });
    expect(parseRiderWorkoutDeviceRegistration("old", {
      status: "active", supportedCapabilities: { workoutBundleVersions: [] },
    })).toBeNull();
    expect(parseRiderWorkoutDeviceRegistration("retired", {
      status: "retired", supportedCapabilities: { workoutBundleVersions: [1] },
    })).toBeNull();
  });

  it("rejects a delivery whose embedded bundle identity differs", () => {
    const delivery = { schemaVersion: 1, deliveryId: "delivery-1", requestId: "request-0001", requestHash: "b".repeat(64),
      targetDeviceId: "device-1", generation: 2, bundle, state: "received", failureCode: null,
      createdAt: 100, updatedAt: 200, acknowledgedAt: 200, expireAt: { seconds: 999, nanoseconds: 0 } };
    expect(parseRiderWorkoutDelivery(delivery)?.bundle.steps[0]).toMatchObject({ targetPowerMinW: 125 });
    expect(parseRiderWorkoutDelivery({ ...delivery, bundle: { ...bundle, deliveryId: "stale" } })).toBeNull();
  });

  it("requires the exact callable response envelope", () => {
    expect(createRiderWorkoutDeliveryResponseSchema.parse({ ok: true, deliveryId: "d", generation: 1,
      state: "pending", idempotent: false })).toMatchObject({ state: "pending" });
    expect(createRiderWorkoutDeliveryResponseSchema.parse({ ok: true, deliveryId: "d", generation: 1,
      state: "received", idempotent: true })).toMatchObject({ state: "received", idempotent: true });
  });

  it("does not regress acknowledged or terminal states on stale snapshots", () => {
    expect(canAdvanceRiderWorkoutDeliveryState("received", "pending")).toBe(false);
    expect(canAdvanceRiderWorkoutDeliveryState("received", "ready_for_next_ride")).toBe(true);
    expect(canAdvanceRiderWorkoutDeliveryState("completed", "execution_started")).toBe(false);
  });

  it("derives expiry without changing the server state and allows explicit terminal replacement", () => {
    const raw = { schemaVersion: 1, deliveryId: "delivery-1", requestId: "request-0001", requestHash: "b".repeat(64),
      targetDeviceId: "device-1", generation: 2, bundle, state: "pending",
      failureCode: null, createdAt: 1, updatedAt: 2, acknowledgedAt: null, expireAt: { seconds: 999, nanoseconds: 0 } };
    const parsed = parseRiderWorkoutDelivery(raw);
    expect(parsed?.state).toBe("pending");
    expect(deliveryPresentationState(parsed, 10_001)).toBe("expired");
    expect(deliveryPresentationState(parsed ? { ...parsed, state: "execution_started" } : null, 10_001)).toBe("execution_started");
    expect(canCreateAfterDelivery("execution_started")).toBe(false);
    expect(canCreateAfterDelivery("received")).toBe(true);
    expect(canCreateAfterDelivery("completed")).toBe(true);
    expect(canCreateAfterDelivery("failed")).toBe(true);
  });

  it("enforces revision hashes and failureCode state invariants", () => {
    const base = { schemaVersion: 1, deliveryId: "delivery-1", requestId: "request-0001", requestHash: "b".repeat(64),
      targetDeviceId: "device-1", generation: 2, bundle, state: "failed", failureCode: "APPLY_FAILED",
      createdAt: 1, updatedAt: 2, acknowledgedAt: 2, expireAt: { seconds: 999, nanoseconds: 0 } };
    expect(parseRiderWorkoutDelivery(base)?.failureCode).toBe("APPLY_FAILED");
    expect(parseRiderWorkoutDelivery({ ...base, failureCode: null })).toBeNull();
    expect(parseRiderWorkoutDelivery({ ...base, state: "received" })).toBeNull();
    expect(parseRiderWorkoutDelivery({ ...base, requestHash: "short" })).toBeNull();
  });

  it("parses the backend desired-state fixture with its embedded immutable bundle", () => {
    const desired = { schemaVersion: 1, deviceId: "device-1", latestDeliveryId: "delivery-1", latestGeneration: 2,
      bundle, lastCreatedAt: 100, updatedAt: 100 };
    expect(parseRiderWorkoutDeviceState(desired)?.bundle.contentRevision).toBe("a".repeat(64));
    expect(parseRiderWorkoutDeviceState({ ...desired, latestGeneration: 3 })).toBeNull();
    expect(parseRiderWorkoutDeviceState({ ...desired, deviceId: "different" })).toBeNull();
  });
});
