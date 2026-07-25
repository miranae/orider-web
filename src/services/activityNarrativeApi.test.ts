import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(),
    } as { getIdToken: ReturnType<typeof vi.fn> } | null,
  },
  getAppCheckToken: vi.fn(),
  callable: vi.fn(),
  runtime: {
    aiApiBase: "https://ai.example.run.app/" as string | undefined,
  },
  track: vi.fn(),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => mocks.callable),
}));

vi.mock("./firebase", () => ({
  auth: mocks.auth,
  functions: {},
  getAppCheckToken: mocks.getAppCheckToken,
}));

vi.mock("./runtimeConfig", () => ({
  getRuntimeConfig: () => mocks.runtime,
}));

vi.mock("./analytics", () => ({
  track: mocks.track,
}));

import {
  ActivityNarrativeRestError,
  generateActivityNarrative,
  peekActivityNarrative,
} from "./activityNarrativeApi";

const narrative = {
  narrativeVersion: "rsn-v1",
  generatedAt: 1,
  isVirtualPower: false,
  summary: "summary",
  overall: {
    totalDistanceKm: 10,
    movingSec: 100,
    pauseSec: 0,
    elevGainM: 20,
    tempStartC: null,
    tempEndC: null,
    tempSource: null,
    flags: [],
  },
  segments: [],
  source: "generated",
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("activityNarrativeApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("id-token") };
    mocks.getAppCheckToken.mockReset().mockResolvedValue("app-check-token");
    mocks.callable.mockReset();
    mocks.runtime.aiApiBase = "https://ai.example.run.app/";
    mocks.track.mockReset();
  });

  it("runtime-config AI base URL과 Auth/App Check 헤더로 generate REST를 호출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(narrative));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateActivityNarrative({
      activityId: "activity-1",
      lang: "ko",
      forceRefresh: true,
    })).resolves.toEqual(narrative);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ai.example.run.app/v1/activity-narrative",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer id-token",
          "X-Firebase-AppCheck": "app-check-token",
        }),
        body: JSON.stringify({
          activityId: "activity-1",
          lang: "ko",
          forceRefresh: true,
        }),
      }),
    );
    expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", {
      operation: "generate",
      transport: "rest",
      outcome: "success",
      lang: "ko",
    });
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("cacheOnly peek도 REST 요청 본문과 transport 관측을 사용한다", async () => {
    const hit = { hit: true, ...narrative, source: "cache" as const };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(hit));
    vi.stubGlobal("fetch", fetchMock);

    await expect(peekActivityNarrative({
      activityId: "activity-2",
      lang: "en",
      cacheOnly: true,
    })).resolves.toEqual(hit);

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        activityId: "activity-2",
        lang: "en",
        cacheOnly: true,
      }),
    });
    expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", {
      operation: "peek",
      transport: "rest",
      outcome: "success",
      lang: "en",
    });
  });

  it("runtime-config가 없는 구형 릴리스에서만 callable compatibility 경로를 사용한다", async () => {
    mocks.runtime.aiApiBase = undefined;
    mocks.callable.mockResolvedValue({ data: narrative });

    await expect(generateActivityNarrative({
      activityId: "activity-3",
      lang: "ko",
    })).resolves.toEqual(narrative);

    expect(mocks.callable).toHaveBeenCalledWith({
      activityId: "activity-3",
      lang: "ko",
    });
    expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", {
      operation: "generate",
      transport: "callable",
      outcome: "success",
      lang: "ko",
      fallbackReason: "rest_not_configured",
    });
  });

  it.each([404, 405, 501])(
    "REST route가 HTTP %s이면 미배포 호환 callable로 fallback한다",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
      mocks.callable.mockResolvedValue({ data: narrative });

      await expect(generateActivityNarrative({
        activityId: "activity-4",
        lang: "ko",
      })).resolves.toEqual(narrative);

      expect(mocks.callable).toHaveBeenCalledOnce();
      expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", {
        operation: "generate",
        transport: "callable",
        outcome: "success",
        lang: "ko",
        fallbackReason: "rest_route_unavailable",
      });
    },
  );

  it("quota·서버·network 오류는 callable로 우회하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      error: { code: "resource-exhausted", message: "daily cap" },
    }, 429)).mockRejectedValueOnce(new TypeError("network failed")));

    await expect(generateActivityNarrative({
      activityId: "activity-5",
      lang: "ko",
    })).rejects.toMatchObject({
      code: "resource-exhausted",
      status: 429,
    });
    await expect(generateActivityNarrative({
      activityId: "activity-6",
      lang: "ko",
    })).rejects.toMatchObject({
      code: "rest-network",
    });

    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledTimes(2);
    expect(mocks.track).toHaveBeenNthCalledWith(1, "activity_narrative_transport", {
      operation: "generate",
      transport: "rest",
      outcome: "error",
      lang: "ko",
    });
  });

  it("구조화된 activity not-found는 route 미배포로 오인해 fallback하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: { code: "not-found", message: "activity not found" },
    }, 404)));

    await expect(generateActivityNarrative({
      activityId: "missing-activity",
      lang: "ko",
    })).rejects.toMatchObject({
      code: "not-found",
      status: 404,
    });
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("익명 공개 cacheOnly 계약만 callable로 유지하고 generate는 우회하지 않는다", async () => {
    mocks.auth.currentUser = null;
    mocks.callable.mockResolvedValue({ data: { hit: false } });

    await expect(peekActivityNarrative({
      activityId: "public-activity",
      lang: "ko",
      cacheOnly: true,
    })).resolves.toEqual({ hit: false });
    await expect(generateActivityNarrative({
      activityId: "public-activity",
      lang: "ko",
    })).rejects.toBeInstanceOf(ActivityNarrativeRestError);

    expect(mocks.callable).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", {
      operation: "peek",
      transport: "callable",
      outcome: "success",
      lang: "ko",
      fallbackReason: "anonymous_peek",
    });
    expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", {
      operation: "generate",
      transport: "rest",
      outcome: "error",
      lang: "ko",
    });
  });
});
