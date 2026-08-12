import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ logClientError: vi.fn() }));

vi.mock("./errorLogger", () => ({
  logClientError: (...args: unknown[]) => mocks.logClientError(...args),
}));

import { parseDeviceSettingsData, preserveCanonicalFtpCache } from "./deviceSettingsClient";

describe("preserveCanonicalFtpCache", () => {
  beforeEach(() => {
    mocks.logClientError.mockClear();
  });

  it("keeps the latest document FTP while applying another settings edit", () => {
    const next = JSON.stringify({ ftpWatts: 200, maxHeartRate: 190 });
    const current = JSON.stringify({ ftpWatts: 280, maxHeartRate: 180 });

    expect(JSON.parse(preserveCanonicalFtpCache(next, current))).toEqual({
      ftpWatts: 280,
      maxHeartRate: 190,
    });
  });

  it("does not invent an FTP cache for a new or malformed document", () => {
    const next = JSON.stringify({ ftpWatts: 200, maxHeartRate: 190 });

    expect(JSON.parse(preserveCanonicalFtpCache(next, undefined))).toEqual({
      maxHeartRate: 190,
    });
    expect(JSON.parse(preserveCanonicalFtpCache(next, "not-json"))).toEqual({
      maxHeartRate: 190,
    });
    expect(mocks.logClientError).toHaveBeenCalledWith(
      "deviceSettingsClient.malformedJson",
      expect.any(SyntaxError),
      {
        operation: "preserveCanonicalFtpCache",
        source: "device_settings",
        jsonRole: "current",
      },
    );
  });

  it.each([
    "subscribeLatestDeviceSettings",
    "subscribeAllDeviceSettings",
    "fetchDeviceSettings",
    "fetchLatestDeviceSettings",
    "fetchAllDeviceSettings",
  ])("logs malformed settings with owner and operation for %s", (operation) => {
    expect(parseDeviceSettingsData(
      { data: "not-json", deviceId: "device-1" },
      "fallback-device",
      operation,
      "owner-1",
    )).toBeNull();
    expect(mocks.logClientError).toHaveBeenCalledWith(
      "deviceSettingsClient.malformedJson",
      expect.any(SyntaxError),
      {
        operation,
        source: "device_settings",
        uid: "owner-1",
        deviceId: "fallback-device",
        jsonRole: "data",
      },
    );
  });

  it("keeps every settings reader wired through the guarded parser", () => {
    const source = readFileSync(
      join(process.cwd(), "src/services/deviceSettingsClient.ts"),
      "utf8",
    );
    expect(source).toContain(
      'parseSettingsSnapshot(docSnap, "subscribeLatestDeviceSettings", uid)',
    );
    expect(source).toContain(
      'parseSettingsSnapshot(docSnap, "subscribeAllDeviceSettings", uid)',
    );
    expect(source).toContain(
      'parseDeviceSettingsData(data, deviceId, "fetchDeviceSettings", uid)',
    );
    expect(source).toContain(
      'parseDeviceSettingsData(data, docSnap.id, "fetchLatestDeviceSettings", uid)',
    );
    expect(source).toContain(
      'parseDeviceSettingsData(data, docSnap.id, "fetchAllDeviceSettings", uid)',
    );
  });
});
