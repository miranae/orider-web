import { describe, expect, it } from "vitest";
import { goalCountdown } from "./goalCountdown";
describe("goal countdown presentation", () => {
  const now = Date.parse("2026-10-22T23:55:00+09:00");
  it("keeps past, current and future goal dates distinct on KST calendar boundaries", () => {
    expect(goalCountdown(Date.parse("2026-10-18T00:00:00+09:00"), now)).toBe("D+4");
    expect(goalCountdown(Date.parse("2026-10-22T00:00:00+09:00"), now)).toBe("D-DAY");
    expect(goalCountdown(Date.parse("2026-10-23T00:00:00+09:00"), now)).toBe("D−1");
    expect(goalCountdown(Date.parse("2026-10-22T00:00:00+09:00"), Date.parse("2026-10-22T00:01:00+09:00"))).toBe("D-DAY");
  });
  it("does not turn missing or invalid dates into a due-today goal", () => {
    for (const target of [null, undefined, NaN, Infinity]) expect(goalCountdown(target, now)).toBe("—");
  });
});
