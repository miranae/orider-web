import { describe, expect, it } from "vitest";
import { deriveEstimatedFtpProgression, detectFtpBreakthrough } from "./ftpProgression";

describe("deriveEstimatedFtpProgression", () => {
  it("prefers 20-minute MMP at 95%, falls back to 1-hour MMP, and sorts months", () => {
    expect(deriveEstimatedFtpProgression([
      { period: "2026-02", mmp: { "20m": 300, "1h": 260 } },
      { period: "2026-01", mmp: { "1h": 250 } },
    ])).toEqual([
      { period: "2026-01", ftpW: 250, source: "1h" },
      { period: "2026-02", ftpW: 285, source: "20m" },
    ]);
  });

  it("drops invalid periods and unusable powers", () => {
    expect(deriveEstimatedFtpProgression([
      { period: "bad", mmp: { "20m": 300 } },
      { period: "2026-03", mmp: { "20m": Number.NaN, "1h": -1 } },
      { period: "2026-04", mmp: {} },
    ])).toEqual([]);
    expect(deriveEstimatedFtpProgression(undefined)).toEqual([]);
  });
});

describe("detectFtpBreakthrough", () => {
  it("requires both 10 W and 3% improvement", () => {
    expect(detectFtpBreakthrough(250, 260)).toMatchObject({ deltaW: 10, candidateFtpW: 260 });
    expect(detectFtpBreakthrough(500, 510)).toBeNull();
    expect(detectFtpBreakthrough(250, 259)).toBeNull();
    expect(detectFtpBreakthrough(250, 259.6)).toBeNull();
  });

  it("hides lower, missing, and invalid candidates", () => {
    expect(detectFtpBreakthrough(250, 240)).toBeNull();
    expect(detectFtpBreakthrough(null, 280)).toBeNull();
    expect(detectFtpBreakthrough(250, Number.NaN)).toBeNull();
  });
});
