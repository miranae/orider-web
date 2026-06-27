import { describe, expect, it } from "vitest";
import {
  estimateFtpFromTest,
  isConservativeDrop,
  FTP_TEST_FACTORS,
} from "./ftpTest";

describe("estimateFtpFromTest", () => {
  it("20분 테스트는 ×0.95", () => {
    expect(estimateFtpFromTest("twenty_min", 300)).toBe(285);
  });

  it("ramp(MAP)은 ×0.75", () => {
    expect(estimateFtpFromTest("ramp", 400)).toBe(300);
  });

  it("all_out(60분)은 ×1.0", () => {
    expect(estimateFtpFromTest("all_out", 270)).toBe(270);
  });

  it("반올림", () => {
    // 263 × 0.95 = 249.85 → 250
    expect(estimateFtpFromTest("twenty_min", 263)).toBe(250);
  });

  it("계수 테이블과 일치", () => {
    expect(estimateFtpFromTest("twenty_min", 100)).toBe(Math.round(100 * FTP_TEST_FACTORS.twenty_min));
  });

  it("유효하지 않은 입력은 null", () => {
    expect(estimateFtpFromTest("ramp", 0)).toBeNull();
    expect(estimateFtpFromTest("ramp", -50)).toBeNull();
    expect(estimateFtpFromTest("ramp", NaN)).toBeNull();
  });
});

describe("isConservativeDrop", () => {
  it("후보가 현재보다 낮으면 true(확인 필요)", () => {
    expect(isConservativeDrop(280, 260)).toBe(true);
  });

  it("후보가 같거나 높으면 false", () => {
    expect(isConservativeDrop(260, 260)).toBe(false);
    expect(isConservativeDrop(260, 300)).toBe(false);
  });

  it("현재 FTP 없으면(최초) false", () => {
    expect(isConservativeDrop(null, 260)).toBe(false);
    expect(isConservativeDrop(undefined, 260)).toBe(false);
    expect(isConservativeDrop(0, 260)).toBe(false);
  });

  it("후보가 유효하지 않으면 false", () => {
    expect(isConservativeDrop(280, 0)).toBe(false);
    expect(isConservativeDrop(280, NaN)).toBe(false);
  });
});
