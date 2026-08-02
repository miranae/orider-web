import { describe, expect, it } from "vitest";
import { parseCoachP2Request, parseCoachP2Response } from "./coachP2Contract";

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

  it("accepts a server-valid post-start unavailable result without hiding consumed quota", () => {
    const postStart = { ...unavailable, quota: { consumed: true },
      budget: { providerCalls: 2, inputTokens: 80, outputTokens: 20 },
      execution: { graphVersion: "p2-v1", started: true } };
    expect(parseCoachP2Response({ data: postStart })).toMatchObject({ outcome: "unavailable",
      quota: { consumed: true }, budget: { providerCalls: 2 }, execution: { started: true } });
  });

  it("accepts latest-activity-missing as the server's non-retryable terminal reason", () => {
    const missing = { ...unavailable,
      error: { code: "graph_execution_unavailable", retryable: false, fallbackAvailable: false },
      budget: { providerCalls: 1, inputTokens: 50, outputTokens: 0 },
      retry: { mode: "none", providerCallAllowed: false, retryable: false, reasonCode: "latest_activity_missing" },
      execution: { graphVersion: "p2-v1", started: true } };
    expect(parseCoachP2Response({ data: missing })).toMatchObject({ outcome: "unavailable",
      error: { code: "graph_execution_unavailable" }, retry: { reasonCode: "latest_activity_missing" } });
  });

  it.each([
    ["graph_feature_disabled", false, "none"],
    ["rollout_ineligible", false, "none"],
    ["rollout_dependency_unavailable", true, "same_request_resume"],
  ] as const)("requires admission-only %s to remain pre-start with zero usage", (reasonCode, retryable, mode) => {
    const admission = { ...unavailable, error: { code: reasonCode, retryable, fallbackAvailable: false },
      retry: { mode, providerCallAllowed: false, retryable, reasonCode } };
    expect(parseCoachP2Response({ data: admission })).toMatchObject({ outcome: "unavailable",
      execution: { started: false }, quota: { consumed: false } });
    expect(() => parseCoachP2Response({ data: { ...admission,
      execution: { graphVersion: "p2-v1", started: true } } })).toThrow();
    expect(() => parseCoachP2Response({ data: { ...admission,
      budget: { providerCalls: 1, inputTokens: 1, outputTokens: 0 },
      execution: { graphVersion: "p2-v1", started: true } } })).toThrow();
    expect(() => parseCoachP2Response({ data: { ...admission, quota: { consumed: true },
      execution: { graphVersion: "p2-v1", started: true } } })).toThrow();
  });

  it("rejects impossible progress, response drift, and more than five calls", () => {
    expect(() => parseCoachP2Response({ data: { ...unavailable, quota: { consumed: true } } })).toThrow();
    expect(() => parseCoachP2Response({ data: { ...unavailable,
      budget: { providerCalls: 1, inputTokens: 10, outputTokens: 0 } } })).toThrow();
    expect(() => parseCoachP2Response({ data: { ...answer, extra: true } })).toThrow();
    expect(() => parseCoachP2Response({ data: { ...answer, budget: { ...answer.budget, providerCalls: 6 } } })).toThrow();
  });

  it("strictly validates the empty-context P2 request tuple", () => {
    const request = { requestId, question: "마지막 운동을 코칭해줘", discipline: "bike", locale: "ko-KR",
      apiVersion: "v2", schemaVersion: "coach-respond-graph-v1", capabilityVersion: "p2", contextFilters: {} };
    expect(parseCoachP2Request(request)).toEqual(request);
    expect(() => parseCoachP2Request({ ...request, contextFilters: { pmcSnapshotId: "pmc_private" } })).toThrow();
    expect(() => parseCoachP2Request({ ...request, responseFormat: "auto" })).toThrow();
  });
});
