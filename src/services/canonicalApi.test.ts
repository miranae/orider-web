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
  parseCanonicalFitnessSummary,
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

/**
 * 피트니스 요약(E) 페이로드는 이 저장소에 서버 타입 사본이 없다. 그래서 파서가 **선언한
 * 모양이 아니면 값 없음**이다 — 일부만 그리면 나머지 칸이 0 으로 보인다.
 */
describe("parseCanonicalFitnessSummary", () => {
  /** 서버 봉투 `data` 모양 — orider-g1-web:functions/src/api/routes/fitness.ts */
  const serverData = (current: unknown) => ({
    current,
    projection: null,
    summaries: { bike: null, run: null, swim: null },
    projections: { bike: null, run: null, swim: null },
    pdc: { bike: null },
    timeseries: { bike: null, run: null, swim: null },
  });

  it("data.current 의 통합 3값을 읽는다 — 서버 키는 totalCTL/totalATL/totalTSB 다", () => {
    expect(parseCanonicalFitnessSummary(serverData({
      totalCTL: 40, totalATL: 30.5, totalTSB: 9.5, breakdown: {}, state: "final",
    }))).toEqual({ ctl: 40, atl: 30.5, tsb: 9.5 });
  });

  it("모르는 필드는 무시한다", () => {
    expect(parseCanonicalFitnessSummary(serverData({
      totalCTL: 1, totalATL: 2, totalTSB: -1, somethingNew: 9,
    }))).toEqual({ ctl: 1, atl: 2, tsb: -1 });
  });

  it("옛 기대(최상위 ctl/atl/tsb)로는 읽지 않는다 — 계약이 바뀌면 값이 사라지되 틀린 숫자는 안 뜬다", () => {
    expect(parseCanonicalFitnessSummary({ ctl: 40, atl: 30, tsb: 10 })).toBeNull();
  });

  it.each([
    ["current 없음", serverData(undefined)],
    ["current 가 null", serverData(null)],
    ["필드 하나가 없음", serverData({ totalCTL: 40, totalATL: 30 })],
    ["숫자가 아님", serverData({ totalCTL: "40", totalATL: 30, totalTSB: 10 })],
    ["유한하지 않음", serverData({ totalCTL: Number.NaN, totalATL: 30, totalTSB: 10 })],
    ["current 가 배열", serverData([1, 2, 3])],
    ["객체가 아님", 42],
    ["배열", [1, 2, 3]],
    ["null", null],
  ])("%s 이면 전체가 null 이다 — 0 을 만들지 않는다", (_label, value) => {
    expect(parseCanonicalFitnessSummary(value)).toBeNull();
  });
});
