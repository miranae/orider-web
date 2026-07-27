import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv from "ajv";
import { collectBrowserEvidence } from "./lib/ai-coach-four-axis-browser-evidence.mjs";
import { collectLiveComparison, collectStageBaselineComparison, decodeEvidenceRequest, FOUR_AXIS_CASES,
  parseOrchestratorActorAllowlist, prefixedEvidenceDigest, privacyScan, MAX_HTTP_RESPONSE_BYTES,
  REQUIRED_RENDER_ASSERTIONS, targetFingerprint,
  validateDispatchRequest, validateStageBaselineDispatchRequest, validateWebEvidenceArtifact,
  validateWebStageBaselineEvidenceArtifact,
  verifyOrchestratorRun, WEB_EVIDENCE_TEST_FILES, webEvidenceArtifactName } from "./lib/ai-coach-four-axis-web-evidence.mjs";

const SHA = "a".repeat(40); const HASH = "b".repeat(64); const CORRELATION = "four-axis-contract-0001";
const FIREBASE_API_KEY = "firebase-web-api-key-1234567890";
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

function observedStageHttp(calls = []) {
  const exchangeTargets = [];
  const uid = `coach-evidence-${createHash("sha256").update(v3Request.correlationId).digest("hex").slice(0, 32)}`;
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
      ? v3Request.targets.baseline : v3Request.targets.candidate;
    const targetName = target === v3Request.targets.baseline ? "baseline" : "candidate";
    const progress = progressByTarget[targetName];
    calls.push({ targetName, path: parsed.pathname, body: options.body ?? null });
    if (parsed.pathname === "/v1/evidence/four-axis/attestation") {
      assert.equal(options.headers.authorization, `Bearer ${oidcFor(parsed.origin)}`);
      const body = JSON.parse(options.body);
      assert.deepEqual(body, { schemaVersion: "ai-coach-four-axis-attestation-v1",
        correlationId: v3Request.correlationId, stageRunId: target.stageRunId, revision: target.revision,
        imageDigest: target.imageDigest, requestDigest: `sha256:${"9".repeat(64)}`,
        orchestratorActor: "ansrudska", providerPhase: "enabled" });
      return new Response(JSON.stringify({ schemaVersion: "ai-coach-four-axis-attestation-response-v3",
        correlationId: v3Request.correlationId, stageRunId: target.stageRunId, revision: target.revision,
        imageDigest: target.imageDigest, evidenceLeaseDigest: digest(targetName === "baseline" ? "8" : "9"),
        orchestratorActor: "ansrudska", expiresAt: v3Request.expiresAt,
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
    assert.equal(options.headers["x-orider-evidence-correlation"], v3Request.correlationId);
    assert.equal(options.headers["x-orider-evidence-orchestrator-actor"], "ansrudska");
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
    firebaseWebApiKey: FIREBASE_API_KEY, maskSecret: (token) => masked.push(token),
    requestSha256: `sha256:${"9".repeat(64)}`, nowMs: Date.parse("2026-07-27T00:00:00.000Z") });
  assert.equal(live.evidence.baseline.length, 10); assert.equal(live.evidence.candidate.length, 10);
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
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: observedStageHttp(),
    clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience), firebaseWebApiKey: "short",
    requestSha256: `sha256:${"9".repeat(64)}` }), /v3_http_identity/u);
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: observedStageHttp(),
    clock: () => 1, identityTokenFor: async () => "", firebaseWebApiKey: FIREBASE_API_KEY,
    requestSha256: `sha256:${"9".repeat(64)}` }), /oidc_token/u);
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
    if (new URL(url).pathname === "/v1/evidence/four-axis/attestation") {
      return new Response("{}", { status: 200, headers: { "content-type": "text/plain" } });
    }
    return observedStageHttp()(url, options);
  }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
  firebaseWebApiKey: FIREBASE_API_KEY, requestSha256: `sha256:${"9".repeat(64)}` }), /attestation_content_type/u);
  await assert.rejects(() => collectStageBaselineComparison(v3Request, { fetchImpl: async (url, options) => {
    if (new URL(url).pathname === "/v1/evidence/four-axis/attestation") {
      return new Response("{}", { status: 200, headers: { "content-type": "application/json",
        "content-length": String(64 * 1024 + 1) } });
    }
    return observedStageHttp()(url, options);
  }, clock: () => 1, identityTokenFor: async (audience) => oidcFor(audience),
  firebaseWebApiKey: FIREBASE_API_KEY, requestSha256: `sha256:${"9".repeat(64)}` }), /attestation_content_length/u);

  for (const mutate of [
    (value) => { value.revision = "tampered-revision"; },
    (value) => { value.expiresAt = "2026-07-27T00:05:00.000Z"; },
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
    firebaseWebApiKey: FIREBASE_API_KEY, requestSha256: `sha256:${"9".repeat(64)}`,
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
  firebaseWebApiKey: FIREBASE_API_KEY, requestSha256: `sha256:${"9".repeat(64)}`,
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
  firebaseWebApiKey: FIREBASE_API_KEY, requestSha256: `sha256:${"9".repeat(64)}`,
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
    firebaseWebApiKey: FIREBASE_API_KEY, requestSha256: `sha256:${"9".repeat(64)}`,
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
  firebaseWebApiKey: FIREBASE_API_KEY, requestSha256: `sha256:${"9".repeat(64)}`,
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
  firebaseWebApiKey: FIREBASE_API_KEY, requestSha256: `sha256:${"9".repeat(64)}`,
  nowMs: Date.parse("2026-07-27T00:00:00.000Z") }), /firebase_exchange_binding/u);
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
    (value) => { value.liveComparison.warmups[0].providerCalls = 1; },
    (value) => { value.liveComparison.warmups.reverse(); },
  ]) {
    const changed = structuredClone(artifact); mutate(changed);
    assert.throws(() => validateWebStageBaselineEvidenceArtifact(changed, semanticExpected), /web_evidence:/u);
  }
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
});

test("operations contract documents the v3 OIDC stage-baseline boundary and fail-closed inputs", () => {
  const document = readFileSync("docs/operations/AI_COACH_FOUR_AXIS_WEB_EVIDENCE.md", "utf8");
  for (const term of ["workflow_dispatch", "correlation_id", "production-before", "tagged-stage-baseline", "10-turn",
    "Chromium", "semantic assertions", "protected Environment", "Workload Identity Federation", "v3", "#1668", "fail-closed"]) {
    assert.match(document, new RegExp(term, "iu"));
  }
});
