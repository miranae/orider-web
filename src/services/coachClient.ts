import { auth, getAppCheckToken } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";
import { parseCoachV2Response, type CoachV2Request, type CoachV2Response } from "./coachV2Contract";
import {
  coachPrescriptionCheckInRequestSchema, parseCoachPrescriptionCheckInResponse,
  type CoachPrescriptionCheckInRequest, type CoachPrescriptionCheckInResponse,
} from "./coachPrescriptionContract";
import { parseCoachPmcInsight, type CoachPmcInsight } from "./coachPmcInsightContract";

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
