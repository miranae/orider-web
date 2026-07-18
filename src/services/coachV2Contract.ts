import { z } from "zod";
import type { CoachDiscipline, CoachRetryDisposition } from "./coachClient";

export const COACH_V2_API_VERSION = "v2" as const;
export const COACH_P1_CAPABILITY_VERSION = "p1" as const;
export const COACH_V2_REQUEST_SCHEMA_VERSION = "coach-respond-v2" as const;
export const COACH_V2_RESPONSE_SCHEMA_VERSION = "coach-response-envelope-v1" as const;
export const COACH_ANSWER_SCHEMA_VERSION = "coach-answer-document-v1" as const;
export const COACH_ANSWER_CATALOG_VERSION = "coach-answer-block-catalog-v1" as const;

export type CoachMetricId = "activity_count" | "duration" | "distance" | "tss" | "ctl" | "atl" |
  "form" | "average_power" | "heart_rate" | "cadence" | "pace" | "elevation" |
  "calories" | "zone_time" | "readiness" | "plan_completion";
export type CoachUnit = "count" | "seconds" | "kilometers" | "tss" | "watts" | "bpm" | "rpm" |
  "seconds_per_km" | "meters" | "kcal" | "percent" | "score" | "dimensionless";
export type CoachDisplayPrimitive = number | string | boolean;

export interface CoachDisplayValue<T extends CoachDisplayPrimitive = number | string> {
  value: T | null;
  unit?: CoachUnit;
  evidenceId: string;
  labelKey?: string;
}

export interface CoachEntityRef {
  entityType: "activity" | "plan_item" | "goal";
  entityId: string;
  label: CoachDisplayValue<string>;
  occurredAt?: CoachDisplayValue<string>;
}

interface BlockBase {
  blockId: string;
  sourceSlotIds: string[];
  partial: boolean;
  stale: boolean;
  truncated: boolean;
  omittedCount: number;
}

export interface NarrativeBlock extends BlockBase {
  kind: "narrative";
  templateKey: "coach.answer.narrative.metric_summary" | "coach.answer.narrative.comparison_summary";
  placeholders: Record<string, CoachDisplayValue>;
}
export interface MetricGridBlock extends BlockBase {
  kind: "metric_grid";
  items: Array<{ metricId: CoachMetricId; current: CoachDisplayValue }>;
}
export interface ComparisonTableBlock extends BlockBase {
  kind: "comparison_table";
  columns: Array<{ id: "current" | "previous" | "delta"; labelKey: string }>;
  rows: Array<{ rowId: string; metricId: CoachMetricId; cells: {
    current: CoachDisplayValue; previous: CoachDisplayValue; delta: CoachDisplayValue;
  } }>;
}
export interface TimeSeriesBlock extends BlockBase {
  kind: "time_series";
  series: Array<{ seriesId: string; metricId: CoachMetricId; points: Array<{
    at: CoachDisplayValue<string>; value: CoachDisplayValue;
  }> }>;
}
export interface DistributionBlock extends BlockBase {
  kind: "distribution";
  categories: Array<{ categoryId: string; label: CoachDisplayValue<string>; value: CoachDisplayValue }>;
}
export interface RankingBlock extends BlockBase {
  kind: "ranking";
  entries: Array<{ rank: CoachDisplayValue<number>; entity: CoachEntityRef; values: CoachDisplayValue[] }>;
}
export interface ActivityListBlock extends BlockBase {
  kind: "activity_list";
  activities: Array<{ activity: CoachEntityRef; values: CoachDisplayValue[] }>;
}
export interface GoalProgressBlock extends BlockBase {
  kind: "goal_progress";
  goalId: string;
  sourceLoadFactsId: string;
  current: CoachDisplayValue;
  target: CoachDisplayValue;
  progress?: CoachDisplayValue;
}
export interface PlanAdherenceBlock extends BlockBase {
  kind: "plan_adherence";
  planned: CoachDisplayValue;
  completed: CoachDisplayValue;
  missed: Array<{ planned: CoachEntityRef; evidenceIds: string[] }>;
  replacements: Array<{ planned: CoachEntityRef; actual: CoachEntityRef; evidenceIds: string[] }>;
}
export interface DataGapBlock extends BlockBase {
  kind: "data_gap";
  reasonCodes: string[];
  missingMetricIds: CoachMetricId[];
}
export type CoachAnswerActionCode = "OPEN_ACTIVITY" | "REVIEW_DATA_GAPS" | "VIEW_TRAINING_LOAD";
export interface ActionBlock extends BlockBase {
  kind: "action";
  actionCode: CoachAnswerActionCode;
  entity?: CoachEntityRef;
}
export interface UnsupportedBlock {
  kind: "unsupported_block";
  blockId: string;
  reason: "unknown_kind" | "invalid_block" | "prescription_feature_disabled";
}

