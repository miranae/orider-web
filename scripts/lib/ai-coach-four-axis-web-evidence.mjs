import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const WEB_EVIDENCE_TEST_FILES = Object.freeze([
  "src/features/coach/aiCoachFourAxisWebEvidence.test.ts",
  "src/features/coach/CoachPmcInsightCard.test.tsx",
  "src/services/coachPmcInsightContract.test.ts",
  "src/features/coach/CoachRiderInsightCard.test.tsx",
  "src/features/fitness/riderInsightParity.test.ts",
  "src/features/coach/CoachPrescription.test.tsx",
  "src/services/coachProgressPlannerContract.test.ts",
  "src/features/courses/CourseRidePlanSection.test.tsx",
  "src/services/coachRidePlanContract.test.ts",
]);

export const REQUIRED_RENDER_ASSERTIONS = Object.freeze([
  "four-axis web evidence enforces 320px and 200% reflow constraints for all four surfaces",
  "CoachPmcInsightCard renders semantic metrics, signed deltas and localized questions without exposing opaque revision codes",
  "CoachPmcInsightCard gives each rendered card region a unique accessible heading id",
  "CoachPmcInsightCard keeps the card reflow-safe for narrow screens and 200% zoom",
  "CoachRiderInsightCard renders the 200% equivalent 320 CSS px structure without fixed-width traps and preserves keyboard order",
  "CoachPrescription renders the canonical backend fixture as exactly seven server-provided days and weekly TSS",
  "CoachPrescription previews server-derived before/after and requires a separate final confirmation",
  "CourseRidePlanSection exposes semantic summary and keyboard-operable question controls",
  "CourseRidePlanSection fails closed when the AI projection drifts from the visible card",
  "CourseRidePlanSection keeps token and snapshot flags independently default-off and AI questions independently hidden",
  "coach PMC insight contract parses the exact backend envelope and preserves canonical Fitness parity without recomputing PMC",
  "persisted PDC → Fitness → Coach Rider Insight parity carries one revision/asOf/type/confidence/duration snapshot through the Fitness surface",
  "Progress Planner backend contract strictly accepts pending proposal before/after evidence and rejects write/extra drift",
  "Coach Ride Plan backend contract strictly accepts only the privacy-safe AI projection",
]);

