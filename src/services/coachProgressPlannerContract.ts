import { z } from "zod";
import { coachPrescriptionSchema } from "./coachPrescriptionContract";

const id = z.string().min(1).max(256);
const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const hash = z.string().regex(/^doc_[0-9a-f]{32}$/u);
const zeroExecution = { providerCalls: z.literal(0), quotaConsumed: z.literal(0) };
const apiVersion = z.discriminatedUnion("capabilityVersion", [
  z.object({ apiVersion: z.literal("v1"), capabilityVersion: z.literal("p0"),
    requestSchemaVersion: z.literal("coach-respond-v1"), responseSchemaVersion: z.literal("coach-response-payload-v1") }).strict(),
  z.object({ apiVersion: z.literal("v2"), capabilityVersion: z.literal("p1"),
    requestSchemaVersion: z.literal("coach-respond-v2"), responseSchemaVersion: z.literal("coach-response-envelope-v1") }).strict(),
  z.object({ apiVersion: z.literal("v2"), capabilityVersion: z.literal("p2"),
    requestSchemaVersion: z.literal("coach-respond-graph-v1"), responseSchemaVersion: z.literal("coach-graph-response-envelope-v1") }).strict(),
]);
const workoutKind = z.enum(["rest", "recovery", "z2", "tempo", "sweet_spot", "threshold", "vo2max", "planned"]);
const workout = z.object({ kind: workoutKind, durationMin: z.number().int().min(0).max(10_080),
  targetTss: z.number().int().min(0).max(10_000).optional() }).strict();
const targetRevision = z.object({ goalId: id, goalHash: hash, planRevision: z.string().regex(/^plan_[0-9a-f]{24}$/u),
  weeks: z.array(z.object({ weekId: id, hash }).strict()).max(104) }).strict();
const evidence = z.object({ evidenceId: id,
  source: z.enum(["fitness", "readiness", "activity", "goal", "plan", "checkin", "policy", "derived"]),
  sourceId: id, field: id, value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
  sourceRevision: id, asOf: iso }).strict();
const change = z.object({ weekId: id, dayIndex: z.number().int().min(0).max(366), localDate: date,
  action: z.enum(["rest", "recovery", "modified_workout"]),
  before: z.object({ action: z.enum(["rest", "follow_plan"]), workout: z.object({ kind: workoutKind,
    durationMin: z.number().int().min(0).max(10_080), targetTss: z.number().int().min(0).max(10_000) }).strict() }).strict(),
  workout, reasonCodes: z.array(id).min(1).max(64).refine((items) => new Set(items).size === items.length),
  evidenceIds: z.array(id).min(1).max(64).refine((items) => new Set(items).size === items.length),
}).strict();

export const coachProgressPlannerCapabilitiesSchema = z.object({
  schemaVersion: z.literal("coach-capabilities-v1"), apiVersions: z.array(apiVersion).min(1).max(3)
    .refine((items) => new Set(items.map((item) => item.capabilityVersion)).size === items.length)
    .refine((items) => items.some((item) => item.capabilityVersion === "p0")
      && items.some((item) => item.capabilityVersion === "p1")),
  defaultCapabilityVersion: z.literal("p0"), queryCatalogVersion: id, factsCatalogVersion: id,
  answerSchemaVersion: id, answerCatalogVersion: id,
  progressPlanner: z.object({ read: z.object({ enabled: z.boolean() }).strict(),
    proposal: z.object({ enabled: z.boolean() }).strict(), confirm: z.object({ enabled: z.boolean() }).strict() }).strict(),
  prescription: z.union([
    z.object({ enabled: z.literal(true), schemaVersion: z.literal("coach-prescription-v1"),
      rulesVersion: z.literal("coach-prescription-rules-v1"), checkIn: z.union([
        z.object({ enabled: z.literal(true), endpoint: z.literal("/v1/coach/prescription/check-in") }).strict(),
        z.object({ enabled: z.literal(false), reasonCode: z.literal("prescription_proposal_feature_disabled") }).strict(),
      ]) }).strict(),
    z.object({ enabled: z.literal(false), reasonCode: z.literal("prescription_feature_disabled"), checkIn: z.union([
      z.object({ enabled: z.literal(true), endpoint: z.literal("/v1/coach/prescription/check-in") }).strict(),
      z.object({ enabled: z.literal(false), reasonCode: z.literal("prescription_proposal_feature_disabled") }).strict(),
    ]) }).strict(),
  ]),
}).strict().superRefine((value, context) => {
  if (value.prescription.enabled !== value.progressPlanner.read.enabled
      || value.prescription.checkIn.enabled !== value.progressPlanner.proposal.enabled) {
    context.addIssue({ code: "custom", message: "progress planner capability mismatch" });
  }
});

