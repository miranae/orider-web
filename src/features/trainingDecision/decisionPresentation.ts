import type { TodayTrainingDecisionProjection, TrainingDecisionSession } from "../../services/trainingDecisionContract";

export type PresentedTrainingDecisionSession = Omit<TrainingDecisionSession, "current"> & {
  current: Omit<TrainingDecisionSession["current"], "targetTss"> & { targetTss: number | null };
};

export function primaryScheduledSession(decision: TodayTrainingDecisionProjection): TrainingDecisionSession | null {
  return decision.scheduledSessions.find((session) => session.sessionId === decision.representativeSessionId)
    ?? decision.scheduledSessions.find((session) => !session.current.completed) ?? decision.scheduledSessions[0] ?? null;
}

export function primaryRecommendedAdjustment(decision: TodayTrainingDecisionProjection) {
  const id = decision.representativeSessionId;
  return decision.recommendedAdjustments.find((item) => item.sessionId === id) ?? null;
}

export function primaryRecommendedSession(decision: TodayTrainingDecisionProjection): PresentedTrainingDecisionSession | null {
  const scheduled = primaryScheduledSession(decision);
  const recommended = primaryRecommendedAdjustment(decision)?.recommendation.workout;
  if (!scheduled || !recommended) return null;
  return { ...scheduled, current: { ...scheduled.current, workout: recommended.kind,
    durationMin: recommended.durationMin, targetTss: recommended.targetTss ?? null } };
}

export function primaryEffectiveSession(decision: TodayTrainingDecisionProjection) {
  return decision.effectiveSessions.find((session) => session.sessionId === decision.representativeSessionId)
    ?? decision.effectiveSessions[0] ?? primaryScheduledSession(decision);
}

export function decisionAction(decision: TodayTrainingDecisionProjection) {
  return canShowRecommendation(decision) ? primaryRecommendedAdjustment(decision)?.recommendation.action ?? null : null;
}

export function canShowRecommendation(decision: TodayTrainingDecisionProjection, now = Date.now()): boolean {
  return decision.mode !== "scheduled-only" && decision.policyStage === "active" && decision.sourceState === "current"
    && !decision.fallback.active && !decision.freshness.stale && decision.capabilities.consent === "granted"
    && decision.capabilities.prescriptionRead === "available" && decision.prescription.status === "ready"
    && decision.recommendationSource !== null && decision.recommendationValidUntil !== null && decision.recommendationValidUntil > now;
}
