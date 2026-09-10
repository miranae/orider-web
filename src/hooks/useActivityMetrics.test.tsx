import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import {
  mockCallableInvocations,
  mockDocData,
  setCallableImplementation,
  setCallableResult,
  setDocData,
  simulateLogin,
  simulateLogout,
} from "../__tests__/mocks/firebase";
import { AuthContextProvider, type AuthContextValue } from "../contexts/AuthContext";
import {
  expireCanonicalRolloutCacheForTests,
  resetCanonicalRolloutCacheForTests,
} from "../services/canonicalRollout";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { fromPublicActivityMetrics, useActivityMetrics } from "./useActivityMetrics";

function signedIn({ children }: { children: React.ReactNode }) {
  const value = {
    user: { uid: "u1" } as AuthContextValue["user"],
    profile: null,
    profileLoading: false,
    loading: false,
    signInWithGoogle: async () => {},
    logout: async () => {},
  } satisfies AuthContextValue;
  return <AuthContextProvider value={value}>{children}</AuthContextProvider>;
}

function signedOut({ children }: { children: React.ReactNode }) {
  const value = {
    user: null,
    profile: null,
    profileLoading: false,
    loading: false,
    signInWithGoogle: async () => {},
    logout: async () => {},
  } satisfies AuthContextValue;
  return <AuthContextProvider value={value}>{children}</AuthContextProvider>;
}

/**
 * 훅 헤더가 약속한 4상태(loading/missing/stale/ready)가 실제로 나오는지.
 * stale 은 값을 버리지 않는다 — 모름을 없음으로 그리지 않기 위해 last-known-good 을 들고 온다.
 */
describe("useActivityMetrics", () => {
  beforeEach(() => {
    mockDocData.clear();
  });

  it("문서가 없으면 missing", async () => {
    const { result } = renderHook(() => useActivityMetrics("act-missing"));
    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(result.current.metrics).toBeNull();
  });

  it("소유자는 정본을, 비소유자는 공개 projection 을 읽는다", async () => {
    setDocData("activity_metrics/act-1", { version: ACTIVITY_METRICS_VERSION, tss: 42, distanceKm: 30 });
    setDocData("activity_metrics_public/act-1", { version: ACTIVITY_METRICS_VERSION, distanceKm: 30 });

    const owner = renderHook(() => useActivityMetrics("act-1", true));
    await waitFor(() => expect(owner.result.current.status).toBe("ready"));
    expect(owner.result.current.metrics?.tss).toBe(42);

    const viewer = renderHook(() => useActivityMetrics("act-1", false));
    await waitFor(() => expect(viewer.result.current.status).toBe("ready"));
    expect(viewer.result.current.metrics?.distanceKm).toBe(30);
    // owner-only 필드는 공개 문서에 없다 — 0 이 아니라 undefined 다.
    expect(viewer.result.current.metrics?.tss).toBeUndefined();
  });

  it("비소유자는 공개 문서가 없으면 missing — 권한 오류가 아니다", async () => {
    setDocData("activity_metrics/act-2", { version: ACTIVITY_METRICS_VERSION, tss: 42 });
    const { result } = renderHook(() => useActivityMetrics("act-2", false));
    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(result.current.metrics).toBeNull();
  });

  it("공개 문서의 민감 필드는 화이트리스트에서 걸러진다", async () => {
    setDocData("activity_metrics_public/act-3", {
      version: ACTIVITY_METRICS_VERSION,
      distanceKm: 12,
      contextSnapshot: { ftp: 250, weightKg: 70 },
      ftp: 250,
      climbs: [{ avgPower: 260 }],
    });
    const { result } = renderHook(() => useActivityMetrics("act-3", false));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.metrics?.distanceKm).toBe(12);
    expect(result.current.metrics?.contextSnapshot).toBeUndefined();
    expect(result.current.metrics?.ftp).toBeUndefined();
    expect(result.current.metrics?.climbs).toBeUndefined();
  });

  it("공개 projection 은 허용된 파워·심박·사이클링 다이내믹스만 보존한다", () => {
    const cyclingDynamics = {
      source: "records",
      sampleCount: 10,
      validSampleCount: 9,
      coverage: 0.9,
      balance: { leftAvgPct: 49, rightAvgPct: 51, asymmetryPct: 2 },
    };
    const publicMetrics = fromPublicActivityMetrics({
      version: ACTIVITY_METRICS_VERSION,
      np: 240,
      avgPower: 220,
      avgHr: 148,
      cyclingDynamics,
      lrBalance: { avg: 51, asymmetryPct: 2 },
      contextSnapshot: { ftp: 250, weightKg: 70 },
      powerCurve: { "5s": 900 },
    });

    expect(publicMetrics).toMatchObject({
      np: 240,
      avgPower: 220,
      avgHr: 148,
      cyclingDynamics,
      lrBalance: { avg: 51, asymmetryPct: 2 },
    });
    expect(publicMetrics.contextSnapshot).toBeUndefined();
    expect(publicMetrics.powerCurve).toBeUndefined();
  });

  it("현재 버전이면 ready", async () => {
    setDocData("activity_metrics/act-ready", { version: ACTIVITY_METRICS_VERSION, tss: 42 });
    const { result } = renderHook(() => useActivityMetrics("act-ready"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.metrics?.tss).toBe(42);
  });

  it("버전이 낮으면 stale 이지만 값은 그대로 들고 온다", async () => {
    setDocData("activity_metrics/act-stale", { version: ACTIVITY_METRICS_VERSION - 1, tss: 42 });
    const { result } = renderHook(() => useActivityMetrics("act-stale"));
    await waitFor(() => expect(result.current.status).toBe("stale"));
    expect(result.current.metrics?.tss).toBe(42);
  });

  it("version 필드가 없는 옛 문서는 stale — 모름을 최신으로 그리지 않는다", async () => {
    setDocData("activity_metrics/act-noversion", { tss: 42 });
    const { result } = renderHook(() => useActivityMetrics("act-noversion"));
    await waitFor(() => expect(result.current.status).toBe("stale"));
    expect(result.current.metrics?.tss).toBe(42);
  });

  it("version 이 숫자가 아니면(문자열 등) stale", async () => {
    setDocData("activity_metrics/act-badversion", { version: "3", tss: 42 });
    const { result } = renderHook(() => useActivityMetrics("act-badversion"));
    await waitFor(() => expect(result.current.status).toBe("stale"));
  });
});

