import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Ajv from "ajv";
import { collectBrowserEvidence } from "./lib/ai-coach-four-axis-browser-evidence.mjs";
import { assertProductNetworkPrivacy, bindLocalContextToRequest, collectLiveComparison, collectStageBaselineComparison,
  createLocalEvidenceEnvelope,
  decodeEvidenceRequest, decodeLocalOperatorContext, FOUR_AXIS_CASES, localWebEvidenceArtifactName,
  observedProductUserDataWrites, readStageProductLedgerReceipts,
  parseOrchestratorActorAllowlist, prefixedEvidenceDigest, privacyScan, MAX_AUTH_RESPONSE_BYTES, MAX_HTTP_RESPONSE_BYTES,
  REQUIRED_RENDER_ASSERTIONS, targetFingerprint,
  validateDispatchRequest, validateLocalEvidenceEnvelope, validateLocalOperatorContext, validateLocalOperatorRequest,
  validateLocalWebStageBaselineEvidenceArtifact, validateStageBaselineDispatchRequest, validateWebEvidenceArtifact,
  validateWebStageBaselineEvidenceArtifact, verifyLocalCheckpointBinding, verifyLocalGoogleIdentity, verifyLocalRepositoryState,
  validateProductLedgerReceipts, verifyLocalEnvelopeSidecar, verifyLocalLeaseGuardBinding, verifyOrchestratorRun,
  WEB_EVIDENCE_TEST_FILES, webEvidenceArtifactName } from
  "./lib/ai-coach-four-axis-web-evidence.mjs";

const SHA = "a".repeat(40); const HASH = "b".repeat(64); const CORRELATION = "four-axis-contract-0001";
const FIREBASE_API_KEY = "firebase-web-api-key-1234567890";
const GOOGLE_EMAIL = /^[A-Za-z0-9][A-Za-z0-9._%+-]{0,127}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,63}$/u;
const fixtureText = readFileSync("scripts/fixtures/ai-coach-four-axis-dispatch-request.json", "utf8");
const fixtureHash = createHash("sha256").update(fixtureText).digest("hex");
const request = JSON.parse(fixtureText);
const v3RequestText = readFileSync("scripts/fixtures/ai-coach-four-axis-stage-baseline-dispatch-request-v2.json", "utf8");
const v3Request = JSON.parse(v3RequestText);
const digest = (character) => `sha256:${character.repeat(64)}`;
const rawDigest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const oidcFor = (audience) => `oidc-${Buffer.from(audience).toString("base64url")}`;

function context() { return { correlationId: CORRELATION, repository: "miranae/orider-web", sha: SHA,
  expectedOrigins: { production: "https://coach-prod.example.com", candidate: "https://candidate---coach-stage.example.com" },
  nowMs: Date.parse("2026-07-27T00:00:00.000Z") }; }
function v3Context() { return { correlationId: CORRELATION, repository: "miranae/orider-web", sha: SHA,
  stageHostSuffix: "---orider-ai-api-stage-ldfyfyx5da-du.a.run.app",
  stageHostSuffixSha256: createHash("sha256")
    .update("---orider-ai-api-stage-ldfyfyx5da-du.a.run.app").digest("hex"),
  orchestratorActors: ["ansrudska", "approved-automation[bot]"],
  nowMs: Date.parse("2026-07-27T00:00:00.000Z") }; }

function localContext() {
  return { schemaVersion: "ai-coach-four-axis-web-local-context-v2",
    contextId: "123e4567-e89b-42d3-a456-426614174000", repository: "miranae/orider-web", commitSha: SHA,
    treeSha: "c".repeat(40), statusClean: true,
    operator: { osAccount: "operator", gitAuthor: "Operator <operator@example.com>",
      cloudAccount: "operator@example.com" },
    identity: { serviceAccount: "ai-coach-stage-collector@orider-dev.iam.gserviceaccount.com",
      localActor: "operator@example.com" },
    backend: { repository: "miranae/orider-g1-web", commitSha: "b".repeat(40), treeSha: "d".repeat(40),
      stageRunId: v3Request.targets.candidate.stageRunId, checkpointSha256: digest("e"),
      leaseGuard: { repository: "miranae/orider-g1-web", commitSha: "b".repeat(40), treeSha: "d".repeat(40),
        relativePath: "scripts/assert-ai-coach-local-stage-lease.mjs", sha256: digest("f") } },
    issuedAt: "2026-07-26T23:55:00.000Z", expiresAt: v3Request.expiresAt,
    request: { path: "request.json", sha256: `sha256:${createHash("sha256").update(v3RequestText).digest("hex")}` },
    stage: { hostSuffix: v3Context().stageHostSuffix, hostSuffixSha256: v3Context().stageHostSuffixSha256,
      targets: { baseline: { targetFingerprint: v3Request.targets.baseline.targetFingerprint,
        tag: v3Request.targets.baseline.tag, revision: v3Request.targets.baseline.revision,
        imageDigest: v3Request.targets.baseline.imageDigest, stageRunId: v3Request.targets.baseline.stageRunId,
        productionAuditDigest: v3Request.targets.baseline.productionAuditDigest },
      candidate: { targetFingerprint: v3Request.targets.candidate.targetFingerprint,
        tag: v3Request.targets.candidate.tag, revision: v3Request.targets.candidate.revision,
        imageDigest: v3Request.targets.candidate.imageDigest, stageRunId: v3Request.targets.candidate.stageRunId } } } };
}

function localRequest() {
  const contextValue = localContext();
  return { schemaVersion: "ai-coach-four-axis-web-local-operator-v1", correlationId: v3Request.correlationId,
    issuedAt: contextValue.issuedAt, expiresAt: contextValue.expiresAt,
    consumer: { repository: contextValue.repository, commitSha: contextValue.commitSha,
      treeSha: contextValue.treeSha, statusClean: true }, backend: contextValue.backend,
    operator: contextValue.operator, identity: contextValue.identity, fixture: v3Request.fixture,
    targets: v3Request.targets };
}

function orchestratorFetch(url) {
  if (url.endsWith("/actions/runs/42001")) return Promise.resolve({ ok: true, json: async () => ({ id: 42001,
    repository: { full_name: "miranae/orider-g1-web" }, head_sha: "b".repeat(40), run_attempt: 1,
    event: "workflow_dispatch", status: "in_progress", conclusion: null, workflow_id: 77,
    actor: { login: "ansrudska" } }) });
  if (url.endsWith("/actions/workflows/77")) return Promise.resolve({ ok: true,
    json: async () => ({ path: ".github/workflows/ai-coach-promotion-gate.yml" }) });
  throw new Error("unexpected GitHub URL");
}

function productExecution(item, targetName) {
  const cardPath = item.caseId.startsWith("pmc_") ? "/v1/coach/insights/pmc"
    : item.caseId.startsWith("rider_") ? "/v1/coach/insights/rider"
    : item.caseId.startsWith("progress_") ? "/v1/coach/change-proposals"
    : item.caseId.startsWith("ride_") ? "/v1/coach/ride-plan" : null;
  return { questionPath: "/v1/coach/respond", cardPath,
    requestKey: createHash("sha256").update(`${targetName}:${item.caseId}:request`).digest("hex"),
    questionStatus: 200, cardStatus: cardPath === null ? null : 200,
    providerCallsObserved: item.providerCalls, providerLedgerCount: item.providerCalls > 0 ? 1 : 0,
    turnLedgerCount: item.quotaConsumed, userDataWrites: 0,
    questionResponseDigest: rawDigest(`${targetName}:${item.caseId}:question`),
    cardResponseDigest: cardPath === null ? null : rawDigest(`${targetName}:${item.caseId}:card`) };
}

function observedLedgerReceipts(requestKey, item, _target, observation) {
  if (observation?.phase === "before") return { request: null, providers: [], turns: [] };
  const createTime = "2026-07-27T00:00:01.000Z"; const updateTime = "2026-07-27T00:00:02.000Z";
  return { request: { path: `coach_requests/${requestKey}`, requestKey,
    requestId: observation?.provenance.requestId, normalizedQuestionDigest: observation?.provenance.questionDigest,
    state: "completed", finalizedAtMs: Date.parse(updateTime),
    createTime, updateTime },
  providers: item.providerCalls > 0 ? [{ path: `coach_provider_budget_charges/${requestKey}`, requestKey,
    usageStatus: "settled", settledAtMs: Date.parse(updateTime), createTime, updateTime }] : [],
  turns: item.quotaConsumed > 0 ? [{ path: `coach_user_turn_charges/${requestKey}`, requestKey,
    chargeStatus: "charged", chargedAtMs: Date.parse(updateTime), createTime, updateTime }] : [] };
}

test("binds local envelope bytes, CLI digest, and a regular sha256 sidecar", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "web-envelope-sidecar-"));
  try {
    const envelopePath = resolve(directory, "evidence.local-file.json");
    const bytes = Buffer.from("{\"ok\":true}\n");
    const sha = createHash("sha256").update(bytes).digest("hex");
    assert.throws(() => verifyLocalEnvelopeSidecar(bytes, envelopePath, sha), /sidecar_missing/u);
    writeFileSync(`${envelopePath}.sha256`, `${"0".repeat(64)}\n`);
    assert.throws(() => verifyLocalEnvelopeSidecar(bytes, envelopePath, sha), /local_envelope_digest/u);
    writeFileSync(`${envelopePath}.sha256`, `${sha}\n`);
    assert.equal(verifyLocalEnvelopeSidecar(bytes, envelopePath, sha), sha);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("accepts only unique backend-cross-checkable ledger receipts", () => {
  const requestKey = "a".repeat(64); const provenance = { requestId: "123e4567-e89b-42d3-a456-426614174000",
    questionDigest: "4".repeat(64),
    notBeforeMs: Date.parse("2026-07-27T00:00:00.000Z"), expiresAtMs: Date.parse("2026-07-27T00:20:00.000Z") };
  const receipt = observedLedgerReceipts(requestKey, { providerCalls: 1, quotaConsumed: 1 }, null,
    { phase: "after", provenance });
  assert.deepEqual(validateProductLedgerReceipts(receipt, requestKey, provenance),
    { requestObserved: true, providerLedgerCount: 1, turnLedgerCount: 1 });
  assert.doesNotThrow(() => validateProductLedgerReceipts({ ...receipt,
    providers: [{ ...receipt.providers[0], settledAtMs: Date.parse(receipt.providers[0].createTime) - 1 }] },
  requestKey, provenance));
  assert.throws(() => validateProductLedgerReceipts({ ...receipt, providers: [...receipt.providers, ...receipt.providers] },
    requestKey, provenance), /ledger_receipt_binding/u);
  assert.throws(() => validateProductLedgerReceipts({ ...receipt,
    request: { ...receipt.request, requestId: "223e4567-e89b-42d3-a456-426614174001" } },
  requestKey, provenance), /ledger_request_binding/u);
  assert.throws(() => validateProductLedgerReceipts({ ...receipt,
    providers: [{ ...receipt.providers[0], settledAtMs: provenance.expiresAtMs + 1 }] },
  requestKey, provenance), /ledger_receipt_binding/u);
  assert.deepEqual(validateProductLedgerReceipts({ request: null, providers: [], turns: [] }, requestKey, provenance),
    { requestObserved: false, providerLedgerCount: 0, turnLedgerCount: 0 });
});

test("observes ledger receipts from the exact Firestore documents", async () => {
  const requestKey = "a".repeat(64); const calls = [];
  const receipts = await readStageProductLedgerReceipts(requestKey, { accessToken: "access-token-123",
    targetName: "baseline", assertStageLease: async (operation) => calls.push(operation),
    fetchImpl: async (url, options) => {
      assert.equal(options.redirect, "error"); assert.ok(options.signal instanceof AbortSignal);
      const path = new URL(url).pathname.split("/documents/")[1];
      if (path.startsWith("coach_user_turn_charges/")) return new Response("{}", { status: 404,
        headers: { "content-type": "application/json" } });
      const fields = path.startsWith("coach_requests/")
        ? { requestKey: { stringValue: requestKey }, requestId: { stringValue: "123e4567-e89b-42d3-a456-426614174000" },
          normalizedQuestionDigest: { stringValue: "4".repeat(64) }, state: { stringValue: "completed" },
          finalizedAtMs: { integerValue: "1785110402000" } }
        : { requestKey: { stringValue: requestKey }, usageStatus: { stringValue: "settled" },
          settledAtMs: { integerValue: "1785110402000" } };
      return new Response(JSON.stringify({ name: `projects/orider-dev/databases/(default)/documents/${path}`,
        createTime: "2026-07-27T00:00:01.000Z", updateTime: "2026-07-27T00:00:02.000Z", fields }),
      { status: 200, headers: { "content-type": "application/json" } });
    } });
  assert.equal(receipts.request.requestId, "123e4567-e89b-42d3-a456-426614174000");
  assert.deepEqual(receipts.turns, []); assert.equal(receipts.providers[0].usageStatus, "settled");
  assert.deepEqual(calls.map((call) => call.path), [
    `coach_requests/${requestKey}`, `coach_user_turn_charges/${requestKey}`,
    `coach_provider_budget_charges/${requestKey}`]);
});

test("bounds and times out Firestore ledger receipt reads with collection context", async () => {
  const requestKey = "a".repeat(64); const base = { accessToken: "access-token-123", targetName: "baseline" };
  await assert.rejects(() => readStageProductLedgerReceipts(requestKey, { ...base,
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, "error"); assert.ok(options.signal instanceof AbortSignal);
      throw new DOMException("timed out", "TimeoutError");
    } }), /v3_ledger_network:coach_requests/u);
  await assert.rejects(() => readStageProductLedgerReceipts(requestKey, { ...base,
    fetchImpl: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json",
      "content-length": String(MAX_AUTH_RESPONSE_BYTES + 1) } }) }),
  /v3_ledger_response:coach_requests:.*v3_ledger_response_content_length/u);
});

