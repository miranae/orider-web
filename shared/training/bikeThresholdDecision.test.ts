import { describe, expect, it } from "vitest";
import type { PdcDoc } from "../types/pdc";
import { resolveBikeThresholdDecision } from "./bikeThresholdDecision";

function fixture(): PdcDoc {
  return {
    discipline: "bike",
    mmpAll: { "20m": { value: 173, activityId: "ride", date: "2026-06-20", startTime: 1 } },
    cp: null,
    pdcModel: { pmax: 900, frc: 12000, ftpEst: 153, cpEst: 158, tteMin: 42 },
    stamina: null,
    powerProfile: "all_rounder",
    wPerKgAtKey: null,
    riderType: null,
    ability: null,
    sustainablePower: [],
    history: [{ period: "2026-06", mmp: { "20m": 162.1 } }],
    vo2maxEst: null,
    activityCount: 12,
    weightKgSnapshot: 70,
    computedAt: 1,
    version: 1,
  };
}

describe("resolveBikeThresholdDecision", () => {
  it("keeps active FTP canonical and separates every evidence role", () => {
    expect(resolveBikeThresholdDecision(203, fixture())).toEqual({
      activeFtpW: 203,
      automaticCandidateW: 153,
      cpW: 158,
      recentTwentyMinuteW: 173,
      latestMonthlyEstimate: { period: "2026-06", ftpW: 154 },
      tteMin: 42,
      activityCount: 12,
    });
  });

  it("does not expose an identical estimate as an action candidate", () => {
    expect(resolveBikeThresholdDecision(153, fixture()).automaticCandidateW).toBeNull();
  });
});
