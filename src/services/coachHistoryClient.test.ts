import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdToken: vi.fn(), getAppCheckToken: vi.fn(), runtime: { aiApiBase: "https://coach.example" as string | undefined },
}));
vi.mock("./firebase", () => ({ auth: { currentUser: { getIdToken: mocks.getIdToken } }, getAppCheckToken: mocks.getAppCheckToken }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => mocks.runtime }));

import {
  continueCoachThread, deleteAllCoachThreads, deleteCoachThread, getCoachThread, getCoachThreads, parseCoachThread, parseCoachThreadPage,
} from "./coachHistoryClient";

const threadId = "123e4567-e89b-42d3-a456-426614174000";
const turnId = "223e4567-e89b-42d3-a456-426614174001";
const olderTurnId = "323e4567-e89b-42d3-a456-426614174002";
const summary = { threadId, title: "이번 주 운동량", discipline: "bike", createdAt: "2026-07-19T01:00:00Z",
  updatedAt: "2026-07-19T02:00:00Z", turnCount: 75, revision: 75 };
const response = { apiVersion: "v2", capabilityVersion: "p1", schemaVersion: "coach-response-envelope-v1", requestId: turnId,
  outcome: "unsupported", unsupported: { reasonCodes: ["unsupported_question"], missingCapabilities: [],
    suggestedQueries: [{ queryTemplateId: "show_weekly_trend", labelKey: "coach.followup.weekly" }] },
  quota: { limit: 3, remaining: 2, resetAt: "2026-07-19T15:00:00Z", consumed: true },
  budget: { blocked: false, providerCalls: 0, inputTokens: 0, outputTokens: 0 },
  retry: { mode: "none", quotaImpact: "none", previousTurnConsumed: true, providerCallAllowed: false, retryable: false, reasonCode: "unsupported_question" },
  execution: { parser: "deterministic", asOf: "2026-07-19T02:00:00Z" } };