function observedStageHttp(calls = [], stageRequest = v3Request, requestDigest = `sha256:${"9".repeat(64)}`) {
  const exchangeTargets = [];
  const actor = stageRequest.identity?.localActor ?? stageRequest.orchestrator.actor;
  const uid = `coach-evidence-${createHash("sha256").update(stageRequest.correlationId).digest("hex").slice(0, 32)}`;
  const jwt = (targetName) => `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: uid, targetName })).toString("base64url")}.${"s".repeat(43)}`;
  const progressByTarget = {
    baseline: { prescriptionId: `rx_${"1".repeat(24)}`,
      sourceRequestId: "22222222-2222-4222-8222-222222222222",
      proposalId: `proposal_${"2".repeat(24)}`, fixtureDigest: digest("6") },
    candidate: { prescriptionId: `rx_${"3".repeat(24)}`,
      sourceRequestId: "44444444-4444-4444-8444-444444444444",
      proposalId: `proposal_${"4".repeat(24)}`, fixtureDigest: digest("7") },
  };
  const pmcData = (targetName) => ({ snapshotId: `pmc_${targetName}`, sourceRevision: `pmcr_${targetName}`,
    current: { ctl: 42, atl: 50, form: -8 }, delta7d: { ctl: 2, atl: -1, form: 3 },
    execution: { providerCalls: 0, quotaConsumed: false, writes: 0 } });
  const riderData = (targetName) => ({ snapshotId: `rider_${targetName}`, sourceRevision: `pdcr_${targetName}`,
    profile: { type: "AllRounder", axisX: 0.25, axisY: -0.1, confidence: 0.91 },
    mmpWatts: { "5s": 980, "1m": 520, "5m": 310, "20m": 255 },
    criticalPower: { cpWatts: 248, wPrimeJoules: 18_500, r2: 0.96 },
    model: { pmaxWatts: 1_020, frcJoules: 19_200, ftpEstWatts: 250, cpEstWatts: 248, tteMinutes: 42 },
    ability: { overallPercentile: 72, byDuration: [{ duration: "20m", wPerKg: 3.64, percentile: 68 }] },
    execution: { providerCalls: 0, quotaConsumed: false, writes: 0 } });
  const rideData = (targetName, questionCode) => ({
    inputRevision: `ridein_${(targetName === "baseline" ? "5" : "6").repeat(24)}`,
    ...(questionCode && { questionCode }), course: { distanceM: 30_000, elevationGainM: 640 },
    estimate: { totalTimeSec: 4_920, averageSpeedKph: 21.95 },
    segments: [{ index: 0, startDistanceM: 0, endDistanceM: 10_000, averageGradePct: 1.2,
      estimatedSpeedKph: 25, estimatedTimeSec: 1_440 },
    { index: 1, startDistanceM: 10_000, endDistanceM: 18_000, averageGradePct: 6.4,
      estimatedSpeedKph: 14, estimatedTimeSec: 2_057 }],
    assumptions: { riderMassKg: 70, rollingResistance: 0.004 },
    execution: { providerCalls: 0, quotaConsumed: false, writes: 0 } });
  const evidenceAnswer = (records) => ({ blocks: [{ kind: "grounded_markdown",
    evidenceIds: records.map((record) => record.evidenceId) }], evidence: records });
  const evidenceRecords = (item, targetName) => {
    const common = (field, value, source, sourceId, sourceRevision) => ({
      evidenceId: `ev_${item.caseId}_${field}_${String(value).replace(/[^a-z0-9]/giu, "_")}`,
      source, sourceId, sourceRevision, field, value, asOf: "2026-07-27T00:00:00.000Z" });
    if (item.source === "pmc") return item.questionCode === "CHANGE"
      ? [common("ctl", 42, "fitness", "pmc", `pmcr_${targetName}`),
        common("ctl", 2, "fitness", "pmc", `pmcr_${targetName}`)]
      : [common("atl", 50, "fitness", "pmc", `pmcr_${targetName}`),
        common("form", -8, "fitness", "pmc", `pmcr_${targetName}`)];
    if (item.source === "rider") return item.questionCode === "PROFILE"
      ? [["rider_type", "AllRounder"], ["axis_x", 0.25], ["axis_y", -0.1], ["confidence", 0.91]]
        .map(([field, value]) => common(field, value, "rider_insight", `rider_${targetName}`, `pdcr_${targetName}`))
      : [["ability_20m_wkg", 3.64], ["ability_20m_percentile", 68]]
        .map(([field, value]) => common(field, value, "rider_insight", `rider_${targetName}`, `pdcr_${targetName}`));
    if (item.source === "ride") {
      const data = rideData(targetName);
      const segments = item.questionCode === "HARDEST_SECTION" ? [data.segments[1]] : data.segments;
      const values = [["distance_m", data.course.distanceM], ["elevation_gain_m", data.course.elevationGainM],
        ["total_time_sec", data.estimate.totalTimeSec], ["average_speed_kph", data.estimate.averageSpeedKph],
        ...segments.flatMap((segment) => [[`segment_${segment.index}_start_m`, segment.startDistanceM],
          [`segment_${segment.index}_end_m`, segment.endDistanceM], [`segment_${segment.index}_grade_pct`, segment.averageGradePct],
          [`segment_${segment.index}_speed_kph`, segment.estimatedSpeedKph], [`segment_${segment.index}_time_sec`, segment.estimatedTimeSec]]),
        ["assumptions", JSON.stringify({ riderMassKg: 70, rollingResistance: 0.004 })]];
      return values.map(([field, value]) => common(field, value, "ride_plan", "ride_plan_projection", data.inputRevision));
    }
    return [];
  };
  return async (url, options) => {
    const parsed = new URL(url); const target = parsed.hostname.startsWith("baseline---")
      ? stageRequest.targets.baseline : stageRequest.targets.candidate;
    const targetName = target === stageRequest.targets.baseline ? "baseline" : "candidate";
    const progress = progressByTarget[targetName];
    calls.push({ targetName, path: parsed.pathname, body: options.body ?? null });
    if (parsed.pathname === "/v1/evidence/four-axis/attestation") {
      assert.equal(options.headers.authorization, `Bearer ${oidcFor(parsed.origin)}`);
      const body = JSON.parse(options.body);
      assert.deepEqual(body, { schemaVersion: "ai-coach-four-axis-attestation-v1",
        correlationId: stageRequest.correlationId, stageRunId: target.stageRunId, revision: target.revision,
        imageDigest: target.imageDigest, requestDigest, orchestratorActor: actor, providerPhase: "enabled" });
      return new Response(JSON.stringify({ schemaVersion: "ai-coach-four-axis-attestation-response-v3",
        correlationId: stageRequest.correlationId, stageRunId: target.stageRunId, revision: target.revision,
        imageDigest: target.imageDigest, evidenceLeaseDigest: digest(targetName === "baseline" ? "8" : "9"),
        orchestratorActor: actor, expiresAt: stageRequest.expiresAt,
        firebaseCustomToken: `firebase-custom-${targetName}`, appCheckToken: `app-check-${targetName}`,
        courseId: `course-evidence-${"3".repeat(32)}`, progress }),
      { status: 200, headers: { "content-type": "application/json" } });
    }
    if (parsed.hostname === "identitytoolkit.googleapis.com") {
      assert.equal(parsed.searchParams.get("key"), FIREBASE_API_KEY);
      const body = JSON.parse(options.body); const exchanged = body.token.replace("firebase-custom-", "");
      assert.ok(["baseline", "candidate"].includes(exchanged)); assert.equal(body.returnSecureToken, true);
      exchangeTargets.push(exchanged);
      return new Response(JSON.stringify({ kind: "identitytoolkit#VerifyCustomTokenResponse",
        idToken: jwt(exchanged), refreshToken: `firebase-refresh-${exchanged}`,
        expiresIn: "1200", isNewUser: false }),
      { status: 200, headers: { "content-type": "application/json" } });
    }
    assert.equal(options.headers.authorization, `Bearer ${jwt(targetName)}`);
    assert.equal(options.headers["X-Firebase-AppCheck"], `app-check-${targetName}`);
    assert.equal(options.headers["x-orider-evidence-lease"], digest(targetName === "baseline" ? "8" : "9"));
    assert.equal(options.headers["x-orider-evidence-correlation"], stageRequest.correlationId);
    assert.equal(options.headers["x-orider-evidence-orchestrator-actor"], actor);
    assert.equal(options.headers["x-orider-test-identity"], undefined);
    assert.deepEqual(exchangeTargets, targetName === "baseline" ? ["baseline"] : ["baseline", "candidate"]);
    const body = options.body ? JSON.parse(options.body) : null;
    let value;
    if (parsed.pathname === "/v1/coach/status") value = { data: { status: "available" } };
    else if (parsed.pathname === "/v1/coach/insights/pmc") value = { data: pmcData(targetName) };
    else if (parsed.pathname === "/v1/coach/insights/rider") value = { data: riderData(targetName) };
    else if (parsed.pathname === "/v1/coach/change-proposals") {
      assert.equal(parsed.searchParams.get("prescriptionId"), progress.prescriptionId);
      assert.equal(parsed.searchParams.get("sourceRequestId"), progress.sourceRequestId);
      value = { status: "ok", data: { recoveryStatus: "pending",
      source: { prescriptionId: progress.prescriptionId, sourceRequestId: progress.sourceRequestId },
      proposal: { proposalId: progress.proposalId, evidence: [{ evidenceId: `ev_progress_${targetName}`,
        source: "progress_planner", sourceId: progress.proposalId, sourceRevision: progress.fixtureDigest,
        field: "weekly_tss", value: 420, asOf: "2026-07-27T00:00:00.000Z" }] },
      providerCalls: 0, quotaConsumed: 0 } };
    }
    else if (parsed.pathname === "/v1/coach/ride-plan/token") value = { data: {
      contextToken: `ride2.${"a".repeat(80)}.${"b".repeat(43)}`, inputRevision: `ridein_${"4".repeat(24)}` } };
    else if (parsed.pathname === "/v1/coach/ride-plan") value = { data: rideData(targetName) };
    else if (parsed.pathname === "/v1/coach/ride-plan/ai-context") value = { data: rideData(targetName, body.questionCode) };
    else if (parsed.pathname === "/v1/coach/respond") {
      const item = FOUR_AXIS_CASES.find((entry) => entry.question === body.question);
      assert.ok(item); assert.equal(body.apiVersion, "v2"); assert.equal(body.capabilityVersion, "p1");
      const records = evidenceRecords(item, targetName);
      const answer = item.source === "progress" ? { blocks: [{ kind: "prescription", prescription: {
        status: "ready", prescriptionId: progress.prescriptionId, evidence: [{ evidenceId: `ev_progress_${targetName}`,
          source: "progress_planner", sourceId: progress.proposalId, sourceRevision: progress.fixtureDigest,
          field: "weekly_tss", value: 420, asOf: "2026-07-27T00:00:00.000Z" }] } }], evidence: [] }
        : records.length > 0 ? evidenceAnswer(records) : { blocks: [{ kind: "headline" }] };
      value = { data: { requestId: body.requestId, outcome: "answer", answer,
        budget: { providerCalls: item.providerCalls }, quota: { consumed: Boolean(item.quotaConsumed) },
        execution: { parser: item.providerCalls ? "provider" : "deterministic" } } };
    } else throw new Error(`unexpected product path: ${parsed.pathname}`);
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  };
}

