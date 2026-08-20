import { z } from "zod";
import { coachChangeReceiptSchema } from "./coachProgressPlannerContract";

const id = z.string().min(3).max(256);
const uuid = z.string().uuid();
const revisionId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,255}$/u);
const prescriptionId = z.string().regex(/^rx_[0-9a-f]{24}$/u);
const scheduledSessionId = z.string().regex(/^ss(?:_legacy)?_[0-9a-f]{24}$/u);
const scheduledSessionRevision = z.string().regex(/^ssr_[0-9a-f]{24}$/u);
const proposalId = z.string().regex(/^proposal_[0-9a-f]{24}$/u);
const auditId = z.string().regex(/^audit_[0-9a-f]{24}$/u);
const weeklyCheckInId = z.string().regex(/^(bike|run|swim)_\d{4}-\d{2}-\d{2}$/u);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const iso = z.string().datetime({ offset: true });
const discipline = z.enum(["bike", "run", "swim"]);
const epoch = z.number().int().nonnegative();
const workoutKind = z.enum(["rest", "recovery", "z2", "tempo", "sweet_spot", "threshold", "vo2max", "planned"]);
const workout = z.object({ kind: workoutKind, durationMin: z.number().int().min(0).max(10_080),
  zone: z.enum(["Z1", "Z2", "Z3", "Z4", "Z5"]).optional(), targetTss: z.number().int().min(0).max(10_000).optional() }).strict();
const evidenceNumber = z.object({ value: z.number().finite(), evidenceId: id }).strict();
const reassessment = z.object({
  metric: z.enum(["form", "rhr_delta_pct", "hrv_delta_pct", "sleep_hours", "hours_since_high_intensity"]),
  operator: z.enum(["gte", "gt", "lte", "lt"]), threshold: evidenceNumber,
  maxAgeHours: z.number().finite().positive().max(8_760).optional(),
  evidenceIds: z.array(id).max(64).refine((items) => new Set(items).size === items.length), ruleId: id,
}).strict();
export const trainingRecommendationSchema = z.object({
  localDate, action: z.enum(["rest", "recovery", "follow_plan", "modified_workout", "reassess"]),
  workout: workout.optional(), reasonCodes: z.array(id).max(64).refine((items) => new Set(items).size === items.length),
  evidenceIds: z.array(id).max(128).refine((items) => new Set(items).size === items.length),
  reassessBefore: z.array(reassessment).max(16).optional(),
}).strict().superRefine((value, context) => {
  if ((value.action === "reassess") === Boolean(value.workout)) {
    context.addIssue({ code: "custom", path: ["workout"], message: "invalid recommendation workout" });
  }
});
export const trainingRecommendedAdjustmentSchema = z.object({ sessionId: scheduledSessionId, recommendation: trainingRecommendationSchema }).strict();
export const trainingLoadAdjustmentSchema = z.object({
  prescriptionStatus: z.enum(["ready", "needs_checkin", "insufficient_data", "safety_blocked"]),
  classification: z.enum(["normal", "productive_load", "high_load", "recovery_review_recommended", "insufficient_data"]),
  reasonCodes: z.array(id).max(64), recommendations: z.array(trainingRecommendedAdjustmentSchema).max(12),
}).strict();
const session = z.object({
  sessionId: scheduledSessionId, planItemId: id, localDate,
  scheduledSessionId, scheduledSessionRevision,
  dayRef: z.object({ goalId: id, weekId: id, dayIndex: z.number().int().min(0).max(6), localDate }).strict(),
  sessionRevision: scheduledSessionRevision,
  baseline: z.object({ workout: workoutKind, durationMin: z.number().int().min(0).max(10_080), targetTss: z.number().int().min(0).max(10_000) }).strict(),
  current: z.object({ workout: workoutKind, durationMin: z.number().int().min(0).max(10_080), targetTss: z.number().int().min(0).max(10_000), completed: z.boolean() }).strict(),
  status: z.enum(["scheduled", "completed", "partial", "skipped", "postponed"]),
  matchedActivityId: id.nullable(), matchConfidence: z.enum(["exact", "probable", "manual", "none"]),
}).strict();
const source = z.object({
  sourceRequestId: uuid, prescriptionId, factsId: revisionId, snapshotRevision: revisionId,
  planRevision: revisionId.nullable(), rulesVersion: revisionId,
  weeklyCheckInId, weeklyCheckInRevision: z.number().int().min(1),
}).strict();