describe("coachHistoryClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks(); mocks.getIdToken.mockResolvedValue("id-token"); mocks.getAppCheckToken.mockResolvedValue("app-check");
  });

  it("parses cursor-paged summaries and rejects duplicate thread ids", () => {
    expect(parseCoachThreadPage({ data: { threads: [summary], nextCursor: "next" } }))
      .toMatchObject({ threads: [{ revision: 75 }], nextCursor: "next" });
    expect(() => parseCoachThreadPage({ data: { threads: [summary, summary], nextCursor: null } })).toThrow("INVALID_COACH_HISTORY_RESPONSE");
    expect(() => parseCoachThreadPage({ data: { threads: [summary, { ...summary, threadId: olderTurnId }], nextCursor: null } }, 1))
      .toThrow("INVALID_COACH_HISTORY_RESPONSE");
  });

  it("parses a partial chronological turn page without equating it to total turnCount", () => {
    const older = { turnId: olderTurnId, requestId: olderTurnId, question: "지난주 운동량은?", createdAt: "2026-07-19T01:30:00Z",
      response: { ...response, requestId: olderTurnId }, sessionRevision: 74 };
    const newer = { turnId, requestId: turnId, question: "이번 주 운동량이 어땠어?", createdAt: "2026-07-19T02:00:00Z",
      response, sessionRevision: 75 };
    const page = parseCoachThread({ data: { thread: { ...summary, turns: [older, newer] }, nextCursor: "older-page" } });
    expect(page.thread.turns.map((turn) => turn.turnId)).toEqual([olderTurnId, turnId]);
    expect(page.thread.turnCount).toBe(75);
    expect(page.thread.revision).toBe(75);
    expect(page.nextCursor).toBe("older-page");
    expect(page.thread.turns.map((turn) => turn.responseFormat)).toEqual(["auto", "auto"]);
    expect(page.thread.turns.map((turn) => turn.sessionRevision)).toEqual([74, 75]);
    expect(() => parseCoachThread({ data: { thread: { ...summary, turns: [newer, older] }, nextCursor: null } }))
      .toThrow("INVALID_COACH_HISTORY_RESPONSE");
  });

  it("parses the closed per-turn response format and rejects unknown values", () => {
    const turn = { turnId, requestId: turnId, question: "이번 주 운동량이 어땠어?", createdAt: "2026-07-19T02:00:00Z",
      response, responseFormat: "chart", sessionRevision: 75 };
    expect(parseCoachThread({ data: { thread: { ...summary, turns: [turn] }, nextCursor: null } })
      .thread.turns[0]?.responseFormat).toBe("chart");
    expect(() => parseCoachThread({ data: { thread: { ...summary, turns: [{ ...turn, responseFormat: "markdown" }] }, nextCursor: null } }))
      .toThrow("INVALID_COACH_HISTORY_RESPONSE");
    expect(() => parseCoachThread({ data: { thread: { ...summary, turns: [{ ...turn, sessionRevision: undefined }] }, nextCursor: null } }))
      .toThrow("INVALID_COACH_HISTORY_RESPONSE");
    expect(() => parseCoachThreadPage({ data: { threads: [{ ...summary, revision: undefined }], nextCursor: null } }))
      .toThrow("INVALID_COACH_HISTORY_RESPONSE");
  });

  it("uses authenticated cursor endpoints and server-authoritative deletes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (url.includes(`${threadId}?`)) return new Response(JSON.stringify({ data: { thread: { ...summary, turns: [] }, nextCursor: null } }));
      return new Response(JSON.stringify({ data: { threads: [summary], nextCursor: null } }));
    });
    await getCoachThreads(20, "list-next");
    await getCoachThread(threadId, 50, "turn-next");
    await deleteCoachThread(threadId);
    await deleteAllCoachThreads();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://coach.example/v1/coach/threads?limit=20&cursor=list-next");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`https://coach.example/v1/coach/threads/${threadId}?limit=20&cursor=turn-next`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ Authorization: "Bearer id-token", "X-Firebase-AppCheck": "app-check" }) });
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: "DELETE" });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("rejects every non-2xx response even when the body contains data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { threads: [summary], nextCursor: null } }), { status: 500 }));
    await expect(getCoachThreads()).rejects.toThrow("HTTP_500");
  });

  it("accepts a valid terminal continuation envelope carried by a non-2xx response", async () => {
    const { unsupported: _unsupported, ...base } = response;
    const failed = { ...base, outcome: "failed", error: {
      code: "token_cap_exceeded", retryable: false, fallbackAvailable: false,
    }, retry: { ...response.retry, mode: "same_request_replay", reasonCode: "token_cap_exceeded" } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: failed }), { status: 500 }));
    await expect(continueCoachThread(threadId, {
      requestId: turnId, question: "지난주와 비교해줘", discipline: "bike", locale: "ko-KR",
      apiVersion: "v2", schemaVersion: "coach-respond-v2", capabilityVersion: "p1",
      contextFilters: {}, responseFormat: "auto", expectedSessionRevision: 75,
    })).resolves.toMatchObject({ requestId: turnId, outcome: "failed", error: { code: "token_cap_exceeded" } });
  });

  it("rejects an error-only non-2xx continuation response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { code: "coach_session_revision_conflict" },
    }), { status: 409 }));
    await expect(continueCoachThread(threadId, {
      requestId: turnId, question: "지난주와 비교해줘", discipline: "bike", locale: "ko-KR",
      apiVersion: "v2", schemaVersion: "coach-respond-v2", capabilityVersion: "p1",
      contextFilters: {}, responseFormat: "auto", expectedSessionRevision: 75,
    })).rejects.toThrow("coach_session_revision_conflict");
  });

  it("enforces the detail-page limit, bounded cursors, and canonical UTC timestamps", async () => {
    const turn = { turnId, requestId: turnId, question: "이번 주 운동량이 어땠어?", createdAt: "2026-07-19T02:00:00Z",
      response, sessionRevision: 75 };
    expect(() => parseCoachThread({ data: { thread: { ...summary, turns: [turn, { ...turn, turnId: olderTurnId, requestId: olderTurnId,
      response: { ...response, requestId: olderTurnId } }] }, nextCursor: null } }, 1)).toThrow("INVALID_COACH_HISTORY_RESPONSE");
    expect(() => parseCoachThreadPage({ data: { threads: [{ ...summary, updatedAt: "2026-07-19T02:00:00+00:00" }], nextCursor: null } }))
      .toThrow("INVALID_COACH_HISTORY_RESPONSE");
    await expect(getCoachThread(threadId, 20, "x".repeat(2_049))).rejects.toThrow("INVALID_COACH_HISTORY_CURSOR");
  });
});