function observedHttp() {
  return async (url, options) => {
    const body = JSON.parse(options.body); const item = FOUR_AXIS_CASES.find((entry) => entry.caseId === body.caseId);
    const target = url.includes("candidate---") ? request.targets.candidate : request.targets.production;
    const targetName = url.includes("candidate---") ? "candidate" : "production";
    const projection = { sourceRevisionDigest: digest("4"), projectionDigest: digest("5"),
      evidenceDigest: digest("6"), sharedFactsDigest: digest("7") };
    const receipt = { schemaVersion: "ai-coach-four-axis-http-receipt-v1",
      correlationDigest: rawDigest(request.correlationId), caseId: item.caseId, fixtureDigest: request.fixture.digest,
      requestDigest: rawDigest(options.body), targetFingerprint: target.targetFingerprint, outcome: "answer",
      providerCalls: item.providerCalls, quotaConsumed: item.quotaConsumed, userDataWrites: 0,
      card: item.card ? { ...structuredClone(projection), providerCalls: 0, quotaConsumed: 0, userDataWrites: 0 } : null,
      response: structuredClone(projection), productExecution: productExecution(item, targetName) };
    return new Response(JSON.stringify(receipt), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("counts user writes only from a successful server write receipt and explicit count", () => {
  const path = `/v1/coach/change-proposals/proposal_${"d".repeat(24)}/confirm`;
  const receipt = { status: "ok", userDataWrites: 1, data: { schemaVersion: "coach-change-receipt-v1",
    proposalId: `proposal_${"d".repeat(24)}`, auditId: `audit_${"f".repeat(24)}`, status: "applied" } };
  assert.equal(observedProductUserDataWrites("POST", path, { ok: false, status: 400 }, receipt), 0);
  assert.equal(observedProductUserDataWrites("POST", path, { ok: false, status: 500 }, receipt), 0);
  assert.equal(observedProductUserDataWrites("POST", path, { ok: true }, { ...receipt, userDataWrites: 0 }), 0);
  assert.equal(observedProductUserDataWrites("POST", path, { ok: true }, receipt), 1);
  assert.equal(observedProductUserDataWrites("POST", path, { ok: true }, { status: "ok", data: receipt.data }), 0);
  assert.throws(() => observedProductUserDataWrites("POST", path, { ok: true },
    { status: "ok", userDataWrites: 1, data: { status: "applied" } }), /v3_user_write_receipt/u);
});

test("scans raw product URL and bodies but retains only redacted capture digests", () => {
  const progressPlanner = { prescriptionId: `rx_${"1".repeat(24)}`,
    sourceRequestId: "22222222-2222-4222-8222-222222222222", proposalId: `proposal_${"2".repeat(24)}` };
  const options = { courseId: `course-evidence-${"3".repeat(32)}`, progressPlanner };
  const url = new URL(`https://candidate---stage.example.com/v1/coach/change-proposals?prescriptionId=${progressPlanner.prescriptionId}`
    + `&sourceRequestId=${progressPlanner.sourceRequestId}`);
  const requestBody = undefined;
  const responseBody = { status: "ok", data: { source: { prescriptionId: progressPlanner.prescriptionId,
    sourceRequestId: progressPlanner.sourceRequestId },
  proposal: { proposalId: progressPlanner.proposalId, evidence: [] }, recoveryStatus: "pending",
  providerCalls: 0, quotaConsumed: 0 } };
  assert.doesNotThrow(() => assertProductNetworkPrivacy(url, requestBody, responseBody, options));

  for (const [name, value] of [["prescriptionId", "rx_private-user-record"],
    ["sourceRequestId", "private-source-request"]]) {
    const leakedQuery = new URL(url); leakedQuery.searchParams.append(name, value);
    assert.throws(() => assertProductNetworkPrivacy(leakedQuery, requestBody, responseBody, options), /v3_product_schema/u);
  }
  for (const leak of [{ uid: "private-user" }, { contact: "rider@example.com" },
    { healthData: { weightKg: 72 } }, { credential: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1MSJ9.signature" },
    { apiKey: `AIza${"a".repeat(35)}` }, { sessionCookie: "session-secret" },
    { identityToken: "secret-token" }, { coordinates: { latitude: 37.5, longitude: 127 } }]) {
    assert.throws(() => assertProductNetworkPrivacy(url, requestBody, leak, options), /v3_product_schema/u);
  }
  for (const key of ["displayName", "fullName", "phoneNumber", "homeAddress", "clientSecret",
    "sessionToken", "setCookie", "api_key", "medicalRecord"]) {
    const leak = structuredClone(responseBody); leak.data[key] = "private-value";
    assert.throws(() => assertProductNetworkPrivacy(url, requestBody, leak, options), /v3_product_schema/u);
  }
  for (const value of ["rider@example.com", "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1MSJ9.signature",
    `AIza${"a".repeat(35)}`]) {
    const shapedLeak = structuredClone(responseBody); shapedLeak.data.recoveryStatus = value;
    assert.throws(() => assertProductNetworkPrivacy(url, requestBody, shapedLeak, options), /v3_product_privacy/u);
  }
  const headlineUrl = new URL("https://candidate---stage.example.com/v1/coach/respond");
  const headlineRequest = { requestId: "123e4567-e89b-42d3-a456-426614174000",
    question: FOUR_AXIS_CASES[0].question, discipline: "bike", locale: "ko-KR", apiVersion: "v2",
    schemaVersion: "coach-respond-v2", capabilityVersion: "p1", contextFilters: {}, responseFormat: "auto" };
  const responseEnvelope = { requestId: headlineRequest.requestId, outcome: "answer",
    budget: { providerCalls: 0 }, quota: { consumed: false }, execution: { parser: "deterministic" } };
  assert.throws(() => assertProductNetworkPrivacy(headlineUrl, headlineRequest,
    { data: { outcome: "answer", answer: {} } }, options), /v3_product_schema_required/u);
  assert.throws(() => assertProductNetworkPrivacy(headlineUrl, {}, undefined, options, "request-preflight"),
    /v3_product_schema_required/u);
  const truncatedRequest = structuredClone(headlineRequest); delete truncatedRequest.responseFormat;
  assert.throws(() => assertProductNetworkPrivacy(headlineUrl, truncatedRequest, undefined, options,
    "request-preflight"), /v3_product_schema_required/u);
  const headlineResponse = { data: { ...responseEnvelope, answer: { blocks: [{ kind: "headline", blockId: "headline-1",
    sourceSlotIds: ["slot-1"], partial: false, stale: false, truncated: false, omittedCount: 0 }] } } };
  assert.doesNotThrow(() => assertProductNetworkPrivacy(headlineUrl, headlineRequest, headlineResponse, options));
  for (const [field, value] of [["apiVersion", "p1"], ["capabilityVersion", "coach-respond-v2"],
    ["schemaVersion", "v2"]]) {
    const swapped = structuredClone(headlineRequest); swapped[field] = value;
    assert.throws(() => assertProductNetworkPrivacy(headlineUrl, swapped, undefined, options, "request-preflight"),
      /v3_product_semantic/u);
  }
  const versionedResponse = structuredClone(headlineResponse);
  Object.assign(versionedResponse.data, { apiVersion: "v2", capabilityVersion: "p1",
    schemaVersion: "coach-response-envelope-v1" });
  assert.doesNotThrow(() => assertProductNetworkPrivacy(headlineUrl, headlineRequest, versionedResponse, options));
  for (const [field, value] of [["apiVersion", "p1"], ["capabilityVersion", "v2"],
    ["schemaVersion", "coach-pmc-insight-v1"]]) {
    const swapped = structuredClone(versionedResponse); swapped.data[field] = value;
    assert.throws(() => assertProductNetworkPrivacy(headlineUrl, headlineRequest, swapped, options),
      /v3_product_semantic/u);
  }
  const headlineLeak = structuredClone(headlineResponse); headlineLeak.data.answer.blocks[0].displayName = "private";
  assert.throws(() => assertProductNetworkPrivacy(headlineUrl, headlineRequest, headlineLeak, options),
    /v3_product_schema/u);
  const markdownResponse = { data: { ...responseEnvelope, answer: { blocks: [{ kind: "grounded_markdown",
    markdown: "Route coordinates are intentionally omitted from this summary.", evidenceIds: [] }] } } };
  assert.doesNotThrow(() => assertProductNetworkPrivacy(headlineUrl, headlineRequest, markdownResponse, options));
  for (const coordinateText of ["latitude: 37.5, longitude: 127.0", "lat/lon: 37.5, 127.0",
    "Exact point (37.5, 127.0)"]) {
    const coordinateTextLeak = structuredClone(markdownResponse);
    coordinateTextLeak.data.answer.blocks[0].markdown = coordinateText;
    assert.throws(() => assertProductNetworkPrivacy(headlineUrl, headlineRequest, coordinateTextLeak, options),
      /v3_product_privacy/u);
  }
  const statusUrl = new URL("https://candidate---stage.example.com/v1/coach/status");
  assert.doesNotThrow(() => assertProductNetworkPrivacy(statusUrl, undefined,
    { data: { status: "available" } }, options));
  assert.throws(() => assertProductNetworkPrivacy(statusUrl, undefined, { data: {} }, options),
    /v3_product_schema_required/u);
  for (const malformed of [null, {}, [], "", false, 0]) {
    assert.throws(() => assertProductNetworkPrivacy(statusUrl, undefined, malformed, options),
      /v3_product_schema/u);
  }
  assert.throws(() => assertProductNetworkPrivacy(statusUrl, undefined,
    { data: { status: "session-secret" } }, options), /v3_product_(?:semantic|privacy)/u);
  for (const [field, value] of [["markdown", "Call 010-1234-5678 after the ride."],
    ["questionSummary", "서울특별시 강남구 테헤란로 123"],
    ["markdown", "User name: Hong Gil Dong"], ["questionSummary", "credential_OpaqueValue123456"]]) {
    const textLeak = structuredClone(markdownResponse);
    if (field === "markdown") textLeak.data.answer.blocks[0].markdown = value;
    else textLeak.data.answer[field] = value;
    assert.throws(() => assertProductNetworkPrivacy(headlineUrl, headlineRequest, textLeak, options),
      /v3_product_privacy/u);
  }
  for (const key of ["coordinate", "coordinates", "exactCoordinates"]) {
    const coordinateLeak = structuredClone(markdownResponse);
    coordinateLeak.data.answer.blocks[0][key] = { latitude: 37.5, longitude: 127 };
    assert.throws(() => assertProductNetworkPrivacy(headlineUrl, headlineRequest, coordinateLeak, options),
      /v3_product_schema/u);
  }
  const capture = { url: `${url.origin}${url.pathname}`, requestBody: "",
    responseBody: prefixedEvidenceDigest(responseBody) };
  assert.doesNotMatch(JSON.stringify(capture), /rx_private|22222222|course-evidence|private-user|secret-token/u);
});

test("validates immutable JSON/base64url dispatch, expiry, consumer SHA and target fingerprints", () => {
  assert.deepEqual(decodeEvidenceRequest(fixtureText, fixtureHash).value, request);
  assert.deepEqual(decodeEvidenceRequest(Buffer.from(fixtureText).toString("base64url"), fixtureHash).value, request);
  assert.equal(validateDispatchRequest(request, context()), request);
  assert.equal(targetFingerprint(request.targets.production), request.targets.production.targetFingerprint);
  for (const mutate of [(value) => { value.consumer.sha = "c".repeat(40); },
    (value) => { value.expiresAt = "2026-07-27T01:00:00Z"; },
    (value) => { value.targets.candidate.taggedUrl = "http://candidate---coach-stage.example.com/evidence"; },
    (value) => { value.targets.production.url += "?leak=1"; },
    (value) => { value.targets.production.url = value.targets.production.url.replace(".com/", ".com:444/"); },
    (value) => { value.targets.production.url = value.targets.production.url.replace("/__evidence", "/wrong") ; },
    (value) => { value.orchestrator.workflowPath = ".github/workflows/other.yml"; },
    (value) => { value.targets.candidate.targetFingerprint = digest("9"); },
    (value) => { value.fixture.turns[8].providerCalls = 0; }]) {
    const changed = structuredClone(request); mutate(changed);
    assert.throws(() => validateDispatchRequest(changed, context()));
  }
  assert.throws(() => decodeEvidenceRequest(fixtureText, "0".repeat(64)), /request_digest/u);
});

test("observes exact GitHub orchestrator run and workflow rather than trusting dispatch fields", async () => {
  assert.deepEqual(await verifyOrchestratorRun(request, { token: "test", fetchImpl: orchestratorFetch }), {
    repository: "miranae/orider-g1-web", workflowPath: ".github/workflows/ai-coach-promotion-gate.yml",
    headSha: "b".repeat(40), runId: 42001, runAttempt: 1, event: "workflow_dispatch" });
  const drift = async (url) => url.endsWith("/actions/runs/42001") ? { ok: true, json: async () => ({ id: 42001,
    repository: { full_name: "miranae/orider-g1-web" }, head_sha: "c".repeat(40), run_attempt: 1,
    event: "workflow_dispatch", status: "in_progress", workflow_id: 77 }) } : orchestratorFetch(url);
  await assert.rejects(verifyOrchestratorRun(request, { token: "test", fetchImpl: drift }), /orchestrator_observation/u);
  const completed = async (url) => url.endsWith("/actions/runs/42001") ? { ok: true, json: async () => ({ id: 42001,
    repository: { full_name: "miranae/orider-g1-web" }, head_sha: "b".repeat(40), run_attempt: 1,
    event: "workflow_dispatch", status: "completed", conclusion: "success", workflow_id: 77,
    actor: { login: "ansrudska" } }) } : orchestratorFetch(url);
  await assert.rejects(verifyOrchestratorRun(request, { token: "test", fetchImpl: completed }),
    /orchestrator_observation/u);
  await assert.rejects(verifyOrchestratorRun(request,
    { token: "test", fetchImpl: orchestratorFetch, expectedActor: "wrong-actor" }), /orchestrator_observation/u);
});

test("local operator context binds exact bytes, clean HEAD/tree, active identity, expiry and stage targets", () => {
  const contextValue = localContext(); const requestValue = localRequest(); const bytes = Buffer.from(JSON.stringify(contextValue));
  const contextSha = createHash("sha256").update(bytes).digest("hex");
  assert.deepEqual(decodeLocalOperatorContext(bytes, contextSha).value, contextValue);
  assert.equal(validateLocalOperatorContext(contextValue, { repository: "miranae/orider-web", sha: SHA,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), contextValue);
  const results = [{ status: 0, stdout: `${SHA}\n` }, { status: 0, stdout: "" },
    { status: 0, stdout: `${contextValue.treeSha}\n` }];
  assert.deepEqual(verifyLocalRepositoryState("/repo", SHA, contextValue.treeSha, () => results.shift()),
    { commitSha: SHA, treeSha: contextValue.treeSha, cleanTree: true });
  assert.deepEqual(verifyLocalGoogleIdentity(contextValue,
    (_command, args) => ({ status: 0, stdout: `${args[0] === "-un" ? "operator"
      : args[1] === "user.name" ? "Operator" : args[1] === "user.email" ? "operator@example.com"
        : "operator@example.com"}\n` })),
  { operator: contextValue.operator, serviceAccount: contextValue.identity.serviceAccount });
  assert.equal(validateLocalOperatorRequest(requestValue, { repository: contextValue.repository, sha: SHA,
    treeSha: contextValue.treeSha, operator: contextValue.operator, identity: contextValue.identity,
    backend: contextValue.backend, stageHostSuffix: contextValue.stage.hostSuffix,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), requestValue);
  assert.deepEqual(bindLocalContextToRequest(contextValue, requestValue,
    "scripts/fixtures/ai-coach-four-axis-stage-baseline-dispatch-request-v2.json"), contextValue.stage.targets);
  for (const mutate of [(value) => { value.contextId = "not-a-uuid"; },
    (value) => { value.treeSha = "bad"; }, (value) => { value.expiresAt = "2026-07-27T01:00:00.000Z"; },
    (value) => { value.identity.serviceAccount = "other-evidence@orider-dev.iam.gserviceaccount.com"; },
    (value) => { value.identity.localActor = "unapproved-user"; },
    (value) => { value.backend.leaseGuard.treeSha = "0".repeat(40); },
    (value) => { value.stage.targets.candidate.imageDigest = digest("0"); }]) {
    const changed = structuredClone(contextValue); mutate(changed);
    if (changed.stage.targets.candidate.imageDigest === digest("0")
        || changed.identity.localActor !== contextValue.identity.localActor) {
      assert.throws(() => bindLocalContextToRequest(changed, requestValue,
        "scripts/fixtures/ai-coach-four-axis-stage-baseline-dispatch-request-v2.json"), /local_request_binding/u);
    } else {
      assert.throws(() => validateLocalOperatorContext(changed, { repository: "miranae/orider-web", sha: SHA,
        nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), /local_/u);
    }
  }
  assert.throws(() => verifyLocalRepositoryState("/repo", SHA, contextValue.treeSha,
    (_command, args) => args[0] === "status" ? { status: 0, stdout: "?? local-secret.json\n" }
      : { status: 0, stdout: `${args[1] === "HEAD^{tree}" ? contextValue.treeSha : SHA}\n` }), /local_clean_tree/u);
  const outputResults = [{ status: 0, stdout: `${SHA}\n` },
    { status: 0, stdout: "?? artifacts/evidence.json\n?? artifacts/evidence.local-file.json\n" },
    { status: 0, stdout: `${contextValue.treeSha}\n` }];
  assert.equal(verifyLocalRepositoryState("/repo", SHA, contextValue.treeSha, () => outputResults.shift(),
    ["artifacts/evidence.json", "artifacts/evidence.local-file.json"]).cleanTree, true);
  assert.throws(() => verifyLocalGoogleIdentity(contextValue,
    () => ({ status: 0, stdout: "other@example.com\n" })),
    /local_operator_identity/u);
});

test("local operator request schema excludes Actions identity and binds backend checkpoint provenance", () => {
  const value = localRequest();
  const schema = JSON.parse(readFileSync(
    "scripts/fixtures/ai-coach-four-axis-web-local-operator-v1.schema.json", "utf8"));
  const validateSchema = new Ajv({ allErrors: true, formats: {
    "date-time": (item) => Number.isFinite(Date.parse(item)), email: (item) => GOOGLE_EMAIL.test(item),
  } }).compile(schema);
  assert.equal(validateSchema(value), true, JSON.stringify(validateSchema.errors));
  const reorderedTurns = structuredClone(value); [reorderedTurns.fixture.turns[0], reorderedTurns.fixture.turns[1]] =
    [reorderedTurns.fixture.turns[1], reorderedTurns.fixture.turns[0]];
  assert.equal(validateSchema(reorderedTurns), false);
  const driftedFixtureDigest = structuredClone(value); driftedFixtureDigest.fixture.digest = digest("0");
  assert.equal(validateSchema(driftedFixtureDigest), false);
  assert.doesNotMatch(JSON.stringify(value), /runId|runAttempt|workflowPath|orchestrator/u);
  const expected = { repository: "miranae/orider-web", sha: SHA, treeSha: value.consumer.treeSha,
    operator: value.operator, identity: value.identity, backend: value.backend,
    stageHostSuffix: localContext().stage.hostSuffix,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z") };
  for (const mutate of [(item) => { item.consumer.statusClean = false; },
    (item) => { item.backend.commitSha = "0".repeat(40); },
    (item) => { item.backend.leaseGuard.commitSha = "0".repeat(40); },
    (item) => { item.backend.stageRunId = "stage_other-0001"; },
    (item) => { item.identity.localActor = "other@example.com"; },
    (item) => { item.runId = 42; }]) {
    const changed = structuredClone(value); mutate(changed);
    assert.throws(() => validateLocalOperatorRequest(changed, expected), /local_request/u);
  }
  const temporary = mkdtempSync(resolve(tmpdir(), "web-lease-checkpoint-"));
  try {
    const checkpointPath = resolve(temporary, "checkpoint.json");
    const checkpointBytes = Buffer.from(JSON.stringify({ leaseGuard: value.backend.leaseGuard }));
    writeFileSync(checkpointPath, checkpointBytes, { mode: 0o600 });
    const checkpointDigest = `sha256:${createHash("sha256").update(checkpointBytes).digest("hex")}`;
    const checkpointBound = structuredClone(value); checkpointBound.backend.checkpointSha256 = checkpointDigest;
    assert.deepEqual(verifyLocalCheckpointBinding(checkpointBound, checkpointPath, checkpointDigest),
      { checkpointSha256: checkpointDigest, leaseGuard: value.backend.leaseGuard });
    assert.throws(() => verifyLocalCheckpointBinding(checkpointBound, checkpointPath, digest("0")),
      /local_checkpoint_binding/u);
    const forged = structuredClone(checkpointBound); forged.backend.leaseGuard.sha256 = digest("0");
    assert.throws(() => verifyLocalCheckpointBinding(forged, checkpointPath, checkpointDigest),
      /local_checkpoint_lease_guard/u);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test("local lease guard binds an owned immutable file to the exact clean backend checkout", () => {
  const backendRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "web-lease-backend-")));
  const externalRoot = mkdtempSync("/tmp/web-lease-external-");
  const runGit = (args) => spawnSync("git", args, { cwd: backendRoot, encoding: "utf8" });
  try {
    const guardPath = resolve(backendRoot, "scripts/assert-ai-coach-local-stage-lease.mjs");
    mkdirSync(resolve(backendRoot, "scripts"));
    writeFileSync(guardPath, "#!/usr/bin/env node\nprocess.exit(0);\n", { mode: 0o600 });
    for (const args of [["init", "-q"], ["config", "user.name", "Lease Test"],
      ["config", "user.email", "lease@example.com"], ["add", "."], ["commit", "-qm", "add guard"],
      ["remote", "add", "origin", "https://github.com/miranae/orider-g1-web.git"]]) {
      assert.equal(runGit(args).status, 0);
    }
    chmodSync(guardPath, 0o600);
    const commitSha = runGit(["rev-parse", "HEAD"]).stdout.trim();
    const treeSha = runGit(["rev-parse", "HEAD^{tree}"]).stdout.trim();
    const sha256 = `sha256:${createHash("sha256").update(readFileSync(guardPath)).digest("hex")}`;
    const binding = { repository: "miranae/orider-g1-web", commitSha, treeSha,
      relativePath: "scripts/assert-ai-coach-local-stage-lease.mjs", sha256 };
    assert.deepEqual(verifyLocalLeaseGuardBinding(backendRoot, guardPath, binding), binding);

    writeFileSync(guardPath, "#!/usr/bin/env node\nprocess.exit(1);\n", { mode: 0o600 });
    assert.throws(() => verifyLocalLeaseGuardBinding(backendRoot, guardPath, binding),
      /local_lease_guard_fs_binding/u);
    assert.equal(runGit(["restore", "scripts/assert-ai-coach-local-stage-lease.mjs"]).status, 0);

    const alwaysPass = resolve(externalRoot, "always-pass.mjs");
    writeFileSync(alwaysPass, "process.exit(0);\n", { mode: 0o600 }); chmodSync(alwaysPass, 0o600);
    assert.throws(() => verifyLocalLeaseGuardBinding(backendRoot, alwaysPass, binding),
      /local_lease_guard_fs_binding/u);
    const alternatePath = resolve(backendRoot, "scripts/alternate-guard.mjs");
    writeFileSync(alternatePath, readFileSync(guardPath), { mode: 0o600 });
    assert.throws(() => verifyLocalLeaseGuardBinding(backendRoot, alternatePath, binding),
      /local_lease_guard_fs_binding/u);
    rmSync(alternatePath);
    assert.throws(() => verifyLocalLeaseGuardBinding(backendRoot, guardPath, { ...binding, sha256: digest("0") }),
      /local_lease_guard_fs_binding/u);
    assert.throws(() => verifyLocalLeaseGuardBinding(backendRoot, guardPath, { ...binding, treeSha: "0".repeat(40) }),
      /local_lease_guard_repository/u);
    writeFileSync(resolve(backendRoot, "untracked.txt"), "dirty\n");
    assert.throws(() => verifyLocalLeaseGuardBinding(backendRoot, guardPath, binding),
      /local_lease_guard_repository/u);
    rmSync(resolve(backendRoot, "untracked.txt"));
    writeFileSync(resolve(backendRoot, "tracked.txt"), "new commit\n");
    assert.equal(runGit(["add", "tracked.txt"]).status, 0);
    assert.equal(runGit(["commit", "-qm", "change backend head"]).status, 0);
    assert.throws(() => verifyLocalLeaseGuardBinding(backendRoot, guardPath, binding),
      /local_lease_guard_repository/u);
  } finally {
    rmSync(backendRoot, { recursive: true, force: true });
    rmSync(externalRoot, { recursive: true, force: true });
  }
});

test("validates v3 stage baseline request and uses OIDC attestation plus short per-target leases", async () => {
  assert.equal(validateStageBaselineDispatchRequest(v3Request, v3Context()), v3Request);
  assert.deepEqual(parseOrchestratorActorAllowlist('["ansrudska","approved-automation[bot]"]'),
    ["ansrudska", "approved-automation[bot]"]);
  assert.throws(() => parseOrchestratorActorAllowlist('["ansrudska","ansrudska"]'), /actor_allowlist/u);
  for (const mutate of [
    (value) => { value.targets.baseline.imageDigest = value.targets.candidate.imageDigest; },
    (value) => { value.targets.baseline.taggedUrl += "/wrong"; },
    (value) => { value.targets.candidate.targetFingerprint = digest("0"); },
    (value) => { value.targets.production = {}; },
    (value) => { value.orchestrator.actor = "unknown-person"; },
    (value) => { value.targets.baseline.taggedUrl = value.targets.baseline.taggedUrl.replace("baseline---", "baseline-x---"); },
  ]) {
    const changed = structuredClone(v3Request); mutate(changed);
    assert.throws(() => validateStageBaselineDispatchRequest(changed, v3Context()), /web_evidence:/u);
  }
  const actorSwap = async (url) => url.endsWith("/actions/runs/42001") ? { ok: true, json: async () => ({ id: 42001,
    repository: { full_name: "miranae/orider-g1-web" }, head_sha: "b".repeat(40), run_attempt: 1,
    event: "workflow_dispatch", status: "in_progress", conclusion: null, workflow_id: 77,
    actor: { login: "approved-automation[bot]" } }) } : orchestratorFetch(url);
  await assert.rejects(verifyOrchestratorRun(v3Request,
    { token: "test", fetchImpl: actorSwap, allowedActors: v3Context().orchestratorActors }), /orchestrator_observation/u);
  assert.deepEqual(await verifyOrchestratorRun(v3Request,
    { token: "test", fetchImpl: orchestratorFetch, allowedActors: v3Context().orchestratorActors }), {
    repository: "miranae/orider-g1-web", workflowPath: ".github/workflows/ai-coach-promotion-gate.yml",
    headSha: "b".repeat(40), runId: 42001, runAttempt: 1, actor: "ansrudska", event: "workflow_dispatch" });
  const actorMutatedText = v3RequestText.replace('"actor":"ansrudska"', '"actor":"approved-automation[bot]"');
  const originalRequestDigest = createHash("sha256").update(v3RequestText).digest("hex");
  assert.notEqual(createHash("sha256").update(actorMutatedText).digest("hex"), originalRequestDigest);
  assert.throws(() => decodeEvidenceRequest(actorMutatedText, originalRequestDigest), /request_digest/u);
  let tick = 0;
  const masked = []; const calls = [];
  const live = await collectStageBaselineComparison(v3Request, { fetchImpl: observedStageHttp(calls),
    clock: () => { tick += 5; return tick; }, identityTokenFor: async (audience) => oidcFor(audience),
    ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
    maskSecret: (token) => masked.push(token),
    requestSha256: `sha256:${"9".repeat(64)}`, nowMs: Date.parse("2026-07-27T00:00:00.000Z") });
  assert.equal(live.evidence.baseline.length, 10); assert.equal(live.evidence.candidate.length, 10);
  assert.deepEqual(live.evidenceLeaseDigests, { baseline: digest("8"), candidate: digest("9") });
  assert.deepEqual(live.evidence.warmups.map(({ receiptDigest: _receiptDigest, ...warmup }) => warmup), [
    { environment: "tagged-stage-baseline", path: "/v1/coach/status", httpStatus: 200,
      providerCalls: 0, quotaConsumed: 0, userDataWrites: 0 },
    { environment: "tagged-stage-candidate", path: "/v1/coach/status", httpStatus: 200,
      providerCalls: 0, quotaConsumed: 0, userDataWrites: 0 },
  ]);
  live.evidence.warmups.forEach((warmup) => assert.match(warmup.receiptDigest, /^sha256:[a-f0-9]{64}$/u));
  const pmc = live.evidence.baseline.find((observation) => observation.caseId === "pmc_change");
  const pmcProvenanceDigest = prefixedEvidenceDigest({ source: "fitness", sourceId: "pmc",
    sourceRevision: "pmcr_baseline" });
  assert.equal(pmc.card.sourceRevisionDigest, pmcProvenanceDigest);
  assert.equal(pmc.response.sourceRevisionDigest, pmcProvenanceDigest);
  assert.notEqual(pmc.response.sourceRevisionDigest, prefixedEvidenceDigest("pmc_baseline"));
  assert.equal(calls.filter((call) => call.path === "/v1/coach/status").length, 2);
  assert.equal(calls.filter((call) => ["/v1/coach/prescription/check-in", "/v1/coach/proposals"]
    .includes(call.path)).length, 0);
  assert.equal(calls.filter((call) => typeof call.body === "string"
    && call.body.includes("다음 7일 사이클 훈련 계획을 만들어줘")).length, 0);
  assert.equal(new Set([...live.evidence.baseline, ...live.evidence.candidate]
    .map((item) => item.productExecution.requestKey)).size, 20);
  for (const token of ["firebase-custom-baseline", "app-check-baseline",
    "firebase-refresh-baseline", "firebase-custom-candidate", "app-check-candidate",
    "firebase-refresh-candidate"]) assert.ok(masked.includes(token));
  assert.equal(masked.filter((token) => token.split(".").length === 3).length, 2);
  assert.doesNotMatch(JSON.stringify(live), /(?:oidc-|firebase-custom-|app-check-|firebase-id-|firebase-refresh-)/u);
  assert.doesNotMatch(JSON.stringify(live), /(?:course-evidence-|"prescriptionId"|"sourceRequestId"|private-user)/u);
  for (const [ledgerReceiptsFor, expected] of [
    [async () => ({ request: null, providers: [], turns: [] }),
    /v3_ledger_request_missing:track0_load_summary/u],
    [async (requestKey, item, target, observation) => { const receipt = observedLedgerReceipts(
      requestKey, item, target, observation);
      return { ...receipt, providers: [...receipt.providers, ...receipt.providers] }; }, /v3_ledger_receipt_binding/u],
  ]) {
    await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: observedStageHttp(),
      ledgerReceiptsFor, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
      firebaseWebApiKey: FIREBASE_API_KEY, requestSha256: `sha256:${"9".repeat(64)}`,
      nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), expected);
  }
  const staleCalls = [];
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: observedStageHttp(staleCalls),
    ledgerReceiptsFor: async (requestKey, item, target, observation) => observedLedgerReceipts(
      requestKey, item, target, { ...observation, phase: "after" }),
    clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
    firebaseWebApiKey: FIREBASE_API_KEY, requestSha256: `sha256:${"9".repeat(64)}`,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), /v3_ledger_preexisting:track0_load_summary/u);
  assert.equal(staleCalls.filter((call) => call.path === "/v1/coach/respond").length, 0);
  for (const [failedPath, status, expectedFiveXx] of [
    ["/v1/coach/insights/pmc", 400, 0],
    ["/v1/coach/status", 500, 1],
    ["/v1/coach/insights/pmc", 500, 1],
    ["/v1/coach/insights/rider", 500, 1],
    ["/v1/coach/change-proposals", 500, 1],
    ["/v1/coach/ride-plan/token", 500, 1],
    ["/v1/coach/ride-plan", 500, 1],
    ["/v1/coach/ride-plan/ai-context", 500, 1],
    ["/v1/coach/respond", 500, 1],
  ]) {
    const contractJson = observedStageHttp();
    await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
      const response = await contractJson(url, options);
      if (new URL(url).pathname !== failedPath) return response;
      return new Response(await response.text(), { status, headers: { "content-type": "application/json" } });
    }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
    ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
    requestSha256: `sha256:${"9".repeat(64)}`,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), (error) => {
      assert.equal(error.message, `web_evidence:v3_product_http_${status}:${failedPath}:five_xx_${expectedFiveXx}`);
      return true;
    });
  }
  for (const [body, status, contentType, expected] of [
    ["", 400, undefined, "web_evidence:v3_product_http_400:/v1/coach/status:five_xx_0"],
    ["<html>unavailable</html>", 500, "text/html", "web_evidence:v3_product_http_500:/v1/coach/status:five_xx_1"],
    ["{invalid", 500, "application/json", "web_evidence:v3_product_http_500:/v1/coach/status:five_xx_1"],
    ["{invalid", 200, "application/json", "web_evidence:response_json"],
  ]) {
    const upstream = observedStageHttp();
    await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
      if (new URL(url).pathname === "/v1/coach/status") {
        return new Response(body, { status, ...(contentType ? { headers: { "content-type": contentType } } : {}) });
      }
      return upstream(url, options);
    }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
    ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
    requestSha256: `sha256:${"9".repeat(64)}`,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), new RegExp(expected, "u"));
  }
  const privateResponse = observedStageHttp();
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
    const response = await privateResponse(url, options);
    if (new URL(url).pathname !== "/v1/coach/respond") return response;
    const value = JSON.parse(await response.text()); value.data.uid = "private-user";
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
  ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
  requestSha256: `sha256:${"9".repeat(64)}`, nowMs: Date.parse("2026-07-27T00:00:00.000Z") }),
  /v3_product_schema/u);
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: observedStageHttp(),
    clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
    ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: "short",
    requestSha256: `sha256:${"9".repeat(64)}` }), /v3_http_identity/u);
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: observedStageHttp(),
    clock: () => 1, identityTokenFor: async () => "", ledgerReceiptsFor: observedLedgerReceipts,
    firebaseWebApiKey: FIREBASE_API_KEY,
    requestSha256: `sha256:${"9".repeat(64)}` }), /oidc_token/u);
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
    if (new URL(url).pathname === "/v1/evidence/four-axis/attestation") {
      return new Response("{}", { status: 200, headers: { "content-type": "text/plain" } });
    }
    return observedStageHttp()(url, options);
  }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
  ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
  requestSha256: `sha256:${"9".repeat(64)}` }), /attestation_content_type/u);
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
    if (new URL(url).pathname === "/v1/evidence/four-axis/attestation") {
      return new Response("{}", { status: 200, headers: { "content-type": "application/json",
        "content-length": String(64 * 1024 + 1) } });
    }
    return observedStageHttp()(url, options);
  }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
  ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
  requestSha256: `sha256:${"9".repeat(64)}` }), /attestation_content_length/u);

  for (const mutate of [
    (value) => { value.revision = "tampered-revision"; },
    (value) => { value.expiresAt = "2026-07-27T00:05:00.000Z"; },
    (value) => { delete value.evidenceLeaseDigest; },
    (value) => { value.appCheckToken = "unsafe\ntoken"; },
    (value) => { value.progress.fixtureDigest = "sha256:invalid"; },
  ]) {
    const base = observedStageHttp();
    await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
      const response = await base(url, options);
      if (new URL(url).pathname !== "/v1/evidence/four-axis/attestation") return response;
      const value = JSON.parse(await response.text()); mutate(value);
      return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
    }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
    ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
    requestSha256: `sha256:${"9".repeat(64)}`,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), /web_evidence:v3_/u);
  }
  const reusedLocator = observedStageHttp();
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
    const response = await reusedLocator(url, options);
    if (new URL(url).pathname !== "/v1/evidence/four-axis/attestation"
        || !new URL(url).hostname.startsWith("candidate---")) return response;
    const value = JSON.parse(await response.text());
    value.progress.sourceRequestId = "22222222-2222-4222-8222-222222222222";
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
  ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
  requestSha256: `sha256:${"9".repeat(64)}`,
  nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), /v3_progress_target_reuse/u);

  const driftedResponse = observedStageHttp();
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
    const response = await driftedResponse(url, options);
    if (new URL(url).pathname !== "/v1/coach/respond") return response;
    const value = JSON.parse(await response.text());
    const evidence = value.data?.answer?.evidence;
    const riderType = evidence?.find((record) => record.field === "rider_type");
    if (riderType) riderType.value = "Climber";
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
  ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
  requestSha256: `sha256:${"9".repeat(64)}`,
  nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), /v3_card_ai_claim_drift:rider_profile/u);

  for (const mutatePmcProvenance of [
    (record) => { record.sourceId = "pmc-tampered"; },
    (record) => { record.sourceRevision = "pmcr_tampered"; },
  ]) {
    const driftedPmcProvenance = observedStageHttp();
    await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
      const response = await driftedPmcProvenance(url, options);
      if (new URL(url).pathname !== "/v1/coach/respond") return response;
      const value = JSON.parse(await response.text());
      const record = value.data?.answer?.evidence?.find((entry) => ["ctl", "atl", "form"].includes(entry.field));
      if (record) mutatePmcProvenance(record);
      return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
    }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
    ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
    requestSha256: `sha256:${"9".repeat(64)}`,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), /v3_pmc_answer_provenance/u);
  }

  const driftedProgressFixture = observedStageHttp();
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
    const response = await driftedProgressFixture(url, options);
    if (new URL(url).pathname !== "/v1/coach/change-proposals") return response;
    const value = JSON.parse(await response.text());
    value.data.proposal.evidence[0].sourceRevision = digest("0");
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
  ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
  requestSha256: `sha256:${"9".repeat(64)}`,
  nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), /v3_progress_card_evidence/u);
  const exchangeFailure = observedStageHttp();
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
    if (new URL(url).hostname === "identitytoolkit.googleapis.com") {
      return new Response(JSON.stringify({ kind: "identitytoolkit#VerifyCustomTokenResponse",
        idToken: "firebase-id-failed", refreshToken: "firebase-refresh-failed", expiresIn: "3600",
        isNewUser: false }), { status: 400, headers: { "content-type": "application/json" } });
    }
    return exchangeFailure(url, options);
  }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
  ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
  requestSha256: `sha256:${"9".repeat(64)}`,
  nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), /firebase_exchange_binding/u);
});

