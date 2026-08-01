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
  "rollout_dependency_unavailable" | "graph_execution_unavailable";

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
  quota: { consumed: false };
  retry: { mode: "none" | "same_request_resume"; providerCallAllowed: false; retryable: boolean;
    reasonCode: CoachP2UnavailableReason };
  execution: { graphVersion: "p2-v1"; started: false };
});

const usage = z.object({ providerCalls: z.number().int().min(0).max(5), inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0) }).strict();
const base = {
  apiVersion: z.literal("v2"), capabilityVersion: z.literal("p2"),
  schemaVersion: z.literal(COACH_P2_RESPONSE_SCHEMA_VERSION), requestId: z.string().uuid(),
};
const unavailableReason = z.enum(["graph_feature_disabled", "rollout_ineligible", "rollout_dependency_unavailable",
  "graph_execution_unavailable"]);
const unavailable = z.object({ ...base, outcome: z.literal("unavailable"),
  error: z.object({ code: unavailableReason, retryable: z.boolean(), fallbackAvailable: z.literal(false) }).strict(),
  quota: z.object({ consumed: z.literal(false) }).strict(),
  budget: usage.extend({ providerCalls: z.literal(0), inputTokens: z.literal(0), outputTokens: z.literal(0) }),
  retry: z.object({ mode: z.enum(["none", "same_request_resume"]), providerCallAllowed: z.literal(false),
    retryable: z.boolean(), reasonCode: unavailableReason }).strict(),
  execution: z.object({ graphVersion: z.literal("p2-v1"), started: z.literal(false) }).strict(),
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
    const retryable = raw.error.code === "rollout_dependency_unavailable" || raw.error.code === "graph_execution_unavailable";
    if (raw.error.retryable !== retryable || raw.retry.retryable !== retryable || raw.retry.reasonCode !== raw.error.code
        || raw.retry.mode !== (retryable ? "same_request_resume" : "none")) throw new Error("INVALID_COACH_P2_RESPONSE");
    return raw;
  }
  return { ...raw, answer: parseCoachAnswerDocument(raw.answer) };
}
