import { accountWorldEndpoint, accountWorldExpiresAt, accountWorldSubscription } from "./accountWorldSignal";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";

const endpoint = "wss://world.orider.co.kr/device-signals";
const token = (exp: number) => `header.${btoa(JSON.stringify({ exp }))}.signature`;

afterEach(() => { vi.unstubAllEnvs(); resetRuntimeConfigForTests(); });

it("limits hosted tokens to the production Firebase project and the fixed TLS endpoint", () => {
  expect(accountWorldEndpoint("notification", "miranae-orider-g1")).toBeUndefined();
  resetRuntimeConfigForTests({ worldAccountSignalsEnabled: true });
  expect(accountWorldEndpoint("notification", "miranae-orider-g1")).toBe("wss://world.orider.co.kr/notification-signals");
  expect(accountWorldEndpoint("device", "another-project")).toBeUndefined();
  resetRuntimeConfigForTests({ worldAccountSignalsEnabled: true, useEmulators: true });
  expect(accountWorldEndpoint("device", "miranae-orider-g1")).toBeUndefined();
});

it("sends both tokens and uses the earlier expiry", async () => {
  const now = Math.floor(Date.now() / 1000);
  const id = token(now + 600);
  const appCheck = token(now + 300);
  const user = { getIdToken: vi.fn(async () => id) };
  const getAppCheckToken = vi.fn(async () => appCheck);
  const request = await accountWorldSubscription(endpoint, "device", user, getAppCheckToken, "workout-device:device");
  expect(request).toEqual({ v: 1, type: "device_subscribe", token: id, appCheck, resource: "workout-device:device" });
  expect(accountWorldExpiresAt(request)).toBe((now + 300) * 1000);
});

it("refreshes expiring credentials once and keeps Firestore available if App Check is missing", async () => {
  const now = Math.floor(Date.now() / 1000);
  const fresh = token(now + 300);
  const user = { getIdToken: vi.fn(async () => fresh) };
  const appCheck = vi.fn(async (force?: boolean) => force ? fresh : token(now + 5));
  await expect(accountWorldSubscription(endpoint, "device", user, appCheck)).resolves.toMatchObject({ appCheck: fresh });
  expect(appCheck.mock.calls).toEqual([[undefined], [true]]);
  await expect(accountWorldSubscription(endpoint, "device", user, async () => null)).rejects.toThrow("credentials unavailable");
});

it("does not send real sign-in credentials to a loopback socket without emulator mode", () => {
  vi.stubEnv("VITE_ORIDER_LOCAL_WORLD", "1");
  vi.stubEnv("VITE_ORIDER_LOCAL_NOTIFICATION_REDIS", "1");
  resetRuntimeConfigForTests({ firebaseProjectId: "demo-orider-lab" });
  expect(accountWorldEndpoint("notification", "demo-orider-lab")).toBeUndefined();
  resetRuntimeConfigForTests({ firebaseProjectId: "demo-orider-lab", useEmulators: true });
  expect(accountWorldEndpoint("notification", "demo-orider-lab")).toBe("ws://127.0.0.1:19487/notification-signals");
});