test("local operator request directly binds email actor, attestation response and per-target product lease", async () => {
  const requestValue = localRequest(); const calls = []; const requestDigest = digest("a");
  let tick = 0;
  const live = await collectStageBaselineComparison(requestValue, {
    fetchImpl: observedStageHttp(calls, requestValue, requestDigest),
    clock: () => { tick += 5; return tick; }, identityTokenFor: async (audience) => oidcFor(audience),
    ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
    maskSecret: () => undefined, requestSha256: requestDigest,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z"),
  });
  assert.deepEqual(live.evidenceLeaseDigests, { baseline: digest("8"), candidate: digest("9") });
  assert.equal(live.evidence.baseline.length, 10); assert.equal(live.evidence.candidate.length, 10);
  const attestations = calls.filter((call) => call.path === "/v1/evidence/four-axis/attestation")
    .map((call) => JSON.parse(call.body));
  assert.deepEqual(attestations.map((item) => [item.orchestratorActor, item.requestDigest]), [
    [requestValue.identity.localActor, requestDigest], [requestValue.identity.localActor, requestDigest],
  ]);

  const upstream = observedStageHttp([], requestValue, requestDigest);
  const actorDrift = async (url, options) => {
    const response = await upstream(url, options);
    if (new URL(url).pathname !== "/v1/evidence/four-axis/attestation") return response;
    const body = await response.json(); body.orchestratorActor = "other@example.com";
    return new Response(JSON.stringify(body), { status: response.status,
      headers: { "content-type": "application/json" } });
  };
  await assert.rejects(() => collectStageBaselineComparison(requestValue, {
    fetchImpl: actorDrift, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
    ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
    maskSecret: () => undefined, requestSha256: requestDigest,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z"),
  }), /v3_attestation_binding/u);
});