export type CoachAnswerBlock = NarrativeBlock | MetricGridBlock | ComparisonTableBlock | TimeSeriesBlock |
  DistributionBlock | RankingBlock | ActivityListBlock | GoalProgressBlock | PlanAdherenceBlock |
  DataGapBlock | ActionBlock | UnsupportedBlock;

export interface CoachEvidenceRecord {
  evidenceId: string;
  source: "activity" | "activity_metrics" | "fitness" | "goal" | "plan" | "policy" | "load_analysis" | "derived";
  sourceId: string;
  field: string;
  value: unknown;
  sourceRevision: string;
  asOf: string;
  ownerScope: "authenticated_user";
}

export interface CoachAnswerDocument {
  compatibility: "supported" | "unsupported_schema";
  answerId: string;
  sourceFactsId: string;
  questionSummary: string;
  status: "complete" | "partial";
  blocks: CoachAnswerBlock[];
  evidence: CoachEvidenceRecord[];
  warnings: Array<{ code: "partial_fact" | "stale_fact" | "missing_fact" | "truncated_fact" | "fallback_only"; sourceSlotId?: string; metricId?: CoachMetricId }>;
  freshness: { asOf: string; timezone: string; staleSourceSlotIds: string[] };
  followUps: Array<{ queryTemplateId: "compare_previous_period" | "show_weekly_trend" | "show_recent_activities" | "review_missing_data"; labelKey: string }>;
}

export interface CoachClarification {
  clarificationId: string;
  promptKey: string;
  options: Array<{ optionId: string; labelKey: string }>;
  turnToken: string;
  expiresAt: string;
  resolutionMode: "continue_no_charge" | "new_turn_required";
  consumesQuota: false;
  providerCalls: 0;
  reasonCode?: string;
}

export interface CoachUnsupportedPayload {
  reasonCodes: string[];
  missingCapabilities: Array<{ domain?: string; metricId?: CoachMetricId; operationId?: string }>;
  suggestedQueries: CoachAnswerDocument["followUps"];
}

export interface CoachV2Response {
  apiVersion: "v2";
  capabilityVersion: "p1";
  schemaVersion: "coach-response-envelope-v1";
  requestId: string;
  outcome: "answer" | "clarification_required" | "unsupported" | "quota_exceeded" | "budget_blocked" | "failed";
  answer?: CoachAnswerDocument;
  clarification?: CoachClarification;
  unsupported?: CoachUnsupportedPayload;
  error?: { code: string; retryable: boolean; fallbackAvailable: boolean };
  quota: { limit: 3; remaining: number; resetAt: string; consumed: boolean };
  budget: { blocked: boolean; providerCalls: 0 | 1; inputTokens: number; outputTokens: number };
  retry: CoachRetryDisposition;
  execution: { parser: "deterministic" | "provider"; queryPlanHash?: string; catalogVersion?: string; factsId?: string; asOf: string };
}

export interface CoachV2QuestionRequest {
  requestId: string;
  question: string;
  discipline: CoachDiscipline;
  locale: string;
  apiVersion: "v2";
  schemaVersion: "coach-respond-v2";
  capabilityVersion: "p1";
  contextFilters: Record<string, never>;
}

