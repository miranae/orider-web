import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@shared/types/deviceSettings";

const mocks = vi.hoisted(() => ({
  profileFtp: 285 as number | null,
  txGet: vi.fn(),
  txSet: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  Timestamp: class Timestamp {
    toMillis() { return 0; }
  },
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: (...args: unknown[]) => mocks.runTransaction(...args),
  serverTimestamp: vi.fn(() => "server-time"),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));
vi.mock("./firebase", () => ({ firestore: {} }));
vi.mock("./errorLogger", () => ({ logClientError: vi.fn() }));

import { putDeviceSettings } from "./deviceSettingsClient";

describe("putDeviceSettings canonical cache seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileFtp = 285;
    mocks.txGet.mockImplementation(({ path }: { path: string[] }) => ({
      data: () => path.length === 2 ? { ftp: mocks.profileFtp } : undefined,
    }));
    mocks.runTransaction.mockImplementation(async (
      _db: unknown,
      body: (tx: { get: typeof mocks.txGet; set: typeof mocks.txSet }) => Promise<void>,
    ) => body({ get: mocks.txGet, set: mocks.txSet }));
  });

  it.each([
    { canonicalFtp: 285, expectedFtp: 285 },
    { canonicalFtp: null, expectedFtp: undefined },
  ])("reads the owner profile and seeds a new document with $canonicalFtp", async ({
    canonicalFtp,
    expectedFtp,
  }) => {
    mocks.profileFtp = canonicalFtp;
    await putDeviceSettings(
      "owner-1",
      "device-1",
      "Phone",
      { ...DEFAULT_APP_SETTINGS, ftpWatts: 200 },
    );

    expect(mocks.txGet).toHaveBeenCalledWith({ path: ["users", "owner-1"] });
    expect(mocks.txGet).toHaveBeenCalledWith({
      path: ["users", "owner-1", "settings", "device-1"],
    });
    const payload = mocks.txSet.mock.calls[0]?.[1] as { data: string };
    expect(JSON.parse(payload.data).ftpWatts).toBe(expectedFtp);
  });
});