/**
 * kill switch (#2442). 끄는 대상은 **소유자의 정본 소비 경로** 다 — 공개 뷰어의 화면까지
 * 끄면 남의 활동을 보던 사람에게는 사고가 아닌데도 빈 화면이 된다.
 */
describe("useActivityMetrics 전환 kill switch", () => {
  beforeEach(() => {
    mockDocData.clear();
    resetCanonicalRolloutCacheForTests();
    simulateLogin({ uid: "u1" });
    setDocData("activity_metrics/act-k", { version: ACTIVITY_METRICS_VERSION, tss: 42 });
    setDocData("activity_metrics_public/act-k", { version: ACTIVITY_METRICS_VERSION, distanceKm: 30 });
  });
  afterEach(() => {
    simulateLogout();
    resetRuntimeConfigForTests();
  });

  it("서버가 activityDetail 을 끄면 소유자는 disabled", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: false } } });
    const { result } = renderHook(() => useActivityMetrics("act-k", true), { wrapper: signedIn });
    await waitFor(() => expect(result.current.status).toBe("disabled"));
    expect(result.current.metrics).toBeNull();
  });

  it("서버가 켜 주면 소유자는 정본을 그대로 읽는다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    const { result } = renderHook(() => useActivityMetrics("act-k", true), { wrapper: signedIn });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.metrics?.tss).toBe(42);
  });

  it("게이트 계층이 꺼져 있으면 소유자 화면은 오늘과 같다", async () => {
    resetRuntimeConfigForTests({});
    const { result } = renderHook(() => useActivityMetrics("act-k", true), { wrapper: signedIn });
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});


/**
 * kill switch 는 **전량 정지**여야 한다. 소유자만 멈추고 남의 공개 활동 상세가 계속 정본 파생
 * 문서를 그리면 전량 정지가 전량이 아니다 (#2237 리뷰).
 *
 * 다만 "서버가 껐다" 와 "판정이 아예 없다" 는 다르다 — 비로그인 방문자는 판정 대상이 아니므로
 * 공개 활동 읽기를 막지 않는다.
 */
