import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(),
    } as { getIdToken: ReturnType<typeof vi.fn> } | null,
  },
  getAppCheckToken: vi.fn(),
  ensureAppCheckReady: vi.fn(),
  callable: vi.fn(),
  runtime: {
    aiApiBase: "https://ai.example.run.app/" as string | undefined,
  },
  track: vi.fn(),
  logClientError: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => mocks.callable),
}));

vi.mock("./firebase", () => ({
  auth: mocks.auth,
  functions: {},
  getAppCheckToken: mocks.getAppCheckToken,
  ensureAppCheckReady: mocks.ensureAppCheckReady,
}));

vi.mock("./runtimeConfig", () => ({
  getRuntimeConfig: () => mocks.runtime,
}));

vi.mock("./analytics", () => ({
  track: mocks.track,
}));

vi.mock("./errorLogger", () => ({
  logClientError: mocks.logClientError,
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
    mocks.ensureAppCheckReady.mockReset().mockResolvedValue(undefined);
    mocks.callable.mockReset();
    mocks.runtime.aiApiBase = "https://ai.example.run.app/";
    mocks.track.mockReset();
    mocks.logClientError.mockReset();
    mocks.onAuthStateChanged.mockReset().mockImplementation((_auth, next) => {
      next(mocks.auth.currentUser);
      return vi.fn();
    });
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

  it("quota·서버 오류는 callable로 우회하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: { code: "resource-exhausted", message: "daily cap" },
    }, 429)));

    await expect(generateActivityNarrative({
      activityId: "activity-5",
      lang: "ko",
    })).rejects.toMatchObject({
      code: "resource-exhausted",
      status: 429,
    });

    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenNthCalledWith(1, "activity_narrative_transport", {
      operation: "generate",
      transport: "rest",
      outcome: "error",
      lang: "ko",
    });
  });

  it("회선 순단은 한 번 재시도하고, 회복되면 REST 그대로 성공한다", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(narrative));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateActivityNarrative({
      activityId: "activity-6",
      lang: "ko",
    })).resolves.toEqual(narrative);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.logClientError).toHaveBeenCalledWith(
      "activityNarrativeApi.restNetworkRetry",
      expect.objectContaining({ code: "rest-network" }),
      { operation: "generate", lang: "ko", attempt: 1 },
    );
    expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", {
      operation: "generate",
      transport: "rest",
      outcome: "success",
      lang: "ko",
    });
  });

  it("재시도 후에도 AI API 호스트가 안 닿으면 callable로 우회한다", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    mocks.callable.mockResolvedValue({ data: narrative });

    await expect(generateActivityNarrative({
      activityId: "activity-7",
      lang: "ko",
    })).resolves.toEqual(narrative);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.callable).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", {
      operation: "generate",
      transport: "callable",
      outcome: "success",
      lang: "ko",
      fallbackReason: "rest_network_unreachable",
    });
  });

  it("REST·callable 양쪽 다 실패하면 callable 오류를 그대로 올린다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    mocks.callable.mockRejectedValue(new Error("unavailable"));

    await expect(peekActivityNarrative({
      activityId: "activity-8",
      lang: "ko",
      cacheOnly: true,
    })).rejects.toThrow("unavailable");

    expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", {
      operation: "peek",
      transport: "callable",
      outcome: "error",
      lang: "ko",
      fallbackReason: "rest_network_unreachable",
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

  it("첫 호출 전에 Firebase Auth 복원을 기다린 뒤 REST 인증 헤더를 만든다", async () => {
    mocks.auth.currentUser = null;
    mocks.onAuthStateChanged.mockImplementationOnce((_auth, next) => {
      mocks.auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("restored-id-token") };
      next(mocks.auth.currentUser);
      return vi.fn();
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hit: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(peekActivityNarrative({
      activityId: "restored-activity",
      lang: "ko",
      cacheOnly: true,
    })).resolves.toEqual({ hit: false });

    expect(mocks.onAuthStateChanged).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer restored-id-token",
      }),
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

  it("익명 peek callable 은 App Check 준비를 기다린 뒤 호출한다", async () => {
    mocks.auth.currentUser = null;
    let releaseAppCheck: (() => void) | undefined;
    mocks.ensureAppCheckReady.mockReturnValue(new Promise<void>((resolve) => {
      releaseAppCheck = resolve;
    }));
    mocks.callable.mockResolvedValue({ data: { hit: false } });

    const pending = peekActivityNarrative({
      activityId: "public-activity",
      lang: "ko",
      cacheOnly: true,
    });
    await Promise.resolve();

    // 준비 전에는 절대 호출하지 않는다 — enforceAppCheck 이 토큰 없는 요청을 "Unauthenticated" 로 거부한다.
    expect(mocks.callable).not.toHaveBeenCalled();
    releaseAppCheck!();

    await expect(pending).resolves.toEqual({ hit: false });
    expect(mocks.ensureAppCheckReady).toHaveBeenCalledOnce();
    expect(mocks.callable).toHaveBeenCalledTimes(1);
  });

  it("App Check 준비가 실패하면 사유를 기록하고도 익명 peek callable 은 시도한다", async () => {
    mocks.auth.currentUser = null;
    const appCheckError = new Error("app-check/token-timeout");
    mocks.ensureAppCheckReady.mockRejectedValue(appCheckError);
    mocks.callable.mockResolvedValue({ data: { hit: false } });

    await expect(peekActivityNarrative({
      activityId: "public-activity",
      lang: "ko",
      cacheOnly: true,
    })).resolves.toEqual({ hit: false });
    expect(mocks.callable).toHaveBeenCalledTimes(1);
    // callable 의 "Unauthenticated" 는 2차 증상 — 준비 실패 사유가 남아야 원인 추적이 된다.
    expect(mocks.logClientError).toHaveBeenCalledWith(
      "activityNarrativeApi.appCheckReady",
      appCheckError,
      { operation: "peek", lang: "ko", fallbackReason: "anonymous_peek", signedIn: false },
    );
  });
});
