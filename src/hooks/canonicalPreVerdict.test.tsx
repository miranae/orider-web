/**
 * 판정이 도착하기 **전에** 소비처가 이미 읽고 있지는 않은지 (#2237 리뷰).
 *
 * 이전 초기 상태는 `gateEnabled: false` 였다. 게이트가 켜져 있는 배포에서도 첫 렌더는
 * "게이트 없음" 으로 보였고 `canonicalRolloutAllows` 가 통과를 돌려주었다 — 그 한 프레임에
 * 소유자 지표 구독과 코스 정본 요청이 이미 나갔다. 서버가 나중에 "끄라" 고 답해도 요청은
 * 이미 나간 뒤다.
 *
 * 그래서 여기서 보는 것은 상태 문자열이 아니라 **바깥으로 나간 읽기가 있는가** 다.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { onSnapshot } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockCallableInvocations,
  setCallableImplementation,
  setCallableResult,
  simulateLogin,
  simulateLogout,
} from "../__tests__/mocks/firebase";
import { AuthContextProvider, type AuthContextValue } from "../contexts/AuthContext";
import { resetCanonicalRolloutCacheForTests } from "../services/canonicalRollout";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { fetchCourseAnalysis } from "../services/courseAnalysisReader";
import { useActivityMetrics } from "./useActivityMetrics";
import { useCourseAnalysis } from "./useCourseAnalysis";
import { useCanonicalRollout } from "./useCanonicalRollout";

vi.mock("../services/courseAnalysisReader", () => ({
  fetchCourseAnalysis: vi.fn(async () => ({
    schemaVersion: 1,
    algorithmVersion: "test",
    status: "canonical",
    computedAt: 1,
    inputRevision: null,
    inputDigest: null,
    period: null,
    data: {
      routeDigest: "d", distanceM: 1000, elevationGainM: 10,
      elevationLossM: 10, difficulty: 1, difficultyBand: "easy",
    },
    error: null,
  })),
}));

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

/** 영원히 답하지 않는 판정 — "판정 전" 창을 테스트가 붙잡아 둔다. */
function hangRolloutVerdict(): void {
  setCallableImplementation("getCanonicalRollout", () => new Promise(() => {}));
}

describe("판정 전에는 아무것도 읽지 않는다", () => {
  beforeEach(() => {
    resetCanonicalRolloutCacheForTests();
    mockCallableInvocations.length = 0;
    vi.mocked(onSnapshot).mockClear();
    vi.mocked(fetchCourseAnalysis).mockClear();
    simulateLogin({ uid: "u1" });
  });
  afterEach(() => {
    simulateLogout();
    resetRuntimeConfigForTests();
  });

  it("게이트가 켜져 있으면 첫 렌더부터 loading — 조용한 통과가 없다", () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    hangRolloutVerdict();
    const { result } = renderHook(() => useCanonicalRollout(), { wrapper: signedIn });
    expect(result.current.gateEnabled).toBe(true);
    expect(result.current.loading).toBe(true);
    expect(result.current.verdictOk).toBe(false);
  });

  it("소유자 지표는 판정 전에 Firestore 를 구독하지 않는다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    hangRolloutVerdict();
    const { result } = renderHook(() => useActivityMetrics("act-1", true), { wrapper: signedIn });
    expect(result.current.status).toBe("loading");
    expect(vi.mocked(onSnapshot)).not.toHaveBeenCalled();
    // 판정을 기다리는 동안 몇 프레임이 더 흘러도 마찬가지다.
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(onSnapshot)).not.toHaveBeenCalled();
  });

  it("판정이 도착한 뒤에야 구독한다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    const { result } = renderHook(() => useActivityMetrics("act-1", true), { wrapper: signedIn });
    await waitFor(() => expect(vi.mocked(onSnapshot)).toHaveBeenCalled());
    expect(result.current.status).not.toBe("disabled");
  });

  it("코스 정본은 판정 전에 요청하지 않는다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true, canonicalCourseEnabled: true });
    hangRolloutVerdict();
    renderHook(() => useCourseAnalysis("course-1"), { wrapper: signedIn });
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(fetchCourseAnalysis)).not.toHaveBeenCalled();
  });

  it("코스 정본은 판정이 켜짐으로 도착한 뒤에 요청한다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true, canonicalCourseEnabled: true });
    setCallableResult("getCanonicalRollout", { data: { surfaces: { course: true } } });
    renderHook(() => useCourseAnalysis("course-1"), { wrapper: signedIn });
    await waitFor(() => expect(vi.mocked(fetchCourseAnalysis)).toHaveBeenCalledWith("course-1"));
  });

  it("게이트 계층이 꺼져 있으면 오늘과 똑같다 — 판정을 기다리지 않고 바로 읽는다", async () => {
    resetRuntimeConfigForTests({ canonicalCourseEnabled: true });
    renderHook(() => useActivityMetrics("act-1", true), { wrapper: signedIn });
    renderHook(() => useCourseAnalysis("course-1"), { wrapper: signedIn });
    await waitFor(() => expect(vi.mocked(fetchCourseAnalysis)).toHaveBeenCalled());
    expect(vi.mocked(onSnapshot)).toHaveBeenCalled();
    expect(mockCallableInvocations).toEqual([]);
  });
});
