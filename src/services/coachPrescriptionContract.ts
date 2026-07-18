import { z } from "zod";

export const COACH_PRESCRIPTION_SCHEMA_VERSION = "coach-prescription-v1" as const;
export const COACH_PRESCRIPTION_RULES_VERSION = "coach-prescription-rules-v1" as const;

export type CoachCheckInSignal = "subjective_fatigue" | "soreness" | "pain_or_illness";
export type CoachPrescriptionStatus = "ready" | "needs_checkin" | "insufficient_data" | "safety_blocked";

export interface CoachPrescriptionEvidence {
  evidenceId: string;
  source: "fitness" | "readiness" | "activity" | "goal" | "plan" | "checkin" | "policy" | "derived";
  sourceId: string;
  field: string;
  value: unknown;
  sourceRevision: string;
  asOf: string;
}

export interface CoachReassessmentCondition {
  metric: "form" | "rhr_delta_pct" | "hrv_delta_pct" | "sleep_hours" | "hours_since_high_intensity";
  operator: "gte" | "gt" | "lte" | "lt";
  threshold: { value: number; evidenceId: string };
  maxAgeHours?: number;
  evidenceIds: string[];
  ruleId: string;
}

export interface CoachPrescriptionDay {
  localDate: string;
  action: "rest" | "recovery" | "follow_plan" | "modified_workout" | "reassess";
  workout?: { kind: "rest" | "recovery" | "z2" | "tempo" | "sweet_spot" | "threshold" | "vo2max" | "planned";
    durationMin: number; zone?: "Z1" | "Z2" | "Z3" | "Z4" | "Z5"; targetTss?: number };
  reasonCodes: string[];
  evidenceIds: string[];
  reassessBefore?: CoachReassessmentCondition[];
}

export interface CoachPrescriptionDTO {
  schemaVersion: typeof COACH_PRESCRIPTION_SCHEMA_VERSION;
  prescriptionId: string;
  factsId: string;
  snapshotRevision: string;
  planRevision: string | null;
  rulesVersion: typeof COACH_PRESCRIPTION_RULES_VERSION;
  validFrom: string;
  validUntil: string;
  confidence: "low" | "medium" | "high";
  status: CoachPrescriptionStatus;
  nextDays: CoachPrescriptionDay[];
  nextWeekLoad?: { minTss: number; maxTss: number; evidenceIds: string[] };
  missingSignals: string[];
  requiredSignals?: CoachCheckInSignal[];
  checkInToken?: string;
  evidence: CoachPrescriptionEvidence[];
  providerCalls: 0;
  quotaConsumed: 0;
}

export interface CoachPrescriptionCheckInRequest {
  requestId: string;
  parentRequestId: string;
  checkInToken: string;
  answers: { subjectiveFatigue?: "normal" | "tired"; soreness?: "none" | "present"; painOrIllness?: boolean };
}

export type CoachPrescriptionCheckInResponse =
  | { status: "ok"; prescription: CoachPrescriptionDTO; providerCalls: 0; quotaConsumed: 0 }
  | { status: "error"; error: { code: string; retryable: boolean }; providerCalls: 0; quotaConsumed: 0 };

const id = z.string().regex(/^[a-z0-9_.:-]{3,160}$/i);
const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const reason = z.string().regex(/^[a-z0-9_.:-]{2,160}$/i);
const unique = (items: string[]) => new Set(items).size === items.length;
const refs = z.array(id).max(128).refine(unique);
const evidenceValue = z.object({ value: z.number().finite(), evidenceId: id }).strict();
const evidence = z.object({ evidenceId: id, source: z.enum(["fitness", "readiness", "activity", "goal", "plan", "checkin", "policy", "derived"]),
  sourceId: id, field: id, value: z.unknown(), sourceRevision: id, asOf: iso }).strict();
const reassessment = z.object({ metric: z.enum(["form", "rhr_delta_pct", "hrv_delta_pct", "sleep_hours", "hours_since_high_intensity"]),
  operator: z.enum(["gte", "gt", "lte", "lt"]), threshold: evidenceValue, maxAgeHours: z.number().finite().positive().optional(),
  evidenceIds: refs, ruleId: id }).strict();
const workout = z.object({ kind: z.enum(["rest", "recovery", "z2", "tempo", "sweet_spot", "threshold", "vo2max", "planned"]),
  durationMin: z.number().int().nonnegative(), zone: z.enum(["Z1", "Z2", "Z3", "Z4", "Z5"]).optional(),
  targetTss: z.number().int().nonnegative().optional() }).strict();
