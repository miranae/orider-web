import { describe, expect, it } from "vitest";
import { parseCoachP2Response } from "./coachP2Contract";

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const unavailable = { apiVersion: "v2", capabilityVersion: "p2", schemaVersion: "coach-graph-response-envelope-v1",
  requestId, outcome: "unavailable", error: { code: "graph_execution_unavailable", retryable: true, fallbackAvailable: false },
  quota: { consumed: false }, budget: { providerCalls: 0, inputTokens: 0, outputTokens: 0 },
  retry: { mode: "same_request_resume", providerCallAllowed: false, retryable: true, reasonCode: "graph_execution_unavailable" },
  execution: { graphVersion: "p2-v1", started: false } };
const answer = { apiVersion: "v2", capabilityVersion: "p2", schemaVersion: "coach-graph-response-envelope-v1",
  requestId, outcome: "answer", quota: { consumed: true },
  budget: { providerCalls: 3, inputTokens: 120, outputTokens: 80 },
  retry: { mode: "none", providerCallAllowed: false, retryable: false, reasonCode: "answer_generated" },
  execution: { graphVersion: "p2-v1", started: true, delivery: "terminal_artifact" },
  answer: { schemaVersion: "coach-answer-document-v2", catalogVersion: "coach-answer-block-catalog-v2",
    answerId: "answer_1", sourceFactsId: "facts_1", questionSummary: "coach.answer.summary.coaching_report_today_review_bike",
    status: "complete", blocks: [], evidence: [], warnings: [],
    freshness: { asOf: "2026-08-01T02:23:00.000Z", timezone: "Asia/Seoul", staleSourceSlotIds: [] }, followUps: [] } };

describe("coach P2 contract", () => {
  it("parses terminal AnswerDocument delivery with up to five provider calls", () => {
    expect(parseCoachP2Response({ data: answer })).toMatchObject({ outcome: "answer", answer: { compatibility: "supported" },
      budget: { providerCalls: 3 } });
  });

  it("parses retryable unavailable as same-request resume only", () => {
    expect(parseCoachP2Response({ data: unavailable })).toMatchObject({ outcome: "unavailable",
      retry: { mode: "same_request_resume" } });
    expect(() => parseCoachP2Response({ data: { ...unavailable, retry: { ...unavailable.retry, mode: "none" } } })).toThrow();
  });

  it("rejects started unavailable, response drift, and more than five calls", () => {
    expect(() => parseCoachP2Response({ data: { ...unavailable, execution: { graphVersion: "p2-v1", started: true } } })).toThrow();
    expect(() => parseCoachP2Response({ data: { ...answer, extra: true } })).toThrow();
    expect(() => parseCoachP2Response({ data: { ...answer, budget: { ...answer.budget, providerCalls: 6 } } })).toThrow();
  });
});
