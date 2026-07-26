import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdToken: vi.fn(), getAppCheckToken: vi.fn(), runtime: { aiApiBase: "https://coach.example.run.app" as string | undefined },
}));
vi.mock("./firebase", () => ({ auth: { currentUser: { getIdToken: mocks.getIdToken } }, getAppCheckToken: mocks.getAppCheckToken }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => mocks.runtime }));

import {
  askCoach, askCoachV2, CoachClientError, confirmCoachProgressProposal, createCoachProgressProposal,
  getCoachPmcInsight, getCoachProgressPlannerCapabilities, getCoachProgressProposal, getCoachProgressProposalRecovery, getCoachRiderInsight,
  getCoachStatus, parseCoachInitialStatus, parseCoachResponse, rollbackCoachProgressProposal, type CoachRespondRequest,
} from "./coachClient";
import parity from "../features/coach/__fixtures__/pmc-fitness-parity.json";
import riderParity from "../features/coach/__fixtures__/rider-insight-parity.json";

const request: CoachRespondRequest = {
  requestId: "123e4567-e89b-42d3-a456-426614174000", question: "최근 운동을 요약해줘", discipline: "bike",
  locale: "ko-KR", capabilityVersion: "p0", contextFilters: {},
};

const response = {
  requestId: request.requestId, status: "ok", reasonCode: "completed", intent: "summary",
  answer: { blocks: [
    { kind: "headline", parts: [{ type: "text", text: "최근 훈련 요약" }] },
    { kind: "insight", parts: [{ type: "evidence", evidenceId: "ev1", displayValue: "TSS 120" }] },
  ], actionCode: "OPEN_PLAN" },
  evidence: [{ evidenceId: "ev1", label: "훈련 부하", value: "120", unit: "TSS", period: "current7d", asOf: "2026-07-18T00:00:00Z" }],
  freshness: { asOf: "2026-07-18T00:00:00Z", latestActivityAt: "2026-07-17T00:00:00Z", staleSources: [] },
  context: { discipline: "bike", period: "current7d", goalIncluded: true },
  quota: { limit: 3, remaining: 2, timezone: "Asia/Seoul", resetAt: "2026-07-19T15:00:00Z" },
  retry: { mode: "same_request_replay", quotaImpact: "none", previousTurnConsumed: true, providerCallAllowed: false, retryable: false, reasonCode: "completed" },
};

