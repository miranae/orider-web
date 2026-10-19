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

let {
  ACTIVITY_NARRATIVE_APP_CHECK_THROTTLE_RECOVERY_KEY,
  ActivityNarrativeRestError,
  appCheckThrottleRetryAfterMs,
  claimActivityNarrativeAppCheckThrottleRecovery,
  generateActivityNarrative,
  peekActivityNarrative,
  retryActivitySocialSummary,
} = await import("./activityNarrativeApi");

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
  it("requests only the share summary in read-only mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ socialSummary: { narrative: "recovered" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(retryActivitySocialSummary("ride", "ko")).resolves.toEqual({ socialSummary: { narrative: "recovered" } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ activityId: "ride", lang: "ko", cacheOnly: true, socialSummaryOnly: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.resetModules();
    ({
      ACTIVITY_NARRATIVE_APP_CHECK_THROTTLE_RECOVERY_KEY,
      ActivityNarrativeRestError,
      appCheckThrottleRetryAfterMs,
      claimActivityNarrativeAppCheckThrottleRecovery,
      generateActivityNarrative,
      peekActivityNarrative,
      retryActivitySocialSummary,
    } = await import("./activityNarrativeApi"));
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

  it("App Check throttle 응답에서 재시도 가능까지 남은 시간을 분류한다", () => {
    expect(appCheckThrottleRetryAfterMs({
      code: "appCheck/throttled",
      message: "AppCheck: Requests throttled due to previous 403 error. Attempts allowed again after 20h:58m:47s (appCheck/throttled).",
    })).toBe((20 * 60 * 60 + 58 * 60 + 47) * 1_000);
    expect(appCheckThrottleRetryAfterMs(
      new Error("AppCheck: Requests throttled due to previous 403 error."),
    )).toBe(5 * 60 * 1_000);
    expect(appCheckThrottleRetryAfterMs(new Error("unrelated request error"))).toBeNull();
  });

  it("App Check 자동 복구 새로고침은 같은 세션에서 한 번만 허용한다", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(claimActivityNarrativeAppCheckThrottleRecovery(storage)).toBe(true);
    expect(values.get(ACTIVITY_NARRATIVE_APP_CHECK_THROTTLE_RECOVERY_KEY)).toBe("1");
    expect(claimActivityNarrativeAppCheckThrottleRecovery(storage)).toBe(false);
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

  it("peek 회선 순단은 한 번 재시도하고, 회복되면 REST 그대로 성공한다", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ hit: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(peekActivityNarrative({
      activityId: "activity-6",
      lang: "ko",
      cacheOnly: true,
    })).resolves.toEqual({ hit: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.logClientError).not.toHaveBeenCalled();
  });

  it("generate 회선 순단은 cacheOnly로 첫 요청 산출물만 확인하고 재전송하지 않는다", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ hit: true, ...narrative }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateActivityNarrative({
      activityId: "activity-7",
      lang: "ko",
    })).resolves.toEqual(narrative);

    // 2번째 호출은 프로브(cacheOnly) — generate 재전송은 일어나지 않아야 한다.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      activityId: "activity-7",
      lang: "ko",
      cacheOnly: true,
    });
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("프로브가 miss면 LLM 중복 실행 대신 오류를 올려 사용자 재시도에 맡긴다", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ hit: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateActivityNarrative({
      activityId: "activity-8",
      lang: "ko",
    })).rejects.toMatchObject({ code: "rest-network" });

    // generate 재전송은 없어야 한다 — 프로브 1회가 끝.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("프로브가 받은 quota 오류는 회선 오류로 뭉개지 않고 그대로 올린다", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({
        error: { code: "resource-exhausted", message: "daily cap" },
      }, 429));
    vi.stubGlobal("fetch", fetchMock);

    // 회선 오류로 보이면 UI 가 무의미한 재시도를 유도한다 — 실제 원인인 quota 를 노출해야 한다.
    await expect(generateActivityNarrative({
      activityId: "activity-9",
      lang: "ko",
    })).rejects.toMatchObject({ code: "resource-exhausted", status: 429 });

    expect(mocks.logClientError).toHaveBeenCalledWith(
      "activityNarrativeApi.restRecoveryProbeFailed",
      expect.objectContaining({ code: "resource-exhausted" }),
      { operation: "generate", lang: "ko" },
    );
  });

  it("프로브도 회선 오류면 판단 불가라 원래 회선 오류를 올린다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(generateActivityNarrative({
      activityId: "activity-13",
      lang: "ko",
    })).rejects.toMatchObject({ code: "rest-network" });

    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("프로브가 구버전 route 404를 받으면 판단 불가로 보고 원래 오류를 올린다", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateActivityNarrative({
      activityId: "activity-14",
      lang: "ko",
    })).rejects.toMatchObject({ code: "rest-network" });
  });

  it("사용자가 명시한 forceRefresh 재생성은 프로브도 대기도 없이 오류를 올린다", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const startedAt = Date.now();
    await expect(generateActivityNarrative({
      activityId: "activity-10",
      lang: "ko",
      forceRefresh: true,
    })).rejects.toMatchObject({ code: "rest-network" });

    // 복구할 게 없는 분기라 회선 순단 대기(400ms)를 타면 안 된다.
    expect(Date.now() - startedAt).toBeLessThan(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", {
      operation: "generate",
      transport: "rest",
      outcome: "error",
      lang: "ko",
    });
  });

  it("peek 재시도 후에도 AI API 호스트가 안 닿으면 callable로 우회한다", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    mocks.callable.mockResolvedValue({ data: { hit: true, ...narrative } });

    await expect(peekActivityNarrative({
      activityId: "activity-11",
      lang: "ko",
      cacheOnly: true,
    })).resolves.toEqual({ hit: true, ...narrative });

    expect(mocks.callable).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", {
      operation: "peek",
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
      activityId: "activity-12",
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

    expect(mocks.onAuthStateChanged).toHaveBeenCalledTimes(2);
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

  it("App Check 준비가 실패하면 원인을 전파하고 callable을 보내지 않는다", async () => {
    mocks.auth.currentUser = null;
    const appCheckError = new Error("app-check/token-timeout");
    mocks.ensureAppCheckReady.mockRejectedValue(appCheckError);
    mocks.callable.mockResolvedValue({ data: { hit: false } });

    await expect(peekActivityNarrative({
      activityId: "public-activity",
      lang: "ko",
      cacheOnly: true,
    })).rejects.toBe(appCheckError);
    expect(mocks.callable).not.toHaveBeenCalled();
    // callable 의 "Unauthenticated" 는 2차 증상 — 준비 실패 사유가 남아야 원인 추적이 된다.
    expect(mocks.logClientError).toHaveBeenCalledWith(
      "activityNarrativeApi.appCheckReady",
      appCheckError,
      { operation: "peek", lang: "ko", fallbackReason: "anonymous_peek", signedIn: false },
    );
  });
  it("REST 실패 후 1분은 callable을 사용하고 만료되면 REST를 다시 탐색한다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    mocks.callable.mockResolvedValue({ data: { hit: false } });
    const request = { activityId: "cooldown", lang: "ko", cacheOnly: true } as const;
    const first = peekActivityNarrative(request);
    await vi.advanceTimersByTimeAsync(400);
    await expect(first).resolves.toEqual({ hit: false });
    await expect(peekActivityNarrative(request)).resolves.toEqual({ hit: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.track).toHaveBeenCalledWith("activity_narrative_transport", expect.objectContaining({ fallbackReason: "rest_network_cooldown" }));
    expect(mocks.logClientError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    fetchMock.mockResolvedValueOnce(jsonResponse({ hit: false }));
    await expect(peekActivityNarrative(request)).resolves.toEqual({ hit: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mocks.callable).toHaveBeenCalledTimes(2);
  });

  it("REST cooldown은 다른 API base나 강제 생성으로 전파되지 않는다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    mocks.callable.mockResolvedValue({ data: { hit: false } });
    const request = { activityId: "base", lang: "ko", cacheOnly: true } as const;
    const first = peekActivityNarrative(request);
    await vi.advanceTimersByTimeAsync(400);
    await first;
    await expect(generateActivityNarrative({ activityId: "base", lang: "ko", forceRefresh: true })).rejects.toMatchObject({ code: "rest-network" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    mocks.runtime.aiApiBase = "https://other.example.run.app";
    fetchMock.mockResolvedValueOnce(jsonResponse({ hit: false }));
    await peekActivityNarrative(request);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][0]).toBe("https://other.example.run.app/v1/activity-narrative");
    expect(mocks.callable).toHaveBeenCalledTimes(1);
  });

  it("동시 peek은 공유하되 활동·언어·요약·인증별 요청은 분리한다", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const request = { activityId: "same", lang: "ko", cacheOnly: true } as const;
    // 토큰 발급을 대기시켜 모든 요청을 진행 중 상태로 유지한다.
    let releaseToken: ((token: string) => void) | undefined;
    mocks.auth.currentUser!.getIdToken.mockReturnValue(new Promise<string>((resolve) => { releaseToken = resolve; }));
    const first = peekActivityNarrative(request);
    const duplicate = peekActivityNarrative(request);
    const english = peekActivityNarrative({ ...request, lang: "en" });
    const other = peekActivityNarrative({ ...request, activityId: "other" });
    const social = retryActivitySocialSummary("same", "ko");
    await vi.waitFor(() => expect(mocks.auth.currentUser!.getIdToken).toHaveBeenCalledTimes(4));
    mocks.auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("other-user-token") };
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ hit: false })));
    const secondUser = peekActivityNarrative(request);
    releaseToken!("first-user-token");
    await Promise.all([first, duplicate, english, other, social, secondUser]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.filter(([, init]) => init.headers.Authorization === "Bearer other-user-token")).toHaveLength(1);
    // 완료된 요청은 다음 열람에 공유하지 않는다.
    await peekActivityNarrative(request);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it.each([401, 403, 429, 500])("peek HTTP %s는 재시도나 callable로 우회하지 않는다", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { code: "denied", message: "denied" } }, status));
    vi.stubGlobal("fetch", fetchMock);
    await expect(peekActivityNarrative({ activityId: "denied", lang: "ko", cacheOnly: true })).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("peek 재시도는 최신 인증 및 App Check 토큰을 다시 가져온다", async () => {
    mocks.auth.currentUser!.getIdToken.mockResolvedValueOnce("old-token").mockResolvedValueOnce("fresh-token");
    mocks.getAppCheckToken.mockResolvedValueOnce("old-app-check").mockResolvedValueOnce("fresh-app-check");
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(jsonResponse({ hit: false }));
    vi.stubGlobal("fetch", fetchMock);
    await peekActivityNarrative({ activityId: "retry", lang: "ko", cacheOnly: true });
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ Authorization: "Bearer fresh-token", "X-Firebase-AppCheck": "fresh-app-check" });
  });

  it("동일 인증 객체로 재로그인해도 이전 세션의 진행 중 요청을 공유하지 않는다", async () => {
    let authChanged: ((user: typeof mocks.auth.currentUser) => void) | undefined;
    mocks.onAuthStateChanged.mockImplementation((_auth, next) => {
      authChanged = next;
      next(mocks.auth.currentUser);
      return vi.fn();
    });
    const firstUser = mocks.auth.currentUser;
    let release: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => {
      release = () => resolve(jsonResponse({ hit: false }));
    })).mockImplementation(() => Promise.resolve(jsonResponse({ hit: false })));
    vi.stubGlobal("fetch", fetchMock);
    const request = { activityId: "same-session", lang: "ko", cacheOnly: true } as const;
    const first = peekActivityNarrative(request);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    authChanged!(null);
    authChanged!(firstUser);
    await peekActivityNarrative(request);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    release!();
    await first;
  });

});
