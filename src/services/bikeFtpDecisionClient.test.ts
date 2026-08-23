import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";

const mocks = vi.hoisted(() => ({
  callable: vi.fn(),
  ensureAppCheckReady: vi.fn(),
  functions: {},
}));

vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => mocks.callable) }));
vi.mock("./firebase", () => ({
  functions: mocks.functions,
  ensureAppCheckReady: mocks.ensureAppCheckReady,
}));

import { acceptBikeThresholdDecision } from "./bikeFtpDecisionClient";

describe("acceptBikeThresholdDecision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callable.mockResolvedValue({ data: { ok: true } });
  });

  it("sends every compare-and-set revision through the App Check callable", async () => {
    await acceptBikeThresholdDecision("uid-1", {
      schemaVersion: 2,
      decisionId: "bike-ftp-1234567890abcdef1234567890abcdef",
      status: "actionable",
      candidate: { ftp: 265, currentFtp: 250, method: "pdc_cp_097", deltaW: 15, deltaPct: 6 },
      evidence: { activityId: "activity-1", activityRevision: "activity-r1", powerSource: "measured", pdcRevision: "pdc-r1" },
      expectedRevisions: { ftp: "ftp-r1", pdc: "pdc-r1", impactPreview: "impact-r1" },
      confidence: { level: "high", score: 0.9, reasons: ["measured_power"] },
      impactPreview: { revision: "impact-r1", effectiveFrom: "next_ride", workoutScalePct: 106 },
      createdAt: 100,
      expiresAt: 200,
    });

    expect(mocks.ensureAppCheckReady).toHaveBeenCalledOnce();
    expect(httpsCallable).toHaveBeenCalledWith(mocks.functions, "acceptBikeThresholdDecision");
    expect(mocks.callable).toHaveBeenCalledWith({
      expectedUid: "uid-1",
      decisionId: "bike-ftp-1234567890abcdef1234567890abcdef",
      expectedFtpRevision: "ftp-r1",
      expectedPdcRevision: "pdc-r1",
      expectedImpactPreviewRevision: "impact-r1",
    });
  });
});
