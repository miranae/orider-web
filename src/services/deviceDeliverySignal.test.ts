import type { Firestore } from "firebase/firestore";
import { followWorldSignal } from "../features/ride-world/followWorldSignal";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { subscribeDeviceDeliverySignal } from "./deviceDeliverySignal";

const auth = vi.hoisted(() => ({ currentUser: { uid: "owner", isAnonymous: false, getIdToken: vi.fn() } }));
vi.mock("firebase/auth", () => ({ getAuth: () => auth }));
vi.mock("../features/ride-world/followWorldSignal", () => ({ followWorldSignal: vi.fn(() => vi.fn()) }));

afterEach(() => { vi.clearAllMocks(); resetRuntimeConfigForTests(); });

it("keeps the canonical device watch until a Redis revision and discards a late read after fallback", async () => {
  resetRuntimeConfigForTests({ worldAccountSignalsEnabled: true });
  const firestore = { app: { options: { projectId: "miranae-orider-g1" } } } as Firestore;
  const stopInitial = vi.fn(), stopFallback = vi.fn();
  const fallback = vi.fn().mockReturnValueOnce(stopInitial).mockReturnValueOnce(stopFallback);
  const receive = vi.fn();
  let finish!: (value: string) => void;
  const read = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  const stop = subscribeDeviceDeliverySignal(firestore, "owner", "workout-device:device", read, receive, vi.fn(), fallback, vi.fn(), async () => "app-check");
  const [url, , signal, disconnected] = vi.mocked(followWorldSignal).mock.calls[0]!;
  expect(url).toBe("wss://world.orider.co.kr/device-signals");
  const frame = { v: 1, type: "device_signal" };
  expect(signal({ ...frame, revision: null })).toBe(true);
  expect(stopInitial).not.toHaveBeenCalled();
  expect(signal({ ...frame, revision: "1790000000:012345678" })).toBe(true);
  expect(stopInitial).toHaveBeenCalledOnce();
  disconnected(1013);
  expect(fallback).toHaveBeenCalledTimes(2);
  finish("old result");
  await Promise.resolve();
  expect(receive).not.toHaveBeenCalled();
  stop();
  expect(stopFallback).toHaveBeenCalledOnce();
});
