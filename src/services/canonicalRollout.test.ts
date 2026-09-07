import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  mockCallableInvocations,
  setCallableImplementation,
  setCallableResult,
  simulateLogin,
  simulateLogout,
} from "../__tests__/mocks/firebase";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import {
  CANONICAL_ROLLOUT_SURFACES,
  canonicalRolloutAllOff,
  canonicalRolloutGateEnabled,
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

  it("성공한 판정은 uid 당 한 번만 부른다", async () => {
    setCallableResult("getCanonicalRollout", { data: { surfaces: { activityDetail: true } } });
    expect((await loadCanonicalRolloutOnce("u1")).activityDetail).toBe(true);
    expect((await loadCanonicalRolloutOnce("u1")).activityDetail).toBe(true);
    expect(mockCallableInvocations.filter((call) => call.name === "getCanonicalRollout")).toHaveLength(1);
  });

  it("실패는 캐시하지 않는다 — 일시 장애가 세션 내내 화면을 끄면 안 된다", async () => {
    setCallableImplementation("getCanonicalRollout", () => {
      throw new Error("network");
    });
    expect(await loadCanonicalRolloutOnce("u1")).toEqual(canonicalRolloutAllOff());
    setCallableImplementation("getCanonicalRollout", () => ({ data: { surfaces: { homeSummary: true } } }));
    expect((await loadCanonicalRolloutOnce("u1")).homeSummary).toBe(true);
  });
});