test("local stage lease fence runs immediately before each shared request and fails before the next candidate request", async () => {
  const requestValue = localRequest(); const requestDigest = digest("a"); const events = [];
  const upstream = observedStageHttp([], requestValue, requestDigest);
  await collectStageBaselineComparison(requestValue, {
    fetchImpl: async (url, options) => { events.push({ type: "fetch", url: String(url) }); return upstream(url, options); },
    assertStageLease: async (operation) => { events.push({ type: "guard", operation }); },
    clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
    ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
    maskSecret: () => undefined, requestSha256: requestDigest,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z"),
  });
  assert.ok(events.length > 0);
  for (let index = 0; index < events.length; index += 2) {
    assert.equal(events[index].type, "guard");
    assert.equal(events[index + 1].type, "fetch");
  }
  const candidateProductFetches = [];
  const failClosedUpstream = observedStageHttp([], requestValue, requestDigest);
  await assert.rejects(() => collectStageBaselineComparison(requestValue, {
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      if (parsed.hostname.startsWith("candidate---") && parsed.pathname.startsWith("/v1/coach/")) {
        candidateProductFetches.push(parsed.pathname);
      }
      return failClosedUpstream(url, options);
    },
    assertStageLease: async (operation) => {
      if (operation.kind === "product-http" && operation.target === "candidate") {
        throw new Error("lease_lost");
      }
    },
    clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
    ledgerReceiptsFor: observedLedgerReceipts, firebaseWebApiKey: FIREBASE_API_KEY,
    maskSecret: () => undefined, requestSha256: requestDigest,
    nowMs: Date.parse("2026-07-27T00:00:00.000Z"),
  }), /lease_lost/u);
  assert.deepEqual(candidateProductFetches, []);
  const localProducer = readFileSync("scripts/run-ai-coach-four-axis-web-evidence-local.mjs", "utf8");
  assert.match(localProducer, /stdio:\s*"ignore"/u);
  assert.doesNotMatch(localProducer, /(?:console|stdout|stderr).*AI_COACH_LOCAL_STAGE_LEASE_TOKEN/iu);
});

