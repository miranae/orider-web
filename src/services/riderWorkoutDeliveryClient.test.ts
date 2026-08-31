import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ callable: vi.fn(), snapshot: null as null | ((value: unknown) => void) }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => mocks.callable) }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((...parts) => parts.join("/")),
  doc: vi.fn((...parts) => parts.join("/")),
  where: vi.fn((...parts) => parts),
  query: vi.fn((...parts) => parts),
  onSnapshot: vi.fn((_ref, next) => { mocks.snapshot = next; return vi.fn(); }),
}));
vi.mock("./firebase", () => ({ firestore: {}, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) }));

import { classifyRiderWorkoutDeliveryError, createRiderWorkoutDelivery, subscribeRiderWorkoutDevices } from "./riderWorkoutDeliveryClient";

describe("riderWorkoutDeliveryClient", () => {
  beforeEach(() => { mocks.callable.mockReset(); mocks.snapshot = null; });

  it("sends the isolated callable contract unchanged", async () => {
    mocks.callable.mockResolvedValue({ data: { ok: true, deliveryId: "delivery-1", generation: 1, state: "pending", idempotent: false } });
    const request = { expectedUid: "uid-1", requestId: "request-0001", targetDeviceId: "device-1", workoutType: "recovery" as const };
    await expect(createRiderWorkoutDelivery(request)).resolves.toMatchObject({ deliveryId: "delivery-1" });
    expect(mocks.callable).toHaveBeenCalledWith(request);
  });

  it("filters incapable snapshots, sorts by the advisory browser timestamp, and leaves activity validation to the server", () => {
    const changed = vi.fn();
    subscribeRiderWorkoutDevices("uid-1", changed, vi.fn());
    mocks.snapshot?.({ docs: [
      { id: "older-capable", data: () => ({ status: "active", supportedCapabilities: { workoutBundleVersions: [1] }, lastSeenAt: Date.now() - 100 }) },
      { id: "capable", data: () => ({ status: "active", supportedCapabilities: { workoutBundleVersions: [1] }, lastSeenAt: Date.now() }) },
      { id: "old", data: () => ({ status: "active", supportedCapabilities: { workoutBundleVersions: [] }, lastSeenAt: Date.now() }) },
      { id: "expired", data: () => ({ status: "active", supportedCapabilities: { workoutBundleVersions: [1] }, lastSeenAt: 1 }) },
    ] });
    expect(changed).toHaveBeenCalledWith([
      expect.objectContaining({ deviceId: "capable" }),
      expect.objectContaining({ deviceId: "older-capable" }),
      expect.objectContaining({ deviceId: "expired" }),
    ]);
  });

  it("permits safe replay only for explicitly uncertain callable outcomes", () => {
    expect(classifyRiderWorkoutDeliveryError({ code: "functions/unavailable" })).toBe("uncertain_network");
    expect(classifyRiderWorkoutDeliveryError({ code: "functions/deadline-exceeded" })).toBe("uncertain_network");
    expect(classifyRiderWorkoutDeliveryError({ code: "functions/not-found" })).toBe("feature_disabled");
    expect(classifyRiderWorkoutDeliveryError(Object.assign(new Error("canonical FTP required"), {
      code: "functions/failed-precondition",
    }))).toBe("ftp_required");
  });
});
