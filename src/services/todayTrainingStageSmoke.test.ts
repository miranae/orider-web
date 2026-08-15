import { describe, expect, it, vi } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { runTodayTrainingStageSmoke } from "../../scripts/lib/today-training-stage-smoke.mjs";
import smokeSchema from "../../scripts/today-training-stage-smoke-v1.schema.json";

const json = (status: number, body: unknown) => ({ status, json: async () => body });
const session = { sessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa", scheduledSessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa",
  scheduledSessionRevision: "ssr_bbbbbbbbbbbbbbbbbbbbbbbb",
  dayRef: { goalId: "goal_1", weekId: "week_1", dayIndex: 2, localDate: "2026-08-15" } };
const ineligibleSession = { sessionId: "ss_dddddddddddddddddddddddd", scheduledSessionId: "ss_dddddddddddddddddddddddd",
  scheduledSessionRevision: "ssr_eeeeeeeeeeeeeeeeeeeeeeee",
  dayRef: { goalId: "goal_2", weekId: "week_2", dayIndex: 3, localDate: "2026-08-16" } };

describe("today training stage smoke", () => {
  it("reserves once, then reuses the current execution across a different commit", async () => {
    const decision = { schemaVersion: "today-training-decision-v1", discipline: "bike",
      projectionId: "today_cccccccccccccccccccccccc", representativeSessionId: session.sessionId,
      effectiveSessions: [session], planSource: { planRevision: "plan_1" },
      sourceRefs: { prescriptionId: "rx_1", proposalId: null, receiptAuditId: null },
      prescription: { validFrom: "2026-08-15T00:00:00.000Z" }, capabilities: { execution: { reserve: "available" } } };
    const ineligibleDecision = { ...decision, projectionId: "today_ffffffffffffffffffffffff",
      representativeSessionId: ineligibleSession.sessionId, effectiveSessions: [ineligibleSession],
      planSource: { planRevision: "plan_2" }, sourceRefs: { prescriptionId: "rx_2", proposalId: null, receiptAuditId: null } };
    const execution = { executionId: "exec_1", status: "reserved", discipline: "bike",
      outcomeStatus: "pending",
      scheduledSessionId: session.sessionId, scheduledSessionRevision: session.scheduledSessionRevision,
      dayRef: session.dayRef,
      planRevision: "plan_1", projectionId: decision.projectionId, prescriptionId: "rx_1",
      prescriptionValidFrom: decision.prescription.validFrom, proposalId: null, receiptAuditId: null };
    let executions: typeof execution[] = [{ ...execution, executionId: "exec_old", status: "invalidated" }]; let reserveCalls = 0;
    const fetchImpl = vi.fn(async (url: string, options: { headers?: Record<string, string>; body?: string } = {}) => {
      if (url.includes("/training-decisions/today")) return json(200, { status: "ok", providerCalls: 0, quotaConsumed: 0,
        data: options.headers?.authorization === "Bearer id-ineligible" ? ineligibleDecision : decision });
      if (url.includes("listSessionExecutions")) return json(200, { data: { executions } });
      if (options.headers?.authorization === "Bearer id-ineligible") return json(404, { error: { code: "not-found" } });
      reserveCalls += 1; executions = [execution]; return json(200, { status: "ok", data: execution });
    });
    const credentialsForIdentity = vi.fn(async (uid: string) => ({ idToken: `id-${uid}`, appCheckToken: "app-check" }));
    const first = await runTodayTrainingStageSmoke({ commitSha: "a".repeat(40), projectId: "orider-stage",
      serviceUrl: "https://stage.example.test", eligibleUid: "eligible", ineligibleUid: "ineligible" },
    { credentialsForIdentity, fetchImpl, now: () => Date.parse("2026-08-15T00:00:00.000Z") });
    const second = await runTodayTrainingStageSmoke({ commitSha: "b".repeat(40), projectId: "orider-stage",
      serviceUrl: "https://stage.example.test", eligibleUid: "eligible", ineligibleUid: "ineligible" },
    { credentialsForIdentity, fetchImpl, now: () => Date.parse("2026-08-15T00:01:00.000Z") });
    expect(first).toMatchObject({ commitSha: "a".repeat(40), auth: { idToken: true, appCheck: true },
      decision: { status: 200 }, executionOff: { status: 404 }, reserve: { status: 200, reservationMode: "fresh" },
      list: { containsReserved: true } });
    expect(second.reserve).toMatchObject({ status: 200, reservationMode: "reused",
      executionIdDigest: first.reserve.executionIdDigest, scheduledSessionIdDigest: first.reserve.scheduledSessionIdDigest });
    expect(reserveCalls).toBe(2);
    const listCalls = fetchImpl.mock.calls.filter(([url]) => String(url).includes("listSessionExecutions"));
    expect(listCalls).toHaveLength(4);
    expect(listCalls[0]?.[1]).toEqual(expect.objectContaining({ body: JSON.stringify({ data: { discipline: "bike", limit: 20 } }),
      headers: expect.objectContaining({ authorization: "Bearer id-eligible", "x-firebase-appcheck": "app-check" }) }));
    const ineligibleReserveCalls = fetchImpl.mock.calls.filter(([url, options]) => String(url).includes("session-executions/reserve")
      && options?.headers?.authorization === "Bearer id-ineligible");
    expect(ineligibleReserveCalls).toHaveLength(2);
    for (const call of ineligibleReserveCalls) {
      expect(JSON.parse(String(call[1]?.body))).toMatchObject({ scheduledSessionId: ineligibleSession.scheduledSessionId,
        scheduledSessionRevision: ineligibleSession.scheduledSessionRevision, dayRef: ineligibleSession.dayRef,
        planRevision: "plan_2", projectionId: ineligibleDecision.projectionId });
    }
    expect(JSON.stringify([first, second])).not.toContain("exec_1");
    expect(JSON.stringify([first, second])).not.toContain(session.sessionId);
    const ajv = new Ajv2020({ strict: true }); addFormats(ajv);
    expect(ajv.validate(smokeSchema, first), ajv.errorsText()).toBe(true);
    expect(ajv.validate(smokeSchema, second), ajv.errorsText()).toBe(true);
  });

  it("uses a different reservation key when the decision tuple changes on the same commit", async () => {
    const decisionFor = (projectionId: string, currentSession: typeof session, planRevision: string) => ({
      schemaVersion: "today-training-decision-v1", discipline: "bike", projectionId,
      representativeSessionId: currentSession.sessionId, effectiveSessions: [currentSession], planSource: { planRevision },
      sourceRefs: { prescriptionId: "rx_1", proposalId: null, receiptAuditId: null },
      prescription: { validFrom: "2026-08-15T00:00:00.000Z" }, capabilities: { execution: { reserve: "available" } },
    });
    const ineligibleDecision = decisionFor("today_ffffffffffffffffffffffff", ineligibleSession, "plan_2");
    let decision = decisionFor("today_cccccccccccccccccccccccc", session, "plan_1");
    let executions: Array<Record<string, unknown>> = [];
    const reservationKeys: string[] = [];
    const fetchImpl = vi.fn(async (url: string, options: { headers?: Record<string, string>; body?: string } = {}) => {
      if (url.includes("/training-decisions/today")) return json(200, { status: "ok", providerCalls: 0, quotaConsumed: 0,
        data: options.headers?.authorization === "Bearer id-ineligible" ? ineligibleDecision : decision });
      if (url.includes("listSessionExecutions")) return json(200, { data: { executions } });
      if (options.headers?.authorization === "Bearer id-ineligible") return json(404, { error: { code: "not-found" } });
      const payload = JSON.parse(String(options.body)) as Record<string, unknown>;
      reservationKeys.push(String(payload.idempotencyKey));
      const execution = { ...payload, executionId: `exec_${reservationKeys.length}`, status: "reserved", outcomeStatus: "pending" };
      executions = [execution];
      return json(200, { status: "ok", data: execution });
    });
    const input = { commitSha: "a".repeat(40), projectId: "orider-stage", serviceUrl: "https://stage.example.test",
      eligibleUid: "eligible", ineligibleUid: "ineligible" };
    const dependencies = { credentialsForIdentity: async (uid: string) => ({ idToken: `id-${uid}`, appCheckToken: "app" }),
      fetchImpl, now: Date.now };
    await runTodayTrainingStageSmoke(input, dependencies);
    decision = decisionFor("today_999999999999999999999999", ineligibleSession, "plan_3");
    executions = [];
    await runTodayTrainingStageSmoke(input, dependencies);
    expect(reservationKeys).toHaveLength(2);
    expect(reservationKeys[0]).not.toBe(reservationKeys[1]);
  });

  it("fails closed when the rollout-ineligible reserve is not 404", async () => {
    const decision = { schemaVersion: "today-training-decision-v1", discipline: "bike", projectionId: "today_cccccccccccccccccccccccc",
      representativeSessionId: session.sessionId, effectiveSessions: [session], planSource: { planRevision: "plan_1" },
      sourceRefs: {}, prescription: {}, capabilities: { execution: { reserve: "available" } } };
    const ineligibleDecision = { ...decision, representativeSessionId: ineligibleSession.sessionId,
      effectiveSessions: [ineligibleSession], planSource: { planRevision: "plan_2" } };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(200, { status: "ok", providerCalls: 0, quotaConsumed: 0, data: decision }))
      .mockResolvedValueOnce(json(200, { data: { executions: [] } }))
      .mockResolvedValueOnce(json(200, { status: "ok", providerCalls: 0, quotaConsumed: 0, data: ineligibleDecision }))
      .mockResolvedValueOnce(json(200, {}));
    await expect(runTodayTrainingStageSmoke({ commitSha: "b".repeat(40), projectId: "orider-stage",
      serviceUrl: "https://stage.example.test", eligibleUid: "eligible", ineligibleUid: "ineligible" }, {
      credentialsForIdentity: async () => ({ idToken: "id", appCheckToken: "app" }), fetchImpl, now: Date.now,
    })).rejects.toThrow("stage_smoke:execution_not_fail_closed");
  });

  it("rejects evidence when the reserved execution is no longer pending in the final list", async () => {
    const decision = { schemaVersion: "today-training-decision-v1", discipline: "bike", projectionId: "today_cccccccccccccccccccccccc",
      representativeSessionId: session.sessionId, effectiveSessions: [session], planSource: { planRevision: "plan_1" },
      sourceRefs: {}, prescription: {}, capabilities: { execution: { reserve: "available" } } };
    const ineligibleDecision = { ...decision, representativeSessionId: ineligibleSession.sessionId,
      effectiveSessions: [ineligibleSession], planSource: { planRevision: "plan_2" } };
    const execution = { executionId: "exec_1", status: "reserved", outcomeStatus: "pending", discipline: "bike",
      scheduledSessionId: session.sessionId, scheduledSessionRevision: session.scheduledSessionRevision, dayRef: session.dayRef,
      planRevision: "plan_1", projectionId: decision.projectionId, prescriptionId: null, prescriptionValidFrom: null,
      proposalId: null, receiptAuditId: null };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(200, { status: "ok", providerCalls: 0, quotaConsumed: 0, data: decision }))
      .mockResolvedValueOnce(json(200, { data: { executions: [] } }))
      .mockResolvedValueOnce(json(200, { status: "ok", providerCalls: 0, quotaConsumed: 0, data: ineligibleDecision }))
      .mockResolvedValueOnce(json(404, {}))
      .mockResolvedValueOnce(json(200, { status: "ok", data: execution }))
      .mockResolvedValueOnce(json(200, { data: { executions: [{ ...execution, status: "started" }] } }));
    await expect(runTodayTrainingStageSmoke({ commitSha: "b".repeat(40), projectId: "orider-stage",
      serviceUrl: "https://stage.example.test", eligibleUid: "eligible", ineligibleUid: "ineligible" }, {
      credentialsForIdentity: async () => ({ idToken: "id", appCheckToken: "app" }), fetchImpl, now: Date.now,
    })).rejects.toThrow("stage_smoke:list_missing_current_execution");
  });

  it("reports the response context when a stage endpoint returns invalid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 502, json: async () => { throw new SyntaxError("invalid JSON"); } });
    await expect(runTodayTrainingStageSmoke({ commitSha: "b".repeat(40), projectId: "orider-stage",
      serviceUrl: "https://stage.example.test", eligibleUid: "eligible", ineligibleUid: "ineligible" }, {
      credentialsForIdentity: async () => ({ idToken: "id", appCheckToken: "app" }), fetchImpl, now: Date.now,
    })).rejects.toThrow("stage_smoke:response_json_invalid:502:https://stage.example.test/v1/coach/training-decisions/today?discipline=bike");
  });

  it("reports status, endpoint, and server code for an abnormal stage response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(503, { error: { code: "upstream-unavailable" } }));
    await expect(runTodayTrainingStageSmoke({ commitSha: "b".repeat(40), projectId: "orider-stage",
      serviceUrl: "https://stage.example.test", eligibleUid: "eligible", ineligibleUid: "ineligible" }, {
      credentialsForIdentity: async () => ({ idToken: "id", appCheckToken: "app" }), fetchImpl, now: Date.now,
    })).rejects.toThrow("stage_smoke:decision_not_eligible:503:https://stage.example.test/v1/coach/training-decisions/today?discipline=bike:upstream-unavailable");
  });
});