export const FOUR_AXIS_CASES = Object.freeze([
  { caseId: "track0_load_summary", questionCode: "LOAD_SUMMARY", providerCalls: 1, quotaConsumed: 1, card: false },
  { caseId: "track0_period_compare", questionCode: "PERIOD_COMPARE", providerCalls: 1, quotaConsumed: 1, card: false },
  { caseId: "pmc_change", questionCode: "CHANGE", providerCalls: 2, quotaConsumed: 1, card: true },
  { caseId: "pmc_recovery", questionCode: "RECOVERY", providerCalls: 2, quotaConsumed: 1, card: true },
  { caseId: "rider_profile", questionCode: "PROFILE", providerCalls: 2, quotaConsumed: 1, card: true },
  { caseId: "rider_duration_priority", questionCode: "DURATION_PRIORITY", providerCalls: 2, quotaConsumed: 1, card: true },
  { caseId: "progress_needs_checkin", questionCode: "PRIORITY", providerCalls: 0, quotaConsumed: 0, card: true },
  { caseId: "progress_selected_evidence", questionCode: "SELECTED_EVIDENCE", providerCalls: 0, quotaConsumed: 0, card: true },
  { caseId: "ride_hardest_section", questionCode: "HARDEST_SECTION", providerCalls: 1, quotaConsumed: 1, card: true },
  { caseId: "ride_personal_pacing", questionCode: "PERSONAL_PACING", providerCalls: 1, quotaConsumed: 1, card: true },
]);
export const CANONICAL_EVIDENCE_PATHNAME = "/__evidence/ai-coach-four-axis/observe";
export const ORCHESTRATOR_WORKFLOW_PATH = ".github/workflows/ai-coach-promotion-gate.yml";

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const HEX_DIGEST = /^[0-9a-f]{64}$/u;
const CORRELATION = /^[a-z0-9][a-z0-9-]{15,79}$/u;
const REVISION = /^[a-z][a-z0-9-]{1,62}$/u;
const TAG = /^[a-z][a-z0-9-]{1,30}$/u;
const FORBIDDEN = /(?:\buid\b|courseId|activityId|idToken|appCheckToken|authorization|(?:^|["'])question["']?\s*:|providerPrompt|providerOutput|polyline|latitude|longitude|exactCoordinates|bearer\s+[A-Za-z0-9._~-]+)/giu;
const RECEIPT_KEYS = ["schemaVersion", "correlationDigest", "caseId", "fixtureDigest", "requestDigest",
  "targetFingerprint", "outcome", "providerCalls", "quotaConsumed", "userDataWrites", "card", "response"];
const PROJECTION_KEYS = ["sourceRevisionDigest", "projectionDigest", "evidenceDigest", "sharedFactsDigest"];
export const MAX_HTTP_RESPONSE_BYTES = 200_000;

function exactKeys(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) throw new Error(code);
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function positiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(code);
  return value;
}
function prefixedDigest(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function p95(values) { return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1]; }

export function evidenceDigest(value) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export function prefixedEvidenceDigest(value) { return `sha256:${evidenceDigest(value)}`; }
export function evidenceFileSha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
export function webEvidenceArtifactName(sha, correlationId) {
  if (!SHA.test(sha) || !CORRELATION.test(correlationId)) throw new Error("web_evidence:invalid_identity");
  return `ai-coach-four-axis-web-evidence-${sha}-${correlationId}`;
}

export function decodeEvidenceRequest(input, expectedSha256) {
  if (typeof input !== "string" || input.length < 2 || input.length > 64_000 || !HEX_DIGEST.test(expectedSha256 ?? "")) {
    throw new Error("web_evidence:request_input");
  }
  let bytes;
  try { bytes = input.trimStart().startsWith("{") ? Buffer.from(input) : Buffer.from(input, "base64url"); }
  catch { throw new Error("web_evidence:request_encoding"); }
  if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) throw new Error("web_evidence:request_digest");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("web_evidence:request_json"); }
  return { value, requestSha256: `sha256:${expectedSha256}` };
}

export function targetFingerprint(target) {
  if (target.environment === "production-warm") return prefixedEvidenceDigest({ environment: target.environment,
    url: target.url, revisionIdentityDigest: target.revisionIdentityDigest,
    productionAuditDigest: target.productionAuditDigest });
  return prefixedEvidenceDigest({ environment: target.environment, taggedUrl: target.taggedUrl, tag: target.tag,
    revision: target.revision, imageDigest: target.imageDigest, stageRunId: target.stageRunId });
}

function validateHttpsTarget(rawUrl, expectedOrigin, code) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error(`${code}:url`); }
  let configured;
  try { configured = new URL(expectedOrigin); } catch { throw new Error(`${code}:configured_origin`); }
  if (parsed.protocol !== "https:" || configured.protocol !== "https:" || parsed.port || configured.port
      || parsed.username || parsed.password || configured.username || configured.password
      || parsed.search || parsed.hash || configured.search || configured.hash || configured.pathname !== "/"
      || parsed.origin !== configured.origin || parsed.pathname !== CANONICAL_EVIDENCE_PATHNAME) {
    throw new Error(`${code}:url`);
  }
  return parsed;
}

