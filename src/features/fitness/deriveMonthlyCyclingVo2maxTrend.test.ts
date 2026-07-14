import { describe, expect, it } from "vitest";
import { deriveMonthlyCyclingVo2maxTrend } from "./deriveMonthlyCyclingVo2maxTrend";

describe("deriveMonthlyCyclingVo2maxTrend", () => {
  it("validates, sorts and deduplicates periods using the last measured 5-minute value", () => {
    const result = deriveMonthlyCyclingVo2maxTrend([
      { period: "2026-03", mmp: { "5m": 300 } },
      { period: "invalid", mmp: { "5m": 999 } },
      { period: "2026-01", mmp: { "5m": 250 } },
      { period: "2026-03", mmp: { "5m": 320 } },
      { period: "2026-13", mmp: { "5m": 350 } },
    ], 75);

    expect(result).toEqual([
      { period: "2026-01", v: 43 },
      { period: "2026-03", v: 53.1 },
    ]);
  });

  it("omits months without measured 5-minute power instead of borrowing another threshold", () => {
    expect(deriveMonthlyCyclingVo2maxTrend([
      { period: "2026-01", mmp: { "20m": 280 } },
      { period: "2026-02", mmp: {} },
      { period: "2026-03", mmp: { "5m": 300 } },
    ], 75)).toEqual([{ period: "2026-03", v: 50.2 }]);
  });

  it("returns no trend without a valid weight", () => {
    const history = [{ period: "2026-03", mmp: { "5m": 300 } }];
    expect(deriveMonthlyCyclingVo2maxTrend(history, null)).toEqual([]);
    expect(deriveMonthlyCyclingVo2maxTrend(history, 0)).toEqual([]);
  });
});
