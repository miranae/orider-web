import { describe, expect, it } from "vitest";

import { parseBikeThresholdDecisionV2, parseFtpDeviceReceipt, parseFtpMutationReceipt } from "./threshold";

const decision = {
  schemaVersion: 2,
  decisionId: "bike-ftp-1234567890abcdef1234567890abcdef",
  status: "actionable",
  candidate: { ftp: 265, currentFtp: 250, method: "pdc_cp_097", deltaW: 15, deltaPct: 6 },
  evidence: {
    powerSource: "measured",
    activityId: "activity-1",
    activityRevision: "activity-r1",
    pdcRevision: "pdc-r1",
  },
  expectedRevisions: { ftp: "ftp-r1", pdc: "pdc-r1", impactPreview: "impact-r1" },
  confidence: { level: "high", score: 0.9, reasons: ["measured_power", "pdc_corroborated"] },
  impactPreview: { revision: "impact-r1", effectiveFrom: "next_ride", workoutScalePct: 106 },
  createdAt: 100,
  expiresAt: 200,
  producerAddedField: true,
};

describe("parseBikeThresholdDecisionV2", () => {
  it("accepts the required v2 core and additive producer fields", () => {
    expect(parseBikeThresholdDecisionV2(decision)).toMatchObject({
      decisionId: "bike-ftp-1234567890abcdef1234567890abcdef",
      candidate: { ftp: 265, currentFtp: 250 },
      expectedRevisions: { ftp: "ftp-r1", pdc: "pdc-r1", impactPreview: "impact-r1" },
    });
  });

  it("ignores v1 and rejects missing compare-and-set revisions", () => {
    expect(parseBikeThresholdDecisionV2({ activityId: "legacy" })).toBeNull();
    expect(parseBikeThresholdDecisionV2({ ...decision, expectedRevisions: undefined })).toBeNull();
  });

  it("supports the backend's null expected FTP revision", () => {
    expect(parseBikeThresholdDecisionV2({ ...decision, expectedRevisions: { ...decision.expectedRevisions, ftp: null } }))
      .toMatchObject({ expectedRevisions: { ftp: null } });
  });

  it("accepts the backend activity/PDC disagreement blocked fixture", () => {
    const disagreement = {
      ...decision,
      status: "blocked",
      candidate: { ftp: 275, currentFtp: 250, method: "pdc_cp_097", deltaW: 25, deltaPct: 10 },
      confidence: {
        level: "medium",
        score: 0.7,
        reasons: ["measured_power", "activity_pdc_disagreement"],
      },
      impactPreview: { revision: "impact-r1", effectiveFrom: "next_ride", workoutScalePct: 110 },
      blockReason: "activity_pdc_disagreement",
    };
    expect(parseBikeThresholdDecisionV2(disagreement)).toMatchObject({
      status: "blocked",
      candidate: { ftp: 275, method: "pdc_cp_097" },
      blockReason: "activity_pdc_disagreement",
    });
  });
});

describe("parseFtpMutationReceipt", () => {
  it("accepts the server aggregate and optional generation", () => {
    expect(parseFtpMutationReceipt({
      schemaVersion: 1,
      mutationId: "mutation-1",
      ftpRevision: "ftp-r2",
      ftpGeneration: 5,
      targetedDeviceCount: 2,
      pendingCount: 1,
      receivedCount: 1,
      deferredCount: 0,
      appliedCount: 0,
      failedCount: 0,
      supersededCount: 0,
      status: "pending",
      createdAt: 100,
      updatedAt: 110,
      additive: "ok",
    })).toMatchObject({ status: "pending", ftpRevision: "ftp-r2" });
  });

  it("accepts the backend device receipt acknowledgedAt and failureCode shape", () => {
    expect(parseFtpDeviceReceipt({
      schemaVersion: 1,
      deviceId: "device-12345678",
      ftpRevision: "threshold:mutation-1",
      ftpGeneration: 5,
      state: "failed",
      failureCode: "storage_busy",
      acknowledgedAt: 120,
    })).toEqual({
      deviceId: "device-12345678",
      ftpRevision: "threshold:mutation-1",
      ftpGeneration: 5,
      state: "failed",
      failureCode: "storage_busy",
      acknowledgedAt: 120,
    });
  });
});