export const todayTrainingDecisionProjectionSchema = z.object({
  schemaVersion: z.literal("today-training-decision-v1"),
  policyVersion: z.literal("today-training-decision-policy-v1"),
  policyStage: z.enum(["shadow", "active"]),
  projectionId: z.string().regex(/^today_[0-9a-f]{24}$/u),
  asOfDate: localDate,
  asOfInstant: epoch,
  computedAt: epoch,
  scheduledProjectionValidUntil: epoch,
  recommendationValidUntil: epoch.nullable(),
  proposalExpiresAt: epoch.nullable(),
  targetDiscipline: discipline,
  mode: z.enum(["scheduled-only", "current-recommendation", "applied-plan"]),
  sourceState: z.enum(["current", "source-stale", "partial"]),
  unavailableReason: z.string().max(200).nullable(),
  localDate, timezone: z.string().min(1).max(100), discipline,
  planSource: z.object({ goalId: id, goalRevision: revisionId, planRevision: revisionId,
    weekRevisions: z.array(z.object({ weekId: id, revision: revisionId }).strict()).max(104) }).strict().nullable(),
  recommendationSource: source.nullable(),
  sourceRefs: z.object({ factsId: revisionId.nullable(), prescriptionId: prescriptionId.nullable(), snapshotRevision: revisionId.nullable(),
    planRevision: revisionId.nullable(), rulesVersion: revisionId.nullable(), proposalId: proposalId.nullable(), receiptAuditId: auditId.nullable() }).strict(),
  prescription: z.object({
    status: z.enum(["ready", "needs_checkin", "insufficient_data", "safety_blocked", "unavailable"]),
    // Hosting 이 Functions 보다 먼저 배포되는 전환 구간에는 기존 응답에 이 필드가 없다.
    // 새 백엔드의 enum/null 만 엄격히 받고, 필드 없음은 마이그레이션 동안만 허용한다.
    confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
    missingSignals: z.array(id).max(64), requiredSignals: z.array(id).max(16), validFrom: iso.nullable(), validUntil: iso.nullable(),
  }).strict(),
  healthGate: z.object({
    state: z.enum(["clear", "stop", "unknown"]), reasonCodes: z.array(id).max(64),
    sourceFreshness: z.enum(["current", "missing", "stale"]),
  }).strict(),
  freshness: z.object({ asOf: iso, generatedAt: iso, validUntil: iso.nullable(), stale: z.boolean() }).strict(),
  scheduledSessions: z.array(session).max(12),
  recommendedAdjustments: z.array(trainingRecommendedAdjustmentSchema).max(12),
  effectiveSessions: z.array(session.extend({ basis: z.enum(["scheduled", "applied_proposal"]), appliedProposalId: proposalId.nullable() }).strict()).max(12),
  representativeSessionId: scheduledSessionId.nullable(),
  proposal: z.object({ proposalId, status: z.enum(["pending", "applied", "expired", "superseded", "consent_revoked", "reverted", "declined"]),
    expiresAt: iso, confirmNonce: z.string().min(32).max(256).nullable() }).strict().nullable(),
  receipt: coachChangeReceiptSchema.nullable(),
  capabilities: z.object({
    consent: z.enum(["granted", "required", "revoked"]),
    prescriptionRead: z.enum(["available", "disabled", "unavailable"]),
    checkIn: z.enum(["available", "disabled", "consent-required", "unavailable"]),
    proposal: z.enum(["available", "disabled", "consent-required", "unavailable"]),
    confirm: z.enum(["available", "disabled", "consent-required", "unavailable"]),
    decline: z.enum(["available", "disabled", "consent-required", "unavailable"]),
    rollback: z.enum(["available", "disabled", "unavailable"]),
    explain: z.enum(["available", "disabled", "consent-required", "quota-exhausted", "unavailable"]),
    execution: z.object({ reserve: z.enum(["available", "disabled"]), start: z.enum(["available", "disabled"]),
      link: z.enum(["available", "disabled"]), unlink: z.enum(["available", "disabled"]),
      status: z.enum(["available", "disabled"]), outcome: z.enum(["available", "disabled"]) }).strict(),
  }).strict(),
  plan: z.object({ goalId: id, phase: z.enum(["base", "build", "peak", "taper", "unknown"]), scheduledSessions: z.array(session).max(12) }).strict().nullable(),
  loadAdjustment: trainingLoadAdjustmentSchema.nullable(),
  load: z.object({ rolling7dTss: z.number().finite().nonnegative().nullable(), calendarWeekActualTssAsOf: z.number().finite().nonnegative().nullable(),
    calendarWeekPlannedTss: z.number().finite().nonnegative().nullable(), targetWeekTss: z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()]).nullable(),
    weeklyLoadComparison: z.enum(["below", "on-target", "above", "unavailable"]), unavailableReason: z.string().max(200).nullable() }).strict(),
  coachCore: z.object({ weeklyCheckInId: weeklyCheckInId.nullable(), weeklyCheckInRevision: z.number().int().min(1).nullable(),
    requiredSignals: z.array(id).max(16), proposalStatus: z.enum(["pending", "applied", "expired", "superseded", "consent_revoked", "reverted", "declined"]).nullable(),
    sourceRequestId: uuid.nullable() }).strict(),
  sources: z.object({ loadScopesUsed: z.array(discipline).max(3), observedScopes: z.array(z.enum(["all", "bike", "run", "swim"])).max(4),
    coverage: z.enum(["complete", "partial", "missing"]), lastActivityIngestAt: epoch.nullable() }).strict(),
  fallback: z.object({ active: z.boolean(), reasonCode: z.enum(["feature_disabled", "no_active_goal", "prescription_not_ready",
    "ambiguous_active_goal", "consent_required", "canonical_load_unavailable", "dependency_unavailable"]).nullable() }).strict(),
  providerCalls: z.literal(0), quotaConsumed: z.literal(0),
}).strict().superRefine((value, context) => {
  if (value.policyStage !== "active" && (value.recommendationSource || value.recommendedAdjustments.length > 0)) {
    context.addIssue({ code: "custom", message: "shadow recommendation exposure" });
  }
  if (value.fallback.active && value.fallback.reasonCode === null) context.addIssue({ code: "custom", message: "fallback reason missing" });
  if (!value.fallback.active && value.fallback.reasonCode !== null) context.addIssue({ code: "custom", message: "unexpected fallback reason" });
  if (value.recommendationSource && value.planSource?.planRevision !== value.recommendationSource.planRevision) {
    context.addIssue({ code: "custom", message: "plan source mismatch" });
  }
  if (value.freshness.stale && value.recommendedAdjustments.length > 0) context.addIssue({ code: "custom", message: "stale recommendation exposure" });
  if (value.mode !== "scheduled-only" && (value.policyStage !== "active" || value.sourceState !== "current"
      || value.capabilities.consent !== "granted" || value.capabilities.prescriptionRead !== "available")) {
    context.addIssue({ code: "custom", message: "unsafe current recommendation" });
  }
});

const projectionEnvelope = z.object({ status: z.literal("ok"), data: todayTrainingDecisionProjectionSchema,
  providerCalls: z.literal(0), quotaConsumed: z.literal(0) }).strict();
export type TodayTrainingDecisionProjection = z.infer<typeof todayTrainingDecisionProjectionSchema>;
export type TrainingDecisionSession = z.infer<typeof session>;
export type TrainingDecisionEffectiveSession = TodayTrainingDecisionProjection["effectiveSessions"][number];

export function parseTodayTrainingDecisionProjection(value: unknown): TodayTrainingDecisionProjection {
  return projectionEnvelope.parse(value).data;
}

export function currentTrainingRecommendation(value: TodayTrainingDecisionProjection, now = Date.now()): boolean {
  return value.mode !== "scheduled-only" && value.policyStage === "active" && value.sourceState === "current"
    && !value.fallback.active && !value.freshness.stale && value.capabilities.consent === "granted"
    && value.capabilities.prescriptionRead === "available" && value.prescription.status === "ready"
    && value.recommendationSource !== null && value.recommendationValidUntil !== null && value.recommendationValidUntil > now;
}
