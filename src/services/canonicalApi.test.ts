import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const currentUser = { getIdToken: vi.fn(async () => "tok") };
vi.mock("./firebase", () => ({ auth: { get currentUser() { return currentUser; } } }));
vi.mock("./runtimeConfig", () => ({
  getRuntimeConfig: () => runtimeConfig,
}));

let runtimeConfig: Record<string, unknown> = {};

import {
  canonicalConsumersEnabled,
  fetchCanonicalHomeSummary,
} from "./canonicalApi";

describe("canonicalApi", () => {
  beforeEach(() => {
    runtimeConfig = { personalApiBase: "https://api.example" };
    currentUser.getIdToken.mockResolvedValue("tok");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("전환 스위치는 기본 꺼짐 — 서버 배포 전에 켜지면 없는 API 를 부른다", () => {
    expect(canonicalConsumersEnabled()).toBe(false);
    runtimeConfig.canonicalConsumersEnabled = true;
    expect(canonicalConsumersEnabled()).toBe(true);
    // 문자열 "true" 같은 느슨한 값으로 켜지지 않는다.
    runtimeConfig.canonicalConsumersEnabled = "true";
    expect(canonicalConsumersEnabled()).toBe(false);
  });

  it("HTTP 오류를 던지지 않고 failed 봉투로 내린다 — 던지면 호출부가 0 을 채운다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const envelope = await fetchCanonicalHomeSummary();
    expect(envelope.status).toBe("failed");
    expect(envelope.error?.code).toBe("http_503");
    // 실패에 값이 실리면 화면이 그걸 그린다.
    expect(envelope.data).toBeNull();
  });

  it("네트워크 단절도 봉투로 내린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const envelope = await fetchCanonicalHomeSummary();
    expect(envelope.error?.code).toBe("network_failed");
    expect(envelope.data).toBeNull();
  });

  it("깨진 JSON 도 봉투로 내린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    const envelope = await fetchCanonicalHomeSummary();
    expect(envelope.error?.code).toBe("parse_failed");
  });

  it("미로그인은 failed 가 아니라 unavailable — 재시도해도 달라지지 않는다", async () => {
    currentUser.getIdToken.mockResolvedValue(undefined as unknown as string);
    const envelope = await fetchCanonicalHomeSummary();
    expect(envelope.status).toBe("unavailable");
    expect(envelope.error?.retryable).toBe(false);
  });

  it("성공 응답의 봉투를 그대로 전달한다", async () => {
    const body = { data: { rolling7d: { totals: { rideCount: 3 } } }, status: "canonical", computedAt: 1 };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const envelope = await fetchCanonicalHomeSummary();
    expect(envelope.status).toBe("canonical");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/api/v1/home/summary",
      { headers: { Authorization: "Bearer tok" } },
    );
  });
});
