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
});