export interface CoachV2ContinueRequest {
  requestId: string;
  parentRequestId: string;
  turnToken: string;
  optionId: string;
  apiVersion: "v2";
  schemaVersion: "coach-respond-v2";
  capabilityVersion: "p1";
}
export type CoachV2Request = CoachV2QuestionRequest | CoachV2ContinueRequest;

const id = z.string().min(1).max(160);
const iso = z.string().datetime({ offset: true });
const reasonCode = z.string().regex(/^[a-z0-9_.:-]{2,120}$/);
const labelKey = z.string().regex(/^coach\.[a-z0-9_.-]{2,100}$/);
const metricId = z.enum(["activity_count", "duration", "distance", "tss", "ctl", "atl", "form", "average_power",
  "heart_rate", "cadence", "pace", "elevation", "calories", "zone_time", "readiness", "plan_completion"]);
const unit = z.enum(["count", "seconds", "kilometers", "tss", "watts", "bpm", "rpm", "seconds_per_km", "meters",
  "kcal", "percent", "score", "dimensionless"]);
const primitive = z.union([z.number().finite(), z.string().max(500), z.boolean(), z.null()]);
const displayValue = z.object({ value: primitive, unit: unit.optional(), evidenceId: id, labelKey: labelKey.optional() }).strict();
const entity = z.object({ entityType: z.enum(["activity", "plan_item", "goal"]), entityId: id,
  label: displayValue, occurredAt: displayValue.optional() }).strict();
const unique = <T>(items: T[]) => new Set(items).size === items.length;
const base = { blockId: id, sourceSlotIds: z.array(id).max(24).refine(unique), partial: z.boolean(), stale: z.boolean(), truncated: z.boolean(),
  omittedCount: z.number().int().nonnegative().max(100_000) };
const schemas = {
  narrative: z.object({ ...base, kind: z.literal("narrative"), templateKey: z.enum([
    "coach.answer.narrative.metric_summary", "coach.answer.narrative.comparison_summary",
  ]), placeholders: z.record(z.string().max(100), displayValue) }).strict(),
  metric_grid: z.object({ ...base, kind: z.literal("metric_grid"), items: z.array(z.object({ metricId, current: displayValue }).strict()).max(500) }).strict(),
  comparison_table: z.object({ ...base, kind: z.literal("comparison_table"), columns: z.array(z.object({
    id: z.enum(["current", "previous", "delta"]), labelKey,
  }).strict()).max(3), rows: z.array(z.object({ rowId: id, metricId, cells: z.object({
    current: displayValue, previous: displayValue, delta: displayValue,
  }).strict() }).strict()).max(160) }).strict(),
  time_series: z.object({ ...base, kind: z.literal("time_series"), series: z.array(z.object({ seriesId: id, metricId,
    points: z.array(z.object({ at: displayValue, value: displayValue }).strict()).max(160),
  }).strict()).max(16) }).strict(),
  distribution: z.object({ ...base, kind: z.literal("distribution"), categories: z.array(z.object({ categoryId: id,
    label: displayValue, value: displayValue,
  }).strict()).max(160) }).strict(),
  ranking: z.object({ ...base, kind: z.literal("ranking"), entries: z.array(z.object({ rank: displayValue, entity,
    values: z.array(displayValue).max(12),
  }).strict()).max(160) }).strict(),
  activity_list: z.object({ ...base, kind: z.literal("activity_list"), activities: z.array(z.object({ activity: entity,
    values: z.array(displayValue).max(12),
  }).strict()).max(160) }).strict(),
  goal_progress: z.object({ ...base, kind: z.literal("goal_progress"), goalId: id, sourceLoadFactsId: id,
    current: displayValue, target: displayValue, progress: displayValue.optional(),
  }).strict(),
  plan_adherence: z.object({ ...base, kind: z.literal("plan_adherence"), planned: displayValue, completed: displayValue,
    missed: z.array(z.object({ planned: entity, evidenceIds: z.array(id).max(24) }).strict()).max(160),
    replacements: z.array(z.object({ planned: entity, actual: entity, evidenceIds: z.array(id).max(24) }).strict()).max(160),
  }).strict(),
  data_gap: z.object({ ...base, kind: z.literal("data_gap"), partial: z.literal(true), reasonCodes: z.array(reasonCode).max(32),
    missingMetricIds: z.array(metricId).max(32),
  }).strict(),
  action: z.discriminatedUnion("actionCode", [
    z.object({ ...base, kind: z.literal("action"), actionCode: z.literal("OPEN_ACTIVITY"),
      entity: entity.refine((value) => value.entityType === "activity"),
    }).strict(),
    z.object({ ...base, kind: z.literal("action"), actionCode: z.enum(["REVIEW_DATA_GAPS", "VIEW_TRAINING_LOAD"]),
    }).strict(),
  ]),
} as const;

