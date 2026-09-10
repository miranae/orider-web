import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockCallableInvocations,
  setCallableImplementation,
  setCallableResult,
  simulateLogin,
  simulateLogout,
} from "../__tests__/mocks/firebase";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import {
  CANONICAL_ROLLOUT_CACHE_TTL_MS,
  CANONICAL_ROLLOUT_SURFACES,
  canonicalRolloutAllOff,
  canonicalRolloutGateEnabled,
  canonicalRolloutObservedOff,
  fetchCanonicalRollout,
  loadCanonicalRolloutOnce,
  parseCanonicalRolloutSurfaces,
  resetCanonicalRolloutCacheForTests,
} from "./canonicalRollout";

/**
 * 이 reader 의 유일한 안전 규칙은 fail-closed 다 — 서버 판정을 못 받았으면 전부 꺼짐이다.
 * 켜진 쪽으로 기울면 설정 조회 장애 하나가 전량 전환이 된다.
 */
describe("canonicalRollout", () => {
  beforeEach(() => {
    resetCanonicalRolloutCacheForTests();
    mockCallableInvocations.length = 0;
    simulateLogin({ uid: "u1" });
  });
  afterEach(() => {
    simulateLogout();
    resetRuntimeConfigForTests();
  });

  it("게이트 계층은 기본 꺼짐 — 켜기 전까지 서버에 묻지 않는다", () => {
    resetRuntimeConfigForTests({});
    expect(canonicalRolloutGateEnabled()).toBe(false);
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    expect(canonicalRolloutGateEnabled()).toBe(true);
  });

  it("서버 응답의 true 만 켜짐 — 나머지 모양은 전부 꺼짐", () => {
    expect(parseCanonicalRolloutSurfaces({ surfaces: { activityDetail: true, weather: "true" } }))
      .toEqual({ ...canonicalRolloutAllOff(), activityDetail: true });
    expect(parseCanonicalRolloutSurfaces(null)).toEqual(canonicalRolloutAllOff());
    expect(parseCanonicalRolloutSurfaces({ surfaces: [] })).toEqual(canonicalRolloutAllOff());
    expect(parseCanonicalRolloutSurfaces({})).toEqual(canonicalRolloutAllOff());
  });

  it("모르는 면 이름은 무시한다 — 아는 일곱 면만 판정에 든다", () => {
    const surfaces = parseCanonicalRolloutSurfaces({ surfaces: { somethingNew: true, course: true } });
    expect(Object.keys(surfaces).sort()).toEqual([...CANONICAL_ROLLOUT_SURFACES].sort());
    expect(surfaces.course).toBe(true);
  });

  it("호출이 실패하면 전부 꺼짐으로 답한다 (fail-closed)", async () => {
    setCallableImplementation("getCanonicalRollout", () => {
      throw new Error("unavailable");
    });
    const result = await fetchCanonicalRollout("u1");
    expect(result.ok).toBe(false);
    expect(result.surfaces).toEqual(canonicalRolloutAllOff());
  });

  it("기대한 uid 가 아니면 부르지 않고 꺼짐으로 답한다", async () => {
    const result = await fetchCanonicalRollout("someone-else");
    expect(result.ok).toBe(false);
    expect(mockCallableInvocations).toEqual([]);
  });

  it("성공한 판정은 TTL 안에서 uid 당 한 번만 부른다", async () => {
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    expect((await loadCanonicalRolloutOnce("u1")).surfaces.activityDetail).toBe(true);
    expect((await loadCanonicalRolloutOnce("u1")).surfaces.activityDetail).toBe(true);
    expect(mockCallableInvocations.filter((call) => call.name === "getCanonicalRollout")).toHaveLength(1);
  });

  it("캐시는 TTL 뒤 만료된다 — kill switch 가 열린 세션에 닿는 경로다", async () => {
    vi.useFakeTimers();
    try {
      setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
      expect((await loadCanonicalRolloutOnce("u1")).surfaces.activityDetail).toBe(true);

      // 서버가 kill switch 를 내렸다 — 전부 꺼짐이 내려온다.
      setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
      // TTL 이 지나기 전에는 아직 옛 판정이다.
      vi.advanceTimersByTime(CANONICAL_ROLLOUT_CACHE_TTL_MS - 1);
      expect((await loadCanonicalRolloutOnce("u1")).surfaces.activityDetail).toBe(true);
      expect(mockCallableInvocations.filter((call) => call.name === "getCanonicalRollout")).toHaveLength(1);

      vi.advanceTimersByTime(2);
      expect((await loadCanonicalRolloutOnce("u1")).surfaces.activityDetail).toBe(false);
      expect(mockCallableInvocations.filter((call) => call.name === "getCanonicalRollout")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("실패는 캐시하지 않는다 — 일시 장애가 세션 내내 화면을 끄면 안 된다", async () => {
    setCallableImplementation("getCanonicalRollout", () => {
      throw new Error("network");
    });
    const failed = await loadCanonicalRolloutOnce("u1");
    expect(failed.ok).toBe(false);
    expect(failed.surfaces).toEqual(canonicalRolloutAllOff());
    setCallableImplementation("getCanonicalRollout", () => ({ data: { surfaces: { homeSummary: true } } }));
    expect((await loadCanonicalRolloutOnce("u1")).surfaces.homeSummary).toBe(true);
  });

  it("만료된 캐시 위에서 실패하면 옛 판정을 되살리지 않는다 (fail-closed)", async () => {
    vi.useFakeTimers();
    try {
      setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
      await loadCanonicalRolloutOnce("u1");
      vi.advanceTimersByTime(CANONICAL_ROLLOUT_CACHE_TTL_MS + 1);
      setCallableImplementation("getCanonicalRollout", () => {
        throw new Error("network");
      });
      expect((await loadCanonicalRolloutOnce("u1")).surfaces).toEqual(canonicalRolloutAllOff());
      // 지운 뒤이므로 다음 호출도 캐시를 믿지 않는다.
      expect((await loadCanonicalRolloutOnce("u1")).surfaces).toEqual(canonicalRolloutAllOff());
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * 세션 기록: **성공한 판정이 꺼짐이라고 말한 면**. 실패도, 로그아웃도 이 답을 바꾸지 않는다 —
 * 다음 성공한 판정만 바꾼다 (#2237 리뷰 3번).
 */
describe("canonicalRolloutObservedOff", () => {
  beforeEach(() => {
    resetCanonicalRolloutCacheForTests();
    mockCallableInvocations.length = 0;
    resetRuntimeConfigForTests({ canonicalRolloutEnabled: true });
    simulateLogin({ uid: "u1" });
  });
  afterEach(() => {
    simulateLogout();
    resetRuntimeConfigForTests();
  });

  it("판정을 받기 전에는 기록이 없다 — 없는 판정은 꺼짐이 아니다", () => {
    expect(canonicalRolloutObservedOff("activityDetail")).toBe(false);
  });

  it("성공한 꺼짐 판정은 기록되고, 그 뒤 실패가 기록을 지우지 않는다", async () => {
    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    await fetchCanonicalRollout("u1");
    expect(canonicalRolloutObservedOff("activityDetail")).toBe(true);

    setCallableImplementation("getCanonicalRollout", () => { throw new Error("boom"); });
    const failed = await fetchCanonicalRollout("u1");
    expect(failed.ok).toBe(false);
    expect(canonicalRolloutObservedOff("activityDetail")).toBe(true);
  });

  it("성공한 켜짐 판정은 기록을 지운다 — 영구 차단이 아니다", async () => {
    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    await fetchCanonicalRollout("u1");
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    await fetchCanonicalRollout("u1");
    expect(canonicalRolloutObservedOff("activityDetail")).toBe(false);
    // 판정에 없던 면은 여전히 꺼짐 기록이다.
    expect(canonicalRolloutObservedOff("course")).toBe(true);
  });

  it("로그아웃해도 기록은 남는다 — 미로그인으로 kill switch 를 빠져나갈 수 없다", async () => {
    setCallableResult("getCanonicalRollout", { data: { surfaces: {} } });
    await fetchCanonicalRollout("u1");
    simulateLogout();
    expect(canonicalRolloutObservedOff("activityDetail")).toBe(true);
  });
});
