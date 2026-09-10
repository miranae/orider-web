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

/** 렌더마다 읽는다 — 값을 바꾸고 rerender 하면 계정 전환이 된다. */
let wrapperUid: string | null = "u1";

function signedInAs({ children }: { children: React.ReactNode }) {
  const value = {
    user: (wrapperUid === null ? null : { uid: wrapperUid }) as AuthContextValue["user"],
    profile: null,
    profileLoading: false,
    loading: false,
    signInWithGoogle: async () => {},
    logout: async () => {},
  } satisfies AuthContextValue;
  return <AuthContextProvider value={value}>{children}</AuthContextProvider>;
}

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

/**
 * 계정 전환 직후 (#2237 리뷰 2번).
 *
 * 판정은 계정별이다. A→B 첫 렌더에서 A 의 허용을 그대로 쓰면 그 프레임에 B 의 화면이 이미
 * 읽기를 시작한다 — uid 변경 처리는 effect 라서 B 의 판정보다 렌더가 먼저다. 그래서 여기서도
 * 보는 것은 상태가 아니라 **바깥으로 나간 읽기** 다.
 */
describe("계정이 바뀌면 판정도 다시 받는다", () => {
  beforeEach(() => {
    resetCanonicalRolloutCacheForTests();
    mockCallableInvocations.length = 0;
    vi.mocked(onSnapshot).mockClear();
    vi.mocked(fetchCourseAnalysis).mockClear();
    wrapperUid = "u1";
    simulateLogin({ uid: "u1" });
  });
  afterEach(() => {
    wrapperUid = "u1";
    simulateLogout();
    resetRuntimeConfigForTests();
  });

  it("전환 첫 렌더는 이전 계정의 허용을 재사용하지 않는다 — 판정 전이다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    const { result, rerender } = renderHook(() => useCanonicalRollout(), { wrapper: signedInAs });
    await waitFor(() => expect(result.current.verdictOk).toBe(true));

    hangRolloutVerdict();
    wrapperUid = "u2";
    simulateLogin({ uid: "u2" });
    rerender();
    expect(result.current.loading).toBe(true);
    expect(result.current.verdictOk).toBe(false);
    expect(result.current.surfaces.activityDetail).toBe(false);
  });

  it("로그아웃도 판정 전이다 — 직전 계정의 허용이 남지 않는다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    const { result, rerender } = renderHook(() => useCanonicalRollout(), { wrapper: signedInAs });
    await waitFor(() => expect(result.current.verdictOk).toBe(true));

    wrapperUid = null;
    simulateLogout();
    rerender();
    expect(result.current.verdictOk).toBe(false);
    expect(result.current.surfaces.activityDetail).toBe(false);
  });

  it("소유자 지표는 전환 직후 새 활동을 구독하지 않는다 — B 의 판정 전이다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useActivityMetrics(id, true),
      { wrapper: signedInAs, initialProps: { id: "act-1" } },
    );
    await waitFor(() => expect(vi.mocked(onSnapshot)).toHaveBeenCalled());

    vi.mocked(onSnapshot).mockClear();
    // B 의 판정은 오지 않는다 — 그동안 아무 구독도 나가면 안 된다.
    hangRolloutVerdict();
    wrapperUid = "u2";
    simulateLogin({ uid: "u2" });
    rerender({ id: "act-2" });
    expect(vi.mocked(onSnapshot)).not.toHaveBeenCalled();
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(onSnapshot)).not.toHaveBeenCalled();
  });

  it("코스 정본은 전환 직후 요청하지 않고, B 의 판정이 켜짐으로 오면 그때 읽는다", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true, canonicalCourseEnabled: true });
    setCallableResult("getCanonicalRollout", { data: { surfaces: { course: true } } });
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useCourseAnalysis(id),
      { wrapper: signedInAs, initialProps: { id: "course-1" } },
    );
    await waitFor(() => expect(vi.mocked(fetchCourseAnalysis)).toHaveBeenCalledWith("course-1"));

    vi.mocked(fetchCourseAnalysis).mockClear();
    let releaseVerdict: (() => void) | null = null;
    setCallableImplementation("getCanonicalRollout", () => new Promise((resolve) => {
      releaseVerdict = () => resolve({ data: { surfaces: { course: true } } });
    }));
    wrapperUid = "u2";
    simulateLogin({ uid: "u2" });
    rerender({ id: "course-2" });
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(fetchCourseAnalysis)).not.toHaveBeenCalled();

    // 판정이 도착하면 막힌 채로 남지 않는다.
    await act(async () => { releaseVerdict!(); await Promise.resolve(); });
    await waitFor(() => expect(vi.mocked(fetchCourseAnalysis)).toHaveBeenCalledWith("course-2"));
  });
});
