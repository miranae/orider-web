import { z } from "zod";
import type { CoachDiscipline } from "./coachClient";
import { parseCoachAnswerDocument, type CoachAnswerDocument } from "./coachV2Contract";

export const COACH_P2_CAPABILITY_VERSION = "p2" as const;
export const COACH_P2_REQUEST_SCHEMA_VERSION = "coach-respond-graph-v1" as const;
export const COACH_P2_RESPONSE_SCHEMA_VERSION = "coach-graph-response-envelope-v1" as const;

export interface CoachP2Request {
  requestId: string;
  question: string;
  discipline: CoachDiscipline;
  locale: string;
  apiVersion: "v2";
  schemaVersion: typeof COACH_P2_REQUEST_SCHEMA_VERSION;
  capabilityVersion: typeof COACH_P2_CAPABILITY_VERSION;
  contextFilters: Record<string, never>;
}

type CoachP2UnavailableReason = "graph_feature_disabled" | "rollout_ineligible" |
  "rollout_dependency_unavailable" | "graph_execution_unavailable" | "latest_activity_missing";

export type CoachP2Response = {
  apiVersion: "v2";
  capabilityVersion: "p2";
  schemaVersion: typeof COACH_P2_RESPONSE_SCHEMA_VERSION;
  requestId: string;
  budget: { providerCalls: number; inputTokens: number; outputTokens: number };
} & ({
  outcome: "answer";
  answer: CoachAnswerDocument;
  quota: { consumed: true };
  retry: { mode: "none"; providerCallAllowed: false; retryable: false; reasonCode: "answer_generated" };
  execution: { graphVersion: "p2-v1"; started: true; delivery: "terminal_artifact" };
} | {
  outcome: "unavailable";
  error: { code: CoachP2UnavailableReason; retryable: boolean; fallbackAvailable: false };
  quota: { consumed: boolean };
  retry: { mode: "none" | "same_request_resume"; providerCallAllowed: false; retryable: boolean;
    reasonCode: CoachP2UnavailableReason };
  execution: { graphVersion: "p2-v1"; started: boolean };
});

const request = z.object({
  requestId: z.string().uuid(), question: z.string().trim().min(2).max(1_000),
  discipline: z.enum(["bike", "run", "swim"]), locale: z.string().min(2).max(35),
  apiVersion: z.literal("v2"), schemaVersion: z.literal(COACH_P2_REQUEST_SCHEMA_VERSION),
  capabilityVersion: z.literal(COACH_P2_CAPABILITY_VERSION), contextFilters: z.object({}).strict(),
}).strict();
const usage = z.object({ providerCalls: z.number().int().min(0).max(5), inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0) }).strict();
const base = {
  apiVersion: z.literal("v2"), capabilityVersion: z.literal("p2"),
  schemaVersion: z.literal(COACH_P2_RESPONSE_SCHEMA_VERSION), requestId: z.string().uuid(),
};
const unavailableReason = z.enum(["graph_feature_disabled", "rollout_ineligible", "rollout_dependency_unavailable",
  "graph_execution_unavailable", "latest_activity_missing"]);
const unavailable = z.object({ ...base, outcome: z.literal("unavailable"),
  error: z.object({ code: unavailableReason, retryable: z.boolean(), fallbackAvailable: z.literal(false) }).strict(),
  quota: z.object({ consumed: z.boolean() }).strict(), budget: usage,
  retry: z.object({ mode: z.enum(["none", "same_request_resume"]), providerCallAllowed: z.literal(false),
    retryable: z.boolean(), reasonCode: unavailableReason }).strict(),
  execution: z.object({ graphVersion: z.literal("p2-v1"), started: z.boolean() }).strict(),
}).strict();
const answer = z.object({ ...base, outcome: z.literal("answer"), answer: z.unknown(),
  quota: z.object({ consumed: z.literal(true) }).strict(), budget: usage,
  retry: z.object({ mode: z.literal("none"), providerCallAllowed: z.literal(false), retryable: z.literal(false),
    reasonCode: z.literal("answer_generated") }).strict(),
  execution: z.object({ graphVersion: z.literal("p2-v1"), started: z.literal(true),
    delivery: z.literal("terminal_artifact") }).strict(),
}).strict();

export function parseCoachP2Response(input: unknown): CoachP2Response {
  const wrapper = z.object({ data: z.unknown() }).passthrough().parse(input);
  const raw = z.discriminatedUnion("outcome", [unavailable, answer]).parse(wrapper.data);
  if (raw.outcome === "unavailable") {
    const missingActivity = raw.retry.reasonCode === "latest_activity_missing";
    const retryable = !missingActivity
      && (raw.error.code === "rollout_dependency_unavailable" || raw.error.code === "graph_execution_unavailable");
    const reasonMatches = missingActivity ? raw.error.code === "graph_execution_unavailable"
      : raw.retry.reasonCode === raw.error.code;
    const zeroExecution = raw.budget.providerCalls === 0 && raw.budget.inputTokens === 0
      && raw.budget.outputTokens === 0 && !raw.quota.consumed;
    const admissionOnly = raw.retry.reasonCode === "graph_feature_disabled"
      || raw.retry.reasonCode === "rollout_ineligible"
      || raw.retry.reasonCode === "rollout_dependency_unavailable";
    if (!reasonMatches || raw.error.retryable !== retryable || raw.retry.retryable !== retryable
        || raw.retry.mode !== (retryable ? "same_request_resume" : "none")
        || (admissionOnly && (raw.execution.started || !zeroExecution))
        || (!raw.execution.started && !zeroExecution)
        || (raw.quota.consumed && !raw.execution.started)
        || (missingActivity && (!raw.execution.started || raw.quota.consumed))) {
      throw new Error("INVALID_COACH_P2_RESPONSE");
    }
    return raw;
  }
  return { ...raw, answer: parseCoachAnswerDocument(raw.answer) };
}

export function parseCoachP2Request(input: unknown): CoachP2Request {
  return request.parse(input);
}
