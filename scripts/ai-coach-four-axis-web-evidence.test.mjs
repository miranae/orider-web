import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectBrowserEvidence } from "./lib/ai-coach-four-axis-browser-evidence.mjs";
import { collectLiveComparison, decodeEvidenceRequest, FOUR_AXIS_CASES, prefixedEvidenceDigest, privacyScan,
  MAX_HTTP_RESPONSE_BYTES, REQUIRED_RENDER_ASSERTIONS, targetFingerprint, validateDispatchRequest, validateWebEvidenceArtifact,
  verifyOrchestratorRun, WEB_EVIDENCE_TEST_FILES, webEvidenceArtifactName } from "./lib/ai-coach-four-axis-web-evidence.mjs";

const SHA = "a".repeat(40); const HASH = "b".repeat(64); const CORRELATION = "four-axis-contract-0001";
const fixtureText = readFileSync("scripts/fixtures/ai-coach-four-axis-dispatch-request.json", "utf8");
const fixtureHash = createHash("sha256").update(fixtureText).digest("hex");
const request = JSON.parse(fixtureText);
const digest = (character) => `sha256:${character.repeat(64)}`;
const rawDigest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function context() { return { correlationId: CORRELATION, repository: "miranae/orider-web", sha: SHA,
  expectedOrigins: { production: "https://coach-prod.example.com", candidate: "https://candidate---coach-stage.example.com" },
  nowMs: Date.parse("2026-07-27T00:00:00.000Z") }; }

function orchestratorFetch(url) {
  if (url.endsWith("/actions/runs/42001")) return Promise.resolve({ ok: true, json: async () => ({ id: 42001,
    repository: { full_name: "miranae/orider-g1-web" }, head_sha: "b".repeat(40), run_attempt: 1,
    event: "workflow_dispatch", status: "in_progress", workflow_id: 77 }) });
  if (url.endsWith("/actions/workflows/77")) return Promise.resolve({ ok: true,
    json: async () => ({ path: ".github/workflows/ai-coach-promotion-gate.yml" }) });
  throw new Error("unexpected GitHub URL");
}

function observedHttp() {
  return async (url, options) => {
    const body = JSON.parse(options.body); const item = FOUR_AXIS_CASES.find((entry) => entry.caseId === body.caseId);
    const target = url.includes("candidate---") ? request.targets.candidate : request.targets.production;
    const projection = { sourceRevisionDigest: digest("4"), projectionDigest: digest("5"),
      evidenceDigest: digest("6"), sharedFactsDigest: digest("7") };
    const receipt = { schemaVersion: "ai-coach-four-axis-http-receipt-v1",
      correlationDigest: rawDigest(request.correlationId), caseId: item.caseId, fixtureDigest: request.fixture.digest,
      requestDigest: rawDigest(options.body), targetFingerprint: target.targetFingerprint, outcome: "answer",
      providerCalls: item.providerCalls, quotaConsumed: item.quotaConsumed, userDataWrites: 0,
      card: item.card ? { ...structuredClone(projection), providerCalls: 0, quotaConsumed: 0, userDataWrites: 0 } : null,
      response: structuredClone(projection) };
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
  assert.match(workflow, /run-name: four-axis-\$\{\{ inputs\.correlation_id \}\}/u);
  assert.match(workflow, /on:\n  workflow_dispatch:/u); assert.doesNotMatch(workflow, /\n\s+push:/u);
  for (const input of ["correlation_id", "evidence_request", "request_sha256"]) assert.match(workflow, new RegExp(`${input}:`, "u"));
  assert.match(workflow, /environment: ai-coach-four-axis-evidence/u);
  assert.match(workflow, /timeout-minutes: 30/u);
  assert.match(workflow, /AI_COACH_EVIDENCE_PRODUCTION_ORIGIN: \$\{\{ secrets\./u);
  assert.match(workflow, /AI_COACH_EVIDENCE_CANDIDATE_ORIGIN: \$\{\{ secrets\./u);
  assert.match(workflow, /AI_COACH_EVIDENCE_AUTHORIZATION: \$\{\{ secrets\./u);
  assert.match(workflow, /AI_COACH_EVIDENCE_TEST_IDENTITY: \$\{\{ secrets\./u);
  assert.match(workflow, /playwright install --with-deps chromium/u);
  assert.match(workflow, /github\/codeql-action\/init@v4/u); assert.match(workflow, /npm run build/u);
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
});

test("operations contract documents v2 incompatibility and missing live credentials as fail-closed", () => {
  const document = readFileSync("docs/operations/AI_COACH_FOUR_AXIS_WEB_EVIDENCE.md", "utf8");
  for (const term of ["workflow_dispatch", "correlation_id", "production warm", "tagged-stage", "10-turn",
    "Chromium", "semantic assertions", "protected Environment", "v2", "#1668", "fail-closed"]) {
    assert.match(document, new RegExp(term, "iu"));
  }
});
