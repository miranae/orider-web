import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteApp, getApps, initializeApp } from "firebase/app";
import { getFunctions } from "firebase/functions";
import { initializeAuth, inMemoryPersistence } from "firebase/auth";
import { CustomProvider, initializeAppCheck } from "firebase/app-check";
vi.unmock("firebase/app");
vi.unmock("firebase/auth");
vi.unmock("firebase/functions");
vi.unmock("firebase/app-check");

import { redeemHandoffCode } from "./handoffRedeem";

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(getApps().map(deleteApp));
});

describe("인계 코드 교환 전용 FirebaseApp", () => {
  it("원래 App Check가 멈춰도 SDK 요청은 인증 헤더 없이 고정 주소에 도달한다", async () => {
    const sourceApp = initializeApp({ projectId: "handoff-test", apiKey: "public-api-key", appId: "test-app" }, "original");
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
