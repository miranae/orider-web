import { beforeEach, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { listActiveFtpDevices, retireFtpRegistration } from "./ftpDeviceRegistrations";

const mocks = vi.hoisted(() => ({ get: vi.fn(), call: vi.fn(), collection: vi.fn(), where: vi.fn(), limit: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  collection: mocks.collection, where: mocks.where, limit: mocks.limit, query: vi.fn(), getDocsFromServer: mocks.get,
}));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.call }));
const services = () => ({
  auth: { currentUser: { uid: "owner", isAnonymous: false } },
  firestore: {}, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
}) as unknown as FirebaseServices;

beforeEach(() => vi.clearAllMocks());

it("소유자의 활성 기기를 8개까지 읽고 마지막 접속이 오래된 순서로 보여 준다", async () => {
  const client = services();
  mocks.get.mockResolvedValue({ docs: [2, 1].map((n) => ({
    id: String(n), data: () => ({ platform: "android", lastSeenAt: n === 1 ? 1 : { toMillis: () => 2 } }),
  })) });
  expect((await listActiveFtpDevices(client, "owner")).map((device) => device.id)).toEqual(["1", "2"]);
  expect(mocks.collection).toHaveBeenCalledWith(client.firestore, "users", "owner", "deviceRegistrations");
  expect(mocks.where).toHaveBeenCalledWith("status", "==", "active");
  expect(mocks.limit).toHaveBeenCalledWith(8);
});

it("선택한 기기와 현재 계정의 서버 확인 결과를 검증한다", async () => {
  const client = services();
  mocks.call.mockResolvedValue({ data: { ok: true, deviceId: "another", status: "retired" } });
  await expect(retireFtpRegistration(client, "owner", "old")).rejects.toThrow("invalid_retirement");
  expect(mocks.call).toHaveBeenCalledWith({ expectedUid: "owner", deviceId: "old" });
  await expect(retireFtpRegistration(client, "previous-account", "old")).rejects.toThrow("account_changed");
  expect(mocks.call).toHaveBeenCalledTimes(1);
});
