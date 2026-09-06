import { describe, expect, it } from "vitest";
import { canonicalDisplayFor, canonicalDisplayShowsValue, decideCanonicalRender } from "./canonicalDisplay";
import { CANONICAL_SCHEMA_VERSION, type CanonicalEnvelope } from "./canonical";

function envelope<T>(over: Partial<CanonicalEnvelope<T>>): CanonicalEnvelope<T> {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    algorithmVersion: "v1",
    status: "canonical",
    computedAt: 1_700_000_000_000,
    inputRevision: null,
    inputDigest: null,
    period: null,
    data: null,
    error: null,
    ...over,
  };
}

describe("canonicalDisplayFor", () => {
  // 이 표는 앱 `CanonicalConsumption.kt` 와 **같은 답**이어야 한다. 갈라지면 같은 계정에서
  // 웹과 앱이 다른 화면을 보여준다.
  it.each([
    ["canonical", false, "value"],
    ["canonical", true, "value"],
    ["stale", false, "value_with_stale_hint"],
    ["processing", false, "loading"],
    ["processing", true, "value_with_stale_hint"],
    // 실패는 캐시가 있어도 알린다 — 조용히 낡은 값을 최신처럼 보여주지 않는다.
    ["failed", false, "error"],
    ["failed", true, "error"],
    // 줄 값이 없는 것과 값이 0 인 것은 다르다.
    ["unavailable", false, "empty"],
    ["unavailable", true, "empty"],
  ] as const)("%s (캐시=%s) → %s", (status, cached, expected) => {
    expect(canonicalDisplayFor(status, cached)).toBe(expected);
  });

  it("숫자를 그려도 되는 상태는 value 계열뿐이다", () => {
    expect(canonicalDisplayShowsValue("value")).toBe(true);
    expect(canonicalDisplayShowsValue("value_with_stale_hint")).toBe(true);
    // 이 셋에서 숫자를 그리면 미계산·실패가 0 으로 보인다.
    expect(canonicalDisplayShowsValue("loading")).toBe(false);
    expect(canonicalDisplayShowsValue("error")).toBe(false);
    expect(canonicalDisplayShowsValue("empty")).toBe(false);
  });
});

describe("decideCanonicalRender", () => {
  it("계약을 어긴 응답은 그리지 않는다", () => {
    // unavailable 인데 값이 실려 있다 — 서버가 계약을 어겼다.
    const decision = decideCanonicalRender(envelope({ status: "unavailable", data: { x: 1 } }), false);
    expect(decision.display).toBe("error");
    expect(decision.contractViolations.length).toBeGreaterThan(0);
  });

  it("정상 응답은 상태 표를 따른다", () => {
    const decision = decideCanonicalRender(envelope({ status: "canonical", data: { x: 1 } }), false);
    expect(decision).toEqual({ display: "value", contractViolations: [] });
  });
});
