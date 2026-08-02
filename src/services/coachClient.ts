import { auth, getAppCheckToken } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";
import { parseCoachV2Response, type CoachV2Request, type CoachV2Response } from "./coachV2Contract";
import { parseCoachP2Request, parseCoachP2Response, type CoachP2Request, type CoachP2Response } from "./coachP2Contract";
import {
  coachPrescriptionCheckInRequestSchema, parseCoachPrescriptionCheckInResponse,
  type CoachPrescriptionCheckInRequest, type CoachPrescriptionCheckInResponse,
} from "./coachPrescriptionContract";
import { parseCoachPmcInsight, type CoachPmcInsight } from "./coachPmcInsightContract";
import { parseCoachRiderInsight, type CoachRiderInsight } from "./coachRiderInsightContract";
import {
  coachRidePlanAiRequestSchema, coachRidePlanPinnedRequestSchema, coachRidePlanTokenRequestSchema,
  parseCoachRidePlan, parseCoachRidePlanAiProjection, parseCoachRidePlanToken,
  type CoachRidePlan, type CoachRidePlanAiProjection, type CoachRidePlanQuestionCode, type CoachRidePlanToken,
} from "./coachRidePlanContract";
import {
  coachProposalConfirmRequestSchema, coachProposalCreateRequestSchema, coachProposalRecoveryQuerySchema,
  coachProposalRollbackRequestSchema,
  parseCoachProgressPlannerCapabilities, parseCoachProposalCreateResponse, parseCoachProposalResponse,
  parseCoachProposalRecoveryResponse, parseCoachReceiptResponse, type CoachProgressPlannerCapabilities, type CoachProposalCreateResponse,
  type CoachProposalRecoveryResponse,
  type CoachProposalResponse, type CoachReceiptResponse,
} from "./coachProgressPlannerContract";

export type CoachDiscipline = "bike" | "run" | "swim";
export type CoachResponseStatus = "ok" | "insufficient_data" | "stale" | "unsupported" | "quota_exceeded" | "budget_blocked" | "fallback";
export type CoachRetryMode = "same_request_resume" | "same_request_poll" | "same_request_replay" | "new_request_required" | "none";
export type CoachActionCode = "FOLLOW_EXISTING_PLAN" | "REVIEW_RECOVERY_BEFORE_TRAINING" | "CHECK_MISSING_DATA" | "OPEN_PLAN" | "NO_ACTIVE_GOAL";
export type CoachClientErrorKind = "transport" | "http" | "contract" | "configuration" | "auth";

export class CoachClientError extends Error {
  constructor(public readonly kind: CoachClientErrorKind, public readonly code: string, options?: { cause?: unknown }) {
    super(code); this.name = "CoachClientError";
    if (options && "cause" in options) Object.defineProperty(this, "cause", { value: options.cause, configurable: true });
  }
}

export function isCoachClientError(value: unknown): value is CoachClientError {
  return value instanceof CoachClientError;
}

export interface CoachQuota {
  limit: number;
  remaining: number;
  timezone: string;
  resetAt: string;
}

export interface CoachInitialStatus {
  status: "available" | "quota_exhausted";
  quota: CoachQuota & { consumed: number; pending: number };
}

export type CoachAnswerPart =
  | { type: "text"; text: string }
  | { type: "evidence"; evidenceId: string; displayValue: string };

export interface CoachAnswerBlock {
  kind: "headline" | "insight" | "warning";
  parts: CoachAnswerPart[];
}

export interface CoachEvidence {
  evidenceId: string;
  label: string;
  value: string;
  unit: string | null;
  period: "current7d" | "current28d" | "previous28d" | null;
  asOf: string;
}

export interface CoachRetryDisposition {
  mode: CoachRetryMode;
  quotaImpact: "none" | "one_new_turn";
  previousTurnConsumed: boolean;
  providerCallAllowed: boolean;
  retryable: boolean;
  reasonCode: string;
}

export interface CoachResponse {
  requestId: string;
  status: CoachResponseStatus;
  reasonCode: string;
  intent: "summary" | "compare" | "unsupported";
  answer: { blocks: CoachAnswerBlock[]; actionCode: CoachActionCode | null };
  evidence: CoachEvidence[];
  freshness: { asOf: string | null; latestActivityAt: string | null; staleSources: string[] };
  context: { discipline: CoachDiscipline; period: "current7d" | "current28d"; goalIncluded: boolean } | null;
  quota: CoachQuota;
  retry: CoachRetryDisposition;
}

