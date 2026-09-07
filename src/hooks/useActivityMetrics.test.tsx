import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import {
  mockDocData,
  setCallableResult,
  setDocData,
  simulateLogin,
  simulateLogout,
} from "../__tests__/mocks/firebase";
import { AuthContextProvider, type AuthContextValue } from "../contexts/AuthContext";
import { resetCanonicalRolloutCacheForTests } from "../services/canonicalRollout";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { useActivityMetrics } from "./useActivityMetrics";

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
      np: 240,
    });
    const { result } = renderHook(() => useActivityMetrics("act-3", false));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.metrics?.distanceKm).toBe(12);
    expect(result.current.metrics?.contextSnapshot).toBeUndefined();
    expect(result.current.metrics?.np).toBeUndefined();
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

  it("kill switch 중에도 공개 뷰어는 공개 문서를 계속 본다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: false } } });
    const { result } = renderHook(() => useActivityMetrics("act-k", false), { wrapper: signedIn });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.metrics?.distanceKm).toBe(30);
  });

  it("게이트 계층이 꺼져 있으면 소유자 화면은 오늘과 같다", async () => {
    resetRuntimeConfigForTests({});
    const { result } = renderHook(() => useActivityMetrics("act-k", true), { wrapper: signedIn });
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});
