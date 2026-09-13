import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAppCheckReady } = vi.hoisted(() => ({
  ensureAppCheckReady: vi.fn(async () => undefined),
}));
const currentUser = { getIdToken: vi.fn(async () => "tok") };
vi.mock("./firebase", () => ({
  auth: { get currentUser() { return currentUser; } },
  ensureAppCheckReady,
}));
vi.mock("./runtimeConfig", () => ({
  getRuntimeConfig: () => runtimeConfig,
}));

let runtimeConfig: Record<string, unknown> = {};

import {
  canonicalConsumersEnabled,
  fetchCanonicalFitnessSummary,
  fetchCanonicalHomeSummary,
  parseCanonicalFitnessSummary,
  parseCanonicalHomeRolling7d,
  parseCanonicalHomeTotals,
} from "./canonicalApi";
import {
  legacyWebHomeTotals,
  serverHomeSummaryData,
  serverHomeTotals,
} from "../__tests__/fixtures/canonicalHomeSummary";

describe("canonicalApi", () => {
  beforeEach(() => {
    runtimeConfig = { personalApiBase: "https://api.example" };
    currentUser.getIdToken.mockResolvedValue("tok");
    ensureAppCheckReady.mockClear().mockResolvedValue(undefined);
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
    const body = { data: serverHomeSummaryData(), status: "canonical", computedAt: 1 };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const envelope = await fetchCanonicalHomeSummary();
    expect(envelope.status).toBe("canonical");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/api/v1/home/summary",
      { headers: { Authorization: "Bearer tok" } },
    );
    expect(ensureAppCheckReady).toHaveBeenCalledOnce();
  });

  it("주입된 auth와 App Check 준비 함수를 사용한다 — 임베드 전용 Firebase 경계", async () => {
    const embeddedReady = vi.fn(async () => undefined);
    const embeddedAuth = {
      currentUser: { getIdToken: vi.fn(async () => "embedded-token") },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "canonical" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCanonicalHomeSummary({
      auth: embeddedAuth as never,
      ensureAppCheckReady: embeddedReady,
    });

    expect(embeddedReady).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/api/v1/home/summary",
      { headers: { Authorization: "Bearer embedded-token" } },
    );
    expect(ensureAppCheckReady).not.toHaveBeenCalled();
  });

  it("fitness 응답 전후 계정이 달라지면 payload를 반환하지 않는다", async () => {
    let resolveResponse!: (response: Response) => void;
    const embeddedAuth = {
      currentUser: { uid: "u1", getIdToken: vi.fn(async () => "u1-token") },
    };
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
    const request = fetchCanonicalFitnessSummary("u1", {
      auth: embeddedAuth as never,
      ensureAppCheckReady: vi.fn(async () => undefined),
    });
    await vi.waitFor(() => expect(resolveResponse).toBeTypeOf("function"));
    embeddedAuth.currentUser = { uid: "u2", getIdToken: vi.fn(async () => "u2-token") };
    resolveResponse(new Response(JSON.stringify({ data: { private: "u1" } }), { status: 200 }));

    const envelope = await request;
    expect(envelope.status).toBe("failed");
    expect(envelope.error?.code).toBe("auth_changed");
    expect(envelope.data).toBeNull();
  });

  it("fitness 요청 전에 현재 계정이 다르면 token과 fetch를 사용하지 않는다", async () => {
    const getIdToken = vi.fn(async () => "wrong-token");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const envelope = await fetchCanonicalFitnessSummary("expected", {
      auth: { currentUser: { uid: "other", getIdToken } } as never,
      ensureAppCheckReady: vi.fn(async () => undefined),
    });

    expect(envelope.error?.code).toBe("auth_changed");
    expect(getIdToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


/**
 * 홈 요약 합계 파서. **서버 필드명·단위가 계약**이고, 그 밖의 모양은 값이 아니라 "없음" 이다.
 *
 * @sync-with orider-g1-web/functions/src/api/routes/home-summary-aggregate.ts#HomeSummaryTotals
 */
describe("parseCanonicalHomeTotals", () => {
  it("서버 모양이면 그대로 통과한다 — 단위 변환 없음(미터·밀리초)", () => {
    expect(parseCanonicalHomeTotals(serverHomeTotals)).toEqual(serverHomeTotals);
  });

  it("옛 웹 필드명(rideCount/distanceKm/movingSec)은 값이 아니다 — 불일치가 조용히 돌아오면 안 된다", () => {
    expect(parseCanonicalHomeTotals(legacyWebHomeTotals)).toBeNull();
  });

  it.each(["activityCount", "distanceMeters", "movingMillis", "elevationGainMeters"] as const)(
    "%s 가 없으면 전체가 null — 나머지 칸이 0 으로 보이면 안 된다",
    (field) => {
      const partial: Record<string, unknown> = { ...serverHomeTotals };
      delete partial[field];
      expect(parseCanonicalHomeTotals(partial)).toBeNull();
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, "42", null])(
    "유한한 숫자가 아니면(%s) 값이 아니다",
    (bad) => {
      expect(parseCanonicalHomeTotals({ ...serverHomeTotals, distanceMeters: bad })).toBeNull();
    },
  );

  it.each([null, undefined, 1, "x", []])("객체가 아니면 값이 아니다 (%s)", (bad) => {
    expect(parseCanonicalHomeTotals(bad)).toBeNull();
  });
});

describe("parseCanonicalHomeRolling7d", () => {
  it("봉투 data 에서 최근 7일 합계를 꺼낸다", () => {
    expect(parseCanonicalHomeRolling7d(serverHomeSummaryData())).toEqual(serverHomeTotals);
  });

  it("rolling7d 나 totals 가 없으면 값이 아니다", () => {
    expect(parseCanonicalHomeRolling7d({})).toBeNull();
    expect(parseCanonicalHomeRolling7d({ rolling7d: {} })).toBeNull();
    expect(parseCanonicalHomeRolling7d(null)).toBeNull();
  });

  it("옛 웹 필드명만 담긴 응답은 값이 아니다 (회귀 가드)", () => {
    expect(parseCanonicalHomeRolling7d({ rolling7d: { totals: legacyWebHomeTotals } })).toBeNull();
  });
});

/**
 * 피트니스 요약(E) 페이로드는 이 저장소에 서버 타입 사본이 없다. 그래서 파서가 **선언한
 * 모양이 아니면 값 없음**이다 — 일부만 그리면 나머지 칸이 0 으로 보인다.
 */
describe("parseCanonicalFitnessSummary", () => {
  /** 서버 봉투 `data` 모양 — orider-g1-web:functions/src/api/routes/fitness.ts */
  const serverData = (current: unknown) => ({
    current: current && typeof current === "object" && !Array.isArray(current) ? {
      breakdown: {
        bike: { ctl: 20, atl: 15, tsb: 5, weeklyTSS: 100 },
        run: { ctl: 15, atl: 10, tsb: 5, weeklyTSS: 50 },
        swim: { ctl: 5, atl: 5.5, tsb: -0.5, weeklyTSS: 20 },
      },
      totalsBasis: ["bike", "run", "swim"],
      ...current as Record<string, unknown>,
    } : current,
    projection: null,
    summaries: { bike: null, run: null, swim: null },
    projections: { bike: null, run: null, swim: null },
    pdc: { bike: null },
    timeseries: { bike: null, run: null, swim: null },
  });

  it("data.current 의 통합 3값을 읽는다 — 서버 키는 totalCTL/totalATL/totalTSB 다", () => {
    expect(parseCanonicalFitnessSummary(serverData({
      totalCTL: 40, totalATL: 30.5, totalTSB: 9.5, state: "final",
    }))).toMatchObject({ ctl: 40, atl: 30.5, tsb: 9.5 });
  });

  it("모르는 필드는 무시한다", () => {
    expect(parseCanonicalFitnessSummary(serverData({
      totalCTL: 1, totalATL: 2, totalTSB: -1, somethingNew: 9,
    }))).toMatchObject({ ctl: 1, atl: 2, tsb: -1 });
  });

  it("종목별 서버 시계열과 coverage 기준 시각을 그대로 보존한다", () => {
    const data = serverData({ totalCTL: 40, totalATL: 30, totalTSB: 10 }) as any;
    data.current.generation = 7;
    data.current.timezone = "Asia/Seoul";
    data.timeseries.bike = {
      discipline: "bike", schemaVersion: 1, computedAt: 1_789_200_000_000,
      startDate: "2026-09-12", endDate: "2026-09-13", pointCount: 2,
      points: [
        { date: "2026-09-12", ctl: 39, atl: 29, tsb: 10, dailyLoad: 80 },
        { date: "2026-09-13", ctl: 40, atl: 30, tsb: 10, dailyLoad: 50 },
      ],
      loadSnapshot: { asOf: 1_789_200_000_000 },
    };

    expect(parseCanonicalFitnessSummary(data)).toMatchObject({
      generation: 7,
      timezone: "Asia/Seoul",
      asOf: 1_789_200_000_000,
      timeseries: { bike: { pointCount: 2, endDate: "2026-09-13" } },
    });
  });

  it("서버 시계열의 순서나 개수가 깨지면 전체를 표시하지 않는다", () => {
    const data = serverData({ totalCTL: 40, totalATL: 30, totalTSB: 10 }) as any;
    data.timeseries.bike = {
      discipline: "bike", schemaVersion: 1, computedAt: 1,
      startDate: "2026-09-13", endDate: "2026-09-12", pointCount: 2,
      points: [
        { date: "2026-09-13", ctl: 40, atl: 30, tsb: 10, dailyLoad: 50 },
        { date: "2026-09-12", ctl: 39, atl: 29, tsb: 10, dailyLoad: 80 },
      ],
    };
    expect(parseCanonicalFitnessSummary(data)).toBeNull();
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
