import { describe, expect, it } from "vitest";
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../services/trainingDecisionContract.test";
import { primaryRecommendedAdjustment, primaryRecommendedSession } from "./decisionPresentation";

describe("decisionPresentation", () => {
  it("does not apply another session's recommendation to the representative session", () => {
    const base = trainingDecisionEnvelope();
    const otherSessionId = "ss_eeeeeeeeeeeeeeeeeeeeeeee";
    const otherAdjustment = { ...base.data.recommendedAdjustments[0]!, sessionId: otherSessionId };
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      recommendedAdjustments: [otherAdjustment],
      loadAdjustment: { ...base.data.loadAdjustment!, recommendations: [otherAdjustment] },
    }));
    expect(primaryRecommendedAdjustment(decision)).toBeNull();
    expect(primaryRecommendedSession(decision)).toBeNull();
  });

  it("keeps a workout-less reassessment authoritative without inventing session metrics", () => {
    const base = trainingDecisionEnvelope();
    const reassessment = { sessionId: base.data.representativeSessionId!, recommendation: {
      localDate: base.data.localDate, action: "reassess" as const, reasonCodes: ["form_gate_before_intensity"],
      evidenceIds: [], reassessBefore: [],
    } };
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      recommendedAdjustments: [reassessment],
      loadAdjustment: { ...base.data.loadAdjustment!, recommendations: [reassessment] },
    }));
    expect(primaryRecommendedAdjustment(decision)).toEqual(reassessment);
    expect(primaryRecommendedSession(decision)).toBeNull();
  });

  it("does not inherit the scheduled TSS when a recommendation omits it", () => {
    const base = trainingDecisionEnvelope();
    const adjustment = { ...base.data.recommendedAdjustments[0]!, recommendation: {
      ...base.data.recommendedAdjustments[0]!.recommendation,
      workout: { kind: "recovery" as const, durationMin: 40, zone: "Z1" as const },
    } };
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      recommendedAdjustments: [adjustment],
      loadAdjustment: { ...base.data.loadAdjustment!, recommendations: [adjustment] },
    }));
    expect(primaryRecommendedSession(decision)?.current).toMatchObject({ workout: "recovery", durationMin: 40,
      targetTss: null });
  });
});
