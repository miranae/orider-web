import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAll: vi.fn(),
  put: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(() => "user-ref"),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: mocks.updateDoc,
}));
vi.mock("./firebase", () => ({ firestore: {} }));
vi.mock("./deviceSettingsClient", () => ({
  fetchAllDeviceSettings: mocks.fetchAll,
  putDeviceSettings: mocks.put,
}));

import { persistRiderMetrics } from "./syncRiderMetrics";

describe("persistRiderMetrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not mutate anything until explicitly called, then falls back to the profile root", async () => {
    mocks.fetchAll.mockResolvedValue([]);
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    await persistRiderMetrics("uid", { ftp: 153 });
    expect(mocks.updateDoc).toHaveBeenCalledWith("user-ref", { ftp: 153 });
  });

  it("updates connected devices and persists the canonical profile root immediately", async () => {
    mocks.fetchAll.mockResolvedValue([{ deviceId: "g1", deviceName: "G1", settings: {}, version: 3 }]);
    mocks.put.mockResolvedValue(undefined);
    const result = await persistRiderMetrics("uid", { ftp: 153 });
    expect(mocks.put).toHaveBeenCalledWith("uid", "g1", "G1", { ftpWatts: 153 }, 3);
    expect(result.updatedDevices).toBe(1);
    expect(mocks.updateDoc).toHaveBeenCalledWith("user-ref", { ftp: 153 });
  });

  it("keeps the canonical root current when only some devices update", async () => {
    mocks.fetchAll.mockResolvedValue([
      { deviceId: "g1", deviceName: "G1", settings: {}, version: 3 },
      { deviceId: "g2", deviceName: "G2", settings: {}, version: 4 },
    ]);
    mocks.put.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("offline"));

    const result = await persistRiderMetrics("uid", { ftp: 153 });

    expect(result.updatedDevices).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(mocks.updateDoc).toHaveBeenCalledWith("user-ref", { ftp: 153 });
  });

  it("keeps the profile canonical when device discovery fails", async () => {
    mocks.fetchAll.mockRejectedValue(new Error("offline"));
    const result = await persistRiderMetrics("uid", { ftp: 153 });
    expect(mocks.updateDoc).toHaveBeenCalledWith("user-ref", { ftp: 153 });
    expect(result.failures[0]?.error).toBe("offline");
  });
});
