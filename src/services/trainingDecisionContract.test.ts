import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharedReassessmentFixture from "./fixtures/today-training-decision-v1.reassess-high-load.json";
import { currentTrainingRecommendation, parseTodayTrainingDecisionProjection, trainingLoadAdjustmentSchema,
  trainingRecommendedAdjustmentSchema } from "./trainingDecisionContract";

export function trainingDecisionEnvelope(overrides: Record<string, unknown> = {}) {
  const session = { sessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa", scheduledSessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa", scheduledSessionRevision: "ssr_bbbbbbbbbbbbbbbbbbbbbbbb",
    dayRef: { goalId: "goal_123", weekId: "week_01", dayIndex: 2, localDate: "2026-08-15" }, sessionRevision: "ssr_bbbbbbbbbbbbbbbbbbbbbbbb",
    planItemId: "item_123", localDate: "2026-08-15",
    baseline: { workout: "tempo", durationMin: 60, targetTss: 70 },
    current: { workout: "tempo", durationMin: 60, targetTss: 70, completed: false }, status: "scheduled",
    matchedActivityId: null, matchConfidence: "none" };
  const data = { schemaVersion: "today-training-decision-v1", policyVersion: "today-training-decision-policy-v1",
    policyStage: "active", projectionId: "today_cccccccccccccccccccccccc", asOfDate: "2026-08-15", asOfInstant: 1_787_000_000_000,
    computedAt: 1_787_000_000_100, scheduledProjectionValidUntil: 4_000_000_000_000,
    recommendationValidUntil: 4_000_000_000_000, proposalExpiresAt: null, targetDiscipline: "bike",
    mode: "current-recommendation", sourceState: "current", unavailableReason: null,
    localDate: "2026-08-15", timezone: "Asia/Seoul", discipline: "bike",
    planSource: { goalId: "goal_123", goalRevision: "goal_revision_123", planRevision: "plan_123",
      weekRevisions: [{ weekId: "week_01", revision: "week_revision_123" }] },
    recommendationSource: { sourceRequestId: "018f47a2-3c4d-7abc-8def-000000000201", prescriptionId: "rx_111111111111111111111111",
      factsId: "facts_123", snapshotRevision: "snapshot_123", planRevision: "plan_123", rulesVersion: "rules_123",
      weeklyCheckInId: "bike_2026-08-11", weeklyCheckInRevision: 1 },
    sourceRefs: { factsId: "facts_123", prescriptionId: "rx_111111111111111111111111", snapshotRevision: "snapshot_123",
      planRevision: "plan_123", rulesVersion: "rules_123", proposalId: null, receiptAuditId: null },
    prescription: { status: "ready", confidence: "high", missingSignals: [], requiredSignals: [], validFrom: "2026-08-14T15:00:00.000Z", validUntil: "2099-08-15T15:00:00.000Z" },
    healthGate: { state: "clear", reasonCodes: [], sourceFreshness: "current" }, freshness: { asOf: "2026-08-15T00:00:00.000Z",
      generatedAt: "2026-08-15T00:01:00.000Z", validUntil: "2099-08-15T15:00:00.000Z", stale: false },
    scheduledSessions: [session], recommendedAdjustments: [{ sessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa", recommendation: { localDate: "2026-08-15",
      action: "recovery", workout: { kind: "recovery", durationMin: 40, zone: "Z1", targetTss: 25 }, reasonCodes: ["high_load"], evidenceIds: [] } }],
    effectiveSessions: [{ ...session, basis: "scheduled", appliedProposalId: null }], representativeSessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa",
    proposal: null, receipt: null, capabilities: { consent: "granted", prescriptionRead: "available", checkIn: "available",
      proposal: "available", confirm: "available", decline: "available", rollback: "disabled", explain: "available",
      execution: { reserve: "available", start: "available", link: "available", unlink: "available", status: "available", outcome: "available" } },
    plan: { goalId: "goal_123", phase: "build", scheduledSessions: [session] },
    loadAdjustment: { prescriptionStatus: "ready", classification: "high_load", reasonCodes: ["high_load"],
      recommendations: [{ sessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa", recommendation: { localDate: "2026-08-15", action: "recovery",
        workout: { kind: "recovery", durationMin: 40, zone: "Z1", targetTss: 25 }, reasonCodes: ["high_load"], evidenceIds: [] } }] },
    load: { rolling7dTss: 330, calendarWeekActualTssAsOf: 205, calendarWeekPlannedTss: 220,
      targetWeekTss: [205, 222], weeklyLoadComparison: "on-target", unavailableReason: null },
    coachCore: { weeklyCheckInId: "bike_2026-08-11", weeklyCheckInRevision: 1, requiredSignals: [], proposalStatus: null,
      sourceRequestId: "018f47a2-3c4d-7abc-8def-000000000201" },
    sources: { loadScopesUsed: ["bike"], observedScopes: ["all", "bike"], coverage: "complete", lastActivityIngestAt: 1_787_000_000_000 },
    fallback: { active: false, reasonCode: null }, providerCalls: 0, quotaConsumed: 0, ...overrides };
  return { status: "ok", data, providerCalls: 0, quotaConsumed: 0 };
}

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