export const coachChangeProposalSchema = z.object({ schemaVersion: z.literal("coach-change-proposal-v1"),
  proposalId: z.string().regex(/^proposal_[0-9a-f]{24}$/u),
  status: z.enum(["pending", "applied", "expired", "superseded", "consent_revoked", "reverted"]),
  source: z.object({ checkInRequestId: uuid, prescriptionId: z.string().regex(/^rx_[0-9a-f]{24}$/u),
    factsId: id, snapshotRevision: id, rulesVersion: id,
    weeklyCheckInId: z.string().regex(/^(bike|run|swim)_\d{4}-\d{2}-\d{2}$/u),
    weeklyCheckInRevision: z.number().int().min(1) }).strict(),
  targetRevision, changes: z.array(change).min(1).max(7), evidence: z.array(evidence).max(500),
  consent: z.object({ policyVersion: z.literal("ai-coach-policy-v4"), revision: iso }).strict(),
  createdAt: iso, expiresAt: iso, ...zeroExecution,
}).strict().superRefine((value, context) => {
  if (Date.parse(value.expiresAt) <= Date.parse(value.createdAt)) context.addIssue({ code: "custom", message: "proposal expiry" });
  const evidenceIds = new Set(value.evidence.map((item) => item.evidenceId));
  if (evidenceIds.size !== value.evidence.length
      || value.changes.some((item) => item.evidenceIds.some((evidenceId) => !evidenceIds.has(evidenceId)))) {
    context.addIssue({ code: "custom", message: "proposal evidence mismatch" });
  }
});

export const coachChangeReceiptSchema = z.object({ schemaVersion: z.literal("coach-change-receipt-v1"),
  proposalId: z.string().regex(/^proposal_[0-9a-f]{24}$/u), auditId: z.string().regex(/^audit_[0-9a-f]{24}$/u),
  status: z.enum(["applied", "reverted"]), appliedAt: iso, revertedAt: iso.optional(),
  beforeRevision: targetRevision, afterRevision: targetRevision, ...zeroExecution,
}).strict().superRefine((value, context) => {
  if ((value.status === "reverted") !== Boolean(value.revertedAt)) context.addIssue({ code: "custom", message: "receipt status mismatch" });
});

const error = z.object({ status: z.literal("error"), error: z.object({ code: z.string().regex(/^[a-z0-9_]{1,64}$/u),
  retryable: z.boolean() }).strict(), ...zeroExecution }).strict();
const proposalEnvelope = z.object({ status: z.literal("ok"), data: coachChangeProposalSchema, ...zeroExecution }).strict();
const createEnvelope = z.object({ status: z.literal("ok"), data: z.object({ proposal: coachChangeProposalSchema,
  nonce: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/u) }).strict(), ...zeroExecution }).strict();
const receiptEnvelope = z.object({ status: z.literal("ok"), data: coachChangeReceiptSchema, ...zeroExecution }).strict();
const recoverySource = z.object({ prescriptionId: z.string().regex(/^rx_[0-9a-f]{24}$/u),
  sourceRequestId: uuid }).strict();
const recoveryBase = { schemaVersion: z.literal("coach-change-proposal-recovery-v1"), source: recoverySource,
  ...zeroExecution };