const day = z.object({ localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), action: z.enum(["rest", "recovery", "follow_plan", "modified_workout", "reassess"]),
  workout: workout.optional(), reasonCodes: z.array(reason).min(1).max(32), evidenceIds: refs,
  reassessBefore: z.array(reassessment).max(8).optional() }).strict();

export const coachPrescriptionSchema = z.object({
  schemaVersion: z.literal(COACH_PRESCRIPTION_SCHEMA_VERSION), prescriptionId: z.string().regex(/^rx_[0-9a-f]{24}$/), factsId: id,
  snapshotRevision: id, planRevision: id.nullable(), rulesVersion: z.literal(COACH_PRESCRIPTION_RULES_VERSION), validFrom: iso, validUntil: iso,
  confidence: z.enum(["low", "medium", "high"]), status: z.enum(["ready", "needs_checkin", "insufficient_data", "safety_blocked"]),
  nextDays: z.array(day).max(7), nextWeekLoad: z.object({ minTss: z.number().int().nonnegative(), maxTss: z.number().int().nonnegative(), evidenceIds: refs }).strict().optional(),
  missingSignals: z.array(reason).max(64).refine(unique), requiredSignals: z.array(z.enum(["subjective_fatigue", "soreness", "pain_or_illness"])).min(1).max(3).refine(unique).optional(),
  checkInToken: z.string().min(32).max(8_192).optional(), evidence: z.array(evidence).max(1_500), providerCalls: z.literal(0), quotaConsumed: z.literal(0),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) context.addIssue({ code: "custom", message: "invalid validity window" });
  const evidenceIds = new Set(value.evidence.map((item) => item.evidenceId));
  if (evidenceIds.size !== value.evidence.length) context.addIssue({ code: "custom", message: "duplicate evidence" });
  const referenced = [...value.nextDays.flatMap((item) => [item.evidenceIds, ...(item.reassessBefore?.flatMap((condition) => [condition.evidenceIds, [condition.threshold.evidenceId]]) ?? [])]).flat(),
    ...(value.nextWeekLoad?.evidenceIds ?? [])];
  if (referenced.some((evidenceId) => !evidenceIds.has(evidenceId))) context.addIssue({ code: "custom", message: "missing evidence reference" });
  value.nextDays.forEach((item) => {
    if ((item.action === "reassess") === Boolean(item.workout)) context.addIssue({ code: "custom", message: "invalid day workout" });
    item.reassessBefore?.forEach((condition) => {
      if (!condition.evidenceIds.includes(condition.threshold.evidenceId)) context.addIssue({ code: "custom", message: "threshold evidence mismatch" });
    });
  });
  if (value.status === "ready") {
    if (value.nextDays.length !== 7 || !value.nextWeekLoad || value.requiredSignals || value.checkInToken
        || value.nextWeekLoad.maxTss < value.nextWeekLoad.minTss) context.addIssue({ code: "custom", message: "ready contract mismatch" });
  } else if (value.nextDays.length !== 0 || value.nextWeekLoad) context.addIssue({ code: "custom", message: "exact prescription forbidden" });
  if (value.status === "needs_checkin") {
    if (!value.requiredSignals?.length || !value.checkInToken
        || value.requiredSignals.some((signal) => !value.missingSignals.includes(signal))) context.addIssue({ code: "custom", message: "check-in contract mismatch" });
  } else if (value.requiredSignals || value.checkInToken) context.addIssue({ code: "custom", message: "check-in fields forbidden" });
});

const checkInResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), prescription: coachPrescriptionSchema, providerCalls: z.literal(0), quotaConsumed: z.literal(0) }).strict(),
  z.object({ status: z.literal("error"), error: z.object({ code: reason, retryable: z.boolean() }).strict(), providerCalls: z.literal(0), quotaConsumed: z.literal(0) }).strict(),
]);

export function parseCoachPrescription(value: unknown): CoachPrescriptionDTO { return coachPrescriptionSchema.parse(value); }

export function parseCoachPrescriptionCheckInResponse(value: unknown): CoachPrescriptionCheckInResponse {
  const wrapper = z.object({ data: z.unknown() }).passthrough().safeParse(value);
  return checkInResponseSchema.parse(wrapper.success ? wrapper.data.data : value);
}

export const coachPrescriptionCheckInRequestSchema = z.object({ requestId: uuid, parentRequestId: uuid,
  checkInToken: z.string().min(32).max(8_192), answers: z.object({ subjectiveFatigue: z.enum(["normal", "tired"]).optional(),
    soreness: z.enum(["none", "present"]).optional(), painOrIllness: z.boolean().optional() }).strict() }).strict();