export interface CoachRespondRequest {
  requestId: string;
  question: string;
  discipline: CoachDiscipline;
  locale: string;
  capabilityVersion: "p0";
  contextFilters: Record<string, never>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS = new Set<CoachResponseStatus>(["ok", "insufficient_data", "stale", "unsupported", "quota_exceeded", "budget_blocked", "fallback"]);
const RETRY = new Set<CoachRetryMode>(["same_request_resume", "same_request_poll", "same_request_replay", "new_request_required", "none"]);
const ACTIONS = new Set<CoachActionCode>(["FOLLOW_EXISTING_PLAN", "REVIEW_RECOVERY_BEFORE_TRAINING", "CHECK_MISSING_DATA", "OPEN_PLAN", "NO_ACTIVE_GOAL"]);
const DISCIPLINES = new Set<CoachDiscipline>(["bike", "run", "swim"]);
const PERIODS = new Set(["current7d", "current28d", "previous28d"]);
const EVIDENCE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function invalidResponse(): CoachClientError {
  return new CoachClientError("contract", "INVALID_COACH_RESPONSE");
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown, max = 2_000): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function nullableString(value: unknown, max = 2_000): value is string | null {
  return value === null || string(value, max);
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isoDateTime(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_TIME.test(value) && Number.isFinite(Date.parse(value));
}

function nullableIsoDateTime(value: unknown): value is string | null {
  return value === null || isoDateTime(value);
}

function endpoint(path: string): string {
  const base = getRuntimeConfig().aiApiBase;
  if (!base) throw new CoachClientError("configuration", "AI_API_BASE_MISSING");
  if (!base.startsWith("https://")) throw new CoachClientError("configuration", "AI_API_BASE_INVALID");
  return `${base.replace(/\/$/, "")}/v1/coach${path}`;
}

function parseQuota(value: unknown, initial: boolean): CoachQuota & { consumed?: number; pending?: number } {
  const quota = record(value);
  if (!quota || !nonnegativeInteger(quota.limit) || !nonnegativeInteger(quota.remaining)
      || quota.remaining > quota.limit || !string(quota.timezone, 100) || !isoDateTime(quota.resetAt)
      || (initial && (!nonnegativeInteger(quota.consumed) || !nonnegativeInteger(quota.pending)))) {
    throw invalidResponse();
  }
  if (initial && Number(quota.consumed) + Number(quota.pending) > quota.limit) throw invalidResponse();
  if (initial && quota.remaining !== quota.limit - Number(quota.consumed) - Number(quota.pending)) throw invalidResponse();
  return {
    limit: quota.limit,
    remaining: quota.remaining,
    timezone: quota.timezone,
    resetAt: quota.resetAt,
    ...(initial ? { consumed: quota.consumed as number, pending: quota.pending as number } : {}),
  };
}

function dataEnvelope(input: unknown): Record<string, unknown> {
  const envelope = record(input);
  const data = record(envelope?.data);
  if (!data) throw invalidResponse();
  return data;
}

export function parseCoachInitialStatus(input: unknown): CoachInitialStatus {
  const data = dataEnvelope(input);
  if (data.status !== "available" && data.status !== "quota_exhausted") throw invalidResponse();
  const quota = parseQuota(data.quota, true) as CoachInitialStatus["quota"];
  if ((data.status === "available") !== (quota.remaining > 0)) throw invalidResponse();
  return { status: data.status, quota };
}

function parseAnswerPart(value: unknown): CoachAnswerPart {
  const part = record(value);
  if (!part) throw invalidResponse();
  if (part.type === "text" && string(part.text)) return { type: "text", text: part.text };
  if (part.type === "evidence" && typeof part.evidenceId === "string" && EVIDENCE_ID.test(part.evidenceId) && string(part.displayValue)) {
    return { type: "evidence", evidenceId: part.evidenceId, displayValue: part.displayValue };
  }
  throw invalidResponse();
}

function parseEvidence(value: unknown): CoachEvidence {
  const evidence = record(value);
  if (!evidence || typeof evidence.evidenceId !== "string" || !EVIDENCE_ID.test(evidence.evidenceId) || !string(evidence.label)
      || !string(evidence.value) || !nullableString(evidence.unit, 100)
      || !(evidence.period === null || PERIODS.has(String(evidence.period))) || !isoDateTime(evidence.asOf)) {
    throw invalidResponse();
  }
  return {
    evidenceId: evidence.evidenceId,
    label: evidence.label,
    value: evidence.value,
    unit: evidence.unit as string | null,
    period: evidence.period as CoachEvidence["period"],
    asOf: evidence.asOf,
  };
}

export function parseCoachResponse(input: unknown): CoachResponse {
  const data = dataEnvelope(input);
  const answer = record(data.answer);
  const freshness = record(data.freshness);
  const context = data.context === null ? null : record(data.context);
  const retry = record(data.retry);
  if (!UUID.test(String(data.requestId)) || !STATUS.has(data.status as CoachResponseStatus)
      || !string(data.reasonCode, 200) || !["summary", "compare", "unsupported"].includes(String(data.intent))
      || !answer || !Array.isArray(answer.blocks) || answer.blocks.length > 6
      || !(answer.actionCode === null || ACTIONS.has(answer.actionCode as CoachActionCode))
      || !Array.isArray(data.evidence) || data.evidence.length > 30
      || !freshness || !nullableIsoDateTime(freshness.asOf) || !nullableIsoDateTime(freshness.latestActivityAt)
      || !Array.isArray(freshness.staleSources) || freshness.staleSources.some((item) => !string(item, 200))
      || !(data.context === null || context)
      || (context && (!DISCIPLINES.has(context.discipline as CoachDiscipline)
        || !["current7d", "current28d"].includes(String(context.period)) || typeof context.goalIncluded !== "boolean"))
      || !retry || !RETRY.has(retry.mode as CoachRetryMode) || !["none", "one_new_turn"].includes(String(retry.quotaImpact))
      || typeof retry.previousTurnConsumed !== "boolean" || typeof retry.providerCallAllowed !== "boolean"
      || typeof retry.retryable !== "boolean" || !string(retry.reasonCode, 200)) {
    throw invalidResponse();
  }
  if ((retry.mode === "new_request_required") !== (retry.quotaImpact === "one_new_turn")) throw invalidResponse();
  const evidence = data.evidence.map(parseEvidence);
  const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
  if (evidenceIds.size !== evidence.length) throw invalidResponse();
  const blocks = answer.blocks.map((value) => {
    const block = record(value);
    if (!block || !["headline", "insight", "warning"].includes(String(block.kind))
        || !Array.isArray(block.parts) || block.parts.length > 12) throw invalidResponse();
    const parts = block.parts.map(parseAnswerPart);
    if (parts.some((part) => part.type === "evidence" && !evidenceIds.has(part.evidenceId))) {
      throw invalidResponse();
    }
    return { kind: block.kind, parts } as CoachAnswerBlock;
  });
  const quota = parseQuota(data.quota, false);
  if (data.status === "quota_exceeded" && quota.remaining !== 0) throw invalidResponse();
  return {
    requestId: data.requestId as string,
    status: data.status as CoachResponseStatus,
    reasonCode: data.reasonCode,
    intent: data.intent as CoachResponse["intent"],
    answer: { blocks, actionCode: answer.actionCode as CoachActionCode | null }, evidence,
    freshness: {
      asOf: freshness.asOf as string | null,
      latestActivityAt: freshness.latestActivityAt as string | null,
      staleSources: [...freshness.staleSources] as string[],
    },
    context: context ? {
      discipline: context.discipline as CoachDiscipline,
      period: context.period as "current7d" | "current28d",
      goalIncluded: context.goalIncluded as boolean,
    } : null,
    quota: { limit: quota.limit, remaining: quota.remaining, timezone: quota.timezone, resetAt: quota.resetAt },
    retry: {
      mode: retry.mode as CoachRetryMode,
      quotaImpact: retry.quotaImpact as CoachRetryDisposition["quotaImpact"],
      previousTurnConsumed: retry.previousTurnConsumed as boolean,
      providerCallAllowed: retry.providerCallAllowed as boolean,
      retryable: retry.retryable as boolean,
      reasonCode: retry.reasonCode as string,
    },
  };
}

async function authenticatedFetch(path: string, init?: RequestInit): Promise<unknown> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new CoachClientError("auth", "SIGN_IN_REQUIRED");
  const appCheckToken = await getAppCheckToken();
  const url = endpoint(path);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new CoachClientError("transport", "NETWORK_ERROR", { cause });
  }
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok && !record(payload)?.data) {
    const error = record(record(payload)?.error);
    throw new CoachClientError("http", string(error?.code, 200) ? error.code : `HTTP_${response.status}`);
  }
  return payload;
}