describe("useActivityMetrics — activityDetail kill switch 범위", () => {
  beforeEach(() => {
    mockDocData.clear();
    resetCanonicalRolloutCacheForTests();
    simulateLogin({ uid: "u1" });
    setDocData("activity_metrics/act-k", { version: ACTIVITY_METRICS_VERSION, tss: 42, distanceKm: 30 });
    setDocData("activity_metrics_public/act-k", { version: ACTIVITY_METRICS_VERSION, distanceKm: 30 });
  });
  afterEach(() => {
    simulateLogout();
    resetRuntimeConfigForTests();
  });

  it("면이 꺼지면 공개 뷰어도 중단 상태다 — 공개 projection 을 그리지 않는다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    const { result } = renderHook(() => useActivityMetrics("act-k", false), { wrapper: signedIn });
    await waitFor(() => expect(result.current.status).toBe("disabled"));
    expect(result.current.metrics).toBeNull();
  });

  it("면이 켜져 있으면 공개 뷰어는 오늘처럼 공개 projection 을 본다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    const { result } = renderHook(() => useActivityMetrics("act-k", false), { wrapper: signedIn });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.metrics?.distanceKm).toBe(30);
    expect(result.current.metrics?.tss).toBeUndefined();
  });

  it("게이트 계층이 꺼져 있으면 오늘과 똑같다 — 소유자도 공개 뷰어도 읽는다", async () => {
    resetRuntimeConfigForTests({});
    const owner = renderHook(() => useActivityMetrics("act-k", true), { wrapper: signedIn });
    await waitFor(() => expect(owner.result.current.status).toBe("ready"));
    const viewer = renderHook(() => useActivityMetrics("act-k", false), { wrapper: signedIn });
    await waitFor(() => expect(viewer.result.current.status).toBe("ready"));
  });

  it("판정이 없는 비로그인 방문자는 공개 활동을 계속 읽는다 — 없는 판정은 꺼짐이 아니다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    simulateLogout();
    const { result } = renderHook(() => useActivityMetrics("act-k", false), { wrapper: signedOut });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.metrics?.distanceKm).toBe(30);
  });

  it("판정 조회가 실패하면 소유자 정본은 꺼짐(fail-closed) 이다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    setCallableImplementation("getCanonicalRollout", () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useActivityMetrics("act-k", true), { wrapper: signedIn });
    await waitFor(() => expect(result.current.status).toBe("disabled"));
  });
});

/**
 * 꺼짐을 한 번 본 면은 **실패로 되살아나지 않는다** (#2237 리뷰 3번).
 *
 * 공개 뷰어 차단이 `verdictOk` 에만 걸려 있어서, 꺼짐 판정 뒤 TTL 재조회가 실패하면
 * `verdictOk` 가 false 로 떨어지고 차단이 풀렸다 — kill switch 를 내렸는데 장애 한 번에
 * 공개 지표 구독이 되살아난다. 다음 **성공한** 판정만 차단을 풀 수 있다.
 */
describe("useActivityMetrics — 꺼짐은 실패로 풀리지 않는다(sticky)", () => {
  const verdictCalls = () =>
    mockCallableInvocations.filter((call) => call.name === "getCanonicalRollout").length;

  beforeEach(() => {
    mockDocData.clear();
    resetCanonicalRolloutCacheForTests();
    mockCallableInvocations.length = 0;
    simulateLogin({ uid: "u1" });
    setDocData("activity_metrics/act-s", { version: ACTIVITY_METRICS_VERSION, tss: 42, distanceKm: 30 });
    setDocData("activity_metrics_public/act-s", { version: ACTIVITY_METRICS_VERSION, distanceKm: 30 });
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
  });
  afterEach(() => {
    simulateLogout();
    resetRuntimeConfigForTests();
  });

  /** TTL 이 지난 뒤 창 포커스로 재조회를 일으킨다 — 훅이 실제로 쓰는 경로다. */
  async function refetchVerdict(): Promise<void> {
    const before = verdictCalls();
    expireCanonicalRolloutCacheForTests();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    await waitFor(() => expect(verdictCalls()).toBe(before + 1));
    await act(async () => { await Promise.resolve(); });
  }

  it("꺼짐 뒤 재조회가 실패해도 공개 뷰어는 계속 막힌다", async () => {
    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    const { result } = renderHook(() => useActivityMetrics("act-s", false), { wrapper: signedIn });
    await waitFor(() => expect(result.current.status).toBe("disabled"));

    setCallableImplementation("getCanonicalRollout", () => { throw new Error("boom"); });
    await refetchVerdict();

    expect(result.current.status).toBe("disabled");
    expect(result.current.metrics).toBeNull();
  });

  it("성공한 켜짐 판정은 차단을 푼다 — 영구 차단이 아니다", async () => {
    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    const { result } = renderHook(() => useActivityMetrics("act-s", false), { wrapper: signedIn });
    await waitFor(() => expect(result.current.status).toBe("disabled"));

    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    await refetchVerdict();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.metrics?.distanceKm).toBe(30);
  });

  it("같은 세션에서 꺼짐을 본 뒤 로그아웃해도 막힌다 — 로그아웃으로 빠져나갈 수 없다", async () => {
    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    const signedInViewer = renderHook(() => useActivityMetrics("act-s", false), { wrapper: signedIn });
    await waitFor(() => expect(signedInViewer.result.current.status).toBe("disabled"));

    simulateLogout();
    const anonymous = renderHook(() => useActivityMetrics("act-s", false), { wrapper: signedOut });
    await act(async () => { await Promise.resolve(); });
    expect(anonymous.result.current.status).toBe("disabled");
  });
});