test("derives warm-excluded 10+10 HTTP evidence, card counters and separate card/AI parity receipts", async () => {
  let tick = 0; const result = await collectLiveComparison(request, { fetchImpl: observedHttp(),
    clock: () => { tick += 5; return tick; }, authorization: "protected", testIdentity: "protected" });
  assert.equal(result.evidence.warmups.length, 2);
  assert.equal(result.evidence.production.length, 10); assert.equal(result.evidence.candidate.length, 10);
  assert.deepEqual(result.evidence.metrics, { productionP95Ms: 5, candidateP95Ms: 5,
    productionFiveXx: 0, candidateFiveXx: 0, measuredTurnsPerTarget: 10 });
  const progress = result.evidence.candidate.find((item) => item.caseId === "progress_selected_evidence");
  const ride = result.evidence.candidate.find((item) => item.caseId === "ride_personal_pacing");
  for (const item of [progress, ride]) {
    assert.notEqual(item.card, item.response); assert.equal(item.card.projectionDigest, item.response.projectionDigest);
    assert.deepEqual([item.card.providerCalls, item.card.quotaConsumed, item.card.userDataWrites], [0, 0, 0]);
  }
  const cost = observedHttp();
  await assert.rejects(collectLiveComparison(request, { fetchImpl: async (url, options) => {
    const response = await cost(url, options); const value = JSON.parse(await response.text());
    if (value.caseId === "ride_personal_pacing") value.card.providerCalls = 1;
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  }, clock: () => 1, authorization: "protected", testIdentity: "protected" }), /card_ai_parity/u);
  await assert.rejects(collectLiveComparison(request, { fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, "error"); assert.ok(options.signal instanceof AbortSignal);
    return new Response("x", { status: 200, headers: { "content-type": "application/json",
      "content-length": String(MAX_HTTP_RESPONSE_BYTES + 1) } });
  }, clock: () => 1, authorization: "protected", testIdentity: "protected" }), /response_content_length/u);
});

