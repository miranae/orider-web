import { describe, expect, it } from "vitest";
import { capDecimals } from "./numberDisplay";

describe("화면 숫자의 소수 자릿수 상한", () => {
  it("나눗셈 결과를 두 자리까지만 남긴다", () => {
    expect(String(capDecimals(620 / 60))).toBe("10.33");
    expect(String(capDecimals(31 / 3, 1))).toBe("10.3");
  });
  it("정수와 짧은 소수는 그대로 둔다", () => {
    expect(String(capDecimals(300 / 60))).toBe("5");
    expect(String(capDecimals(10.5))).toBe("10.5");
    expect(String(capDecimals(0.85))).toBe("0.85");
  });
});