export async function getCoachStatus(): Promise<CoachInitialStatus> {
  return parseCoachInitialStatus(await authenticatedFetch("/status"));
}

/** Canonical server projection only; this GET never invokes a provider, consumes quota, or writes. */
export async function getCoachPmcInsight(discipline: CoachDiscipline): Promise<CoachPmcInsight> {
  try {
    const payload = await authenticatedFetch(`/insights/pmc?discipline=${encodeURIComponent(discipline)}`, {
      method: "GET", cache: "no-store",
    });
    return parseCoachPmcInsight(payload, discipline);
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_PMC_INSIGHT", { cause });
  }
}

/** Canonical persisted PDC v5 projection; zero provider calls/quota/writes. */
export async function getCoachRiderInsight(): Promise<CoachRiderInsight> {
  try {
    return parseCoachRiderInsight(await authenticatedFetch("/insights/rider?discipline=bike", { method: "GET", cache: "no-store" }), "bike");
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_RIDER_INSIGHT", { cause });
  }
}

/** Issues an owner-bound opaque token. Course identity stays in the authenticated JSON body and out of URLs/logs. */
export async function createCoachRidePlanToken(courseId: string): Promise<CoachRidePlanToken> {
  try {
    const body = coachRidePlanTokenRequestSchema.parse({ courseId });
    return parseCoachRidePlanToken(await authenticatedFetch("/ride-plan/token", {
      method: "POST", cache: "no-store", body: JSON.stringify(body),
    }));
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_RIDE_PLAN_TOKEN", { cause });
  }
}

