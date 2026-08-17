import type { TodayTrainingDecisionProjection, TrainingDecisionSession } from "../../services/trainingDecisionContract";

export type PresentedTrainingDecisionSession = Omit<TrainingDecisionSession, "current"> & {
  /** 강도 존은 권고 워크아웃에만 존재한다(계약상 optional) — 예정/실행 세션에는 없으므로 null. */
  current: Omit<TrainingDecisionSession["current"], "targetTss"> & { targetTss: number | null; zone?: Zone | null };
};

type Zone = NonNullable<TrainingRecommendationWorkout["zone"]>;
type TrainingRecommendationWorkout = NonNullable<
  TodayTrainingDecisionProjection["recommendedAdjustments"][number]["recommendation"]["workout"]
>;

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
    durationMin: recommended.durationMin, targetTss: recommended.targetTss ?? null,
    zone: recommended.zone ?? null } };
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
