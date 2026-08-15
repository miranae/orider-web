import { describe, expect, it, vi } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { runTodayTrainingStageSmoke } from "../../scripts/lib/today-training-stage-smoke.mjs";
import smokeSchema from "../../scripts/today-training-stage-smoke-v1.schema.json";

const json = (status: number, body: unknown) => ({ status, json: async () => body });
const session = { sessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa", scheduledSessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa",
  scheduledSessionRevision: "ssr_bbbbbbbbbbbbbbbbbbbbbbbb",
  dayRef: { goalId: "goal_1", weekId: "week_1", dayIndex: 2, localDate: "2026-08-15" } };

describe("today training stage smoke", () => {
  it("reserves once, then reuses the current execution across a different commit", async () => {
    const decision = { schemaVersion: "today-training-decision-v1", discipline: "bike",
      projectionId: "today_cccccccccccccccccccccccc", representativeSessionId: session.sessionId,
      effectiveSessions: [session], planSource: { planRevision: "plan_1" },
      sourceRefs: { prescriptionId: "rx_1", proposalId: null, receiptAuditId: null },
      prescription: { validFrom: "2026-08-15T00:00:00.000Z" }, capabilities: { execution: { reserve: "available" } } };
    const execution = { executionId: "exec_1", status: "reserved", discipline: "bike",
      scheduledSessionId: session.sessionId, scheduledSessionRevision: session.scheduledSessionRevision,
      dayRef: session.dayRef,
      planRevision: "plan_1", projectionId: decision.projectionId, prescriptionId: "rx_1",
      prescriptionValidFrom: decision.prescription.validFrom, proposalId: null, receiptAuditId: null };
    let executions: typeof execution[] = [{ ...execution, executionId: "exec_old", status: "invalidated" }]; let reserveCalls = 0;
    const fetchImpl = vi.fn(async (url: string, options: { headers?: Record<string, string> } = {}) => {
      if (url.includes("/training-decisions/today")) return json(200, { status: "ok", providerCalls: 0, quotaConsumed: 0, data: decision });
      if (url.includes("listSessionExecutions")) return json(200, { result: { executions } });
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
    expect(reserveCalls).toBe(1);
    const listCalls = fetchImpl.mock.calls.filter(([url]) => String(url).includes("listSessionExecutions"));
    expect(listCalls).toHaveLength(3);
    expect(listCalls[0]?.[1]).toEqual(expect.objectContaining({ body: JSON.stringify({ data: { discipline: "bike", limit: 20 } }),
      headers: expect.objectContaining({ authorization: "Bearer id-eligible", "x-firebase-appcheck": "app-check" }) }));
    expect(JSON.stringify([first, second])).not.toContain("exec_1");
    expect(JSON.stringify([first, second])).not.toContain(session.sessionId);
    const ajv = new Ajv2020({ strict: true }); addFormats(ajv);
    expect(ajv.validate(smokeSchema, first), ajv.errorsText()).toBe(true);
    expect(ajv.validate(smokeSchema, second), ajv.errorsText()).toBe(true);
  });

  it("fails closed when the rollout-ineligible reserve is not 404", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(200, { status: "ok", providerCalls: 0, quotaConsumed: 0, data: {
        schemaVersion: "today-training-decision-v1", discipline: "bike", projectionId: "today_cccccccccccccccccccccccc",
        representativeSessionId: session.sessionId, effectiveSessions: [session], planSource: { planRevision: "plan_1" },
        sourceRefs: {}, prescription: {}, capabilities: { execution: { reserve: "available" } },
      } })).mockResolvedValueOnce(json(200, { result: { executions: [] } })).mockResolvedValueOnce(json(200, {}));
    await expect(runTodayTrainingStageSmoke({ commitSha: "b".repeat(40), projectId: "orider-stage",
      serviceUrl: "https://stage.example.test", eligibleUid: "eligible", ineligibleUid: "ineligible" }, {
      credentialsForIdentity: async () => ({ idToken: "id", appCheckToken: "app" }), fetchImpl, now: Date.now,
    })).rejects.toThrow("stage_smoke:execution_not_fail_closed");
  });
});