test("measures actual component roots, semantic naming, live regions, keyboard and 320px 200% Chromium reflow", async () => {
  const browser = await collectBrowserEvidence();
  for (const surface of Object.values(browser.evidence.surfaces)) {
    assert.ok(surface.rootScrollWidth <= surface.rootClientWidth);
    assert.ok(surface.labelledRootCount >= 1); assert.ok(surface.namedInteractiveCount >= 1);
    assert.ok(surface.liveRegionObservedCount >= 1);
    assert.equal(surface.observedFocusOrderDigest, surface.expectedFocusOrderDigest);
    assert.equal(surface.focusOrderMismatchCount, 0); assert.equal(surface.focusedQuestionOrdinal, 0);
    assert.equal(surface.skippedQuestionControlCount, 0); assert.equal(surface.tabindexMinusOneQuestionCount, 0);
    assert.ok(surface.keyboardActivations >= 1); assert.match(surface.measurementReceiptDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.match(surface.screenshotDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.match(surface.ariaSnapshotDigest, /^sha256:[a-f0-9]{64}$/u);
  }
});

test("validates the dispatch v2 artifact and rejects observed evidence drift", async () => {
  let tick = 0; const live = await collectLiveComparison(request, { fetchImpl: observedHttp(),
    clock: () => { tick += 5; return tick; }, authorization: "protected", testIdentity: "protected" });
  const browser = await collectBrowserEvidence();
  const orchestrator = await verifyOrchestratorRun(request, { token: "test", fetchImpl: orchestratorFetch });
  const targets = { production: { targetFingerprint: request.targets.production.targetFingerprint,
    revisionIdentityDigest: request.targets.production.revisionIdentityDigest,
    productionAuditDigest: request.targets.production.productionAuditDigest },
  candidate: { targetFingerprint: request.targets.candidate.targetFingerprint, tag: request.targets.candidate.tag,
    revision: request.targets.candidate.revision, imageDigest: request.targets.candidate.imageDigest,
    stageRunId: request.targets.candidate.stageRunId } };
  const fileShas = Object.fromEntries(WEB_EVIDENCE_TEST_FILES.map((file) => [file, HASH]));
  const base = { schemaVersion: "ai-coach-four-axis-web-dispatch-evidence-v2",
    artifactName: webEvidenceArtifactName(SHA, CORRELATION), repository: "miranae/orider-web", commitSha: SHA,
    workflowPath: ".github/workflows/ai-coach-four-axis-evidence.yml",
    dispatch: { correlationId: CORRELATION, requestSha256: `sha256:${fixtureHash}`, expiresAt: request.expiresAt,
      consumer: request.consumer, orchestrator,
      workflow: { repository: "miranae/orider-web", runId: 9001, runAttempt: 1, event: "workflow_dispatch" } },
    targets, staticEvidence: { testFiles: WEB_EVIDENCE_TEST_FILES, testFileSha256: fileShas,
      results: { passed: 78, failed: 0, skipped: 0, todo: 0 },
      assertionReceiptDigests: REQUIRED_RENDER_ASSERTIONS.map((title) => prefixedEvidenceDigest({ title,
        testFileSha256: fileShas })) },
    browserEvidence: browser.evidence, liveComparison: live.evidence };
  const artifact = { ...base, privacyScan: privacyScan({ finalArtifact: JSON.stringify(base), renderedDom: browser.captures,
    networkUrls: live.captures.map((item) => item.url), networkBodies: live.captures.map((item) => item.requestBody),
    testLogs: "78 assertions passed", providerSidecars: live.evidence.candidate.map((item) => JSON.stringify(item.response)) }) };
  const expected = { sha: SHA, correlationId: CORRELATION, requestSha256: `sha256:${fixtureHash}`,
    expiresAt: request.expiresAt,
    workflowRunId: 9001, workflowRunAttempt: 1, orchestrator, targets, fileShas };
  assert.equal(validateWebEvidenceArtifact(artifact, expected), artifact);
  for (const mutate of [(value) => { value.liveComparison.candidate[8].card.projectionDigest = digest("9"); },
    (value) => { value.liveComparison.candidate[9].card.providerCalls = 1; },
    (value) => { value.browserEvidence.surfaces.ride.rootScrollWidth = value.browserEvidence.surfaces.ride.rootClientWidth + 1; },
    (value) => { value.staticEvidence.results.failed = 1; },
    (value) => { value.privacyScan.matches.networkBodies = 1; }]) {
    const changed = structuredClone(artifact); mutate(changed);
    assert.throws(() => validateWebEvidenceArtifact(changed, expected));
  }
  const expiryDrift = structuredClone(artifact); expiryDrift.dispatch.expiresAt = "2026-07-27T00:19:59.000Z";
  assert.throws(() => validateWebEvidenceArtifact(expiryDrift, expected), /dispatch_binding/u);
  const reverseOrder = structuredClone(artifact);
  reverseOrder.browserEvidence.surfaces.pmc.observedFocusOrderDigest = digest("8");
  assert.throws(() => validateWebEvidenceArtifact(reverseOrder, expected), /browser_measurement/u);
  const skippedControl = structuredClone(artifact);
  skippedControl.browserEvidence.surfaces.rider.skippedQuestionControlCount = 1;
  assert.throws(() => validateWebEvidenceArtifact(skippedControl, expected), /browser_measurement/u);
  const removedFromTabOrder = structuredClone(artifact);
  removedFromTabOrder.browserEvidence.surfaces.ride.tabindexMinusOneQuestionCount = 1;
  assert.throws(() => validateWebEvidenceArtifact(removedFromTabOrder, expected), /browser_measurement/u);
});

test("workflow is dispatch-only and binds protected HTTP/browser evidence to immutable inputs", () => {
  const workflow = readFileSync(".github/workflows/ai-coach-four-axis-evidence.yml", "utf8");
  const runner = readFileSync("scripts/run-ai-coach-four-axis-web-evidence.mjs", "utf8");
  const contract = readFileSync("scripts/lib/ai-coach-four-axis-web-evidence.mjs", "utf8");
  assert.match(workflow, /run-name: four-axis-\$\{\{ inputs\.correlation_id \}\}/u);
  assert.match(workflow, /on:\n  workflow_dispatch:/u); assert.doesNotMatch(workflow, /\n\s+push:/u);
  for (const input of ["correlation_id", "evidence_request", "request_sha256"]) assert.match(workflow, new RegExp(`${input}:`, "u"));
  assert.match(workflow, /environment: ai-coach-four-axis-evidence/u);
  assert.match(workflow, /timeout-minutes: 30/u);
  assert.match(workflow, /id-token: write/u);
  assert.match(workflow, /google-github-actions\/auth@v3/u);
  assert.match(workflow, /workload_identity_provider: \$\{\{ vars\.AI_COACH_STAGE_COLLECTOR_WIF_PROVIDER \}\}/u);
  assert.match(workflow, /environment: ai-coach-four-axis-evidence/u);
  assert.match(workflow, /AI_COACH_EVIDENCE_DISPATCHER_ACTOR/u);
  assert.match(workflow, /AI_COACH_EVIDENCE_ORCHESTRATOR_ACTORS_JSON/u);
  assert.match(workflow, /AI_COACH_STAGE_FIREBASE_WEB_API_KEY/u);
  assert.doesNotMatch(workflow, /AI_COACH_EVIDENCE_DISPATCH_ACTOR/u);
  assert.match(workflow, /permission-actions: read/u);
  assert.ok(workflow.indexOf("npx playwright install --with-deps chromium")
    < workflow.indexOf("google-github-actions/auth@v3"));
  assert.ok(workflow.indexOf("google-github-actions/setup-gcloud@v3")
    < workflow.indexOf("Observe production-before baseline and candidate stage tags"));
  assert.match(runner, /workflow: \{ repository, runId: workflowRunId, runAttempt: workflowRunAttempt, actor,/u);
  assert.doesNotMatch(workflow, /AI_COACH_EVIDENCE_(?:PRODUCTION_ORIGIN|CANDIDATE_ORIGIN|AUTHORIZATION|TEST_IDENTITY|ORCHESTRATOR_READ_TOKEN)/u);
  assert.match(runner, /print-identity-token/u); assert.match(runner, /--audiences=\$\{audience\}/u);
  assert.match(runner, /--include-email/u); assert.doesNotMatch(runner, /console\.log\([^)]*token/iu);
  assert.match(contract, /\/v1\/evidence\/four-axis\/attestation/u);
  assert.match(contract, /x-orider-evidence-lease/u); assert.doesNotMatch(contract, /leaseCredential.*console/iu);
  assert.match(workflow, /playwright install --with-deps chromium/u);
  assert.match(workflow, /github\/codeql-action\/init@v4/u); assert.match(workflow, /npm run build/u);
});

test("local operator CLI is separate from Actions and preserves live, browser, lease and privacy evidence", () => {
  const runner = readFileSync("scripts/run-ai-coach-four-axis-web-evidence-local.mjs", "utf8");
  const verifier = readFileSync("scripts/verify-ai-coach-four-axis-web-evidence-local.mjs", "utf8");
  for (const source of [runner, verifier]) {
    assert.doesNotMatch(source, /GITHUB_[A-Z_]+|api\.github\.com|verifyOrchestratorRun/u);
    assert.match(source, /--local-context/u); assert.match(source, /--context-sha256/u);
    assert.match(source, /verifyLocalRepositoryState/u); assert.match(source, /verifyLocalGoogleIdentity/u);
  }
  assert.match(runner, /collectBrowserEvidence/u); assert.match(runner, /collectStageBaselineComparison/u);
  assert.match(runner, /privacyScan/u); assert.match(runner, /--impersonate-service-account=/u);
  assert.match(runner, /createLocalEvidenceEnvelope/u); assert.match(runner, /mode: 0o600/u);
  assert.equal(runner.match(/flag: "wx"/gu)?.length, 3);
  assert.doesNotMatch(runner, /::add-mask::/u);
  assert.match(verifier, /validateLocalWebStageBaselineEvidenceArtifact/u);
  assert.match(verifier, /validateLocalEvidenceEnvelope/u);
  assert.match(verifier, /verifyLocalEnvelopeSidecar/u);
  assert.match(verifier, /verifyLocalLeaseGuardBinding/u);
  assert.ok(verifier.indexOf("validateLocalEvidenceEnvelope(envelope")
    < verifier.lastIndexOf("verifyLocalLeaseGuardBinding("));
});

test("publishes a backend-cross-checkable representative v3 schema and artifact", () => {
  const path = "scripts/fixtures/ai-coach-four-axis-stage-baseline-evidence-v3.json";
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"),
    "555394ad001f4ee90e99e6cc0b278c91faf76cc316d7467ef695ff687f7609aa");
  assert.equal(artifact.dispatch.requestSha256,
    `sha256:${createHash("sha256").update(v3RequestText).digest("hex")}`);
  const targets = artifact.targets;
  assert.equal(validateWebStageBaselineEvidenceArtifact(artifact, { sha: SHA, correlationId: CORRELATION,
    requestSha256: artifact.dispatch.requestSha256, expiresAt: v3Request.expiresAt,
    workflowRunId: 9001, workflowRunAttempt: 1, orchestrator: artifact.dispatch.orchestrator,
    workflowActor: "orider-gate[bot]", targets, fileShas: artifact.staticEvidence.testFileSha256 }), artifact);
  const semanticExpected = { sha: SHA, correlationId: CORRELATION,
    requestSha256: artifact.dispatch.requestSha256, expiresAt: v3Request.expiresAt,
    workflowRunId: 9001, workflowRunAttempt: 1, workflowActor: "orider-gate[bot]",
    orchestrator: artifact.dispatch.orchestrator, targets, fileShas: artifact.staticEvidence.testFileSha256 };
  for (const mutate of [
    (value) => { value.dispatch.workflow.actor = "other-bot[bot]"; },
    (value) => { value.liveComparison.baseline[0].fixtureDigest = digest("0"); },
    (value) => { value.liveComparison.candidate[1].response.evidenceDigest = "invalid"; },
    (value) => { value.liveComparison.baseline[2].productExecution.cardPath = "/v1/coach/insights/rider"; },
    (value) => { value.liveComparison.candidate[3].productExecution.requestKey = value.liveComparison.baseline[3].productExecution.requestKey; },
    (value) => { value.liveComparison.baseline[0].productExecution.providerLedgerCount = 2; },
    (value) => { value.liveComparison.candidate[0].productExecution.turnLedgerCount = 2; },
    (value) => { value.liveComparison.baseline[0].productExecution.userDataWrites = 1; },
    (value) => { value.liveComparison.warmups[0].providerCalls = 1; },
    (value) => { value.liveComparison.warmups.reverse(); },
  ]) {
    const changed = structuredClone(artifact); mutate(changed);
    assert.throws(() => validateWebStageBaselineEvidenceArtifact(changed, semanticExpected), /web_evidence:/u);
  }
  const writeObserved = structuredClone(artifact);
  const observation = writeObserved.liveComparison.baseline[0];
  observation.userDataWrites = 1; observation.productExecution.userDataWrites = 1;
  observation.receiptDigest = prefixedEvidenceDigest({ schemaVersion: "ai-coach-four-axis-http-receipt-v1",
    correlationDigest: rawDigest(CORRELATION), caseId: observation.caseId,
    fixtureDigest: observation.fixtureDigest, requestDigest: observation.requestDigest,
    targetFingerprint: writeObserved.targets.baseline.targetFingerprint, outcome: "answer",
    providerCalls: observation.providerCalls, quotaConsumed: observation.quotaConsumed,
    userDataWrites: observation.userDataWrites, card: observation.card, response: observation.response,
    productExecution: observation.productExecution });
  assert.notEqual(observation.receiptDigest, artifact.liveComparison.baseline[0].receiptDigest);
  assert.throws(() => validateWebStageBaselineEvidenceArtifact(writeObserved, semanticExpected), /web_evidence:/u);
  const schema = JSON.parse(readFileSync("scripts/fixtures/ai-coach-four-axis-stage-baseline-evidence-v3.schema.json", "utf8"));
  const validateSchema = new Ajv({ allErrors: true }).compile(schema);
  assert.equal(validateSchema(artifact), true, JSON.stringify(validateSchema.errors));
  for (const mutate of [
    (value) => { value.dispatch.unexpected = true; },
    (value) => { delete value.staticEvidence.results.todo; },
    (value) => { value.browserEvidence.surfaces.pmc.viewportCssPx = 321; },
    (value) => { value.liveComparison.baseline[0].rawResponse = "leak"; },
    (value) => { value.liveComparison.warmups[0].receiptDigest = "invalid"; },
    (value) => { value.liveComparison.warmups[0].path = "/v1/coach/respond"; },
    (value) => { value.liveComparison.warmups[1].httpStatus = 204; },
    (value) => { value.liveComparison.warmups.reverse(); },
    (value) => { value.liveComparison.baseline[2].caseId = "pmc_recovery"; },
    (value) => { value.liveComparison.candidate[4].productExecution.cardPath = "/v1/coach/insights/pmc"; },
    (value) => { value.browserEvidence.surfaces.pmc.componentName = "CoachRiderInsightCard"; },
    (value) => { value.privacyScan.matches.networkBodies = 1; },
  ]) {
    const changed = structuredClone(artifact); mutate(changed);
    assert.equal(validateSchema(changed), false);
  }
  assert.equal(schema.properties.schemaVersion.const, "ai-coach-four-axis-web-stage-baseline-evidence-v3");
  assert.deepEqual(schema.required, ["schemaVersion", "artifactName", "repository", "commitSha", "workflowPath",
    "dispatch", "targets", "staticEvidence", "browserEvidence", "liveComparison", "privacyScan"]);
});

test("local evidence preserves the semantic v3 payload and emits the backend exact local-file envelope", () => {
  const canonical = JSON.parse(readFileSync("scripts/fixtures/ai-coach-four-axis-stage-baseline-evidence-v3.json", "utf8"));
  const contextValue = localContext(); const requestValue = localRequest();
  const contextSha256 = `sha256:${createHash("sha256").update(JSON.stringify(contextValue)).digest("hex")}`;
  const artifactName = localWebEvidenceArtifactName(SHA, contextValue.contextId);
  const artifact = { schemaVersion: "ai-coach-four-axis-web-stage-baseline-local-evidence-v1", artifactName,
    repository: "miranae/orider-web", commitSha: SHA,
    producerPath: "scripts/run-ai-coach-four-axis-web-evidence-local.mjs",
    localExecution: { contextId: contextValue.contextId, contextSha256, operator: contextValue.operator,
      identity: contextValue.identity, backend: contextValue.backend, issuedAt: contextValue.issuedAt,
      expiresAt: contextValue.expiresAt, treeSha: contextValue.treeSha, statusClean: true },
    request: { correlationId: requestValue.correlationId, requestSha256: contextValue.request.sha256,
      issuedAt: requestValue.issuedAt, expiresAt: requestValue.expiresAt, consumer: requestValue.consumer,
      backend: requestValue.backend, operator: requestValue.operator, identity: requestValue.identity },
    targets: canonical.targets,
    evidenceLeaseDigests: { baseline: digest("8"), candidate: digest("9") },
    staticEvidence: canonical.staticEvidence, browserEvidence: canonical.browserEvidence,
    liveComparison: canonical.liveComparison, privacyScan: canonical.privacyScan };
  assert.equal(validateLocalWebStageBaselineEvidenceArtifact(artifact, { sha: SHA, context: contextValue,
    contextSha256, request: requestValue, targets: canonical.targets,
    fileShas: canonical.staticEvidence.testFileSha256 }), artifact);
  const evidencePath = `artifacts/${artifactName}/${artifactName}.json`;
  const envelope = createLocalEvidenceEnvelope({ headSha: SHA, treeSha: contextValue.treeSha,
    evidencePath, evidenceBytes: 42_001, evidenceSha256: digest("d") });
  assert.deepEqual(envelope, { executionMode: "local-file-v1", headSha: SHA, treeSha: contextValue.treeSha,
    statusClean: true, evidence: { path: evidencePath, bytes: 42_001, sha256: digest("d") } });
  assert.equal(validateLocalEvidenceEnvelope(envelope, envelope), envelope);
  for (const mutate of [(value) => { value.statusClean = false; }, (value) => { value.evidence.bytes += 1; },
    (value) => { value.evidence.sha256 = "invalid"; }, (value) => { value.executionMode = "github-actions"; }]) {
    const changed = structuredClone(envelope); mutate(changed);
    assert.throws(() => validateLocalEvidenceEnvelope(changed, envelope), /local_envelope/u);
  }
  const drift = structuredClone(artifact); drift.targets.candidate.imageDigest = digest("0");
  assert.throws(() => validateLocalWebStageBaselineEvidenceArtifact(drift, { sha: SHA, context: contextValue,
    contextSha256, request: requestValue, targets: canonical.targets,
    fileShas: canonical.staticEvidence.testFileSha256 }), /local_artifact_target_binding/u);
  const reusedLease = structuredClone(artifact);
  reusedLease.evidenceLeaseDigests.candidate = reusedLease.evidenceLeaseDigests.baseline;
  assert.throws(() => validateLocalWebStageBaselineEvidenceArtifact(reusedLease, { sha: SHA, context: contextValue,
    contextSha256, request: requestValue, targets: canonical.targets,
    fileShas: canonical.staticEvidence.testFileSha256 }), /local_lease_binding/u);
});

test("publishes a complete backend-readable representative v2 artifact with an exact fixture hash", () => {
  const path = "scripts/fixtures/ai-coach-four-axis-dispatch-artifact.json";
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"),
    "09281847cb9bf5010de901ab7cf0690599592a23721fac5c658974eecd1bec5e");
  assert.equal(validateWebEvidenceArtifact(artifact, { sha: SHA, correlationId: CORRELATION,
    requestSha256: artifact.dispatch.requestSha256, expiresAt: request.expiresAt,
    workflowRunId: 9001, workflowRunAttempt: 1,
    orchestrator: artifact.dispatch.orchestrator, targets: artifact.targets,
    fileShas: artifact.staticEvidence.testFileSha256 }), artifact);
  assert.equal(artifact.liveComparison.production.length, 10);
  assert.equal(artifact.liveComparison.candidate.length, 10);
});

test("privacy scan covers final JSON, DOM, URLs, bodies, logs and provider sidecars", () => {
  assert.deepEqual(privacyScan({ finalArtifact: "safe", renderedDom: "safe", networkUrls: "https://safe.example",
    networkBodies: "safe", testLogs: "safe", providerSidecars: "safe" }).matches,
  { finalArtifact: 0, renderedDom: 0, networkUrls: 0, networkBodies: 0, testLogs: 0, providerSidecars: 0 });
  assert.equal(privacyScan({ finalArtifact: "safe", renderedDom: "safe", networkUrls: "safe",
    networkBodies: '{"uid":"raw"}', testLogs: "safe", providerSidecars: "safe" }).matches.networkBodies, 1);
  assert.equal(privacyScan({ finalArtifact: "safe", renderedDom: "safe", networkUrls: "safe",
    networkBodies: '{"firebaseCustomToken":"raw"}', testLogs: "safe", providerSidecars: "safe" })
    .matches.networkBodies, 1);
  assert.equal(privacyScan({ finalArtifact: '{"exactCoordinates":[37.5,127]}' }).matches.finalArtifact, 1);
  assert.equal(privacyScan({ providerSidecars: JSON.stringify('{"coordinates":[37.5,127]}') })
    .matches.providerSidecars, 1);
  for (const key of ["latitude", "longitude"]) {
    assert.equal(privacyScan({ testLogs: JSON.stringify({ [key]: 37.5 }) }).matches.testLogs, 1);
  }
  for (const text of ["latitude: 37.5, longitude: 127.0", "lat/lon: 37.5, 127.0", "(37.5, 127.0)"]) {
    assert.ok(privacyScan({ renderedDom: text }).matches.renderedDom >= 1);
  }
  assert.equal(privacyScan({ renderedDom: "The route coordinates are intentionally omitted." })
    .matches.renderedDom, 0);
});

test("operations contract documents the v3 OIDC stage-baseline boundary and fail-closed inputs", () => {
  const document = readFileSync("docs/operations/AI_COACH_FOUR_AXIS_WEB_EVIDENCE.md", "utf8");
  for (const term of ["workflow_dispatch", "correlation_id", "production-before", "tagged-stage-baseline", "10-turn",
    "Chromium", "semantic assertions", "protected Environment", "Workload Identity Federation", "v3", "#1668", "fail-closed"]) {
    assert.match(document, new RegExp(term, "iu"));
  }
});
