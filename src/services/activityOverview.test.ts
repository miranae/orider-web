import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityOverview, localActivityOverviewUrl } from "./activityOverview";
import { logClientError } from "./errorLogger";

vi.mock("./errorLogger", () => ({ logClientError: vi.fn() }));

const mocks = vi.hoisted(() => ({ callable: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.callable }));
const services = () => ({ auth: { currentUser: { uid: "u1" } }, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) }) as unknown as FirebaseServices;

describe("activity overview read cache", () => {
  beforeEach(() => mocks.callable.mockReset().mockResolvedValue({ data: { status: "unavailable", activityId: "a", reason: "metrics_unavailable" } }));
  it("deduplicates identical pending requests but separates metric revisions", async () => {
    const firebase = services();
    const a = loadActivityOverview(firebase, "u1", "a", "ko", "r1");
    const b = loadActivityOverview(firebase, "u1", "a", "ko", "r1");
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(mocks.callable).toHaveBeenCalledTimes(1);
    await loadActivityOverview(firebase, "u1", "a", "ko", "r2");
    expect(mocks.callable).toHaveBeenCalledTimes(2);
  });
  it("checks ownership before reading and after a late response", async () => {
    const firebase = services();
    await expect(loadActivityOverview(firebase, "other", "a", "ko", "r")).rejects.toThrow("account_changed");
    let resolve!: (value: unknown) => void;
    mocks.callable.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = loadActivityOverview(firebase, "u1", "a", "ko", "r");
    await Promise.resolve();
    Object.assign(firebase.auth, { currentUser: { uid: "u2" } });
    resolve({ data: { activityId: "a" } });
    await expect(pending).rejects.toThrow("input_changed");
  });
  it("expires cache after 30 seconds and never retains rejected calls", async () => {
    const firebase = services();
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    await loadActivityOverview(firebase, "u1", "a", "en", "r");
    now.mockReturnValue(32_000);
    mocks.callable.mockRejectedValueOnce(new Error("offline"));
    await expect(loadActivityOverview(firebase, "u1", "a", "en", "r")).rejects.toThrow("offline");
    await loadActivityOverview(firebase, "u1", "a", "en", "r");
    expect(mocks.callable).toHaveBeenCalledTimes(3);
    now.mockRestore();
  });
});

describe("App Check 간헐 거부는 조용한 빈 화면이 되면 안 된다", () => {
  const ok = { data: { status: "available", activityId: "a", presentation: { coachSentence: "x", session: { discipline: "bike" } } } };
  const rejection = Object.assign(new Error("Unauthenticated"), { code: "functions/unauthenticated" });

  beforeEach(() => { mocks.callable.mockReset(); vi.mocked(logClientError).mockClear(); });

  it("거부되면 토큰을 다시 확보하고 한 번 더 부른다", async () => {
    const firebase = services();
    mocks.callable.mockRejectedValueOnce(rejection).mockResolvedValueOnce(ok);
    await expect(loadActivityOverview(firebase, "u1", "a", "ko", "r")).resolves.toMatchObject({ status: "available" });
    expect(mocks.callable).toHaveBeenCalledTimes(2);
    expect(firebase.ensureAppCheckReady).toHaveBeenCalledTimes(2);
    expect(logClientError).not.toHaveBeenCalled();
  });

  it("재시도까지 실패하면 표준 로거에 남기고 던진다 — 흔적 없이 사라지지 않는다", async () => {
    mocks.callable.mockRejectedValue(rejection);
    await expect(loadActivityOverview(services(), "u1", "a", "ko", "r")).rejects.toThrow("Unauthenticated");
    expect(mocks.callable).toHaveBeenCalledTimes(2);
    expect(logClientError).toHaveBeenCalledWith("loadActivityOverview.appCheckRejected", rejection, { activityId: "a", lang: "ko" });
  });

  it("App Check 와 무관한 실패는 재시도하지 않는다", async () => {
    for (const error of [new Error("account_changed"), Object.assign(new Error("nope"), { code: "functions/permission-denied" })]) {
      mocks.callable.mockReset().mockRejectedValue(error);
      await expect(loadActivityOverview(services(), "u1", "a", "ko", `r-${error.message}`)).rejects.toThrow(error.message);
      expect(mocks.callable).toHaveBeenCalledTimes(1);
    }
  });
});

it("enables the local overview only for explicit DEV loopback without changing production transport", async () => {
  expect(localActivityOverviewUrl(true, "127.0.0.1", "/api/local/activity-overview")).toBe("/api/local/activity-overview");
  expect(localActivityOverviewUrl(false, "localhost", "/api/local/activity-overview")).toBeNull();
  expect(localActivityOverviewUrl(true, "orider.co.kr", "/api/local/activity-overview")).toBeNull();
  expect(localActivityOverviewUrl(true, "localhost", "https://example.test/overview")).toBeNull();
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_ACTIVITY_OVERVIEW_PREVIEW_URL", "/api/local/activity-overview");
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  mocks.callable.mockResolvedValueOnce({ data: { status: "unavailable", activityId: "a", reason: "metrics_unavailable" } });
  try { await loadActivityOverview(services(), "u1", "a", "ko", "production-transport"); expect(fetchSpy).not.toHaveBeenCalled(); }
  finally { vi.unstubAllEnvs(); fetchSpy.mockRestore(); }
});

it("bounds a stalled local preview and evicts its pending cache for a manual retry", async () => {
  vi.useFakeTimers();
  vi.stubEnv("DEV", true);
  vi.stubEnv("VITE_ACTIVITY_OVERVIEW_PREVIEW_URL", "/api/local/activity-overview");
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("preview_timeout")), { once: true });
  }));
  try {
    const firebase = services();
    const failure = expect(loadActivityOverview(firebase, "u1", "a", "ko", "timeout")).rejects.toThrow("preview_timeout");
    await vi.advanceTimersByTimeAsync(10000);
    await failure;
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "unavailable", activityId: "a", reason: "metrics_unavailable" }) } as Response);
    await expect(loadActivityOverview(firebase, "u1", "a", "ko", "timeout")).resolves.toMatchObject({ activityId: "a" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); vi.unstubAllEnvs(); fetchSpy.mockRestore(); }
});