const recoveryData = z.discriminatedUnion("recoveryStatus", [
  z.object({ ...recoveryBase, recoveryStatus: z.literal("not_found"), reasonCode: z.null(), proposal: z.null(),
    receipt: z.null(), confirmNonce: z.null(), rollbackRequestId: z.null() }).strict(),
  z.object({ ...recoveryBase, recoveryStatus: z.literal("pending"), reasonCode: z.null(),
    proposal: coachChangeProposalSchema, receipt: z.null(),
    confirmNonce: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/u), rollbackRequestId: z.null() }).strict(),
  z.object({ ...recoveryBase, recoveryStatus: z.literal("applied"), reasonCode: z.null(),
    proposal: coachChangeProposalSchema, receipt: coachChangeReceiptSchema,
    confirmNonce: z.null(), rollbackRequestId: uuid }).strict(),
  z.object({ ...recoveryBase, recoveryStatus: z.literal("reverted"), reasonCode: z.null(),
    proposal: coachChangeProposalSchema, receipt: coachChangeReceiptSchema,
    confirmNonce: z.null(), rollbackRequestId: uuid }).strict(),
  z.object({ ...recoveryBase, recoveryStatus: z.literal("inactive"),
    reasonCode: z.enum(["proposal_expired", "proposal_revision_changed", "consent_not_active"]),
    proposal: coachChangeProposalSchema, receipt: z.null(), confirmNonce: z.null(), rollbackRequestId: z.null() }).strict(),
]).superRefine((value, context) => {
  if (value.recoveryStatus === "not_found") return;
  const expectedProposalStatus = value.recoveryStatus === "inactive"
    ? { proposal_expired: "expired", proposal_revision_changed: "superseded",
      consent_not_active: "consent_revoked" }[value.reasonCode]
    : value.recoveryStatus;
  if (value.proposal.status !== expectedProposalStatus) {
    context.addIssue({ code: "custom", message: "proposal recovery state mismatch" });
  }
  if (value.source.prescriptionId !== value.proposal.source.prescriptionId
      || value.source.sourceRequestId !== value.proposal.source.checkInRequestId) {
    context.addIssue({ code: "custom", message: "proposal recovery source mismatch" });
  }
  if ((value.recoveryStatus === "applied" || value.recoveryStatus === "reverted")
      && (value.receipt.status !== value.recoveryStatus || value.receipt.proposalId !== value.proposal.proposalId)) {
    context.addIssue({ code: "custom", message: "proposal recovery receipt mismatch" });
  }
});
const recoveryEnvelope = z.object({ status: z.literal("ok"), data: recoveryData, ...zeroExecution }).strict();

export type CoachProgressPlannerCapabilities = z.infer<typeof coachProgressPlannerCapabilitiesSchema>;
export type CoachChangeProposal = z.infer<typeof coachChangeProposalSchema>;
export type CoachChangeReceipt = z.infer<typeof coachChangeReceiptSchema>;
export type CoachProposalError = z.infer<typeof error>;
export type CoachProposalCreateResponse = z.infer<typeof createEnvelope> | CoachProposalError;
export type CoachProposalResponse = z.infer<typeof proposalEnvelope> | CoachProposalError;
export type CoachReceiptResponse = z.infer<typeof receiptEnvelope> | CoachProposalError;
export type CoachProposalRecoveryResponse = z.infer<typeof recoveryEnvelope> | CoachProposalError;
export type CoachProposalRecovery = z.infer<typeof recoveryData>;

function data(value: unknown): unknown {
  const parsed = z.object({ data: z.unknown() }).passthrough().safeParse(value);
  return parsed.success ? parsed.data.data : value;
}

export function parseCoachProgressPlannerCapabilities(value: unknown): CoachProgressPlannerCapabilities {
  return coachProgressPlannerCapabilitiesSchema.parse(data(value));
}
export function parseCoachProposalCreateResponse(value: unknown): CoachProposalCreateResponse {
  return z.union([createEnvelope, error]).parse(value);
}
export function parseCoachProposalResponse(value: unknown): CoachProposalResponse {
  return z.union([proposalEnvelope, error]).parse(value);
}
export function parseCoachReceiptResponse(value: unknown): CoachReceiptResponse {
  return z.union([receiptEnvelope, error]).parse(value);
}
export function parseCoachProposalRecoveryResponse(value: unknown): CoachProposalRecoveryResponse {
  return z.union([recoveryEnvelope, error]).parse(value);
}

export const coachProposalCreateRequestSchema = z.object({ requestId: uuid, checkInRequestId: uuid,
  localDates: z.array(date).min(1).max(7).refine((items) => new Set(items).size === items.length) }).strict();
export const coachProposalConfirmRequestSchema = z.object({ requestId: uuid,
  nonce: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/u) }).strict();
export const coachProposalRollbackRequestSchema = z.object({ requestId: uuid }).strict();
export const coachProposalRecoveryQuerySchema = z.object({ prescriptionId: z.string().regex(/^rx_[0-9a-f]{24}$/u),
  sourceRequestId: uuid }).strict();

// Ensures the consumer retains the same canonical prescription dependency as the response envelope.
export const coachProgressPlannerPrescriptionSchema = coachPrescriptionSchema;