export function validateDispatchRequest(value, context) {
  exactKeys(value, ["schemaVersion", "correlationId", "expiresAt", "consumer", "orchestrator", "fixture", "targets"],
    "web_evidence:request_keys");
  if (value.schemaVersion !== "ai-coach-four-axis-web-dispatch-v1" || value.correlationId !== context.correlationId
      || !CORRELATION.test(value.correlationId)) throw new Error("web_evidence:request_correlation");
  const expiresAt = Date.parse(value.expiresAt); const now = context.nowMs ?? Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - now > 30 * 60_000) throw new Error("web_evidence:request_expiry");
  exactKeys(value.consumer, ["repository", "sha"], "web_evidence:consumer_keys");
  if (value.consumer.repository !== "miranae/orider-web" || value.consumer.repository !== context.repository
      || value.consumer.sha !== context.sha) throw new Error("web_evidence:consumer_binding");
  exactKeys(value.orchestrator, ["repository", "workflowPath", "headSha", "runId", "runAttempt"],
    "web_evidence:orchestrator_keys");
  if (value.orchestrator.repository !== "miranae/orider-g1-web"
      || value.orchestrator.workflowPath !== ORCHESTRATOR_WORKFLOW_PATH
      || !SHA.test(value.orchestrator.headSha)) throw new Error("web_evidence:orchestrator_binding");
  positiveInteger(value.orchestrator.runId, "web_evidence:orchestrator_run");
  positiveInteger(value.orchestrator.runAttempt, "web_evidence:orchestrator_attempt");
  exactKeys(value.fixture, ["digest", "turns"], "web_evidence:fixture_keys");
  if (value.fixture.digest !== prefixedEvidenceDigest(FOUR_AXIS_CASES)
      || JSON.stringify(value.fixture.turns) !== JSON.stringify(FOUR_AXIS_CASES)) {
    throw new Error("web_evidence:fixture_binding");
  }
  exactKeys(value.targets, ["production", "candidate"], "web_evidence:target_keys");
  const production = exactKeys(value.targets.production, ["environment", "url", "targetFingerprint",
    "revisionIdentityDigest", "productionAuditDigest"], "web_evidence:production_keys");
  const candidate = exactKeys(value.targets.candidate, ["environment", "taggedUrl", "targetFingerprint", "tag",
    "revision", "imageDigest", "stageRunId"], "web_evidence:candidate_keys");
  exactKeys(context.expectedOrigins, ["production", "candidate"], "web_evidence:configured_origins");
  const productionUrl = validateHttpsTarget(production.url, context.expectedOrigins.production, "web_evidence:production");
  const candidateUrl = validateHttpsTarget(candidate.taggedUrl, context.expectedOrigins.candidate, "web_evidence:candidate");
  if (production.environment !== "production-warm" || candidate.environment !== "tagged-stage"
      || !DIGEST.test(production.revisionIdentityDigest) || !DIGEST.test(production.productionAuditDigest)
      || production.targetFingerprint !== targetFingerprint(production) || !TAG.test(candidate.tag)
      || !candidateUrl.hostname.startsWith(`${candidate.tag}---`) || !REVISION.test(candidate.revision)
      || !DIGEST.test(candidate.imageDigest) || !/^stage_[a-z0-9-]{8,64}$/u.test(candidate.stageRunId)
      || candidate.targetFingerprint !== targetFingerprint(candidate) || productionUrl.href === candidateUrl.href) {
    throw new Error("web_evidence:target_binding");
  }
  return value;
}