/** Reads only the server-computed snapshot; the browser never reconstructs course physics. */
export async function getCoachRidePlan(courseId: string, contextToken: string): Promise<CoachRidePlan> {
  try {
    const body = coachRidePlanPinnedRequestSchema.parse({ courseId, contextToken });
    return parseCoachRidePlan(await authenticatedFetch("/ride-plan", {
      method: "POST", cache: "no-store", body: JSON.stringify(body),
    }));
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_RIDE_PLAN", { cause });
  }
}

/** Token and card must be the exact same server revision before the UI can expose either one. */
export async function loadCoachRidePlan(courseId: string): Promise<CoachRidePlan> {
  const token = await createCoachRidePlanToken(courseId);
  const plan = await getCoachRidePlan(courseId, token.contextToken);
  if (plan.contextToken !== token.contextToken || plan.inputRevision !== token.inputRevision) {
    throw new CoachClientError("contract", "COACH_RIDE_PLAN_REVISION_MISMATCH");
  }
  return plan;
}

/** Builds the provider-safe, zero-provider projection pinned to the card token. */
export async function getCoachRidePlanAiContext(courseId: string, contextToken: string,
  questionCode: CoachRidePlanQuestionCode, signal?: AbortSignal): Promise<CoachRidePlanAiProjection> {
  try {
    const body = coachRidePlanAiRequestSchema.parse({ courseId, contextToken, questionCode });
    return parseCoachRidePlanAiProjection(await authenticatedFetch("/ride-plan/ai-context", {
      method: "POST", cache: "no-store", body: JSON.stringify(body), signal,
    }));
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_RIDE_PLAN_AI_CONTEXT", { cause });
  }
}

export async function getCoachProgressPlannerCapabilities(): Promise<CoachProgressPlannerCapabilities> {
  try {
    return parseCoachProgressPlannerCapabilities(await authenticatedFetch("/capabilities", { method: "GET", cache: "no-store" }));
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_PROGRESS_PLANNER_CAPABILITIES", { cause });
  }
}

/** Owner-scoped durable recovery; server selects the canonical current proposal and receipt. */
export async function getCoachProgressProposalRecovery(prescriptionId: string,
  sourceRequestId: string): Promise<CoachProposalRecoveryResponse> {
  try {
    const query = new URLSearchParams(coachProposalRecoveryQuerySchema.parse({ prescriptionId, sourceRequestId }));
    const parsed = parseCoachProposalRecoveryResponse(await authenticatedFetch(`/change-proposals?${query.toString()}`, {
      method: "GET", cache: "no-store",
    }));
    if (parsed.status === "ok" && (parsed.data.source.prescriptionId !== prescriptionId
        || parsed.data.source.sourceRequestId !== sourceRequestId)) {
      throw new CoachClientError("contract", "COACH_PROGRESS_RECOVERY_SOURCE_MISMATCH");
    }
    return parsed;
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_PROGRESS_RECOVERY", { cause });
  }
}