const evidence = z.object({ evidenceId: id, source: z.enum(["activity", "activity_metrics", "fitness", "goal", "plan", "policy", "load_analysis", "derived"]),
  sourceId: id, field: id, value: z.unknown(), sourceRevision: id, asOf: iso, ownerScope: z.literal("authenticated_user"),
}).strict();
const warning = z.object({ code: z.enum(["partial_fact", "stale_fact", "missing_fact", "truncated_fact", "fallback_only"]),
  sourceSlotId: id.optional(), metricId: metricId.optional(),
}).strict();
const followUp = z.object({ queryTemplateId: z.enum(["compare_previous_period", "show_weekly_trend", "show_recent_activities", "review_missing_data"]),
  labelKey,
}).strict();
const answerRaw = z.object({ schemaVersion: z.string(), catalogVersion: z.string(), answerId: id, sourceFactsId: id,
  questionSummary: labelKey, status: z.enum(["complete", "partial"]), blocks: z.array(z.unknown()).max(24),
  evidence: z.array(evidence).max(1_500), warnings: z.array(warning).max(64), freshness: z.object({
    asOf: iso, timezone: z.string().min(1).max(100), staleSourceSlotIds: z.array(id).max(24),
  }).strict(), followUps: z.array(followUp).max(4),
}).strict();

const retry = z.object({ mode: z.enum(["same_request_resume", "same_request_poll", "same_request_replay", "new_request_required", "none"]),
  quotaImpact: z.enum(["none", "one_new_turn"]), previousTurnConsumed: z.boolean(), providerCallAllowed: z.boolean(),
  retryable: z.boolean(), reasonCode,
}).strict();
const quota = z.object({ limit: z.literal(3), remaining: z.number().int().min(0).max(3), resetAt: iso, consumed: z.boolean() }).strict();
const budget = z.object({ blocked: z.boolean(), providerCalls: z.union([z.literal(0), z.literal(1)]), inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
}).strict();
const execution = z.object({ parser: z.enum(["deterministic", "provider"]), queryPlanHash: id.optional(), catalogVersion: id.optional(),
  factsId: id.optional(), asOf: iso,
}).strict();
const clarification = z.object({ clarificationId: z.string().regex(/^[A-Za-z0-9_-]{8,96}$/), promptKey: labelKey,
  options: z.array(z.object({ optionId: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/), labelKey }).strict()).min(1).max(6)
    .refine((items) => unique(items.map((item) => item.optionId))),
  turnToken: z.string().max(8_192), expiresAt: iso, resolutionMode: z.enum(["continue_no_charge", "new_turn_required"]),
  consumesQuota: z.literal(false), providerCalls: z.literal(0), reasonCode: reasonCode.optional(),
}).strict().superRefine((value, context) => {
  const validToken = value.resolutionMode === "continue_no_charge"
    ? value.turnToken.length >= 32 && value.turnToken.length <= 8_192
    : value.turnToken === "";
  if (!validToken) context.addIssue({ code: "custom", message: "invalid clarification token" });
});
const unsupported = z.object({ reasonCodes: z.array(reasonCode).min(1).max(16), missingCapabilities: z.array(z.object({
  domain: id.optional(), metricId: metricId.optional(), operationId: id.optional(),
}).strict()).max(32), suggestedQueries: z.array(followUp).min(1).max(4) }).strict();
const error = z.object({ code: reasonCode, retryable: z.boolean(), fallbackAvailable: z.boolean() }).strict();
const envelopeRaw = z.object({ apiVersion: z.literal("v2"), capabilityVersion: z.literal("p1"),
  schemaVersion: z.literal("coach-response-envelope-v1"), requestId: z.string().uuid(),
  outcome: z.enum(["answer", "clarification_required", "unsupported", "quota_exceeded", "budget_blocked", "failed"]),
  answer: z.unknown().optional(), clarification: clarification.optional(), unsupported: unsupported.optional(), error: error.optional(),
  quota, budget, retry, execution,
}).strict();

