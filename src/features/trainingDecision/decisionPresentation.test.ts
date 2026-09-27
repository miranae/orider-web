import { describe, expect, it } from "vitest";
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../services/trainingDecisionContract.test";
import { primaryRecommendedAdjustment, primaryRecommendedSession, presentedRecommendedAdjustments } from "./decisionPresentation";

describe("decisionPresentation", () => {
  it.each([
    ["rest", 0, 0, false],
    ["tempo", 60, 70, true],
    ["rest", 10, 0, true],
    ["rest", 0, 5, true],
  ])("compares rest recommendation with scheduled %s/%s minutes/%s TSS", (kind, durationMin, targetTss, visible) => {
    const base = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    const decision = { ...base,
      scheduledSessions: [{ ...base.scheduledSessions[0]!, current: {
        ...base.scheduledSessions[0]!.current, workout: kind as string, durationMin: durationMin as number, targetTss: targetTss as number,
      } }],
      recommendedAdjustments: [{ ...base.recommendedAdjustments[0]!, recommendation: {
        ...base.recommendedAdjustments[0]!.recommendation, action: "rest" as const,
        workout: { kind: "rest" as const, durationMin: 0, targetTss: 0 },
      } }],
    };
    expect(presentedRecommendedAdjustments(decision)).toHaveLength(visible ? 1 : 0);
    expect(primaryRecommendedAdjustment(decision) !== null).toBe(visible);
  });

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
