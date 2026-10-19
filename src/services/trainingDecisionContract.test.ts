import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharedReassessmentFixture from "./fixtures/today-training-decision-v1.reassess-high-load.json";
import { currentTrainingRecommendation, parseTodayTrainingDecisionProjection, trainingLoadAdjustmentSchema,
  trainingRecommendedAdjustmentSchema } from "./trainingDecisionContract";

import { trainingDecisionEnvelope } from "../__tests__/fixtures/trainingDecision";

describe("today training decision contract", () => {
  it("parses the byte-pinned backend high-load reassessment fixture", () => {
    expect(createHash("sha256").update(readFileSync("src/services/fixtures/today-training-decision-v1.reassess-high-load.json")).digest("hex"))
      .toBe("0c40edb6772f08779d2ebb55b34c6d261f2097fc8da5629628d6be6ae51365c7");
    expect(trainingLoadAdjustmentSchema.parse(sharedReassessmentFixture.highLoad).classification).toBe("high_load");
    const parsed = trainingRecommendedAdjustmentSchema.parse(sharedReassessmentFixture.reassessment);
    expect(parsed.recommendation.reassessBefore?.[0]?.threshold).toEqual({
      value: -15, evidenceId: "rx_ev_b925cd58b64ca98d2cae",
    });
  });

  it("requires workout metrics for executable actions and forbids them for reassessment", () => {
    const base = trainingDecisionEnvelope().data.recommendedAdjustments[0]!;
    expect(() => trainingRecommendedAdjustmentSchema.parse({ ...base,
      recommendation: { ...base.recommendation, action: "recovery", workout: undefined } })).toThrow("invalid recommendation workout");
    expect(() => trainingRecommendedAdjustmentSchema.parse({ ...base,
      recommendation: { ...base.recommendation, action: "reassess" } })).toThrow("invalid recommendation workout");
  });

  it("parses the zero-provider canonical projection and keeps its source tuple", () => {
    const parsed = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    expect(parsed.recommendationSource).toMatchObject({ factsId: "facts_123", planRevision: "plan_123" });
    expect(currentTrainingRecommendation(parsed)).toBe(true);
  });

  it("preserves future policy metadata and rejects malformed policy values", () => {
    expect(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ policyVersion: "future policy + 2" })).policyVersion)
      .toBe("future policy + 2");
    for (const policyVersion of ["", "   ", "x".repeat(257), 2]) {
      expect(() => parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ policyVersion }))).toThrow();
    }
    expect(() => parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ schemaVersion: "today-training-decision-v2" }))).toThrow();
  });

  it("accepts public null, normalizes the legacy zero sentinel, and accepts positive revisions", () => {
    const publicNoCheckIn = trainingDecisionEnvelope() as any;
    publicNoCheckIn.data.recommendationSource = { ...publicNoCheckIn.data.recommendationSource!, weeklyCheckInRevision: null };
    expect(parseTodayTrainingDecisionProjection(publicNoCheckIn).recommendationSource?.weeklyCheckInRevision).toBeNull();

    const legacyNoCheckIn = trainingDecisionEnvelope();
    legacyNoCheckIn.data.recommendationSource = { ...legacyNoCheckIn.data.recommendationSource!, weeklyCheckInRevision: 0 };
    expect(parseTodayTrainingDecisionProjection(legacyNoCheckIn).recommendationSource?.weeklyCheckInRevision).toBeNull();

    const revised = trainingDecisionEnvelope();
    revised.data.recommendationSource = { ...revised.data.recommendationSource!, weeklyCheckInRevision: 2 };
    expect(parseTodayTrainingDecisionProjection(revised).recommendationSource?.weeklyCheckInRevision).toBe(2);
  });

  it.each([-1, 1.5])("rejects invalid weekly check-in revision %s", (weeklyCheckInRevision) => {
    const envelope = trainingDecisionEnvelope();
    envelope.data.recommendationSource = { ...envelope.data.recommendationSource!, weeklyCheckInRevision };
    expect(() => parseTodayTrainingDecisionProjection(envelope)).toThrow();
  });

  it("accepts the Hosting-first confidence transition but rejects unknown values", () => {
    const unavailable = trainingDecisionEnvelope();
    unavailable.data.prescription = { ...unavailable.data.prescription, status: "unavailable", confidence: null };
    expect(parseTodayTrainingDecisionProjection(unavailable).prescription.confidence).toBeNull();

    const missing = trainingDecisionEnvelope() as any;
    delete missing.data.prescription.confidence;
    expect(parseTodayTrainingDecisionProjection(missing).prescription.confidence).toBeUndefined();
    expect(() => parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      prescription: { ...trainingDecisionEnvelope().data.prescription, confidence: "unknown" },
    }))).toThrow();
  });

  it("rejects shadow recommendations and mismatched plan revisions", () => {
    expect(() => parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ policyStage: "shadow" }))).toThrow();
    const envelope = trainingDecisionEnvelope();
    envelope.data.recommendationSource = { ...envelope.data.recommendationSource!, planRevision: "plan_other" };
    expect(() => parseTodayTrainingDecisionProjection(envelope)).toThrow();
  });

  it("keeps scheduled sessions available when recommendation falls back", () => {
    const parsed = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ recommendationSource: null,
      recommendedAdjustments: [], loadAdjustment: null, mode: "scheduled-only", recommendationValidUntil: null,
      sourceRefs: { factsId: null, prescriptionId: null, snapshotRevision: null, planRevision: "plan_123", rulesVersion: null, proposalId: null, receiptAuditId: null },
      fallback: { active: true, reasonCode: "prescription_not_ready" } }));
    expect(parsed.scheduledSessions).toHaveLength(1);
    expect(currentTrainingRecommendation(parsed)).toBe(false);
  });

  it("requires the explicit zero-cost envelope", () => {
    const envelope = trainingDecisionEnvelope() as Record<string, unknown>;
    delete envelope.providerCalls;
    expect(() => parseTodayTrainingDecisionProjection(envelope)).toThrow();
  });
});