function sameValue(left: unknown, right: unknown): boolean {
  return Object.is(left, right);
}

function displayValues(block: Exclude<CoachAnswerBlock, UnsupportedBlock>): CoachDisplayValue[] {
  if (block.kind === "narrative") return Object.values(block.placeholders);
  if (block.kind === "metric_grid") return block.items.map((item) => item.current);
  if (block.kind === "comparison_table") return block.rows.flatMap((row) => Object.values(row.cells));
  if (block.kind === "time_series") return block.series.flatMap((series) => series.points.flatMap((point) => [point.at, point.value]));
  if (block.kind === "distribution") return block.categories.flatMap((item) => [item.label, item.value]);
  if (block.kind === "ranking") return block.entries.flatMap((item) => [item.rank, item.entity.label, ...(item.entity.occurredAt ? [item.entity.occurredAt] : []), ...item.values]);
  if (block.kind === "activity_list") return block.activities.flatMap((item) => [item.activity.label, ...(item.activity.occurredAt ? [item.activity.occurredAt] : []), ...item.values]);
  if (block.kind === "goal_progress") return [block.current, block.target, ...(block.progress ? [block.progress] : [])];
  if (block.kind === "plan_adherence") return [block.planned, block.completed, ...block.missed.flatMap((item) => [item.planned.label, ...(item.planned.occurredAt ? [item.planned.occurredAt] : [])]),
    ...block.replacements.flatMap((item) => [item.planned.label, ...(item.planned.occurredAt ? [item.planned.occurredAt] : []),
      item.actual.label, ...(item.actual.occurredAt ? [item.actual.occurredAt] : [])])];
  if (block.kind === "action") return block.entity ? [block.entity.label, ...(block.entity.occurredAt ? [block.entity.occurredAt] : [])] : [];
  return [];
}

function parseBlock(value: unknown, index: number, evidenceById: Map<string, CoachEvidenceRecord>): CoachAnswerBlock {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const safeId = typeof raw?.blockId === "string" && raw.blockId.length <= 160 ? raw.blockId : `unsupported_${index}`;
  if (raw?.kind === "prescription") return { kind: "unsupported_block", blockId: safeId, reason: "prescription_feature_disabled" };
  if (typeof raw?.kind !== "string" || !(raw.kind in schemas)) {
    return { kind: "unsupported_block", blockId: safeId, reason: "unknown_kind" };
  }
  const result = schemas[raw.kind as keyof typeof schemas].safeParse(value);
  if (!result.success) return { kind: "unsupported_block", blockId: safeId, reason: "invalid_block" };
  const block = result.data as Exclude<CoachAnswerBlock, UnsupportedBlock>;
  const validEvidence = displayValues(block).every((item) => {
    const record = evidenceById.get(item.evidenceId);
    return record && sameValue(record.value, item.value);
  });
  const relationEvidence = block.kind !== "plan_adherence" || [...block.missed, ...block.replacements]
    .flatMap((item) => item.evidenceIds).every((evidenceId) => evidenceById.has(evidenceId));
  return validEvidence && relationEvidence ? block : { kind: "unsupported_block", blockId: safeId, reason: "invalid_block" };
}

