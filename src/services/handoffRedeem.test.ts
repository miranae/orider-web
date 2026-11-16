import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteApp, getApps, initializeApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { initializeAuth, inMemoryPersistence } from "firebase/auth";
import { CustomProvider, initializeAppCheck } from "firebase/app-check";
vi.unmock("firebase/app");
vi.unmock("firebase/auth");
vi.unmock("firebase/functions");
vi.unmock("firebase/app-check");

import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { redeemHandoffCode } from "./handoffRedeem";

afterEach(async () => {
  vi.unstubAllGlobals();
  resetRuntimeConfigForTests();
  await Promise.all(getApps().map(deleteApp));
});

describe("인계 코드 교환 전용 FirebaseApp", () => {
  it("분리된 stage에서 운영 인계 서버에 요청하지 않는다", async () => {
    const app = initializeApp({ projectId: "miranae-orider-g1", apiKey: "public-key", appId: "test-app" });
    const fetchMock = vi.fn();
    resetRuntimeConfigForTests({ appEnvironment: "stage" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(redeemHandoffCode(getFunctions(app), "A".repeat(43))).rejects.toThrow("handoff/unavailable-in-isolated-stage");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("에뮬레이터 demo 프로젝트에서는 연결된 에뮬레이터 Functions 로 교환하고 운영 주소에 요청하지 않는다", async () => {
    const app = initializeApp({ projectId: "demo-orider-lab", apiKey: "fake", appId: "fake" }, "lab");
    const functions = getFunctions(app, "asia-northeast3");
    connectFunctionsEmulator(functions, "localhost", 5599);
    resetRuntimeConfigForTests({ useEmulators: true });
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ result: { token: "emulator-token" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const code = "B".repeat(43);
    expect(await redeemHandoffCode(functions, code)).toBe("emulator-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:5599/demo-orider-lab/asia-northeast3/webHandoffRedeem");
    expect(request.body).toBe(JSON.stringify({ data: { code } }));
    expect(getApps().some((candidate) => candidate.name.startsWith("orider-handoff-redeem-"))).toBe(false);
  });
  it("에뮬레이터 실행이라도 demo 프로젝트가 아니면 에뮬레이터 교환 경로를 쓰지 않는다", async () => {
    const app = initializeApp({ projectId: "other-project", apiKey: "fake", appId: "fake" }, "not-demo");
    resetRuntimeConfigForTests({ useEmulators: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(redeemHandoffCode(getFunctions(app), "C".repeat(43))).rejects.toThrow("handoff/unavailable-in-isolated-stage");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("원래 App Check가 멈춰도 SDK 요청은 인증 헤더 없이 고정 주소에 도달한다", async () => {
    const sourceApp = initializeApp({ projectId: "miranae-orider-g1", apiKey: "public-api-key", appId: "test-app" }, "original");
    initializeAuth(sourceApp, { persistence: inMemoryPersistence });
    initializeAppCheck(sourceApp, { provider: new CustomProvider({ getToken: () => new Promise(() => {}) }) });
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ result: { token: "custom-token" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const code = "A".repeat(43);
    expect(await redeemHandoffCode(getFunctions(sourceApp), code)).toBe("custom-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://auth.orider.co.kr/webHandoffRedeem");
    expect(request.body).toBe(JSON.stringify({ data: { code } }));
    expect(request.headers).toEqual({ "Content-Type": "application/json" });
    await redeemHandoffCode(getFunctions(sourceApp), code);
    expect(getApps().filter((app) => app.name.startsWith("orider-handoff-redeem-"))).toHaveLength(1);
  });
});