describe("coachClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks(); mocks.getIdToken.mockResolvedValue("id-token"); mocks.getAppCheckToken.mockResolvedValue("app-check");
    mocks.runtime.aiApiBase = "https://coach.example.run.app";
  });

  it("loads the strict authoritative status with Auth and App Check", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: {
      status: "available", quota: { limit: 3, consumed: 1, pending: 0, remaining: 2, timezone: "Asia/Seoul", resetAt: "2026-07-19T15:00:00Z" },
    } })));
    await expect(getCoachStatus()).resolves.toMatchObject({ status: "available", quota: { remaining: 2, pending: 0 } });
    expect(fetchMock).toHaveBeenCalledWith("https://coach.example.run.app/v1/coach/status", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer id-token", "X-Firebase-AppCheck": "app-check" }),
    }));
  });

  it("loads a private no-store canonical PMC projection without status, quota, or provider calls", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(parity.cardEnvelope)));
    await expect(getCoachPmcInsight("bike")).resolves.toMatchObject({ discipline: "bike",
      execution: { providerCalls: 0, quotaConsumed: false, writes: 0 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://coach.example.run.app/v1/coach/insights/pmc?discipline=bike",
      expect.objectContaining({ method: "GET", cache: "no-store",
        headers: expect.objectContaining({ Authorization: "Bearer id-token", "X-Firebase-AppCheck": "app-check" }) }),
    );
  });

  it("loads the bounded Bike Rider Insight projection with zero provider, quota, and writes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(riderParity.cardEnvelope)));
    await expect(getCoachRiderInsight()).resolves.toMatchObject({ discipline: "bike", sourceRevision: riderParity.cardEnvelope.data.sourceRevision,
      execution: { providerCalls: 0, quotaConsumed: false, writes: 0 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://coach.example.run.app/v1/coach/insights/rider?discipline=bike",
      expect.objectContaining({ method: "GET", cache: "no-store",
        headers: expect.objectContaining({ Authorization: "Bearer id-token", "X-Firebase-AppCheck": "app-check" }) }));
  });

  it("posts only the merged P0 request DTO and accepts terminal 429 data", async () => {
    const exhausted = { ...response, status: "quota_exceeded", quota: { ...response.quota, remaining: 0 } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: exhausted }), { status: 429 }));
    await expect(askCoach(request)).resolves.toMatchObject({ status: "quota_exceeded", quota: { remaining: 0 } });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify(request) });
  });

  it("posts the explicit P1 tuple and parses terminal envelopes without P0 fallback", async () => {
    const p1Request = { requestId: request.requestId, question: request.question, discipline: request.discipline, locale: request.locale,
      apiVersion: "v2" as const, schemaVersion: "coach-respond-v2" as const, capabilityVersion: "p1" as const, contextFilters: {} };
    const data = { apiVersion: "v2", capabilityVersion: "p1", schemaVersion: "coach-response-envelope-v1", requestId: request.requestId,
      outcome: "unsupported", unsupported: { reasonCodes: ["unsupported_capability"], missingCapabilities: [],
        suggestedQueries: [{ queryTemplateId: "show_weekly_trend", labelKey: "coach.followup.show_weekly_trend" }] },
      quota: { limit: 3, remaining: 3, resetAt: "2026-07-19T15:00:00Z", consumed: false },
      budget: { blocked: false, providerCalls: 0, inputTokens: 0, outputTokens: 0 },
      retry: { mode: "same_request_replay", quotaImpact: "none", previousTurnConsumed: false, providerCallAllowed: false, retryable: false, reasonCode: "unsupported_capability" },
      execution: { parser: "deterministic", asOf: "2026-07-18T00:00:00Z" } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data })));
    await expect(askCoachV2(p1Request)).resolves.toMatchObject({ outcome: "unsupported", quota: { remaining: 3 } });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify(p1Request) });
  });

  it("rejects unknown blocks, actions, evidence references and non-data envelopes", () => {
    expect(() => parseCoachResponse(response)).toThrow("INVALID_COACH_RESPONSE");
    expect(() => parseCoachResponse({ data: { ...response, answer: { ...response.answer, actionCode: "OPEN_URL" } } })).toThrow();
    expect(() => parseCoachResponse({ data: { ...response, answer: { ...response.answer, blocks: [{ kind: "html", parts: [] }] } } })).toThrow();
    expect(() => parseCoachResponse({ data: { ...response, answer: { ...response.answer, blocks: [{ kind: "insight", parts: [{ type: "evidence", evidenceId: "missing", displayValue: "x" }] }] } } })).toThrow();
  });

  it.each(["ok", "insufficient_data", "stale", "unsupported", "quota_exceeded", "budget_blocked", "fallback"] as const)(
    "accepts the allowlisted %s terminal status",
    (status) => {
      const remaining = status === "quota_exceeded" ? 0 : 2;
      expect(parseCoachResponse({ data: { ...response, status, quota: { ...response.quota, remaining } } }).status).toBe(status);
    },
  );

  it.each(["same_request_resume", "same_request_poll", "same_request_replay", "new_request_required", "none"] as const)(
    "accepts the merged %s retry mode fixture",
    (mode) => expect(parseCoachResponse({ data: { ...response, retry: {
      ...response.retry, mode, quotaImpact: mode === "new_request_required" ? "one_new_turn" : "none",
    } } }).retry.mode).toBe(mode),
  );

  it("enforces quota/status, ISO time and evidence identity invariants", () => {
    const initial = (status: string, overrides: Record<string, unknown>) => ({ data: { status, quota: { limit: 3, consumed: 1, pending: 0,
      remaining: 2, timezone: "Asia/Seoul", resetAt: "2026-07-19T15:00:00Z", ...overrides } } });
    expect(() => parseCoachInitialStatus(initial("quota_exhausted", {}))).toThrow();
    expect(() => parseCoachInitialStatus(initial("available", { remaining: 0 }))).toThrow();
    expect(() => parseCoachInitialStatus(initial("available", { remaining: 4 }))).toThrow();
    expect(() => parseCoachInitialStatus(initial("available", { remaining: 1 }))).toThrow();
    expect(() => parseCoachInitialStatus(initial("available", { consumed: 2, pending: 2 }))).toThrow();
    expect(() => parseCoachInitialStatus(initial("available", { resetAt: "tomorrow" }))).toThrow();
    expect(() => parseCoachResponse({ data: { ...response, quota: { ...response.quota, remaining: 4 } } })).toThrow();
    expect(() => parseCoachResponse({ data: { ...response, status: "quota_exceeded" } })).toThrow();
    expect(() => parseCoachResponse({ data: { ...response, evidence: [{ ...response.evidence[0], asOf: "today" }] } })).toThrow();
    expect(() => parseCoachResponse({ data: { ...response, freshness: { ...response.freshness, asOf: "today" } } })).toThrow();
    expect(() => parseCoachResponse({ data: { ...response, evidence: [response.evidence[0], response.evidence[0]] } })).toThrow();
    expect(() => parseCoachResponse({ data: { ...response, evidence: [{ ...response.evidence[0], evidenceId: "bad id" }] } })).toThrow();
    expect(() => parseCoachResponse({ data: { ...response, retry: { ...response.retry, mode: "new_request_required", quotaImpact: "none" } } })).toThrow();
    expect(() => parseCoachResponse({ data: { ...response, retry: { ...response.retry, mode: "same_request_resume", quotaImpact: "one_new_turn" } } })).toThrow();
  });

  it("classifies transport, HTTP and contract failures without exposing response bodies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("private network detail"));
    await expect(getCoachStatus()).rejects.toMatchObject({ kind: "transport", code: "NETWORK_ERROR" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "invalid_request", message: "private" } }), { status: 400 }));
    await expect(askCoach(request)).rejects.toMatchObject({ kind: "http", code: "invalid_request" });
    try {
      parseCoachResponse({ data: {} });
      throw new Error("expected parseCoachResponse to reject an invalid contract");
    } catch (error) {
      expect(error).toBeInstanceOf(CoachClientError);
      expect(error).toMatchObject({ kind: "contract", code: "INVALID_COACH_RESPONSE" });
    }
  });

  it("uses authenticated no-store Progress Planner capability, proposal, confirm, GET, and rollback routes", async () => {
    const capabilities = { schemaVersion: "coach-capabilities-v1", apiVersions: [
      { apiVersion: "v1", capabilityVersion: "p0", requestSchemaVersion: "coach-respond-v1", responseSchemaVersion: "coach-response-payload-v1" },
      { apiVersion: "v2", capabilityVersion: "p1", requestSchemaVersion: "coach-respond-v2", responseSchemaVersion: "coach-response-envelope-v1" },
    ], defaultCapabilityVersion: "p0",
      queryCatalogVersion: "catalog-query", factsCatalogVersion: "catalog-facts", answerSchemaVersion: "answer-schema",
      answerCatalogVersion: "answer-catalog",
      progressPlanner: { read: { enabled: true }, proposal: { enabled: true }, confirm: { enabled: true } },
      prescription: { enabled: true, schemaVersion: "coach-prescription-v1", rulesVersion: "coach-prescription-rules-v1",
        checkIn: { enabled: true, endpoint: "/v1/coach/prescription/check-in" } } };
    const errorResponse = () => new Response(JSON.stringify({ error: { code: "proposal_not_found" } }), { status: 404 });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: capabilities })))
      .mockResolvedValueOnce(errorResponse()).mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(errorResponse()).mockResolvedValueOnce(errorResponse()).mockResolvedValueOnce(errorResponse());
    await expect(getCoachProgressPlannerCapabilities()).resolves.toMatchObject({ progressPlanner: { read: { enabled: true } } });
    const proposalId = `proposal_${"d".repeat(24)}`;
    const createRequest = { requestId: "123e4567-e89b-42d3-a456-426614174000",
      checkInRequestId: "018f47a2-3c4d-7abc-8def-000000000201", localDates: ["2026-07-27"] };
    await expect(createCoachProgressProposal(createRequest)).rejects.toMatchObject({ code: "proposal_not_found" });
    await expect(getCoachProgressProposal(proposalId)).rejects.toMatchObject({ code: "proposal_not_found" });
    const confirmRequest = { requestId: "123e4567-e89b-42d3-a456-426614174001", nonce: "n".repeat(32) };
    await expect(confirmCoachProgressProposal(proposalId, confirmRequest)).rejects.toMatchObject({ code: "proposal_not_found" });
    const rollbackRequest = { requestId: "123e4567-e89b-42d3-a456-426614174002" };
    await expect(rollbackCoachProgressProposal(proposalId, rollbackRequest)).rejects.toMatchObject({ code: "proposal_not_found" });
    const prescriptionId = `rx_${"e".repeat(24)}`; const sourceRequestId = "018f47a2-3c4d-7abc-8def-000000000201";
    await expect(getCoachProgressProposalRecovery(prescriptionId, sourceRequestId)).rejects.toMatchObject({ code: "proposal_not_found" });

    expect(fetchMock.mock.calls).toEqual(expect.arrayContaining([
      ["https://coach.example.run.app/v1/coach/capabilities", expect.objectContaining({ method: "GET", cache: "no-store" })],
      ["https://coach.example.run.app/v1/coach/proposals", expect.objectContaining({ method: "POST", cache: "no-store",
        body: JSON.stringify(createRequest) })],
      [`https://coach.example.run.app/v1/coach/proposals/${proposalId}`, expect.objectContaining({ method: "GET", cache: "no-store" })],
      [`https://coach.example.run.app/v1/coach/proposals/${proposalId}/confirm`, expect.objectContaining({ method: "POST",
        cache: "no-store", body: JSON.stringify(confirmRequest) })],
      [`https://coach.example.run.app/v1/coach/proposals/${proposalId}/rollback`, expect.objectContaining({ method: "POST",
        cache: "no-store", body: JSON.stringify(rollbackRequest) })],
      [`https://coach.example.run.app/v1/coach/change-proposals?prescriptionId=${prescriptionId}&sourceRequestId=${sourceRequestId}`,
        expect.objectContaining({ method: "GET", cache: "no-store" })],
    ]));
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer id-token", "X-Firebase-AppCheck": "app-check" }));
    }
  });

  it("fails closed without an explicit HTTPS AI API base", async () => {
    mocks.runtime.aiApiBase = undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(getCoachStatus()).rejects.toThrow("AI_API_BASE_MISSING");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

export { response as coachResponseFixture };