export async function createCoachProgressProposal(input: { requestId: string; checkInRequestId: string;
  localDates: string[] }): Promise<CoachProposalCreateResponse> {
  try {
    const body = coachProposalCreateRequestSchema.parse(input);
    return parseCoachProposalCreateResponse(await authenticatedFetch("/proposals", {
      method: "POST", cache: "no-store", body: JSON.stringify(body),
    }));
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_PROGRESS_PROPOSAL", { cause });
  }
}

export async function getCoachProgressProposal(proposalId: string): Promise<CoachProposalResponse> {
  if (!/^proposal_[0-9a-f]{24}$/u.test(proposalId)) throw new CoachClientError("contract", "INVALID_COACH_PROPOSAL_ID");
  try {
    return parseCoachProposalResponse(await authenticatedFetch(`/proposals/${encodeURIComponent(proposalId)}`, {
      method: "GET", cache: "no-store",
    }));
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_PROGRESS_PROPOSAL", { cause });
  }
}

export async function confirmCoachProgressProposal(proposalId: string, input: { requestId: string;
  nonce: string }): Promise<CoachReceiptResponse> {
  if (!/^proposal_[0-9a-f]{24}$/u.test(proposalId)) throw new CoachClientError("contract", "INVALID_COACH_PROPOSAL_ID");
  try {
    const body = coachProposalConfirmRequestSchema.parse(input);
    return parseCoachReceiptResponse(await authenticatedFetch(`/proposals/${encodeURIComponent(proposalId)}/confirm`, {
      method: "POST", cache: "no-store", body: JSON.stringify(body),
    }));
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_PROGRESS_RECEIPT", { cause });
  }
}

export async function rollbackCoachProgressProposal(proposalId: string, input: { requestId: string }): Promise<CoachReceiptResponse> {
  if (!/^proposal_[0-9a-f]{24}$/u.test(proposalId)) throw new CoachClientError("contract", "INVALID_COACH_PROPOSAL_ID");
  try {
    const body = coachProposalRollbackRequestSchema.parse(input);
    return parseCoachReceiptResponse(await authenticatedFetch(`/proposals/${encodeURIComponent(proposalId)}/rollback`, {
      method: "POST", cache: "no-store", body: JSON.stringify(body),
    }));
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_PROGRESS_RECEIPT", { cause });
  }
}

export async function askCoach(request: CoachRespondRequest): Promise<CoachResponse> {
  return parseCoachResponse(await authenticatedFetch("/respond", { method: "POST", body: JSON.stringify(request) }));
}

/** P1 is an explicit compatibility tuple; it never falls back to the P0 parser. */
export async function askCoachV2(request: CoachV2Request): Promise<CoachV2Response> {
  try {
    return parseCoachV2Response(await authenticatedFetch("/respond", { method: "POST", body: JSON.stringify(request) }));
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_V2_RESPONSE", { cause });
  }
}

/** P2 is selected only from an advertised product slice and never retries through P1. */
export async function askCoachP2(request: CoachP2Request): Promise<CoachP2Response> {
  let body: CoachP2Request;
  try {
    body = parseCoachP2Request(request);
  } catch (cause) {
    throw new CoachClientError("contract", "INVALID_COACH_P2_REQUEST", { cause });
  }
  try {
    return parseCoachP2Response(await authenticatedFetch("/respond", { method: "POST", body: JSON.stringify(body) }));
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_P2_RESPONSE", { cause });
  }
}

/** Deterministic P2 continuation. The endpoint must return zero provider calls and zero quota consumption. */
export async function submitCoachPrescriptionCheckIn(request: CoachPrescriptionCheckInRequest): Promise<CoachPrescriptionCheckInResponse> {
  try {
    const body = coachPrescriptionCheckInRequestSchema.parse(request);
    return parseCoachPrescriptionCheckInResponse(await authenticatedFetch("/prescription/check-in", {
      method: "POST", body: JSON.stringify(body),
    }));
  } catch (cause) {
    if (isCoachClientError(cause)) throw cause;
    throw new CoachClientError("contract", "INVALID_COACH_PRESCRIPTION_RESPONSE", { cause });
  }
}
