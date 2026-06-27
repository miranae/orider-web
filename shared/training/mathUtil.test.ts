import { describe, expect, it } from "vitest";
import { isPositiveFinite, clamp, round2 } from "./mathUtil";

describe("isPositiveFinite", () => {
  it("양수 유한값만 true", () => {
    expect(isPositiveFinite(1)).toBe(true);
    expect(isPositiveFinite(0.01)).toBe(true);
  });
  it("0·음수·NaN·Infinity·비수치는 false", () => {
    expect(isPositiveFinite(0)).toBe(false);
    expect(isPositiveFinite(-1)).toBe(false);
    expect(isPositiveFinite(NaN)).toBe(false);
    expect(isPositiveFinite(Infinity)).toBe(false);
    expect(isPositiveFinite(null)).toBe(false);
    expect(isPositiveFinite(undefined)).toBe(false);
    expect(isPositiveFinite("5")).toBe(false);
  });
});

describe("clamp", () => {
  it("범위 내는 그대로", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it("하한/상한으로 제한", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("round2", () => {
  it("소수 2자리 반올림", () => {
    expect(round2(3.857)).toBe(3.86);
    expect(round2(4.071)).toBe(4.07);
    expect(round2(10)).toBe(10);
  });
});
