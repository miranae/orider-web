import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetchAll: vi.fn(), put: vi.fn(), updateDoc: vi.fn(), command: vi.fn() }));
vi.mock("firebase/firestore", () => ({ collection: vi.fn(), doc: vi.fn(() => "user-ref"), getDocs: vi.fn(), setDoc: vi.fn(), updateDoc: mocks.updateDoc }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string) => (data: unknown) => mocks.command(name, data) }));
vi.mock("./firebase", () => ({ firestore: {}, functions: {} }));
vi.mock("./deviceSettingsClient", () => ({ fetchAllDeviceSettings: mocks.fetchAll, putDeviceSettings: mocks.put }));
import { persistRiderMetrics } from "./syncRiderMetrics";
describe("persistRiderMetrics canonical provenance before device mirrors", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.command.mockResolvedValue({}); mocks.fetchAll.mockResolvedValue([]); mocks.put.mockResolvedValue(undefined); });
  it("sends explicit FTP to the existing canonical command even for the device default", async () => {
    await persistRiderMetrics("uid", { ftp: 200 }, { ftpHistorySource: "test" });
    expect(mocks.command).toHaveBeenCalledWith("updateFtp", { expectedUid: "uid", ftp: 200, source: "test", mutationId: expect.any(String) });
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
  it("confirms weight source before any device write", async () => {
    mocks.fetchAll.mockResolvedValue([{ deviceId: "g1", deviceName: "G1", settings: {}, version: 3 }]);
    await persistRiderMetrics("uid", { weightKg: 70 });
    expect(mocks.command).toHaveBeenCalledWith("updateProfileMetrics", { mutationId: expect.any(String), patch: { weightKg: 70 } });
    expect(mocks.put).toHaveBeenCalledWith("uid", "g1", "G1", { riderWeightKg: 70 }, 3);
    expect(mocks.command.mock.invocationCallOrder[0]).toBeLessThan(mocks.put.mock.invocationCallOrder[0]);
  });
  it("leaves devices untouched if the canonical command fails", async () => {
    mocks.command.mockRejectedValue(new Error("revision conflict"));
    await expect(persistRiderMetrics("uid", { weightKg: 70 })).rejects.toThrow("revision conflict");
    expect(mocks.fetchAll).not.toHaveBeenCalled(); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("retains committed provenance when device discovery fails", async () => {
    mocks.fetchAll.mockRejectedValue(new Error("offline"));
    expect(await persistRiderMetrics("uid", { ftp: 250 })).toMatchObject({ updatedDevices: 0, failures: [{ error: "offline" }] });
    expect(mocks.command).toHaveBeenCalledOnce();
  });
  it("preserves partial device failure and the canonical source", async () => {
    mocks.fetchAll.mockResolvedValue([{ deviceId: "g1", deviceName: "G1", settings: {}, version: 3 }, { deviceId: "g2", deviceName: "G2", settings: {}, version: 4 }]);
    mocks.put.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("offline"));
    expect(await persistRiderMetrics("uid", { ftp: 250 })).toMatchObject({ updatedDevices: 1, failures: [{ deviceId: "g2" }] });
    expect(mocks.command).toHaveBeenCalledOnce();
  });
});
