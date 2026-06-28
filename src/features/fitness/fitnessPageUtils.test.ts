import { describe, expect, it } from "vitest";

import {
  formatKoreanDate,
  getRangeOptions,
  makeDurationLabel,
  secToMmss,
  tsbStatusDesc,
  tsbStatusLabel,
} from "./fitnessPageUtils";

const t = (key: string, options?: Record<string, unknown>) =>
  options && "n" in options ? `${key}:${options.n}` : key;

describe("fitnessPageUtils", () => {
  it("formats core fitness labels", () => {
    expect(secToMmss(305)).toBe("5:05");
    expect(makeDurationLabel(t)(60)).toBe("duration.min:1");
    expect(formatKoreanDate(Date.UTC(2026, 5, 28))).toBe("2026-06-28");
  });

  it("builds range options and TSB status labels", () => {
    expect(getRangeOptions(t).map((option) => option.value)).toEqual([30, 90, 180, 365]);
    expect(tsbStatusLabel(30, t)).toBe("status.overRecovery");
    expect(tsbStatusLabel(-31, t)).toBe("status.overtraining");
    expect(tsbStatusDesc(6, t)).toBe("desc.recovery");
    expect(tsbStatusDesc(-11, t)).toBe("desc.rest");
  });
});
