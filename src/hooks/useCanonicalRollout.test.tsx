import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockCallableInvocations,
  setCallableImplementation,
  setCallableResult,
  simulateLogin,
  simulateLogout,
} from "../__tests__/mocks/firebase";
import { AuthContextProvider, type AuthContextValue } from "../contexts/AuthContext";
import {
  CANONICAL_ROLLOUT_CACHE_TTL_MS,
  resetCanonicalRolloutCacheForTests,
} from "../services/canonicalRollout";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { useCanonicalRollout, useCanonicalSurfaceEnabled } from "./useCanonicalRollout";

function withUser(uid: string | null) {
  const value = {
    user: uid ? ({ uid } as AuthContextValue["user"]) : null,
    profile: null,
    profileLoading: false,
    loading: false,
    signInWithGoogle: async () => {},
    logout: async () => {},
  } satisfies AuthContextValue;
  return ({ children }: { children: React.ReactNode }) => (
    <AuthContextProvider value={value}>{children}</AuthContextProvider>
  );
}

describe("useCanonicalRollout", () => {
  beforeEach(() => {
    resetCanonicalRolloutCacheForTests();
    mockCallableInvocations.length = 0;
    simulateLogin({ uid: "u1" });
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
  });
  afterEach(() => {
    simulateLogout();
    resetRuntimeConfigForTests();
  });

  it("게이트 계층이 꺼져 있으면 서버에 묻지 않는다", async () => {
    resetRuntimeConfigForTests({});
    const { result } = renderHook(() => useCanonicalRollout(), { wrapper: withUser("u1") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.gateEnabled).toBe(false);
    expect(mockCallableInvocations).toEqual([]);
  });

  it("면마다 따로 켜진다", async () => {
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true, weather: true } } });
    const { result } = renderHook(() => useCanonicalRollout(), { wrapper: withUser("u1") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.surfaces.activityDetail).toBe(true);
    expect(result.current.surfaces.weather).toBe(true);
    expect(result.current.surfaces.trainingDecision).toBe(false);
  });

  it("호출 실패는 전부 꺼짐 (fail-closed)", async () => {
    setCallableImplementation("getCanonicalRollout", () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useCanonicalRollout(), { wrapper: withUser("u1") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.surfaces.activityDetail).toBe(false);
  });

  it("판정을 받으면 verdictOk 가 참 — 실패와 \"서버가 껐다\" 를 구분한다", async () => {
    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    const { result } = renderHook(() => useCanonicalRollout(), { wrapper: withUser("u1") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.verdictOk).toBe(true);
    expect(result.current.surfaces.activityDetail).toBe(false);
  });

  it("미로그인은 판정 대상이 아니다 — 묻지 않고 꺼짐", async () => {
    const { result } = renderHook(() => useCanonicalRollout(), { wrapper: withUser(null) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.surfaces.milestones).toBe(false);
    expect(mockCallableInvocations).toEqual([]);
  });
});

/** stage 4 네 면은 빌드 플래그 AND 서버 판정이다. 로컬 스위치가 언제나 이긴다. */
describe("useCanonicalSurfaceEnabled", () => {
  beforeEach(() => {
    resetCanonicalRolloutCacheForTests();
    mockCallableInvocations.length = 0;
    simulateLogin({ uid: "u1" });
    setCallableResult("getCanonicalRollout", { data: { surfaces: { milestones: true, course: false } } });
  });
  afterEach(() => {
    simulateLogout();
    resetRuntimeConfigForTests();
  });

  it("빌드 플래그가 꺼져 있으면 서버가 켜도 꺼짐", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    const { result } = renderHook(() => useCanonicalSurfaceEnabled("milestones"), { wrapper: withUser("u1") });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("빌드 플래그가 켜져도 서버가 껐으면 꺼짐", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true, canonicalCourseEnabled: true });
    const { result } = renderHook(() => useCanonicalSurfaceEnabled("course"), { wrapper: withUser("u1") });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("둘 다 켜지면 켜짐", async () => {
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true, canonicalMilestonesEnabled: true });
    const { result } = renderHook(() => useCanonicalSurfaceEnabled("milestones"), { wrapper: withUser("u1") });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("게이트 계층이 꺼져 있으면 빌드 플래그만으로 결정된다 — callable 배포 전 회귀 방지", async () => {
    resetRuntimeConfigForTests({ canonicalMilestonesEnabled: true });
    const { result } = renderHook(() => useCanonicalSurfaceEnabled("milestones"), { wrapper: withUser("u1") });
    await waitFor(() => expect(result.current).toBe(true));
    expect(mockCallableInvocations).toEqual([]);
  });
});

/**
 * kill switch 가 **이미 열려 있는 탭**에 닿는지. 마운트 때 한 번만 묻고 세션 내내 캐시하면
 * 사고 대응으로 서버를 뒤집어도 열린 탭은 새로고침 전까지 그대로다 (#2237 리뷰).
 */
describe("useCanonicalRollout 재조회 — kill switch 전달 경로", () => {
  beforeEach(() => {
    resetCanonicalRolloutCacheForTests();
    mockCallableInvocations.length = 0;
    simulateLogin({ uid: "u1" });
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true, canonicalMilestonesEnabled: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    simulateLogout();
    resetRuntimeConfigForTests();
  });

  function rolloutCalls(): number {
    return mockCallableInvocations.filter((call) => call.name === "getCanonicalRollout").length;
  }

  /** 첫 판정이 도착할 때까지 microtask 를 흘린다 (가짜 타이머 아래에서도 안전). */
  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("주기 갱신만으로도 kill switch 가 마운트된 소비처에 닿는다", async () => {
    vi.useFakeTimers();
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true, milestones: true } } });
    const { result } = renderHook(() => useCanonicalRollout(), { wrapper: withUser("u1") });
    await settle();
    expect(result.current.surfaces.activityDetail).toBe(true);

    // 서버에서 killSwitch 를 올렸다 — 전부 꺼짐이 내려온다.
    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    await act(async () => {
      vi.advanceTimersByTime(CANONICAL_ROLLOUT_CACHE_TTL_MS + 1);
    });
    await settle();
    expect(result.current.surfaces.activityDetail).toBe(false);
    expect(result.current.surfaces.milestones).toBe(false);
  });

  it("탭이 다시 보이면 그 자리에서 다시 묻는다", async () => {
    vi.useFakeTimers();
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    const { result } = renderHook(() => useCanonicalRollout(), { wrapper: withUser("u1") });
    await settle();
    expect(rolloutCalls()).toBe(1);

    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    // 주기 타이머는 건드리지 않고 시계만 민다 — visibilitychange 하나만으로 도는지 본다.
    vi.setSystemTime(Date.now() + CANONICAL_ROLLOUT_CACHE_TTL_MS + 1);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle();
    expect(rolloutCalls()).toBe(2);
    expect(result.current.surfaces.activityDetail).toBe(false);
  });

  it("창이 포커스를 받으면 그 자리에서 다시 묻는다", async () => {
    vi.useFakeTimers();
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    const { result } = renderHook(() => useCanonicalRollout(), { wrapper: withUser("u1") });
    await settle();

    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    vi.setSystemTime(Date.now() + CANONICAL_ROLLOUT_CACHE_TTL_MS + 1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await settle();
    expect(rolloutCalls()).toBe(2);
    expect(result.current.surfaces.activityDetail).toBe(false);
  });

  it("TTL 안의 포커스는 서버를 다시 때리지 않는다 — 캐시 수명이 호출량을 막는다", async () => {
    vi.useFakeTimers();
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    renderHook(() => useCanonicalRollout(), { wrapper: withUser("u1") });
    await settle();
    expect(rolloutCalls()).toBe(1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle();
    expect(rolloutCalls()).toBe(1);
  });

  it("전량 켜짐 → kill switch 는 이미 마운트된 소비처(useCanonicalSurfaceEnabled)까지 내려간다", async () => {
    vi.useFakeTimers();
    setCallableResult("getCanonicalRollout", { data: { surfaces: { milestones: true } } });
    const { result } = renderHook(() => useCanonicalSurfaceEnabled("milestones"), { wrapper: withUser("u1") });
    await settle();
    expect(result.current).toBe(true);

    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    await act(async () => {
      vi.advanceTimersByTime(CANONICAL_ROLLOUT_CACHE_TTL_MS + 1);
    });
    await settle();
    expect(result.current).toBe(false);
  });

  /**
   * 최악 지연을 못 박는다 (#2237 리뷰 4번).
   *
   * 캐시 만료는 **조회 시각** 기준인데 갱신 주기는 **마운트 시각** 기준이었다. 만료 1초 전에
   * 마운트한 훅은 남은 1초 + 60초 = 약 120초 동안 낡은 판정을 들고 있었다 — 문서가 약속한
   * 60초의 두 배다. 이제 갱신은 만료 시각에 맞춰 예약된다.
   */
  it("만료 직전에 마운트해도 남은 수명 안에 새 판정을 받는다 — 최악 지연은 TTL 하나다", async () => {
    vi.useFakeTimers();
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    // 첫 훅이 판정을 받아 캐시를 채운다(만료 = 지금 + TTL).
    renderHook(() => useCanonicalRollout(), { wrapper: withUser("u1") });
    await settle();
    expect(rolloutCalls()).toBe(1);

    // 만료 1초 전에 새 화면이 마운트한다 — 캐시 적중이라 서버를 다시 때리지 않는다.
    vi.setSystemTime(Date.now() + CANONICAL_ROLLOUT_CACHE_TTL_MS - 1_000);
    const late = renderHook(() => useCanonicalRollout(), { wrapper: withUser("u1") });
    await settle();
    expect(late.result.current.surfaces.activityDetail).toBe(true);
    expect(rolloutCalls()).toBe(1);

    // 서버에서 kill switch 를 올렸다. 남은 수명(1초)만 지나면 늦게 마운트한 훅도 알아야 한다.
    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    await act(async () => {
      vi.advanceTimersByTime(1_001);
    });
    await settle();
    expect(late.result.current.surfaces.activityDetail).toBe(false);
  });

  it("언마운트하면 리스너와 타이머를 걷는다 — 화면을 떠난 뒤 서버를 때리지 않는다", async () => {
    vi.useFakeTimers();
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    const { unmount } = renderHook(() => useCanonicalRollout(), { wrapper: withUser("u1") });
    await settle();
    expect(rolloutCalls()).toBe(1);
    unmount();
    vi.setSystemTime(Date.now() + CANONICAL_ROLLOUT_CACHE_TTL_MS + 1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(CANONICAL_ROLLOUT_CACHE_TTL_MS * 3);
    });
    await settle();
    expect(rolloutCalls()).toBe(1);
  });
});