function parseAnswer(value: unknown): CoachAnswerDocument {
  const raw = answerRaw.parse(value);
  if (raw.schemaVersion !== COACH_ANSWER_SCHEMA_VERSION || raw.catalogVersion !== COACH_ANSWER_CATALOG_VERSION) {
    return { compatibility: "unsupported_schema", answerId: raw.answerId, sourceFactsId: raw.sourceFactsId,
      questionSummary: raw.questionSummary, status: raw.status, blocks: [{ kind: "unsupported_block", blockId: "answer_schema", reason: "invalid_block" }],
      evidence: [], warnings: [], freshness: raw.freshness, followUps: [] };
  }
  const evidenceById = new Map(raw.evidence.map((item) => [item.evidenceId, item]));
  if (evidenceById.size !== raw.evidence.length) throw new Error("INVALID_COACH_V2_RESPONSE");
  return { compatibility: "supported", answerId: raw.answerId, sourceFactsId: raw.sourceFactsId,
    questionSummary: raw.questionSummary, status: raw.status, blocks: raw.blocks.map((block, index) => parseBlock(block, index, evidenceById)),
    evidence: raw.evidence, warnings: raw.warnings, freshness: raw.freshness, followUps: raw.followUps };
}

export function parseCoachV2Response(input: unknown): CoachV2Response {
  const wrapper = z.object({ data: z.unknown() }).passthrough().parse(input);
  const raw = envelopeRaw.parse(wrapper.data);
  const answer = raw.answer === undefined ? undefined : parseAnswer(raw.answer);
  const has = (name: "answer" | "clarification" | "unsupported" | "error") => raw[name] !== undefined;
  const validOutcome = raw.outcome === "answer" ? has("answer") && !has("clarification") && !has("unsupported") && !has("error")
    : raw.outcome === "clarification_required" ? has("clarification") && !has("answer") && !has("unsupported") && !has("error")
      : raw.outcome === "unsupported" ? has("unsupported") && !has("answer") && !has("clarification") && !has("error")
        : has("error") && !has("clarification") && !has("unsupported");
  const hasProvenance = typeof raw.execution.queryPlanHash === "string"
    && typeof raw.execution.catalogVersion === "string" && typeof raw.execution.factsId === "string";
  const hasAnyProvenance = [raw.execution.queryPlanHash, raw.execution.catalogVersion, raw.execution.factsId]
    .some((value) => typeof value === "string");
  const providerBinding = raw.execution.parser === "deterministic" ? raw.budget.providerCalls === 0
    : raw.budget.providerCalls === 1 || raw.outcome !== "answer";
  if (!validOutcome || raw.quota.consumed !== raw.retry.previousTurnConsumed
      || (raw.retry.mode === "new_request_required") !== (raw.retry.quotaImpact === "one_new_turn")
      || (raw.retry.mode === "same_request_replay" && raw.retry.retryable)
      || (raw.error && raw.error.retryable !== raw.retry.retryable)
      || (raw.budget.providerCalls === 0 && (raw.budget.inputTokens !== 0 || raw.budget.outputTokens !== 0))
      || !providerBinding || (raw.budget.providerCalls === 1 && raw.execution.parser !== "provider")
      || (raw.outcome === "answer" && (!hasProvenance || answer?.sourceFactsId !== raw.execution.factsId))
      || (raw.outcome !== "answer" && hasAnyProvenance)
      || (raw.outcome === "quota_exceeded" && (raw.quota.remaining !== 0 || raw.quota.consumed || raw.budget.providerCalls !== 0))
      || (raw.outcome === "budget_blocked" && (!raw.budget.blocked || raw.quota.consumed || raw.budget.providerCalls !== 0))
      || (raw.error && Boolean(answer) !== raw.error.fallbackAvailable)
      || (answer && raw.outcome !== "answer" && (answer.status !== "partial" || answer.blocks.some((block) => !["metric_grid", "data_gap", "action", "unsupported_block"].includes(block.kind))))) {
    throw new Error("INVALID_COACH_V2_RESPONSE");
  }
  return { ...raw, ...(answer ? { answer } : {}) } as CoachV2Response;
}
