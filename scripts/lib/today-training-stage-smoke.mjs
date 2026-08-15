import { createHash } from "node:crypto";

const timeout = () => AbortSignal.timeout(15_000);
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

async function requestJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, { ...options, signal: timeout() });
  let body;
  try {
    body = await response.json();
  } catch (cause) {
    throw new Error(`stage_smoke:response_json_invalid:${response.status}:${url}`, { cause });
  }
  return { status: response.status, body };
}

const headers = (credential) => ({ authorization: `Bearer ${credential.idToken}`,
  "x-firebase-appcheck": credential.appCheckToken, "content-type": "application/json" });

const reservePayloadFor = (decision, session, idempotencyKey) => ({
  dayRef: session.dayRef, scheduledSessionId: session.scheduledSessionId,
  scheduledSessionRevision: session.scheduledSessionRevision, planRevision: decision.planSource.planRevision,
  projectionId: decision.projectionId, prescriptionId: decision.sourceRefs?.prescriptionId ?? null,
  prescriptionValidFrom: decision.prescription?.validFrom ?? null, proposalId: decision.sourceRefs?.proposalId ?? null,
  receiptAuditId: decision.sourceRefs?.receiptAuditId ?? null, discipline: "bike", idempotencyKey,
});

export async function runTodayTrainingStageSmoke(input, dependencies) {
  if (!/^[a-f0-9]{40}$/u.test(input.commitSha) || !/^https:\/\//u.test(input.serviceUrl)
    || !/^[a-z][a-z0-9-]{4,62}$/u.test(input.projectId)) throw new Error("stage_smoke:config_invalid");
  const [eligible, ineligible] = await Promise.all([
    dependencies.credentialsForIdentity(input.eligibleUid), dependencies.credentialsForIdentity(input.ineligibleUid),
  ]);
  if (!eligible.idToken || !eligible.appCheckToken || !ineligible.idToken || !ineligible.appCheckToken) {
    throw new Error("stage_smoke:credentials_invalid");
  }
  const today = await requestJson(dependencies.fetchImpl, `${input.serviceUrl}/v1/coach/training-decisions/today?discipline=bike`, {
    method: "GET", headers: headers(eligible),
  });
  const decision = today.body?.data;
  if (today.status !== 200 || today.body?.status !== "ok" || decision?.schemaVersion !== "today-training-decision-v1"
    || today.body?.providerCalls !== 0 || today.body?.quotaConsumed !== 0
    || decision?.capabilities?.execution?.reserve !== "available" || decision?.discipline !== "bike") {
    throw new Error("stage_smoke:decision_not_eligible");
  }
  const session = decision.effectiveSessions?.find((item) => item.sessionId === decision.representativeSessionId);
  if (!session || !decision.planSource) throw new Error("stage_smoke:representative_session_missing");
  const reservePayload = reservePayloadFor(decision, session, `stage-${input.commitSha.slice(0, 24)}`);
  const listUrl = `https://asia-northeast3-${input.projectId}.cloudfunctions.net/listSessionExecutions`;
  const listExecutions = async () => {
    const listed = await requestJson(dependencies.fetchImpl, listUrl, {
      method: "POST", headers: headers(eligible), body: JSON.stringify({ data: { discipline: "bike", limit: 20 } }),
    });
    if (listed.status !== 200 || !Array.isArray(listed.body?.data?.executions)) throw new Error("stage_smoke:list_failed");
    return listed.body.data.executions;
  };
  const matchesCurrentDecision = (item) => item?.status !== "invalidated" && item?.discipline === "bike"
    && item?.scheduledSessionId === session.scheduledSessionId
    && item?.scheduledSessionRevision === session.scheduledSessionRevision
    && item?.dayRef?.goalId === session.dayRef.goalId && item?.dayRef?.weekId === session.dayRef.weekId
    && item?.dayRef?.dayIndex === session.dayRef.dayIndex && item?.dayRef?.localDate === session.dayRef.localDate
    && item?.planRevision === decision.planSource.planRevision && item?.projectionId === decision.projectionId
    && (item?.prescriptionId ?? null) === (reservePayload.prescriptionId ?? null)
    && (item?.prescriptionValidFrom ?? null) === (reservePayload.prescriptionValidFrom ?? null)
    && (item?.proposalId ?? null) === (reservePayload.proposalId ?? null)
    && (item?.receiptAuditId ?? null) === (reservePayload.receiptAuditId ?? null);
  const before = await listExecutions();
  const reusable = before.find((item) => matchesCurrentDecision(item)
    && item.status === "reserved" && item.outcomeStatus === "pending");
  const reserveUrl = `${input.serviceUrl}/v1/coach/session-executions/reserve`;
  const ineligibleToday = await requestJson(dependencies.fetchImpl,
    `${input.serviceUrl}/v1/coach/training-decisions/today?discipline=bike`, {
      method: "GET", headers: headers(ineligible),
    });
  const ineligibleDecision = ineligibleToday.body?.data;
  const ineligibleSession = ineligibleDecision?.effectiveSessions
    ?.find((item) => item.sessionId === ineligibleDecision.representativeSessionId);
  if (ineligibleToday.status !== 200 || ineligibleToday.body?.status !== "ok"
    || ineligibleDecision?.schemaVersion !== "today-training-decision-v1" || ineligibleDecision?.discipline !== "bike"
    || !ineligibleSession || !ineligibleDecision.planSource) throw new Error("stage_smoke:ineligible_decision_invalid");
  const executionOff = await requestJson(dependencies.fetchImpl, reserveUrl, {
    method: "POST", headers: headers(ineligible),
    body: JSON.stringify(reservePayloadFor(ineligibleDecision, ineligibleSession, `stage-off-${input.commitSha.slice(0, 20)}`)),
  });
  if (executionOff.status !== 404) throw new Error("stage_smoke:execution_not_fail_closed");
  const reserve = await requestJson(dependencies.fetchImpl, reserveUrl, {
    method: "POST", headers: headers(eligible), body: JSON.stringify(reservePayload),
  });
  const execution = reserve.body?.data;
  if (reserve.status !== 200 || reserve.body?.status !== "ok" || typeof execution?.executionId !== "string"
    || execution.status !== "reserved" || execution.outcomeStatus !== "pending" || !matchesCurrentDecision(execution)) {
    throw new Error("stage_smoke:reserve_failed");
  }
  const reservationMode = reusable?.executionId === execution.executionId ? "reused" : "fresh";
  const executions = await listExecutions();
  if (typeof execution?.executionId !== "string" || !matchesCurrentDecision(execution)
    || !executions.some((item) => item?.executionId === execution.executionId && matchesCurrentDecision(item)
      && item.status === "reserved" && item.outcomeStatus === "pending")) {
    throw new Error("stage_smoke:list_missing_current_execution");
  }
  return { schemaVersion: "today-training-stage-smoke-v1", commitSha: input.commitSha, projectId: input.projectId,
    createdAt: new Date(dependencies.now()).toISOString(), auth: { idToken: true, appCheck: true },
    decision: { status: 200, schemaVersion: decision.schemaVersion, providerCalls: 0, quotaConsumed: 0 },
    executionOff: { status: 404 }, executionEligible: { status: 200, discipline: "bike" },
    reserve: { status: 200, reservationMode, executionIdDigest: digest(execution.executionId),
      scheduledSessionIdDigest: digest(execution.scheduledSessionId) },
    list: { status: 200, discipline: "bike", containsReserved: true } };
}
