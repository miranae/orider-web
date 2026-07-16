import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAll: vi.fn(),
  put: vi.fn(),
  updateDoc: vi.fn(),
  batchUpdate: vi.fn(),
  batchSet: vi.fn(),
  batchCommit: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "history-collection"),
  doc: vi.fn((value) => value === "history-collection" ? "history-ref" : "user-ref"),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: mocks.updateDoc,
  writeBatch: vi.fn(() => ({
    update: mocks.batchUpdate,
    set: mocks.batchSet,
    commit: mocks.batchCommit,
  })),
}));
vi.mock("./firebase", () => ({ firestore: {} }));
vi.mock("./deviceSettingsClient", () => ({
  fetchAllDeviceSettings: mocks.fetchAll,
  putDeviceSettings: mocks.put,
}));

import { persistRiderMetrics } from "./syncRiderMetrics";

describe("persistRiderMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batchCommit.mockResolvedValue(undefined);
  });

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

  it("atomically persists a detected FTP change with its audit history", async () => {
    mocks.fetchAll.mockResolvedValue([]);

    await persistRiderMetrics(
      "uid",
      { ftp: 265 },
      { ftpHistorySource: "detected", changedAt: 1234 },
    );

    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.batchUpdate).toHaveBeenCalledWith("user-ref", { ftp: 265 });
    expect(mocks.batchSet).toHaveBeenCalledWith("history-ref", {
      value: 265,
      source: "detected",
      changedAt: 1234,
    });
    expect(mocks.batchCommit).toHaveBeenCalledOnce();
  });

  it("rejects an atomic save failure and retries the same audit intent", async () => {
    mocks.fetchAll.mockResolvedValue([]);
    mocks.batchCommit
      .mockRejectedValueOnce(new Error("batch unavailable"))
      .mockResolvedValueOnce(undefined);

    const save = () => persistRiderMetrics(
      "uid",
      { ftp: 265 },
      { ftpHistorySource: "test", changedAt: 1234 },
    );

    await expect(save()).rejects.toThrow("batch unavailable");
    await expect(save()).resolves.toMatchObject({ failures: [] });
    expect(mocks.batchSet).toHaveBeenNthCalledWith(1, "history-ref", {
      value: 265,
      source: "test",
      changedAt: 1234,
    });
    expect(mocks.batchSet).toHaveBeenNthCalledWith(2, "history-ref", {
      value: 265,
      source: "test",
      changedAt: 1234,
    });
    expect(mocks.batchCommit).toHaveBeenCalledTimes(2);
  });
});