export async function verifyOrchestratorRun(request, { token, fetchImpl = fetch } = {}) {
  if (!token) throw new Error("web_evidence:orchestrator_token");
  const base = `https://api.github.com/repos/${request.orchestrator.repository}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28" };
  const runResponse = await fetchImpl(`${base}/actions/runs/${request.orchestrator.runId}`, { headers });
  if (!runResponse.ok) throw new Error(`web_evidence:orchestrator_http_${runResponse.status}`);
  const run = await runResponse.json();
  if (run?.repository?.full_name !== request.orchestrator.repository || run?.head_sha !== request.orchestrator.headSha
      || run?.run_attempt !== request.orchestrator.runAttempt || run?.event !== "workflow_dispatch"
      || !["queued", "in_progress", "completed"].includes(run?.status)
      || run.status === "completed" && run.conclusion !== "success" || !Number.isSafeInteger(run?.workflow_id)) {
    throw new Error("web_evidence:orchestrator_observation");
  }
  const workflowResponse = await fetchImpl(`${base}/actions/workflows/${run.workflow_id}`, { headers });
  if (!workflowResponse.ok) throw new Error(`web_evidence:workflow_http_${workflowResponse.status}`);
  const workflow = await workflowResponse.json();
  if (workflow?.path !== request.orchestrator.workflowPath) throw new Error("web_evidence:orchestrator_workflow");
  return { repository: run.repository.full_name, workflowPath: workflow.path, headSha: run.head_sha,
    runId: run.id, runAttempt: run.run_attempt, event: run.event };
}

export function passedVitestAssertions(machineResult) {
  const assertions = (machineResult?.testResults ?? []).flatMap((suite) => suite.assertionResults ?? []);
  if (!Number.isInteger(machineResult?.numPassedTests) || machineResult.numPassedTests < REQUIRED_RENDER_ASSERTIONS.length
      || machineResult.numFailedTests !== 0 || machineResult.numPendingTests !== 0 || machineResult.numTodoTests !== 0
      || assertions.some((assertion) => assertion.status !== "passed")) throw new Error("web_evidence:test_results");
  const titles = assertions.map((assertion) => assertion.fullName ?? assertion.title ?? "");
  if (REQUIRED_RENDER_ASSERTIONS.some((title) => !titles.includes(title))) throw new Error("web_evidence:assertion_allowlist");
  return titles;
}

function validateReceipt(receipt, item, request, target) {
  exactKeys(receipt, RECEIPT_KEYS, `web_evidence:receipt_keys:${item.caseId}`);
  if (receipt.schemaVersion !== "ai-coach-four-axis-http-receipt-v1"
      || receipt.correlationDigest !== prefixedDigest(request.correlationId)
      || receipt.caseId !== item.caseId || receipt.fixtureDigest !== request.fixture.digest
      || receipt.targetFingerprint !== target.targetFingerprint || receipt.outcome !== "answer"
      || receipt.providerCalls !== item.providerCalls || receipt.quotaConsumed !== item.quotaConsumed
      || receipt.userDataWrites !== 0 || !DIGEST.test(receipt.requestDigest)) {
    throw new Error(`web_evidence:receipt_binding:${item.caseId}`);
  }
  exactKeys(receipt.response, PROJECTION_KEYS, `web_evidence:response_keys:${item.caseId}`);
  if (Object.values(receipt.response).some((digest) => !DIGEST.test(digest))) {
    throw new Error(`web_evidence:response_digest:${item.caseId}`);
  }
  if (item.card) {
    exactKeys(receipt.card, [...PROJECTION_KEYS, "providerCalls", "quotaConsumed", "userDataWrites"],
      `web_evidence:card_keys:${item.caseId}`);
    if (receipt.card.providerCalls !== 0 || receipt.card.quotaConsumed !== 0 || receipt.card.userDataWrites !== 0
        || PROJECTION_KEYS.some((key) => receipt.card[key] !== receipt.response[key])) {
      throw new Error(`web_evidence:card_ai_parity:${item.caseId}`);
    }
  } else if (receipt.card !== null) throw new Error(`web_evidence:unexpected_card:${item.caseId}`);
  return receipt;
}

async function observeTarget(request, target, options) {
  const observations = []; const captures = []; let fiveXx = 0;
  for (let ordinal = -1; ordinal < FOUR_AXIS_CASES.length; ordinal += 1) {
    const item = FOUR_AXIS_CASES[Math.max(0, ordinal)];
    const body = { schemaVersion: "ai-coach-four-axis-synthetic-request-v1", correlationId: request.correlationId,
      fixtureDigest: request.fixture.digest, caseId: item.caseId, questionCode: item.questionCode };
    const bodyText = JSON.stringify(body); const requestDigest = prefixedDigest(bodyText);
    const started = options.clock();
    const response = await options.fetchImpl(target.environment === "production-warm" ? target.url : target.taggedUrl, {
      method: "POST", redirect: "error", headers: { "content-type": "application/json",
        authorization: `Bearer ${options.authorization}`, "x-orider-test-identity": options.testIdentity,
        "x-orider-observation-phase": ordinal < 0 ? "warmup" : "measured" }, body: bodyText,
      signal: AbortSignal.timeout(30_000),
    });
    const declaredLength = response.headers?.get?.("content-length");
    if (declaredLength != null && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_HTTP_RESPONSE_BYTES)) {
      throw new Error("web_evidence:response_content_length");
    }
    if (!response.headers?.get?.("content-type")?.toLowerCase().startsWith("application/json")) {
      throw new Error("web_evidence:response_content_type");
    }
    const chunks = []; let received = 0; const reader = response.body?.getReader?.();
    if (!reader) throw new Error("web_evidence:response_stream_required");
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      received += value.byteLength;
      if (received > MAX_HTTP_RESPONSE_BYTES) { await reader.cancel(); throw new Error("web_evidence:response_body_cap"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(received); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const responseText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const latencyMs = Math.max(0, Math.round(options.clock() - started));
    captures.push({ url: response.url || (target.environment === "production-warm" ? target.url : target.taggedUrl),
      requestBody: bodyText, responseBody: responseText });
    if (response.status >= 500 && response.status <= 599) fiveXx += 1;
    if (!response.ok) throw new Error(`web_evidence:http_${target.environment}_${response.status}`);
    let receipt; try { receipt = JSON.parse(responseText); } catch { throw new Error("web_evidence:receipt_json"); }
    validateReceipt(receipt, item, request, target);
    if (receipt.requestDigest !== requestDigest) throw new Error(`web_evidence:request_receipt:${item.caseId}`);
    const bounded = { caseId: item.caseId, fixtureDigest: receipt.fixtureDigest, requestDigest,
      httpStatus: response.status, latencyMs, providerCalls: receipt.providerCalls, quotaConsumed: receipt.quotaConsumed,
      userDataWrites: receipt.userDataWrites, card: receipt.card, response: receipt.response,
      receiptDigest: prefixedEvidenceDigest(receipt) };
    if (ordinal < 0) options.warmups.push({ environment: target.environment, receiptDigest: bounded.receiptDigest });
    else observations.push(bounded);
  }
  return { observations, captures, fiveXx };
}

export async function collectLiveComparison(request, options) {
  if (!options.authorization || !options.testIdentity) throw new Error("web_evidence:http_identity");
  const warmups = [];
  const production = await observeTarget(request, request.targets.production, { ...options, warmups });
  const candidate = await observeTarget(request, request.targets.candidate, { ...options, warmups });
  const productionP95Ms = p95(production.observations.map((item) => item.latencyMs));
  const candidateP95Ms = p95(candidate.observations.map((item) => item.latencyMs));
  for (let index = 0; index < FOUR_AXIS_CASES.length; index += 1) {
    if (production.observations[index].requestDigest !== candidate.observations[index].requestDigest
        || production.observations[index].fixtureDigest !== candidate.observations[index].fixtureDigest) {
      throw new Error("web_evidence:cross_target_request_drift");
    }
  }
  if (production.fiveXx !== 0 || candidate.fiveXx !== 0 || candidateP95Ms > productionP95Ms * 1.2) {
    throw new Error("web_evidence:live_gate");
  }
  return { evidence: { warmups, production: production.observations, candidate: candidate.observations,
    metrics: { productionP95Ms, candidateP95Ms, productionFiveXx: production.fiveXx,
      candidateFiveXx: candidate.fiveXx, measuredTurnsPerTarget: FOUR_AXIS_CASES.length } },
  captures: [...production.captures, ...candidate.captures] };
}

export function privacyScan(channels) {
  const matches = {}; let scannedBytes = 0;
  for (const [name, values] of Object.entries(channels)) {
    const text = Array.isArray(values) ? values.join("\n") : String(values ?? "");
    scannedBytes += Buffer.byteLength(text); FORBIDDEN.lastIndex = 0;
    matches[name] = [...text.matchAll(FORBIDDEN)].length;
  }
  return { matches, scannedBytes };
}

function validateObservationSet(observations, target, correlationId, targetFingerprintValue) {
  if (!Array.isArray(observations) || observations.length !== FOUR_AXIS_CASES.length) throw new Error(`web_evidence:${target}_count`);
  observations.forEach((observation, index) => {
    const item = FOUR_AXIS_CASES[index];
    exactKeys(observation, ["caseId", "fixtureDigest", "requestDigest", "httpStatus", "latencyMs", "providerCalls",
      "quotaConsumed", "userDataWrites", "card", "response", "receiptDigest"], `web_evidence:${target}_observation_keys`);
    if (observation.caseId !== item.caseId || observation.httpStatus !== 200 || observation.providerCalls !== item.providerCalls
        || observation.quotaConsumed !== item.quotaConsumed || observation.userDataWrites !== 0
        || !Number.isSafeInteger(observation.latencyMs) || observation.latencyMs < 0
        || !DIGEST.test(observation.fixtureDigest) || !DIGEST.test(observation.requestDigest)
        || !DIGEST.test(observation.receiptDigest)) throw new Error(`web_evidence:${target}_observation`);
    exactKeys(observation.response, PROJECTION_KEYS, `web_evidence:${target}_response`);
    if (item.card) {
      exactKeys(observation.card, [...PROJECTION_KEYS, "providerCalls", "quotaConsumed", "userDataWrites"],
        `web_evidence:${target}_card`);
      if (observation.card.providerCalls !== 0 || observation.card.quotaConsumed !== 0 || observation.card.userDataWrites !== 0
          || PROJECTION_KEYS.some((key) => observation.card[key] !== observation.response[key])) {
        throw new Error(`web_evidence:${target}_parity`);
      }
    } else if (observation.card !== null) throw new Error(`web_evidence:${target}_card_absence`);
    const receipt = { schemaVersion: "ai-coach-four-axis-http-receipt-v1",
      correlationDigest: prefixedDigest(correlationId), caseId: observation.caseId,
      fixtureDigest: observation.fixtureDigest, requestDigest: observation.requestDigest,
      targetFingerprint: targetFingerprintValue, outcome: "answer", providerCalls: observation.providerCalls,
      quotaConsumed: observation.quotaConsumed, userDataWrites: observation.userDataWrites,
      card: observation.card, response: observation.response };
    if (observation.receiptDigest !== prefixedEvidenceDigest(receipt)) throw new Error(`web_evidence:${target}_receipt_digest`);
  });
}

export function validateWebEvidenceArtifact(value, expected) {
  exactKeys(value, ["schemaVersion", "artifactName", "repository", "commitSha", "workflowPath", "dispatch",
    "targets", "staticEvidence", "browserEvidence", "liveComparison", "privacyScan"], "web_evidence:artifact_keys");
  if (value.schemaVersion !== "ai-coach-four-axis-web-dispatch-evidence-v2"
      || value.artifactName !== webEvidenceArtifactName(expected.sha, expected.correlationId)
      || value.repository !== "miranae/orider-web" || value.commitSha !== expected.sha
      || value.workflowPath !== ".github/workflows/ai-coach-four-axis-evidence.yml") throw new Error("web_evidence:provenance");
  exactKeys(value.dispatch, ["correlationId", "requestSha256", "expiresAt", "consumer", "orchestrator", "workflow"],
    "web_evidence:dispatch_keys");
  if (value.dispatch.correlationId !== expected.correlationId || value.dispatch.requestSha256 !== expected.requestSha256
      || value.dispatch.expiresAt !== expected.expiresAt
      || !Number.isFinite(Date.parse(value.dispatch.expiresAt))) throw new Error("web_evidence:dispatch_binding");
  exactKeys(value.dispatch.workflow, ["repository", "runId", "runAttempt", "event"], "web_evidence:workflow_keys");
  if (value.dispatch.workflow.repository !== "miranae/orider-web" || value.dispatch.workflow.event !== "workflow_dispatch"
      || value.dispatch.workflow.runId !== expected.workflowRunId || value.dispatch.workflow.runAttempt !== expected.workflowRunAttempt) {
    throw new Error("web_evidence:workflow_binding");
  }
  if (JSON.stringify(value.dispatch.orchestrator) !== JSON.stringify(expected.orchestrator)
      || JSON.stringify(value.dispatch.consumer) !== JSON.stringify({ repository: "miranae/orider-web", sha: expected.sha })) {
    throw new Error("web_evidence:request_provenance");
  }
  exactKeys(value.targets, ["production", "candidate"], "web_evidence:artifact_targets");
  if (JSON.stringify(value.targets) !== JSON.stringify(expected.targets)) throw new Error("web_evidence:artifact_target_binding");
  exactKeys(value.staticEvidence, ["testFiles", "testFileSha256", "results", "assertionReceiptDigests"],
    "web_evidence:static_keys");
  if (JSON.stringify(value.staticEvidence.testFiles) !== JSON.stringify(WEB_EVIDENCE_TEST_FILES)
      || JSON.stringify(value.staticEvidence.testFileSha256) !== JSON.stringify(expected.fileShas)
      || value.staticEvidence.results.failed !== 0 || value.staticEvidence.results.skipped !== 0
      || value.staticEvidence.results.todo !== 0 || value.staticEvidence.results.passed < REQUIRED_RENDER_ASSERTIONS.length
      || !Array.isArray(value.staticEvidence.assertionReceiptDigests)
      || JSON.stringify(value.staticEvidence.assertionReceiptDigests) !== JSON.stringify(REQUIRED_RENDER_ASSERTIONS
        .map((title) => prefixedEvidenceDigest({ title, testFileSha256: expected.fileShas })))) throw new Error("web_evidence:static");
  exactKeys(value.browserEvidence, ["engine", "harnessMode", "harnessPath", "viewportCssPx", "deviceScaleFactor",
    "cssZoomPercent", "surfaces"], "web_evidence:browser_keys");
  if (value.browserEvidence.engine !== "chromium" || value.browserEvidence.viewportCssPx !== 320
      || value.browserEvidence.deviceScaleFactor !== 2 || value.browserEvidence.cssZoomPercent !== 200
      || value.browserEvidence.harnessMode !== "evidence"
      || value.browserEvidence.harnessPath !== "/scripts/evidence/four-axis/index.html") {
    throw new Error("web_evidence:browser_context");
  }
  exactKeys(value.browserEvidence.surfaces, ["pmc", "rider", "progress", "ride"], "web_evidence:browser_surfaces");
  const componentNames = { pmc: "CoachPmcInsightCard", rider: "CoachRiderInsightCard",
    progress: "CoachPrescription", ride: "CourseRidePlanSection" };
  for (const [name, surface] of Object.entries(value.browserEvidence.surfaces)) {
    exactKeys(surface, ["surface", "componentName", "harnessPath", "viewportCssPx", "deviceScaleFactor",
      "cssZoomPercent", "rootClientWidth", "rootScrollWidth", "labelledRootCount", "namedInteractiveCount",
      "liveRegionObservedCount", "tabStartDigest", "tabSteps", "expectedFocusOrderDigest",
      "observedFocusOrderDigest", "focusOrderMismatchCount", "questionControlOrderDigest", "focusedQuestionOrdinal",
      "focusedQuestionControlDigest", "tabindexMinusOneQuestionCount", "skippedQuestionControlCount",
      "keyboardActivations", "domDigest", "ariaSnapshotDigest", "screenshotDigest", "measurementReceiptDigest"],
    "web_evidence:browser_surface");
    const { measurementReceiptDigest, ...receipt } = surface;
    if (surface.surface !== name || surface.componentName !== componentNames[name]
        || surface.harnessPath !== value.browserEvidence.harnessPath || surface.viewportCssPx !== 320
        || surface.deviceScaleFactor !== 2 || surface.cssZoomPercent !== 200
        || !Number.isSafeInteger(surface.rootClientWidth) || surface.rootClientWidth < 1
        || surface.rootScrollWidth > surface.rootClientWidth || surface.labelledRootCount < 1
        || surface.namedInteractiveCount < 1 || surface.liveRegionObservedCount < 1
        || !DIGEST.test(surface.tabStartDigest) || !Number.isSafeInteger(surface.tabSteps) || surface.tabSteps < 1
        || !DIGEST.test(surface.expectedFocusOrderDigest)
        || surface.observedFocusOrderDigest !== surface.expectedFocusOrderDigest
        || surface.focusOrderMismatchCount !== 0 || !DIGEST.test(surface.questionControlOrderDigest)
        || surface.focusedQuestionOrdinal !== 0 || !DIGEST.test(surface.focusedQuestionControlDigest)
        || surface.tabindexMinusOneQuestionCount !== 0 || surface.skippedQuestionControlCount !== 0
        || surface.keyboardActivations < 1 || !DIGEST.test(surface.domDigest)
        || !DIGEST.test(surface.ariaSnapshotDigest) || !DIGEST.test(surface.screenshotDigest)
        || surface.measurementReceiptDigest !== prefixedEvidenceDigest(receipt)) {
      throw new Error("web_evidence:browser_measurement");
    }
  }
  exactKeys(value.liveComparison, ["warmups", "production", "candidate", "metrics"], "web_evidence:live_keys");
  if (!Array.isArray(value.liveComparison.warmups) || value.liveComparison.warmups.length !== 2
      || value.liveComparison.warmups.some((item) => !DIGEST.test(item.receiptDigest))) throw new Error("web_evidence:warmup");
  validateObservationSet(value.liveComparison.production, "production", expected.correlationId,
    expected.targets.production.targetFingerprint);
  validateObservationSet(value.liveComparison.candidate, "candidate", expected.correlationId,
    expected.targets.candidate.targetFingerprint);
  if (value.liveComparison.warmups[0].receiptDigest !== value.liveComparison.production[0].receiptDigest
      || value.liveComparison.warmups[1].receiptDigest !== value.liveComparison.candidate[0].receiptDigest) {
    throw new Error("web_evidence:warmup_receipt");
  }
  const productionP95 = p95(value.liveComparison.production.map((item) => item.latencyMs));
  const candidateP95 = p95(value.liveComparison.candidate.map((item) => item.latencyMs));
  if (JSON.stringify(value.liveComparison.metrics) !== JSON.stringify({ productionP95Ms: productionP95,
    candidateP95Ms: candidateP95, productionFiveXx: 0, candidateFiveXx: 0, measuredTurnsPerTarget: 10 })
      || candidateP95 > productionP95 * 1.2) throw new Error("web_evidence:live_metrics");
  for (let index = 0; index < FOUR_AXIS_CASES.length; index += 1) {
    if (value.liveComparison.production[index].requestDigest !== value.liveComparison.candidate[index].requestDigest
        || value.liveComparison.production[index].fixtureDigest !== value.liveComparison.candidate[index].fixtureDigest) {
      throw new Error("web_evidence:target_request_parity");
    }
  }
  exactKeys(value.privacyScan, ["matches", "scannedBytes"], "web_evidence:privacy_keys");
  exactKeys(value.privacyScan.matches, ["finalArtifact", "renderedDom", "networkUrls", "networkBodies", "testLogs",
    "providerSidecars"], "web_evidence:privacy_channels");
  FORBIDDEN.lastIndex = 0;
  if (Object.values(value.privacyScan.matches).some((count) => count !== 0)
      || !Number.isSafeInteger(value.privacyScan.scannedBytes) || value.privacyScan.scannedBytes < 1
      || FORBIDDEN.test(JSON.stringify(value))) throw new Error("web_evidence:privacy");
  return value;
}
