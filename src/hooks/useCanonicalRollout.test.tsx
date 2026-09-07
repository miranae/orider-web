import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
