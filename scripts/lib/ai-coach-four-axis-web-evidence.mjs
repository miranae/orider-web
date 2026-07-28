import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

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
  { caseId: "track0_load_summary", source: "track0", question: "최근 28일 훈련 부하를 요약해줘", questionCode: "LOAD_SUMMARY", providerCalls: 1, quotaConsumed: 1, card: false },
  { caseId: "track0_period_compare", source: "track0", question: "최근 7일과 이전 7일 훈련을 비교해줘", questionCode: "PERIOD_COMPARE", providerCalls: 1, quotaConsumed: 1, card: false },
  { caseId: "pmc_change", source: "pmc", question: "현재 PMC 변화가 의미하는 것을 설명해줘", questionCode: "CHANGE", providerCalls: 2, quotaConsumed: 1, card: true },
  { caseId: "pmc_recovery", source: "pmc", question: "현재 피로도에서 회복을 어떻게 조절할까?", questionCode: "RECOVERY", providerCalls: 2, quotaConsumed: 1, card: true },
  { caseId: "rider_profile", source: "rider", question: "내 라이더 유형과 강점을 설명해줘", questionCode: "PROFILE", providerCalls: 2, quotaConsumed: 1, card: true },
  { caseId: "rider_duration_priority", source: "rider", question: "어떤 파워 지속시간을 우선 훈련해야 해?", questionCode: "DURATION_PRIORITY", providerCalls: 2, quotaConsumed: 1, card: true },
  { caseId: "progress_needs_checkin", source: "progress", question: "선택한 처방에서 우선 확인할 항목은 뭐야?", questionCode: "PRIORITY", providerCalls: 0, quotaConsumed: 0, card: true },
  { caseId: "progress_selected_evidence", source: "progress", question: "선택한 처방의 근거를 설명해줘", questionCode: "SELECTED_EVIDENCE", providerCalls: 0, quotaConsumed: 0, card: true },
  { caseId: "ride_hardest_section", source: "ride", question: "이 코스에서 가장 어려운 구간은 어디야?", questionCode: "HARDEST_SECTION", providerCalls: 1, quotaConsumed: 1, card: true },
  { caseId: "ride_personal_pacing", source: "ride", question: "내 능력에 맞는 코스 페이스를 알려줘", questionCode: "PERSONAL_PACING", providerCalls: 1, quotaConsumed: 1, card: true },
]);
export const FOUR_AXIS_DISPATCH_TURNS = Object.freeze(FOUR_AXIS_CASES.map(({ source: _source, ...item }) => item));
const FOUR_AXIS_LEGACY_TURNS = Object.freeze(FOUR_AXIS_CASES.map(
  ({ source: _source, question: _question, ...item }) => item));
export const CANONICAL_EVIDENCE_PATHNAME = "/__evidence/ai-coach-four-axis/observe";
export const ORCHESTRATOR_WORKFLOW_PATH = ".github/workflows/ai-coach-promotion-gate.yml";
export const CANONICAL_STAGE_HOST_SUFFIX = "---orider-ai-api-stage-ldfyfyx5da-du.a.run.app";

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const HEX_DIGEST = /^[0-9a-f]{64}$/u;
const CORRELATION = /^[a-z0-9][a-z0-9-]{15,79}$/u;
const REVISION = /^[a-z][a-z0-9-]{1,62}$/u;
const TAG = /^[a-z][a-z0-9-]{1,30}$/u;
const GITHUB_ACTOR = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(?:\[bot\])?$/u;
const FORBIDDEN = /(?:\buid\b|courseId|activityId|prescriptionId|sourceRequestId|(?:firebaseCustom|access|refresh|identity|id|appCheck)Token|authorization|oidc-[A-Za-z0-9._~-]+|(?:^|["'])(?:question|token)["']?\s*:|providerPrompt|providerOutput|polyline|latitude|longitude|bearer\s+[A-Za-z0-9._~-]+)/giu;
const RAW_PRIVATE_VALUE = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\bAIza[A-Za-z0-9_-]{20,}\b|bearer\s+[A-Za-z0-9._~-]+)/iu;
const RECEIPT_KEYS = ["schemaVersion", "correlationDigest", "caseId", "fixtureDigest", "requestDigest",
  "targetFingerprint", "outcome", "providerCalls", "quotaConsumed", "userDataWrites", "card", "response",
  "productExecution"];
const PROJECTION_KEYS = ["sourceRevisionDigest", "projectionDigest", "evidenceDigest", "sharedFactsDigest"];
const PRODUCT_EXECUTION_KEYS = ["questionPath", "cardPath", "requestKey", "questionStatus", "cardStatus",
  "providerCallsObserved", "providerLedgerCount", "turnLedgerCount", "userDataWrites", "questionResponseDigest",
  "cardResponseDigest"];
const PRODUCT_CARD_PATHS = new Map([
  ["track0_load_summary", null], ["track0_period_compare", null],
  ["pmc_change", "/v1/coach/insights/pmc"], ["pmc_recovery", "/v1/coach/insights/pmc"],
  ["rider_profile", "/v1/coach/insights/rider"], ["rider_duration_priority", "/v1/coach/insights/rider"],
  ["progress_needs_checkin", "/v1/coach/change-proposals"],
  ["progress_selected_evidence", "/v1/coach/change-proposals"],
  ["ride_hardest_section", "/v1/coach/ride-plan"], ["ride_personal_pacing", "/v1/coach/ride-plan"],
]);
const PRODUCT_USER_DATA_WRITE_PATHS = [/^\/v1\/coach\/change-proposals\/[^/]+\/(?:confirm|rollback)$/u,
  /^\/v1\/coach\/(?:profile|weekly-check-in)$/u];
export const MAX_HTTP_RESPONSE_BYTES = 200_000;
export const MAX_AUTH_RESPONSE_BYTES = 64 * 1024;
const MAX_LEDGER_PROVENANCE_AGE_MS = 90 * 60_000;
const AUTH_TOKEN = /^[A-Za-z0-9._~-]{8,16384}$/u;
const FIREBASE_WEB_API_KEY = /^[A-Za-z0-9_-]{20,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const GOOGLE_ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9._%+-]{0,127}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,63}$/u;
const SERVICE_ACCOUNT = /^[a-z][a-z0-9-]{4,28}@[a-z][a-z0-9-]{4,28}\.iam\.gserviceaccount\.com$/u;
const LOCAL_CONTEXT_SCHEMA = "ai-coach-four-axis-web-local-context-v2";
const LOCAL_REQUEST_SCHEMA = "ai-coach-four-axis-web-local-operator-v1";
const LOCAL_ARTIFACT_SCHEMA = "ai-coach-four-axis-web-stage-baseline-local-evidence-v1";
const LOCAL_LEASE_GUARD_PATH = "scripts/assert-ai-coach-local-stage-lease.mjs";
export const APPROVED_LOCAL_EVIDENCE_SERVICE_ACCOUNT =
  "ai-coach-stage-collector@orider-dev.iam.gserviceaccount.com";

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

function verifiedSecret(value, code) {
  if (typeof value !== "string" || !AUTH_TOKEN.test(value) || /[\r\n]/u.test(value)) throw new Error(code);
  return value;
}

function validateLocalLeaseGuard(value, backend, code) {
  exactKeys(value, ["repository", "commitSha", "treeSha", "relativePath", "sha256"], code);
  if (value.repository !== "miranae/orider-g1-web" || value.repository !== backend.repository
      || value.commitSha !== backend.commitSha || value.treeSha !== backend.treeSha
      || value.relativePath !== LOCAL_LEASE_GUARD_PATH || !DIGEST.test(value.sha256)) throw new Error(code);
  return value;
}

async function readBoundedJsonResponse(response, { code, maxBytes = MAX_AUTH_RESPONSE_BYTES } = {}) {
  const contentType = response.headers?.get?.("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) throw new Error(`${code}_content_type`);
  const declared = response.headers?.get?.("content-length");
  if (declared != null && (!/^\d+$/u.test(declared) || Number(declared) < 2 || Number(declared) > maxBytes)) {
    throw new Error(`${code}_content_length`);
  }
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error(`${code}_stream_required`);
  const chunks = []; let received = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    received += value.byteLength;
    if (received > maxBytes) { await reader.cancel(); throw new Error(`${code}_body_cap`); }
    chunks.push(value);
  }
  if (received < 2 || declared != null && received !== Number(declared)) throw new Error(`${code}_body_size`);
  const bytes = new Uint8Array(received); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error(`${code}_json`); }
}

export function evidenceDigest(value) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export function prefixedEvidenceDigest(value) { return `sha256:${evidenceDigest(value)}`; }
export function evidenceFileSha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
export function webEvidenceArtifactName(sha, correlationId) {
  if (!SHA.test(sha) || !CORRELATION.test(correlationId)) throw new Error("web_evidence:invalid_identity");
  return `ai-coach-four-axis-web-evidence-${sha}-${correlationId}`;
}

export function localWebEvidenceArtifactName(sha, contextId) {
  if (!SHA.test(sha) || !UUID.test(contextId)) throw new Error("web_evidence:local_identity");
  return `ai-coach-four-axis-web-local-evidence-${sha}-${contextId}`;
}

export function decodeLocalOperatorContext(bytes, expectedSha256) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > 64_000 || !HEX_DIGEST.test(expectedSha256 ?? "")
      || createHash("sha256").update(bytes).digest("hex") !== expectedSha256) {
    throw new Error("web_evidence:local_context_digest");
  }
  try { return { value: JSON.parse(bytes.toString("utf8")), contextSha256: `sha256:${expectedSha256}` }; }
  catch { throw new Error("web_evidence:local_context_json"); }
}

export function validateLocalOperatorContext(value, expected) {
  exactKeys(value, ["schemaVersion", "contextId", "repository", "commitSha", "treeSha", "statusClean", "operator", "identity",
    "backend", "issuedAt", "expiresAt", "request", "stage"], "web_evidence:local_context_keys");
  exactKeys(value.operator, ["osAccount", "gitAuthor", "cloudAccount"], "web_evidence:local_operator_keys");
  exactKeys(value.identity, ["serviceAccount", "localActor"], "web_evidence:local_identity_keys");
  exactKeys(value.backend, ["repository", "commitSha", "treeSha", "stageRunId", "checkpointSha256", "leaseGuard"],
    "web_evidence:local_backend_keys");
  validateLocalLeaseGuard(value.backend.leaseGuard, value.backend, "web_evidence:local_lease_guard_binding");
  exactKeys(value.request, ["path", "sha256"], "web_evidence:local_context_request_keys");
  exactKeys(value.stage, ["hostSuffix", "hostSuffixSha256", "targets"], "web_evidence:local_stage_keys");
  exactKeys(value.stage.targets, ["baseline", "candidate"], "web_evidence:local_target_keys");
  const baselineKeys = ["targetFingerprint", "tag", "revision", "imageDigest", "stageRunId", "productionAuditDigest"];
  const candidateKeys = ["targetFingerprint", "tag", "revision", "imageDigest", "stageRunId"];
  exactKeys(value.stage.targets.baseline, baselineKeys, "web_evidence:local_baseline_keys");
  exactKeys(value.stage.targets.candidate, candidateKeys, "web_evidence:local_candidate_keys");
  const issuedAt = Date.parse(value.issuedAt); const expiresAt = Date.parse(value.expiresAt);
  const now = expected.nowMs ?? Date.now();
  if (value.schemaVersion !== LOCAL_CONTEXT_SCHEMA || !UUID.test(value.contextId)
      || value.repository !== "miranae/orider-web" || value.repository !== expected.repository
      || value.commitSha !== expected.sha || !SHA.test(value.treeSha) || value.statusClean !== true
      || Object.values(value.operator).some((identity) => typeof identity !== "string" || identity.length < 1
        || identity.length > 320 || /[\r\n\0]/u.test(identity))
      || !GOOGLE_ACCOUNT.test(value.operator.cloudAccount) || !GOOGLE_ACCOUNT.test(value.identity.localActor)
      || value.identity.localActor !== value.operator.cloudAccount
      || !SERVICE_ACCOUNT.test(value.identity.serviceAccount)
      || value.identity.serviceAccount !== APPROVED_LOCAL_EVIDENCE_SERVICE_ACCOUNT
      || value.backend.repository !== "miranae/orider-g1-web" || !SHA.test(value.backend.commitSha)
      || !SHA.test(value.backend.treeSha) || !/^stage_[a-z0-9-]{8,64}$/u.test(value.backend.stageRunId)
      || !DIGEST.test(value.backend.checkpointSha256)
      || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now + 60_000
      || expiresAt <= now || expiresAt - issuedAt > 30 * 60_000
      || typeof value.request.path !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/u.test(value.request.path)
      || !DIGEST.test(value.request.sha256)
      || value.stage.hostSuffix !== CANONICAL_STAGE_HOST_SUFFIX
      || !HEX_DIGEST.test(value.stage.hostSuffixSha256)
      || createHash("sha256").update(value.stage.hostSuffix).digest("hex") !== value.stage.hostSuffixSha256) {
    throw new Error("web_evidence:local_context_binding");
  }
  return value;
}

export function validateLocalOperatorRequest(value, context) {
  exactKeys(value, ["schemaVersion", "correlationId", "issuedAt", "expiresAt", "consumer", "backend", "operator",
    "identity", "fixture", "targets"], "web_evidence:local_request_keys");
  exactKeys(value.consumer, ["repository", "commitSha", "treeSha", "statusClean"],
    "web_evidence:local_request_consumer_keys");
  exactKeys(value.backend, ["repository", "commitSha", "treeSha", "stageRunId", "checkpointSha256", "leaseGuard"],
    "web_evidence:local_request_backend_keys");
  validateLocalLeaseGuard(value.backend.leaseGuard, value.backend, "web_evidence:local_request_lease_guard");
  exactKeys(value.operator, ["osAccount", "gitAuthor", "cloudAccount"], "web_evidence:local_request_operator_keys");
  exactKeys(value.identity, ["serviceAccount", "localActor"], "web_evidence:local_request_identity_keys");
  exactKeys(value.fixture, ["digest", "turns"], "web_evidence:local_request_fixture_keys");
  const issuedAt = Date.parse(value.issuedAt); const expiresAt = Date.parse(value.expiresAt);
  const now = context.nowMs ?? Date.now();
  if (value.schemaVersion !== LOCAL_REQUEST_SCHEMA || !CORRELATION.test(value.correlationId ?? "")
      || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now + 60_000
      || expiresAt <= now || expiresAt - issuedAt > 30 * 60_000
      || value.consumer.repository !== "miranae/orider-web" || value.consumer.repository !== context.repository
      || value.consumer.commitSha !== context.sha || value.consumer.treeSha !== context.treeSha
      || value.consumer.statusClean !== true
      || value.backend.repository !== "miranae/orider-g1-web" || !SHA.test(value.backend.commitSha)
      || !SHA.test(value.backend.treeSha) || !/^stage_[a-z0-9-]{8,64}$/u.test(value.backend.stageRunId)
      || !DIGEST.test(value.backend.checkpointSha256)
      || JSON.stringify(value.backend) !== JSON.stringify(context.backend)
      || JSON.stringify(value.operator) !== JSON.stringify(context.operator)
      || value.identity.serviceAccount !== APPROVED_LOCAL_EVIDENCE_SERVICE_ACCOUNT
      || value.identity.serviceAccount !== context.identity.serviceAccount
      || value.identity.localActor !== context.identity.localActor || !GOOGLE_ACCOUNT.test(value.identity.localActor)
      || value.identity.localActor !== value.operator.cloudAccount
      || value.fixture.digest !== prefixedEvidenceDigest(FOUR_AXIS_DISPATCH_TURNS)
      || prefixedEvidenceDigest(value.fixture.turns) !== prefixedEvidenceDigest(FOUR_AXIS_DISPATCH_TURNS)) {
    throw new Error("web_evidence:local_request_binding");
  }
  exactKeys(value.targets, ["baseline", "candidate"], "web_evidence:local_request_target_keys");
  const targetKeys = ["environment", "taggedUrl", "targetFingerprint", "tag", "revision", "imageDigest", "stageRunId"];
  const baseline = exactKeys(value.targets.baseline, [...targetKeys, "productionAuditDigest"],
    "web_evidence:local_request_baseline_keys");
  const candidate = exactKeys(value.targets.candidate, targetKeys, "web_evidence:local_request_candidate_keys");
  for (const [name, target] of Object.entries({ baseline, candidate })) {
    let url; try { url = new URL(target.taggedUrl); } catch { throw new Error(`web_evidence:local_request_${name}_url`); }
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash
        || url.pathname !== "/" || url.hostname !== `${target.tag}${context.stageHostSuffix}`
        || !TAG.test(target.tag) || !REVISION.test(target.revision) || !DIGEST.test(target.imageDigest)
        || target.stageRunId !== value.backend.stageRunId || target.targetFingerprint !== targetFingerprint(target)) {
      throw new Error(`web_evidence:local_request_${name}_binding`);
    }
  }
  if (baseline.environment !== "tagged-stage-baseline" || candidate.environment !== "tagged-stage-candidate"
      || baseline.taggedUrl === candidate.taggedUrl || baseline.revision === candidate.revision
      || !DIGEST.test(baseline.productionAuditDigest)) throw new Error("web_evidence:local_request_target_binding");
  return value;
}

export function bindLocalContextToRequest(context, request, requestPath) {
  const projectedTargets = {
    baseline: { targetFingerprint: request.targets.baseline.targetFingerprint, tag: request.targets.baseline.tag,
      revision: request.targets.baseline.revision, imageDigest: request.targets.baseline.imageDigest,
      stageRunId: request.targets.baseline.stageRunId,
      productionAuditDigest: request.targets.baseline.productionAuditDigest },
    candidate: { targetFingerprint: request.targets.candidate.targetFingerprint, tag: request.targets.candidate.tag,
      revision: request.targets.candidate.revision, imageDigest: request.targets.candidate.imageDigest,
      stageRunId: request.targets.candidate.stageRunId },
  };
  if (context.request.sha256 !== `sha256:${evidenceFileSha256(requestPath)}`
      || context.expiresAt !== request.expiresAt
      || context.issuedAt !== request.issuedAt
      || JSON.stringify(context.operator) !== JSON.stringify(request.operator)
      || JSON.stringify(context.identity) !== JSON.stringify(request.identity)
      || JSON.stringify(context.backend) !== JSON.stringify(request.backend)
      || JSON.stringify(context.stage.targets) !== JSON.stringify(projectedTargets)) {
    throw new Error("web_evidence:local_request_binding");
  }
  return projectedTargets;
}

export function verifyLocalCheckpointBinding(request, path, expectedSha256) {
  if (typeof path !== "string" || path.length < 1 || !DIGEST.test(expectedSha256 ?? "")
      || expectedSha256 !== request.backend.checkpointSha256
      || `sha256:${evidenceFileSha256(path)}` !== expectedSha256) {
    throw new Error("web_evidence:local_checkpoint_binding");
  }
  let checkpoint; try { checkpoint = JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error("web_evidence:local_checkpoint_json"); }
  const leaseGuard = validateLocalLeaseGuard(checkpoint?.leaseGuard, request.backend,
    "web_evidence:local_checkpoint_lease_guard");
  if (JSON.stringify(leaseGuard) !== JSON.stringify(request.backend.leaseGuard)) {
    throw new Error("web_evidence:local_checkpoint_lease_guard");
  }
  return { checkpointSha256: expectedSha256, leaseGuard };
}

export function verifyLocalLeaseGuardBinding(backendRoot, guardPath, binding, runner = spawnSync) {
  if (!isAbsolute(backendRoot ?? "") || !isAbsolute(guardPath ?? "")) {
    throw new Error("web_evidence:local_lease_guard_path");
  }
  exactKeys(binding, ["repository", "commitSha", "treeSha", "relativePath", "sha256"],
    "web_evidence:local_lease_guard_binding");
  if (binding.repository !== "miranae/orider-g1-web" || !SHA.test(binding.commitSha)
      || !SHA.test(binding.treeSha) || !DIGEST.test(binding.sha256)) {
    throw new Error("web_evidence:local_lease_guard_binding");
  }
  let canonicalRoot; let canonicalGuard; let guardStat;
  try {
    canonicalRoot = realpathSync(backendRoot); canonicalGuard = realpathSync(guardPath);
    guardStat = lstatSync(guardPath);
  } catch { throw new Error("web_evidence:local_lease_guard_fs"); }
  const boundGuard = resolve(canonicalRoot, binding?.relativePath ?? "");
  const guardRelative = relative(canonicalRoot, canonicalGuard);
  if (canonicalRoot !== resolve(backendRoot) || canonicalGuard !== resolve(guardPath)
      || binding?.relativePath !== LOCAL_LEASE_GUARD_PATH || boundGuard !== canonicalGuard
      || guardRelative.startsWith("..") || isAbsolute(guardRelative) || guardRelative === ""
      || !guardStat.isFile() || guardStat.isSymbolicLink()
      || typeof process.getuid !== "function" || guardStat.uid !== process.getuid()
      || (guardStat.mode & 0o022) !== 0
      || `sha256:${createHash("sha256").update(readFileSync(canonicalGuard)).digest("hex")}` !== binding.sha256) {
    throw new Error("web_evidence:local_lease_guard_fs_binding");
  }
  const git = (args, code) => {
    const result = runner("git", args, { cwd: canonicalRoot, encoding: "utf8", maxBuffer: 64_000 });
    if (result.status !== 0 || result.signal || result.error) throw new Error(code);
    return result.stdout.trim();
  };
  const head = git(["rev-parse", "HEAD"], "web_evidence:local_lease_guard_git");
  const tree = git(["rev-parse", "HEAD^{tree}"], "web_evidence:local_lease_guard_git");
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"], "web_evidence:local_lease_guard_git");
  const origin = git(["remote", "get-url", "origin"], "web_evidence:local_lease_guard_git");
  if (binding.repository !== "miranae/orider-g1-web" || binding.commitSha !== head || binding.treeSha !== tree
      || status !== "" || !/^(?:https:\/\/github\.com\/|git@github\.com:)miranae\/orider-g1-web(?:\.git)?$/u.test(origin)) {
    throw new Error("web_evidence:local_lease_guard_repository");
  }
  return { repository: binding.repository, commitSha: head, treeSha: tree,
    relativePath: binding.relativePath, sha256: binding.sha256 };
}

export function verifyLocalRepositoryState(root, sha, treeSha, runner = spawnSync, allowedUntracked = []) {
  const head = runner("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", maxBuffer: 64_000 });
  if (head.status !== 0 || head.stdout.trim() !== sha) throw new Error("web_evidence:local_head_binding");
  const status = runner("git", ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: root, encoding: "utf8", maxBuffer: 1_000_000 });
  const allowed = new Set(allowedUntracked);
  const entries = status.stdout.split("\n").filter(Boolean);
  if (status.status !== 0 || entries.some((entry) => !entry.startsWith("?? ") || !allowed.has(entry.slice(3)))) {
    throw new Error("web_evidence:local_clean_tree");
  }
  const tree = runner("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8", maxBuffer: 64_000 });
  if (tree.status !== 0 || tree.stdout.trim() !== treeSha) throw new Error("web_evidence:local_tree_binding");
  return { commitSha: sha, treeSha, cleanTree: true };
}

export function verifyLocalGoogleIdentity(context, runner = spawnSync, root = process.cwd()) {
  const invoke = (command, args) => runner(command, args, { cwd: root, encoding: "utf8", maxBuffer: 64_000 });
  const os = invoke("id", ["-un"]); const name = invoke("git", ["config", "user.name"]);
  const email = invoke("git", ["config", "user.email"]);
  const active = invoke("gcloud", ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"]);
  const actual = { osAccount: os.stdout?.trim(), gitAuthor: `${name.stdout?.trim()} <${email.stdout?.trim()}>`,
    cloudAccount: active.stdout?.trim() };
  if ([os, name, email, active].some((result) => result.status !== 0)
      || JSON.stringify(actual) !== JSON.stringify(context.operator)) {
    throw new Error("web_evidence:local_operator_identity");
  }
  return { operator: context.operator, serviceAccount: context.identity.serviceAccount };
}

export function parseOrchestratorActorAllowlist(value) {
  let actors;
  try { actors = JSON.parse(value); } catch { throw new Error("web_evidence:orchestrator_actor_allowlist_json"); }
  if (!Array.isArray(actors) || actors.length < 1 || actors.length > 16
      || actors.some((actor) => typeof actor !== "string" || !GITHUB_ACTOR.test(actor))
      || new Set(actors).size !== actors.length) throw new Error("web_evidence:orchestrator_actor_allowlist");
  return actors;
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
    revision: target.revision, imageDigest: target.imageDigest, stageRunId: target.stageRunId,
    ...(target.productionAuditDigest && { productionAuditDigest: target.productionAuditDigest }) });
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
  if (value.fixture.digest !== prefixedEvidenceDigest(FOUR_AXIS_LEGACY_TURNS)
      || JSON.stringify(value.fixture.turns) !== JSON.stringify(FOUR_AXIS_LEGACY_TURNS)) {
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

export function validateStageBaselineDispatchRequest(value, context) {
  exactKeys(value, ["schemaVersion", "correlationId", "expiresAt", "consumer", "orchestrator", "fixture", "targets"],
    "web_evidence:v3_request_keys");
  if (value.schemaVersion !== "ai-coach-four-axis-web-stage-baseline-dispatch-v2"
      || value.correlationId !== context.correlationId || !CORRELATION.test(value.correlationId)) {
    throw new Error("web_evidence:v3_request_identity");
  }
  const expiresAt = Date.parse(value.expiresAt); const now = context.nowMs ?? Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - now > 30 * 60_000) {
    throw new Error("web_evidence:v3_request_expiry");
  }
  exactKeys(value.consumer, ["repository", "sha"], "web_evidence:v3_consumer_keys");
  exactKeys(value.orchestrator, ["repository", "workflowPath", "headSha", "runId", "runAttempt", "actor"],
    "web_evidence:v3_orchestrator_keys");
  exactKeys(value.fixture, ["digest", "turns"], "web_evidence:v3_fixture_keys");
  if (value.consumer.repository !== "miranae/orider-web" || value.consumer.repository !== context.repository
      || value.consumer.sha !== context.sha || value.orchestrator.repository !== "miranae/orider-g1-web"
      || value.orchestrator.workflowPath !== ORCHESTRATOR_WORKFLOW_PATH || !SHA.test(value.orchestrator.headSha)
      || !GITHUB_ACTOR.test(value.orchestrator.actor)
      || !Array.isArray(context.orchestratorActors) || !context.orchestratorActors.includes(value.orchestrator.actor)
      || !Number.isSafeInteger(value.orchestrator.runId) || value.orchestrator.runId < 1
      || !Number.isSafeInteger(value.orchestrator.runAttempt) || value.orchestrator.runAttempt < 1
      || value.fixture.digest !== prefixedEvidenceDigest(FOUR_AXIS_DISPATCH_TURNS)
      || prefixedEvidenceDigest(value.fixture.turns) !== prefixedEvidenceDigest(FOUR_AXIS_DISPATCH_TURNS)) {
    throw new Error("web_evidence:v3_request_binding");
  }
  exactKeys(value.targets, ["baseline", "candidate"], "web_evidence:v3_target_keys");
  const expectedTargetKeys = ["environment", "taggedUrl", "targetFingerprint", "tag", "revision", "imageDigest", "stageRunId"];
  const baseline = exactKeys(value.targets.baseline, [...expectedTargetKeys, "productionAuditDigest"],
    "web_evidence:v3_baseline_keys");
  const candidate = exactKeys(value.targets.candidate, expectedTargetKeys, "web_evidence:v3_candidate_keys");
  const hostSuffix = context.stageHostSuffix; const hostSuffixSha256 = context.stageHostSuffixSha256;
  if (hostSuffix !== CANONICAL_STAGE_HOST_SUFFIX
      || !/^---[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(hostSuffix)
      || !HEX_DIGEST.test(hostSuffixSha256 ?? "")
      || createHash("sha256").update(hostSuffix).digest("hex") !== hostSuffixSha256) {
    throw new Error("web_evidence:v3_host_config");
  }
  for (const [name, target] of Object.entries({ baseline, candidate })) {
    let url; try { url = new URL(target.taggedUrl); } catch { throw new Error(`web_evidence:v3_${name}_url`); }
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash
        || url.pathname !== "/" || url.hostname !== `${target.tag}${hostSuffix}`
        || !TAG.test(target.tag) || !REVISION.test(target.revision)
        || !DIGEST.test(target.imageDigest) || !/^stage_[a-z0-9-]{8,64}$/u.test(target.stageRunId)
        || target.targetFingerprint !== targetFingerprint(target)) throw new Error(`web_evidence:v3_${name}_binding`);
  }
  if (baseline.environment !== "tagged-stage-baseline" || candidate.environment !== "tagged-stage-candidate"
      || baseline.stageRunId !== candidate.stageRunId || baseline.taggedUrl === candidate.taggedUrl
      || baseline.revision === candidate.revision
      || !DIGEST.test(baseline.productionAuditDigest)) throw new Error("web_evidence:v3_target_binding");
  return value;
}

export async function verifyOrchestratorRun(request, { token, fetchImpl = fetch, expectedActor, allowedActors } = {}) {
  if (!token) throw new Error("web_evidence:orchestrator_token");
  const base = `https://api.github.com/repos/${request.orchestrator.repository}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28" };
  const runResponse = await fetchImpl(`${base}/actions/runs/${request.orchestrator.runId}`, { headers });
  if (!runResponse.ok) throw new Error(`web_evidence:orchestrator_http_${runResponse.status}`);
  const run = await runResponse.json();
  const requestedActor = request.orchestrator.actor;
  const actorBound = requestedActor === undefined
    ? !expectedActor || run?.actor?.login === expectedActor
    : Array.isArray(allowedActors) && allowedActors.includes(requestedActor) && run?.actor?.login === requestedActor;
  if (run?.repository?.full_name !== request.orchestrator.repository || run?.head_sha !== request.orchestrator.headSha
      || run?.run_attempt !== request.orchestrator.runAttempt || run?.event !== "workflow_dispatch"
      || !actorBound
      || run?.status !== "in_progress" || run?.conclusion !== null || !Number.isSafeInteger(run?.workflow_id)) {
    throw new Error("web_evidence:orchestrator_observation");
  }
  const workflowResponse = await fetchImpl(`${base}/actions/workflows/${run.workflow_id}`, { headers });
  if (!workflowResponse.ok) throw new Error(`web_evidence:workflow_http_${workflowResponse.status}`);
  const workflow = await workflowResponse.json();
  if (workflow?.path !== request.orchestrator.workflowPath) throw new Error("web_evidence:orchestrator_workflow");
  return { ...request.orchestrator, event: run.event };
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
  validateProductExecution(receipt.productExecution, item);
  return receipt;
}

function validateProductExecution(product, item) {
  exactKeys(product, PRODUCT_EXECUTION_KEYS, `web_evidence:product_execution_keys:${item.caseId}`);
  const cardPath = PRODUCT_CARD_PATHS.get(item.caseId);
  if (product.questionPath !== "/v1/coach/respond" || product.cardPath !== cardPath
      || !HEX_DIGEST.test(product.requestKey) || product.questionStatus !== 200
      || product.cardStatus !== (cardPath === null ? null : 200)
      || product.providerCallsObserved !== item.providerCalls
      || product.providerLedgerCount !== (item.providerCalls > 0 ? 1 : 0)
      || product.turnLedgerCount !== item.quotaConsumed || product.userDataWrites !== 0
      || !DIGEST.test(product.questionResponseDigest)
      || (cardPath === null ? product.cardResponseDigest !== null : !DIGEST.test(product.cardResponseDigest))) {
    throw new Error(`web_evidence:product_execution_binding:${item.caseId}`);
  }
  return product;
}

function productHeaders(options) {
  return { "content-type": "application/json", authorization: `Bearer ${options.authorization}`,
    "X-Firebase-AppCheck": options.appCheckToken, "x-orider-evidence-lease": options.leaseCredential,
    "x-orider-evidence-correlation": options.evidenceCorrelationId,
    "x-orider-evidence-orchestrator-actor": options.orchestratorActor };
}

export function observedProductUserDataWrites(method, path, response, value) {
  const pathname = new URL(path, "https://evidence.invalid").pathname;
  if (method === "GET" || !response?.ok
      || !PRODUCT_USER_DATA_WRITE_PATHS.some((pattern) => pattern.test(pathname))) return 0;
  const count = value?.userDataWrites;
  if (count === undefined) return 0;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("web_evidence:v3_user_write_count");
  if (count === 0) return 0;
  const receipt = value?.status === "ok" ? value.data : null;
  if (receipt?.schemaVersion !== "coach-change-receipt-v1"
      || !/^proposal_[0-9a-f]{24}$/u.test(receipt.proposalId ?? "")
      || !/^audit_[0-9a-f]{24}$/u.test(receipt.auditId ?? "")
      || !["applied", "reverted"].includes(receipt.status)) {
    throw new Error("web_evidence:v3_user_write_receipt");
  }
  return count;
}

export function verifyLocalEnvelopeSidecar(envelopeBytes, envelopePath, expectedSha256) {
  const sidecarPath = `${envelopePath}.sha256`;
  let stat; let sidecar;
  try { stat = lstatSync(sidecarPath); sidecar = readFileSync(sidecarPath, "utf8"); }
  catch { throw new Error("web_evidence:local_envelope_sidecar_missing"); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("web_evidence:local_envelope_sidecar_file");
  const sidecarSha256 = sidecar.match(/^([0-9a-f]{64})\n$/u)?.[1];
  const actualSha256 = createHash("sha256").update(envelopeBytes).digest("hex");
  if (!sidecarSha256 || !HEX_DIGEST.test(expectedSha256)
      || sidecarSha256 !== expectedSha256 || actualSha256 !== expectedSha256) {
    throw new Error("web_evidence:local_envelope_digest");
  }
  return actualSha256;
}

export function validateProductLedgerReceipts(value, requestKey, expected) {
  exactKeys(value, ["providers", "request", "turns"], "web_evidence:v3_ledger_receipt_keys");
  if (!expected || !UUID.test(expected.requestId ?? "") || !HEX_DIGEST.test(expected.questionDigest ?? "")
      || !Number.isSafeInteger(expected.notBeforeMs)
      || !Number.isSafeInteger(expected.expiresAtMs) || expected.expiresAtMs <= expected.notBeforeMs) {
    throw new Error("web_evidence:v3_ledger_expected_provenance");
  }
  const inWindow = (iso, millis) => Number.isSafeInteger(millis) && Number.isFinite(Date.parse(iso))
    && Date.parse(iso) >= expected.notBeforeMs && Date.parse(iso) <= expected.expiresAtMs
    && millis >= expected.notBeforeMs && millis <= expected.expiresAtMs;
  const validUpdate = (createTime, updateTime) => Number.isFinite(Date.parse(updateTime))
    && Date.parse(updateTime) >= Date.parse(createTime) && Date.parse(updateTime) <= expected.expiresAtMs;
  if (value.request !== null) {
    exactKeys(value.request, ["createTime", "finalizedAtMs", "normalizedQuestionDigest", "path", "requestId",
      "requestKey", "state", "updateTime"], "web_evidence:v3_ledger_request_record");
    if (value.request.path !== `coach_requests/${requestKey}` || value.request.requestKey !== requestKey
        || value.request.requestId !== expected.requestId
        || value.request.normalizedQuestionDigest !== expected.questionDigest || value.request.state !== "completed"
        || !inWindow(value.request.createTime, value.request.finalizedAtMs)
        || !validUpdate(value.request.createTime, value.request.updateTime)) {
      throw new Error("web_evidence:v3_ledger_request_binding");
    }
  }
  const validate = (records, collection, statusKey, expectedStatus) => {
    if (!Array.isArray(records)) throw new Error("web_evidence:v3_ledger_receipt_array");
    const paths = new Set();
    for (const record of records) {
      const timeKey = collection === "coach_provider_budget_charges" ? "settledAtMs" : "chargedAtMs";
      exactKeys(record, ["createTime", "path", "requestKey", statusKey, timeKey, "updateTime"],
        "web_evidence:v3_ledger_receipt_record");
      const expectedPath = `${collection}/${requestKey}`;
      if (record.requestKey !== requestKey || record.path !== expectedPath || paths.has(record.path)
          || record[statusKey] !== expectedStatus || !inWindow(record.createTime, record[timeKey])
          || !validUpdate(record.createTime, record.updateTime)) {
        throw new Error("web_evidence:v3_ledger_receipt_binding");
      }
      paths.add(record.path);
    }
    return records.length;
  };
  return { requestObserved: value.request !== null,
    providerLedgerCount: validate(value.providers, "coach_provider_budget_charges", "usageStatus", "settled"),
    turnLedgerCount: validate(value.turns, "coach_user_turn_charges", "chargeStatus", "charged") };
}

export async function readStageProductLedgerReceipts(requestKey, options) {
  if (!HEX_DIGEST.test(requestKey) || !AUTH_TOKEN.test(options?.accessToken ?? "")
      || typeof options?.fetchImpl !== "function") throw new Error("web_evidence:v3_ledger_observer_config");
  const records = { request: null, providers: [], turns: [] };
  for (const [key, collection] of [["request", "coach_requests"], ["turns", "coach_user_turn_charges"],
    ["providers", "coach_provider_budget_charges"]]) {
    await options.assertStageLease?.({ kind: "ledger-http", target: options.targetName, method: "GET",
      path: `${collection}/${requestKey}` });
    const path = `${collection}/${requestKey}`;
    const url = `https://firestore.googleapis.com/v1/projects/orider-dev/databases/(default)/documents/${path}`;
    let response;
    try {
      response = await options.fetchImpl(url, { method: "GET", redirect: "error",
        headers: { authorization: `Bearer ${options.accessToken}` }, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new Error(`web_evidence:v3_ledger_network:${collection}`, { cause: error });
    }
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new Error(`web_evidence:v3_ledger_http:${collection}:${response.status}`);
    }
    let value;
    try {
      value = await readBoundedJsonResponse(response,
        { code: "web_evidence:v3_ledger_response", maxBytes: MAX_AUTH_RESPONSE_BYTES });
    } catch (error) {
      throw new Error(`web_evidence:v3_ledger_response:${collection}:${error.message}`, { cause: error });
    }
    if (value?.name !== `projects/orider-dev/databases/(default)/documents/${path}`
        || value?.fields?.requestKey?.stringValue !== requestKey
        || !Number.isFinite(Date.parse(value.createTime)) || !Number.isFinite(Date.parse(value.updateTime))) {
      throw new Error(`web_evidence:v3_ledger_document_binding:${collection}`);
    }
    const integer = (name) => {
      const parsed = Number(value.fields?.[name]?.integerValue);
      if (!Number.isSafeInteger(parsed)) throw new Error(`web_evidence:v3_ledger_document_binding:${collection}`);
      return parsed;
    };
    if (key === "request") records.request = { path, requestKey,
      requestId: value.fields?.requestId?.stringValue, state: value.fields?.state?.stringValue,
      normalizedQuestionDigest: value.fields?.normalizedQuestionDigest?.stringValue,
      finalizedAtMs: integer("finalizedAtMs"), createTime: value.createTime, updateTime: value.updateTime };
    else if (key === "turns") records.turns.push({ path, requestKey,
      chargeStatus: value.fields?.chargeStatus?.stringValue, chargedAtMs: integer("chargedAtMs"),
      createTime: value.createTime, updateTime: value.updateTime });
    else records.providers.push({ path, requestKey, usageStatus: value.fields?.usageStatus?.stringValue,
      settledAtMs: integer("settledAtMs"), createTime: value.createTime, updateTime: value.updateTime });
  }
  return records;
}

async function assertStageLease(options, operation) {
  if (typeof options.assertStageLease === "function") await options.assertStageLease(operation);
}

async function observeLegacyTarget(request, target, options) {
  const observations = []; const captures = []; let fiveXx = 0;
  for (let ordinal = -1; ordinal < FOUR_AXIS_CASES.length; ordinal += 1) {
    const item = FOUR_AXIS_CASES[Math.max(0, ordinal)];
    const body = { schemaVersion: "ai-coach-four-axis-synthetic-request-v1", correlationId: request.correlationId,
      fixtureDigest: request.fixture.digest, caseId: item.caseId, questionCode: item.questionCode };
    const bodyText = JSON.stringify(body); const requestDigest = prefixedDigest(bodyText); const started = options.clock();
    const response = await options.fetchImpl(target.environment === "production-warm" ? target.url : target.taggedUrl, {
      method: "POST", redirect: "error", headers: { "content-type": "application/json",
        authorization: `Bearer ${options.authorization}`, "x-orider-test-identity": options.testIdentity,
        "x-orider-observation-phase": ordinal < 0 ? "warmup" : "measured" }, body: bodyText,
      signal: AbortSignal.timeout(30_000) });
    const value = await readBoundedJsonResponse(response, { code: "web_evidence:response",
      maxBytes: MAX_HTTP_RESPONSE_BYTES });
    const responseText = JSON.stringify(value); const latencyMs = Math.max(0, Math.round(options.clock() - started));
    captures.push({ url: response.url || (target.environment === "production-warm" ? target.url : target.taggedUrl),
      requestBody: bodyText, responseBody: responseText });
    if (response.status >= 500 && response.status <= 599) fiveXx += 1;
    if (!response.ok) throw new Error(`web_evidence:http_${target.environment}_${response.status}`);
    validateReceipt(value, item, request, target);
    if (value.requestDigest !== requestDigest) throw new Error(`web_evidence:request_receipt:${item.caseId}`);
    const bounded = { caseId: item.caseId, fixtureDigest: value.fixtureDigest, requestDigest,
      httpStatus: response.status, latencyMs, providerCalls: value.providerCalls, quotaConsumed: value.quotaConsumed,
      userDataWrites: value.userDataWrites, card: value.card, response: value.response,
      ...(value.productExecution && { productExecution: value.productExecution }),
      receiptDigest: prefixedEvidenceDigest(value) };
    if (ordinal < 0) options.warmups.push({ environment: target.environment, receiptDigest: bounded.receiptDigest });
    else observations.push(bounded);
  }
  return { observations, captures, fiveXx };
}

async function productFetch(origin, path, options, { method = "GET", body } = {}) {
  if (!path.startsWith("/v1/coach/") || path.includes("#")) throw new Error("web_evidence:v3_product_path");
  if (options.expiresAtMs <= (options.nowMs ?? Date.now())) throw new Error("web_evidence:v3_product_credential_expired");
  const started = options.clock();
  await assertStageLease(options, { kind: "product-http", target: options.targetName, method, path });
  const requestUrl = new URL(path, origin);
  assertProductNetworkPrivacy(requestUrl, body, {}, options);
  const response = await options.fetchImpl(requestUrl, { method, redirect: "error",
    headers: productHeaders(options), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000) });
  const pathname = new URL(path, origin).pathname;
  if (response.status >= 500 && response.status <= 599) options.httpMetrics.fiveXx += 1;
  if (!response.ok) {
    throw new Error(`web_evidence:v3_product_http_${response.status}:${pathname}:five_xx_${options.httpMetrics.fiveXx}`);
  }
  const value = await readBoundedJsonResponse(response, { code: "web_evidence:response",
    maxBytes: MAX_HTTP_RESPONSE_BYTES });
  assertProductNetworkPrivacy(requestUrl, body, value, options);
  const latencyMs = Math.max(0, Math.round(options.clock() - started));
  return { response, value, latencyMs, responseDigest: prefixedEvidenceDigest(value),
    userDataWrites: observedProductUserDataWrites(method, path, response, value),
    capture: { url: `${origin}${pathname}`, requestBody: body === undefined ? "" : prefixedEvidenceDigest(body),
      responseBody: prefixedEvidenceDigest(value) } };
}

const PRODUCT_SCALAR = Symbol("product-scalar");
const productExecutionSchema = { providerCalls: PRODUCT_SCALAR, quotaConsumed: PRODUCT_SCALAR, writes: PRODUCT_SCALAR };
const productEvidenceSchema = { evidenceId: PRODUCT_SCALAR, source: PRODUCT_SCALAR, sourceId: PRODUCT_SCALAR,
  sourceRevision: PRODUCT_SCALAR, field: PRODUCT_SCALAR, value: PRODUCT_SCALAR, asOf: PRODUCT_SCALAR,
  ownerScope: PRODUCT_SCALAR };
const nullableProductSchema = (schema) => (value) => value === null ? PRODUCT_SCALAR : schema;
const productPrescriptionSchema = { schemaVersion: PRODUCT_SCALAR, prescriptionId: PRODUCT_SCALAR,
  factsId: PRODUCT_SCALAR, snapshotRevision: PRODUCT_SCALAR, planRevision: PRODUCT_SCALAR,
  rulesVersion: PRODUCT_SCALAR, validFrom: PRODUCT_SCALAR, validUntil: PRODUCT_SCALAR,
  confidence: PRODUCT_SCALAR, status: PRODUCT_SCALAR, nextDays: [{ localDate: PRODUCT_SCALAR,
    action: PRODUCT_SCALAR, workout: { kind: PRODUCT_SCALAR, durationMin: PRODUCT_SCALAR,
      zone: PRODUCT_SCALAR, targetTss: PRODUCT_SCALAR }, reasonCodes: [PRODUCT_SCALAR],
    evidenceIds: [PRODUCT_SCALAR], reassessBefore: [{ metric: PRODUCT_SCALAR, operator: PRODUCT_SCALAR,
      threshold: { value: PRODUCT_SCALAR, evidenceId: PRODUCT_SCALAR }, maxAgeHours: PRODUCT_SCALAR,
      evidenceIds: [PRODUCT_SCALAR], ruleId: PRODUCT_SCALAR }] }],
  nextWeekLoad: { minTss: PRODUCT_SCALAR, maxTss: PRODUCT_SCALAR, evidenceIds: [PRODUCT_SCALAR] },
  missingSignals: [PRODUCT_SCALAR], requiredSignals: [PRODUCT_SCALAR], checkInToken: PRODUCT_SCALAR,
  evidence: [productEvidenceSchema], providerCalls: PRODUCT_SCALAR, quotaConsumed: PRODUCT_SCALAR };
const productAnswerBlockSchema = (value) => {
  const base = { blockId: PRODUCT_SCALAR, kind: PRODUCT_SCALAR, sourceSlotIds: [PRODUCT_SCALAR],
    partial: PRODUCT_SCALAR, stale: PRODUCT_SCALAR, truncated: PRODUCT_SCALAR, omittedCount: PRODUCT_SCALAR };
  if (value?.kind === "headline") return base;
  if (value?.kind === "grounded_markdown") return { ...base, markdown: PRODUCT_SCALAR,
    evidenceIds: [PRODUCT_SCALAR] };
  if (value?.kind === "prescription") return { ...base, prescription: productPrescriptionSchema };
  throw new Error("web_evidence:v3_product_schema:response.data.answer.blocks.kind");
};
const productAnswerSchema = { schemaVersion: PRODUCT_SCALAR, catalogVersion: PRODUCT_SCALAR,
  answerId: PRODUCT_SCALAR, sourceFactsId: PRODUCT_SCALAR, questionSummary: PRODUCT_SCALAR,
  status: PRODUCT_SCALAR, blocks: [productAnswerBlockSchema], evidence: [productEvidenceSchema],
  warnings: [{ code: PRODUCT_SCALAR, sourceSlotId: PRODUCT_SCALAR, metricId: PRODUCT_SCALAR }],
  freshness: { asOf: PRODUCT_SCALAR, timezone: PRODUCT_SCALAR, staleSourceSlotIds: [PRODUCT_SCALAR] },
  followUps: [{ queryTemplateId: PRODUCT_SCALAR, labelKey: PRODUCT_SCALAR }] };
const ridePlanSchema = { schemaVersion: PRODUCT_SCALAR, status: PRODUCT_SCALAR, contextToken: PRODUCT_SCALAR,
  inputRevision: PRODUCT_SCALAR, questionCode: PRODUCT_SCALAR,
  course: { distanceM: PRODUCT_SCALAR, elevationGainM: PRODUCT_SCALAR },
  estimate: nullableProductSchema({ totalTimeSec: PRODUCT_SCALAR, averageSpeedKph: PRODUCT_SCALAR }),
  segments: [{ index: PRODUCT_SCALAR, startDistanceM: PRODUCT_SCALAR, endDistanceM: PRODUCT_SCALAR,
    averageGradePct: PRODUCT_SCALAR, estimatedSpeedKph: PRODUCT_SCALAR, estimatedTimeSec: PRODUCT_SCALAR }],
  assumptions: { model: PRODUCT_SCALAR, weather: PRODUCT_SCALAR, stops: PRODUCT_SCALAR,
    fueling: PRODUCT_SCALAR, optimalSegmentPower: PRODUCT_SCALAR, riderMassKg: PRODUCT_SCALAR,
    rollingResistance: PRODUCT_SCALAR }, exampleQuestionCodes: [PRODUCT_SCALAR], execution: productExecutionSchema };
const proposalRevisionSchema = { goalId: PRODUCT_SCALAR, goalHash: PRODUCT_SCALAR,
  planRevision: PRODUCT_SCALAR, weeks: [{ weekId: PRODUCT_SCALAR, hash: PRODUCT_SCALAR }] };
const proposalSchema = { schemaVersion: PRODUCT_SCALAR, proposalId: PRODUCT_SCALAR, status: PRODUCT_SCALAR,
  source: { checkInRequestId: PRODUCT_SCALAR, prescriptionId: PRODUCT_SCALAR, factsId: PRODUCT_SCALAR,
    snapshotRevision: PRODUCT_SCALAR, rulesVersion: PRODUCT_SCALAR, weeklyCheckInId: PRODUCT_SCALAR,
    weeklyCheckInRevision: PRODUCT_SCALAR }, targetRevision: proposalRevisionSchema,
  changes: [{ weekId: PRODUCT_SCALAR, dayIndex: PRODUCT_SCALAR, localDate: PRODUCT_SCALAR,
    action: PRODUCT_SCALAR, before: { action: PRODUCT_SCALAR,
      workout: { kind: PRODUCT_SCALAR, durationMin: PRODUCT_SCALAR, targetTss: PRODUCT_SCALAR } },
    workout: { kind: PRODUCT_SCALAR, durationMin: PRODUCT_SCALAR, targetTss: PRODUCT_SCALAR },
    reasonCodes: [PRODUCT_SCALAR], evidenceIds: [PRODUCT_SCALAR] }], evidence: [productEvidenceSchema],
  consent: { policyVersion: PRODUCT_SCALAR, revision: PRODUCT_SCALAR }, createdAt: PRODUCT_SCALAR,
  expiresAt: PRODUCT_SCALAR, providerCalls: PRODUCT_SCALAR, quotaConsumed: PRODUCT_SCALAR };
const PRODUCT_REQUEST_SCHEMAS = new Map([
  ["/v1/coach/ride-plan/token", { courseId: PRODUCT_SCALAR }],
  ["/v1/coach/ride-plan", { courseId: PRODUCT_SCALAR, contextToken: PRODUCT_SCALAR }],
  ["/v1/coach/ride-plan/ai-context", { courseId: PRODUCT_SCALAR, contextToken: PRODUCT_SCALAR,
    questionCode: PRODUCT_SCALAR }],
  ["/v1/coach/respond", { requestId: PRODUCT_SCALAR, question: PRODUCT_SCALAR, discipline: PRODUCT_SCALAR,
    locale: PRODUCT_SCALAR, apiVersion: PRODUCT_SCALAR, schemaVersion: PRODUCT_SCALAR,
    capabilityVersion: PRODUCT_SCALAR, contextFilters: { pmcSnapshotId: PRODUCT_SCALAR,
      riderSnapshotId: PRODUCT_SCALAR, progressPlanner: { prescriptionId: PRODUCT_SCALAR,
        sourceRequestId: PRODUCT_SCALAR }, ridePlan: { contextToken: PRODUCT_SCALAR,
        inputRevision: PRODUCT_SCALAR, questionCode: PRODUCT_SCALAR } },
    responseFormat: PRODUCT_SCALAR, expectedSessionRevision: PRODUCT_SCALAR }],
]);
const PRODUCT_RESPONSE_SCHEMAS = new Map([
  ["/v1/coach/status", { data: { status: PRODUCT_SCALAR } }],
  ["/v1/coach/insights/pmc", { data: { schemaVersion: PRODUCT_SCALAR, status: PRODUCT_SCALAR,
    discipline: PRODUCT_SCALAR, snapshotId: PRODUCT_SCALAR, sourceRevision: PRODUCT_SCALAR, asOf: PRODUCT_SCALAR,
    current: { ctl: PRODUCT_SCALAR, atl: PRODUCT_SCALAR, form: PRODUCT_SCALAR },
    delta7d: { ctl: PRODUCT_SCALAR, atl: PRODUCT_SCALAR, form: PRODUCT_SCALAR },
    freshness: { status: PRODUCT_SCALAR, maxAgeHours: PRODUCT_SCALAR, reasonCodes: [PRODUCT_SCALAR] },
    sourceQuality: { level: PRODUCT_SCALAR, estimatedLoad: PRODUCT_SCALAR, reasonCodes: [PRODUCT_SCALAR] },
    classification: PRODUCT_SCALAR, interpretationCode: PRODUCT_SCALAR,
    exampleQuestionCodes: [PRODUCT_SCALAR], execution: productExecutionSchema } }],
  ["/v1/coach/insights/rider", { data: { schemaVersion: PRODUCT_SCALAR, status: PRODUCT_SCALAR,
    discipline: PRODUCT_SCALAR, snapshotId: PRODUCT_SCALAR, sourceRevision: PRODUCT_SCALAR, asOf: PRODUCT_SCALAR,
    profile: nullableProductSchema({ type: PRODUCT_SCALAR, axisX: PRODUCT_SCALAR, axisY: PRODUCT_SCALAR,
      confidence: PRODUCT_SCALAR }), mmpWatts: { "5s": PRODUCT_SCALAR, "1m": PRODUCT_SCALAR,
      "5m": PRODUCT_SCALAR, "20m": PRODUCT_SCALAR },
    criticalPower: nullableProductSchema({ cpWatts: PRODUCT_SCALAR, wPrimeJoules: PRODUCT_SCALAR,
      r2: PRODUCT_SCALAR }), model: nullableProductSchema({ pmaxWatts: PRODUCT_SCALAR,
      frcJoules: PRODUCT_SCALAR, ftpEstWatts: PRODUCT_SCALAR, cpEstWatts: PRODUCT_SCALAR,
      tteMinutes: PRODUCT_SCALAR }), ability: nullableProductSchema({ overallPercentile: PRODUCT_SCALAR,
      byDuration: [{ duration: PRODUCT_SCALAR, wPerKg: PRODUCT_SCALAR, percentile: PRODUCT_SCALAR }] }),
    activityCount: PRODUCT_SCALAR, weightKgSnapshot: PRODUCT_SCALAR, reasonCodes: [PRODUCT_SCALAR],
    exampleQuestionCodes: [PRODUCT_SCALAR], execution: productExecutionSchema } }],
  ["/v1/coach/change-proposals", { status: PRODUCT_SCALAR, providerCalls: PRODUCT_SCALAR,
    quotaConsumed: PRODUCT_SCALAR, data: { schemaVersion: PRODUCT_SCALAR,
      source: { prescriptionId: PRODUCT_SCALAR, sourceRequestId: PRODUCT_SCALAR },
      recoveryStatus: PRODUCT_SCALAR, reasonCode: PRODUCT_SCALAR,
      proposal: nullableProductSchema(proposalSchema), receipt: nullableProductSchema({ schemaVersion: PRODUCT_SCALAR,
        proposalId: PRODUCT_SCALAR, auditId: PRODUCT_SCALAR, status: PRODUCT_SCALAR,
        appliedAt: PRODUCT_SCALAR, revertedAt: PRODUCT_SCALAR, beforeRevision: proposalRevisionSchema,
        afterRevision: proposalRevisionSchema, providerCalls: PRODUCT_SCALAR, quotaConsumed: PRODUCT_SCALAR }),
      confirmNonce: PRODUCT_SCALAR, rollbackRequestId: PRODUCT_SCALAR,
      providerCalls: PRODUCT_SCALAR, quotaConsumed: PRODUCT_SCALAR } }],
  ["/v1/coach/ride-plan/token", { data: { contextToken: PRODUCT_SCALAR, inputRevision: PRODUCT_SCALAR,
    expiresAt: PRODUCT_SCALAR, secretVersion: PRODUCT_SCALAR, execution: productExecutionSchema } }],
  ["/v1/coach/ride-plan", { data: ridePlanSchema }],
  ["/v1/coach/ride-plan/ai-context", { data: ridePlanSchema }],
  ["/v1/coach/respond", { data: { apiVersion: PRODUCT_SCALAR, capabilityVersion: PRODUCT_SCALAR,
    schemaVersion: PRODUCT_SCALAR, requestId: PRODUCT_SCALAR, outcome: PRODUCT_SCALAR,
    answer: nullableProductSchema(productAnswerSchema), clarification: { clarificationId: PRODUCT_SCALAR,
      promptKey: PRODUCT_SCALAR, options: [{ optionId: PRODUCT_SCALAR, labelKey: PRODUCT_SCALAR }],
      turnToken: PRODUCT_SCALAR, expiresAt: PRODUCT_SCALAR, resolutionMode: PRODUCT_SCALAR,
      consumesQuota: PRODUCT_SCALAR, providerCalls: PRODUCT_SCALAR, reasonCode: PRODUCT_SCALAR },
    unsupported: { reasonCodes: [PRODUCT_SCALAR], missingCapabilities: [{ domain: PRODUCT_SCALAR,
      metricId: PRODUCT_SCALAR, operationId: PRODUCT_SCALAR }], suggestedQueries: [{ queryTemplateId: PRODUCT_SCALAR,
      labelKey: PRODUCT_SCALAR }] }, error: { code: PRODUCT_SCALAR, retryable: PRODUCT_SCALAR,
      fallbackAvailable: PRODUCT_SCALAR }, quota: { limit: PRODUCT_SCALAR, remaining: PRODUCT_SCALAR,
      resetAt: PRODUCT_SCALAR, consumed: PRODUCT_SCALAR }, budget: { blocked: PRODUCT_SCALAR,
      providerCalls: PRODUCT_SCALAR, inputTokens: PRODUCT_SCALAR, outputTokens: PRODUCT_SCALAR },
    retry: { mode: PRODUCT_SCALAR, quotaImpact: PRODUCT_SCALAR, previousTurnConsumed: PRODUCT_SCALAR,
      providerCallAllowed: PRODUCT_SCALAR, retryable: PRODUCT_SCALAR, reasonCode: PRODUCT_SCALAR },
    execution: { parser: PRODUCT_SCALAR, queryPlanHash: PRODUCT_SCALAR, catalogVersion: PRODUCT_SCALAR,
      factsId: PRODUCT_SCALAR, prescriptionId: PRODUCT_SCALAR, prescriptionRulesVersion: PRODUCT_SCALAR,
      asOf: PRODUCT_SCALAR } } }],
]);

function assertProductShape(value, schema, path) {
  if (typeof schema === "function") return assertProductShape(value, schema(value), path);
  if (schema === PRODUCT_SCALAR) {
    if (value !== null && typeof value === "object" || typeof value === "undefined") {
      throw new Error(`web_evidence:v3_product_schema:${path}`);
    }
    return;
  }
  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) throw new Error(`web_evidence:v3_product_schema:${path}`);
    value.forEach((item, index) => assertProductShape(item, schema[0], `${path}.${index}`)); return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`web_evidence:v3_product_schema:${path}`);
  }
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(schema, key)) throw new Error(`web_evidence:v3_product_schema:${path}.${key}`);
    assertProductShape(item, schema[key], `${path}.${key}`);
  }
}

export function assertProductNetworkPrivacy(url, requestBody, responseBody, options = {}) {
  const observedUrl = new URL(url); const progress = options.progressPlanner ?? {}; const pathname = observedUrl.pathname;
  const allowedQuery = pathname === "/v1/coach/change-proposals"
    ? { prescriptionId: progress.prescriptionId, sourceRequestId: progress.sourceRequestId }
    : ["/v1/coach/insights/pmc", "/v1/coach/insights/rider"].includes(pathname) ? { discipline: "bike" } : {};
  if ([...observedUrl.searchParams.keys()].length !== Object.keys(allowedQuery).length
      || Object.entries(allowedQuery).some(([key, expected]) => observedUrl.searchParams.getAll(key).length !== 1
        || observedUrl.searchParams.get(key) !== expected)) {
    throw new Error("web_evidence:v3_product_schema:query");
  }
  observedUrl.search = "";
  const requestSchema = PRODUCT_REQUEST_SCHEMAS.get(pathname);
  if (requestBody !== undefined) {
    if (!requestSchema) throw new Error("web_evidence:v3_product_schema:request");
    assertProductShape(requestBody, requestSchema, "request");
  } else if (requestSchema) throw new Error("web_evidence:v3_product_schema:request");
  const responseSchema = PRODUCT_RESPONSE_SCHEMAS.get(pathname);
  if (!responseSchema) throw new Error("web_evidence:v3_product_schema:response");
  if (responseBody && Object.keys(responseBody).length > 0) assertProductShape(responseBody, responseSchema, "response");
  const approvedField = (direction, path, key, value) => {
    if (direction === "request" && pathname === "/v1/coach/respond" && path === "" && key === "question") {
      return FOUR_AXIS_CASES.some((entry) => entry.question === value);
    }
    if (direction === "request" && ["/v1/coach/ride-plan/token", "/v1/coach/ride-plan",
      "/v1/coach/ride-plan/ai-context"].includes(pathname) && path === "" && key === "courseId") {
      return typeof options.courseId === "string" && value === options.courseId;
    }
    if (direction === "request" && pathname === "/v1/coach/respond"
        && path === "contextFilters.progressPlanner") {
      return key === "prescriptionId" && value === progress.prescriptionId
        || key === "sourceRequestId" && value === progress.sourceRequestId;
    }
    if (direction === "response" && pathname === "/v1/coach/change-proposals" && path === "data.source") {
      return key === "prescriptionId" && value === progress.prescriptionId
        || key === "sourceRequestId" && value === progress.sourceRequestId;
    }
    if (direction === "response" && pathname === "/v1/coach/change-proposals"
        && path === "data.proposal" && key === "proposalId") return value === progress.proposalId;
    if (direction === "response" && pathname === "/v1/coach/change-proposals"
        && path === "data.proposal.source" && key === "prescriptionId") return value === progress.prescriptionId;
    if (direction === "response" && pathname === "/v1/coach/respond"
        && path === "data.execution" && key === "prescriptionId") return value === progress.prescriptionId;
    return direction === "response" && pathname === "/v1/coach/respond"
      && /^data\.answer\.blocks\.\d+\.prescription$/u.test(path) && key === "prescriptionId"
      && value === progress.prescriptionId;
  };
  const inspectAndRedact = (value, direction, path = "") => {
    if (typeof value === "string" && RAW_PRIVATE_VALUE.test(value)) throw new Error("web_evidence:v3_product_privacy");
    if (Array.isArray(value)) return value.map((item, index) => inspectAndRedact(item, direction,
      path ? `${path}.${index}` : String(index)));
    if (!value || typeof value !== "object") return value;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (approvedField(direction, path, key, item)) continue;
      result[key] = inspectAndRedact(item, direction, path ? `${path}.${key}` : key);
    }
    return result;
  };
  const scan = privacyScan({ networkUrls: observedUrl.toString(),
    networkBodies: [JSON.stringify(inspectAndRedact(requestBody, "request")),
      JSON.stringify(inspectAndRedact(responseBody, "response"))] });
  if (scan.matches.networkUrls !== 0 || scan.matches.networkBodies !== 0) {
    throw new Error("web_evidence:v3_product_privacy");
  }
}

function deterministicUuid(seed) {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function firebaseFixtureRequestKey(idToken, correlationId, requestId) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("web_evidence:v3_firebase_id_token_shape");
  let payload; try { payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); }
  catch { throw new Error("web_evidence:v3_firebase_id_token_payload"); }
  const expectedUid = `coach-evidence-${createHash("sha256").update(correlationId).digest("hex").slice(0, 32)}`;
  if (!payload || Object.keys(payload).includes("uid") || payload.sub !== expectedUid) {
    throw new Error("web_evidence:v3_firebase_subject_binding");
  }
  return createHash("sha256").update(`${payload.sub}\0${requestId}`).digest("hex");
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function primitive(value) {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || typeof value === "number" && Number.isFinite(value);
}

function normalizedClaims(claims) {
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > 500
      || claims.some((claim) => !record(claim) || typeof claim.field !== "string" || claim.field.length < 1
        || claim.field.length > 128 || !primitive(claim.value))) {
    throw new Error("web_evidence:v3_parity_claims");
  }
  return claims.map(({ field, value }) => ({ field, value })).sort((left, right) =>
    `${left.field}\0${JSON.stringify(left.value)}`.localeCompare(`${right.field}\0${JSON.stringify(right.value)}`));
}

function riderCardClaims(data) {
  const claims = [];
  const add = (field, value) => { if (value !== null && value !== undefined) claims.push({ field, value }); };
  add("rider_type", data.profile?.type); add("axis_x", data.profile?.axisX);
  add("axis_y", data.profile?.axisY); add("confidence", data.profile?.confidence);
  for (const duration of ["5s", "1m", "5m", "20m"]) add(`mmp_${duration}`, data.mmpWatts?.[duration]);
  add("cp_watts", data.criticalPower?.cpWatts); add("w_prime_joules", data.criticalPower?.wPrimeJoules);
  add("cp_r2", data.criticalPower?.r2); add("model_pmax", data.model?.pmaxWatts);
  add("model_frc", data.model?.frcJoules); add("model_ftp", data.model?.ftpEstWatts);
  add("model_cp", data.model?.cpEstWatts); add("model_tte", data.model?.tteMinutes);
  add("ability_overall", data.ability?.overallPercentile);
  for (const row of data.ability?.byDuration ?? []) {
    add(`ability_${row?.duration}_wkg`, row?.wPerKg);
    add(`ability_${row?.duration}_percentile`, row?.percentile);
  }
  return claims;
}

function rideCardClaims(data, questionCode) {
  if (!record(data.course) || !record(data.estimate) || !Array.isArray(data.segments)
      || data.segments.length < 1 || !record(data.assumptions)) throw new Error("web_evidence:v3_ride_card_claims");
  const summary = [{ field: "distance_m", value: data.course.distanceM },
    { field: "elevation_gain_m", value: data.course.elevationGainM },
    { field: "total_time_sec", value: data.estimate.totalTimeSec },
    { field: "average_speed_kph", value: data.estimate.averageSpeedKph }];
  const segments = data.segments.map((segment) => [{ field: `segment_${segment.index}_start_m`, value: segment.startDistanceM },
    { field: `segment_${segment.index}_end_m`, value: segment.endDistanceM },
    { field: `segment_${segment.index}_grade_pct`, value: segment.averageGradePct },
    { field: `segment_${segment.index}_speed_kph`, value: segment.estimatedSpeedKph },
    { field: `segment_${segment.index}_time_sec`, value: segment.estimatedTimeSec }]);
  const hardest = [...data.segments].sort((left, right) => right.averageGradePct - left.averageGradePct
    || right.estimatedTimeSec - left.estimatedTimeSec || left.index - right.index)[0];
  const selected = questionCode === "HARDEST_SECTION"
    ? [segments[data.segments.indexOf(hardest)]]
    : segments;
  return [...summary, ...selected.flat(), { field: "assumptions", value: JSON.stringify(canonical(data.assumptions)) }];
}

function cardClaims(item, prepared) {
  const data = prepared.card?.value?.data;
  if (!record(data)) throw new Error(`web_evidence:v3_card_contract:${item.caseId}`);
  if (item.source === "pmc") return ["ctl", "atl", "form"].flatMap((field) => [
    { field, value: data.current?.[field] }, { field, value: data.delta7d?.[field] }]);
  if (item.source === "rider") return riderCardClaims(data);
  if (item.source === "progress") {
    const evidence = data.proposal?.evidence;
    const locator = prepared.progressLocator;
    if (!Array.isArray(evidence) || !record(locator)
        || evidence.some((record) => record?.sourceId !== locator.proposalId
          || record?.sourceRevision !== locator.fixtureDigest)) {
      throw new Error("web_evidence:v3_progress_card_evidence");
    }
    return evidence.map((item) => ({ field: item?.field, value: item?.value }));
  }
  return rideCardClaims(data, item.questionCode);
}

function referencedAnswerEvidence(answer) {
  if (!record(answer) || !Array.isArray(answer.blocks) || !Array.isArray(answer.evidence)) {
    throw new Error("web_evidence:v3_answer_evidence_contract");
  }
  const ids = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!record(value)) return;
    for (const [key, nested] of Object.entries(value)) {
      if (key === "evidenceIds" && Array.isArray(nested)) nested.forEach((id) => typeof id === "string" && ids.add(id));
      else visit(nested);
    }
  };
  visit(answer.blocks);
  const byId = new Map(answer.evidence.map((item) => [item?.evidenceId, item]));
  if (ids.size < 1 || byId.size !== answer.evidence.length || [...ids].some((id) => !byId.has(id))) {
    throw new Error("web_evidence:v3_answer_evidence_binding");
  }
  return [...ids].map((id) => byId.get(id));
}

function responseClaims(item, envelope, prepared) {
  if (item.source === "progress") {
    const blocks = envelope.answer?.blocks?.filter((block) => block?.kind === "prescription") ?? [];
    const prescription = blocks[0]?.prescription;
    if (blocks.length !== 1 || prescription?.prescriptionId !== prepared.contextFilters.progressPlanner.prescriptionId
        || !Array.isArray(prescription.evidence)
        || prescription.evidence.some((record) => record?.sourceId !== prepared.progressLocator.proposalId
          || record?.sourceRevision !== prepared.progressLocator.fixtureDigest)) {
      throw new Error("web_evidence:v3_progress_answer_binding");
    }
    return { claims: prescription.evidence.map((record) => ({ field: record?.field, value: record?.value })),
      provenance: prepared.sourceBinding };
  }
  let evidence = referencedAnswerEvidence(envelope.answer);
  if (item.source === "rider") evidence = evidence.filter((record) => record?.source === "rider_insight"
    && record?.sourceId === prepared.card.value.data.snapshotId
    && record?.sourceRevision === prepared.card.value.data.sourceRevision);
  if (item.source === "ride") evidence = evidence.filter((record) => record?.sourceId === "ride_plan_projection"
    && record?.sourceRevision === prepared.card.value.data.inputRevision);
  if (item.source === "pmc") {
    evidence = evidence.filter((record) => ["ctl", "atl", "form"].includes(record?.field));
    const sourceRevision = prepared.card.value.data.sourceRevision;
    if (evidence.some((record) => record?.source !== "fitness" || record?.sourceId !== "pmc"
      || record?.sourceRevision !== sourceRevision)) throw new Error("web_evidence:v3_pmc_answer_provenance");
    return { claims: evidence.map((record) => ({ field: record?.field, value: record?.value })),
      provenance: { source: "fitness", sourceId: "pmc", sourceRevision } };
  }
  return { claims: evidence.map((record) => ({ field: record?.field, value: record?.value })),
    provenance: prepared.sourceBinding };
}

function parityProjections(item, envelope, prepared) {
  const expected = normalizedClaims(cardClaims(item, prepared));
  const response = responseClaims(item, envelope, prepared);
  const actual = normalizedClaims(response.claims);
  const remaining = [...expected];
  for (const claim of actual) {
    const index = remaining.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(claim));
    if (index < 0) throw new Error(`web_evidence:v3_card_ai_claim_drift:${item.caseId}`);
    remaining.splice(index, 1);
  }
  const fields = new Set(actual.map((claim) => claim.field));
  const mandatory = item.source === "pmc" ? (item.questionCode === "CHANGE" ? ["ctl"] : ["atl", "form"])
    : item.source === "rider" ? (item.questionCode === "PROFILE"
      ? ["rider_type", "axis_x", "axis_y", "confidence"] : [])
      : [];
  if (mandatory.some((field) => !fields.has(field))
      || item.source === "rider" && item.questionCode === "DURATION_PRIORITY"
        && !actual.some((claim) => /^(?:ability|mmp)_/u.test(claim.field))
      || item.source === "ride" && actual.length !== expected.length
      || item.source === "progress" && actual.length < expected.length) {
    throw new Error(`web_evidence:v3_card_ai_claim_incomplete:${item.caseId}`);
  }
  const cardProvenance = item.source === "pmc" ? { source: "fitness", sourceId: "pmc",
    sourceRevision: prepared.card.value.data.sourceRevision } : prepared.sourceBinding;
  const projection = (claims, provenance) => ({ sourceRevisionDigest: prefixedEvidenceDigest(provenance),
    projectionDigest: prefixedEvidenceDigest(claims),
    evidenceDigest: prefixedEvidenceDigest(claims.map((claim) => claim.field)),
    sharedFactsDigest: prefixedEvidenceDigest({ provenance, claims }) });
  return { card: projection(actual.map((claim) => expected.find((candidate) =>
    JSON.stringify(candidate) === JSON.stringify(claim))), cardProvenance),
  response: projection(actual, response.provenance) };
}

async function prepareCard(origin, request, item, options) {
  if (item.source === "track0") return { card: null, contextFilters: {}, captures: [], latencyMs: 0 };
  if (item.source === "pmc") {
    const result = await productFetch(origin, "/v1/coach/insights/pmc?discipline=bike", options);
    const snapshotId = result.value?.data?.snapshotId;
    if (typeof snapshotId !== "string") throw new Error("web_evidence:v3_pmc_snapshot");
    return { card: result, contextFilters: { pmcSnapshotId: snapshotId }, sourceBinding: snapshotId };
  }
  if (item.source === "rider") {
    const result = await productFetch(origin, "/v1/coach/insights/rider?discipline=bike", options);
    const snapshotId = result.value?.data?.snapshotId;
    if (typeof snapshotId !== "string") throw new Error("web_evidence:v3_rider_snapshot");
    return { card: result, contextFilters: { riderSnapshotId: snapshotId }, sourceBinding: snapshotId };
  }
  if (item.source === "progress") {
    const locator = options.progressPlanner;
    if (!locator || typeof locator.prescriptionId !== "string" || typeof locator.sourceRequestId !== "string") {
      throw new Error("web_evidence:v3_progress_locator");
    }
    const context = { prescriptionId: locator.prescriptionId, sourceRequestId: locator.sourceRequestId };
    const query = new URLSearchParams(context).toString();
    const result = await productFetch(origin, `/v1/coach/change-proposals?${query}`, options);
    if (result.value?.status !== "ok" || result.value?.data?.source?.prescriptionId !== locator.prescriptionId
        || result.value?.data?.source?.sourceRequestId !== locator.sourceRequestId
        || result.value?.data?.proposal?.proposalId !== locator.proposalId) {
      throw new Error("web_evidence:v3_progress_card_binding");
    }
    return { card: result, contextFilters: { progressPlanner: context }, progressLocator: locator,
      sourceBinding: locator };
  }
  const token = await productFetch(origin, "/v1/coach/ride-plan/token", options,
    { method: "POST", body: { courseId: options.courseId } });
  const contextToken = token.value?.data?.contextToken;
  if (typeof contextToken !== "string") throw new Error("web_evidence:v3_ride_token");
  const card = await productFetch(origin, "/v1/coach/ride-plan", options,
    { method: "POST", body: { courseId: options.courseId, contextToken } });
  const inputRevision = card.value?.data?.inputRevision;
  if (typeof inputRevision !== "string") throw new Error("web_evidence:v3_ride_revision");
  const ai = await productFetch(origin, "/v1/coach/ride-plan/ai-context", options,
    { method: "POST", body: { courseId: options.courseId, contextToken, questionCode: item.questionCode } });
  if (ai.value?.data?.inputRevision !== inputRevision || ai.value?.data?.questionCode !== item.questionCode) {
    throw new Error("web_evidence:v3_ride_ai_binding");
  }
  const cardClaimsDigest = prefixedEvidenceDigest(normalizedClaims(rideCardClaims(card.value.data, item.questionCode)));
  const aiClaimsDigest = prefixedEvidenceDigest(normalizedClaims(rideCardClaims(ai.value.data, item.questionCode)));
  if (cardClaimsDigest !== aiClaimsDigest) throw new Error("web_evidence:v3_ride_ai_claim_drift");
  return { card, contextFilters: { ridePlan: { contextToken, inputRevision, questionCode: item.questionCode } },
    sourceBinding: inputRevision, extraCaptures: [token.capture, ai.capture], extraLatencyMs: token.latencyMs + ai.latencyMs,
    extraUserDataWrites: token.userDataWrites + ai.userDataWrites };
}

async function observeTarget(request, target, options) {
  const origin = new URL(target.taggedUrl).origin; const observations = []; const captures = [];
  const httpMetrics = { fiveXx: 0 }; const productOptions = { ...options, httpMetrics };
  const warmup = await productFetch(origin, "/v1/coach/status", productOptions);
  if (warmup.value?.data?.status !== "available") {
    throw new Error("web_evidence:v3_status_warmup");
  }
  options.warmups.push({ environment: target.environment, path: "/v1/coach/status",
    httpStatus: warmup.response.status, providerCalls: 0, quotaConsumed: 0, userDataWrites: 0,
    receiptDigest: prefixedEvidenceDigest({ path: "/v1/coach/status", status: warmup.response.status,
      responseDigest: warmup.responseDigest, providerCalls: 0, quotaConsumed: 0, userDataWrites: 0 }) });
  captures.push(warmup.capture);
  for (const item of FOUR_AXIS_CASES) {
    const prepared = await prepareCard(origin, request, item, productOptions);
    const requestId = deterministicUuid(`${request.correlationId}\0${target.tag}\0${item.caseId}`);
    const body = { requestId, question: item.question, discipline: "bike", locale: "ko-KR", apiVersion: "v2",
      schemaVersion: "coach-respond-v2", capabilityVersion: "p1", contextFilters: prepared.contextFilters,
      responseFormat: "auto" };
    const requestDigest = prefixedEvidenceDigest({ caseId: item.caseId, questionCode: item.questionCode,
      question: item.question });
    const requestKey = firebaseFixtureRequestKey(options.authorization, request.correlationId, requestId);
    const ledgerExpiresAtMs = Date.parse(request.expiresAt);
    const ledgerProvenance = { requestId,
      questionDigest: createHash("sha256").update(item.question.normalize("NFKC").replace(/\s+/gu, " ").trim()).digest("hex"),
      notBeforeMs: ledgerExpiresAtMs - MAX_LEDGER_PROVENANCE_AGE_MS, expiresAtMs: ledgerExpiresAtMs };
    if (typeof options.ledgerReceiptsFor !== "function") throw new Error("web_evidence:v3_ledger_observer");
    const priorReceipt = await options.ledgerReceiptsFor(requestKey, item, target,
      { phase: "before", provenance: ledgerProvenance });
    const priorLedgers = validateProductLedgerReceipts(priorReceipt, requestKey, ledgerProvenance);
    if (priorLedgers.requestObserved || priorLedgers.providerLedgerCount !== 0 || priorLedgers.turnLedgerCount !== 0) {
      throw new Error(`web_evidence:v3_ledger_preexisting:${item.caseId}`);
    }
    const question = await productFetch(origin, "/v1/coach/respond", productOptions, { method: "POST", body });
    const envelope = question.value?.data;
    if (!envelope || envelope.requestId !== requestId || envelope.outcome !== "answer"
        || envelope.budget?.providerCalls !== item.providerCalls
        || envelope.quota?.consumed !== Boolean(item.quotaConsumed)) {
      throw new Error(`web_evidence:v3_question_contract:${item.caseId}`);
    }
    const providerCallsObserved = envelope.budget.providerCalls;
    const ledgerReceipt = await options.ledgerReceiptsFor(requestKey, item, target,
      { phase: "after", provenance: ledgerProvenance });
    const { requestObserved, providerLedgerCount, turnLedgerCount } = validateProductLedgerReceipts(
      ledgerReceipt, requestKey, ledgerProvenance);
    if (!requestObserved) {
      throw new Error(`web_evidence:v3_ledger_request_missing:${item.caseId}`);
    }
    if (providerLedgerCount !== Number(item.providerCalls > 0) || turnLedgerCount !== item.quotaConsumed) {
      throw new Error(`web_evidence:v3_ledger_count:${item.caseId}`);
    }
    const userDataWrites = question.userDataWrites + (prepared.card?.userDataWrites ?? 0)
      + (prepared.extraUserDataWrites ?? 0);
    const product = { questionPath: "/v1/coach/respond", cardPath: PRODUCT_CARD_PATHS.get(item.caseId),
      requestKey,
      questionStatus: question.response.status, cardStatus: prepared.card?.response.status ?? null,
      providerCallsObserved, providerLedgerCount, turnLedgerCount, userDataWrites,
      questionResponseDigest: question.responseDigest,
      cardResponseDigest: prepared.card?.responseDigest ?? null };
    const parity = prepared.card ? parityProjections(item, envelope, prepared) : null;
    const projection = prepared.card
      ? parity.response
      : { sourceRevisionDigest: prefixedEvidenceDigest(envelope.execution ?? {}),
        projectionDigest: prefixedEvidenceDigest(envelope.answer), evidenceDigest: prefixedEvidenceDigest(envelope.answer),
        sharedFactsDigest: prefixedEvidenceDigest(envelope.execution ?? {}) };
    const card = prepared.card ? { ...parity.card, providerCalls: 0, quotaConsumed: 0, userDataWrites: 0 } : null;
    const bounded = { caseId: item.caseId, fixtureDigest: request.fixture.digest, requestDigest,
      httpStatus: question.response.status,
      latencyMs: question.latencyMs + (prepared.card?.latencyMs ?? 0) + (prepared.extraLatencyMs ?? 0),
      providerCalls: providerCallsObserved, quotaConsumed: turnLedgerCount, userDataWrites,
      card, response: projection, productExecution: product };
    bounded.receiptDigest = prefixedEvidenceDigest({ schemaVersion: "ai-coach-four-axis-http-receipt-v1",
      correlationDigest: prefixedDigest(request.correlationId), caseId: bounded.caseId,
      fixtureDigest: bounded.fixtureDigest, requestDigest: bounded.requestDigest,
      targetFingerprint: target.targetFingerprint, outcome: "answer", providerCalls: bounded.providerCalls,
      quotaConsumed: bounded.quotaConsumed, userDataWrites: bounded.userDataWrites,
      card: bounded.card, response: bounded.response, productExecution: bounded.productExecution });
    observations.push(bounded); captures.push(...(prepared.extraCaptures ?? []), ...(prepared.card ? [prepared.card.capture] : []),
      question.capture);
  }
  return { observations, captures, fiveXx: httpMetrics.fiveXx };
}

async function attestStageTarget(request, target, options) {
  const origin = new URL(target.taggedUrl).origin;
  const identityToken = verifiedSecret(await options.identityTokenFor(origin), "web_evidence:v3_oidc_token");
  options.maskSecret?.(identityToken);
  const localActor = request.identity?.localActor ?? request.orchestrator?.actor;
  const body = { schemaVersion: "ai-coach-four-axis-attestation-v1", correlationId: request.correlationId,
    stageRunId: target.stageRunId, revision: target.revision, imageDigest: target.imageDigest,
    requestDigest: options.requestSha256, orchestratorActor: localActor, providerPhase: "enabled" };
  await assertStageLease(options, { kind: "attestation-http", target: target.tag, method: "POST",
    path: "/v1/evidence/four-axis/attestation" });
  const response = await options.fetchImpl(new URL("/v1/evidence/four-axis/attestation", origin), {
    method: "POST", redirect: "error", headers: { "content-type": "application/json",
      authorization: `Bearer ${identityToken}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  const value = await readBoundedJsonResponse(response, { code: "web_evidence:v3_attestation" });
  exactKeys(value, ["schemaVersion", "correlationId", "stageRunId", "revision", "imageDigest",
    "evidenceLeaseDigest", "orchestratorActor", "expiresAt", "firebaseCustomToken", "appCheckToken", "courseId",
    "progress"],
    "web_evidence:v3_attestation_keys");
  const expiry = Date.parse(value.expiresAt); const now = options.nowMs ?? Date.now();
  if (!response.ok || value.schemaVersion !== "ai-coach-four-axis-attestation-response-v3"
      || value.correlationId !== request.correlationId || value.stageRunId !== target.stageRunId
      || value.revision !== target.revision || value.imageDigest !== target.imageDigest
      || value.orchestratorActor !== localActor || !DIGEST.test(value.evidenceLeaseDigest)
      || typeof value.courseId !== "string" || !/^course-evidence-[a-f0-9]{32}$/u.test(value.courseId)
      || !Number.isFinite(expiry) || expiry - now < 10 * 60_000 || expiry > Date.parse(request.expiresAt)) {
    throw new Error("web_evidence:v3_attestation_binding");
  }
  exactKeys(value.progress, ["prescriptionId", "sourceRequestId", "proposalId", "fixtureDigest"],
    "web_evidence:v3_progress_keys");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
  if (!/^rx_[a-f0-9]{24}$/u.test(value.progress.prescriptionId ?? "")
      || !uuid.test(value.progress.sourceRequestId ?? "")
      || !/^proposal_[a-f0-9]{24}$/u.test(value.progress.proposalId ?? "")
      || !DIGEST.test(value.progress.fixtureDigest ?? "")
      || new Set(Object.values(value.progress)).size !== 4) {
    throw new Error("web_evidence:v3_progress_binding");
  }
  const firebaseCustomToken = verifiedSecret(value.firebaseCustomToken, "web_evidence:v3_firebase_custom_token");
  const appCheckToken = verifiedSecret(value.appCheckToken, "web_evidence:v3_app_check_token");
  options.maskSecret?.(firebaseCustomToken); options.maskSecret?.(appCheckToken);
  return { firebaseCustomToken, appCheckToken, leaseCredential: value.evidenceLeaseDigest,
    evidenceCorrelationId: value.correlationId, orchestratorActor: value.orchestratorActor,
    courseId: value.courseId, progressPlanner: value.progress, expiresAtMs: expiry };
}

async function exchangeFirebaseCustomToken(authentication, options) {
  if (!FIREBASE_WEB_API_KEY.test(options.firebaseWebApiKey ?? "")) throw new Error("web_evidence:v3_firebase_api_key");
  const url = new URL("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken");
  url.searchParams.set("key", options.firebaseWebApiKey);
  await assertStageLease(options, { kind: "firebase-auth", target: options.targetName, method: "POST",
    path: "/v1/accounts:signInWithCustomToken" });
  const response = await options.fetchImpl(url, { method: "POST", redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: authentication.firebaseCustomToken, returnSecureToken: true }),
    signal: AbortSignal.timeout(30_000) });
  const value = await readBoundedJsonResponse(response, { code: "web_evidence:v3_firebase_exchange" });
  exactKeys(value, ["kind", "idToken", "refreshToken", "expiresIn", "isNewUser"],
    "web_evidence:v3_firebase_exchange_keys");
  const expiresIn = Number(value.expiresIn); const now = options.nowMs ?? Date.now();
  if (!response.ok || value.kind !== "identitytoolkit#VerifyCustomTokenResponse"
      || typeof value.isNewUser !== "boolean" || !/^\d{1,5}$/u.test(String(value.expiresIn))
      || expiresIn < 60 || expiresIn > 3600 || authentication.expiresAtMs <= now) {
    throw new Error("web_evidence:v3_firebase_exchange_binding");
  }
  const idToken = verifiedSecret(value.idToken, "web_evidence:v3_firebase_id_token");
  const refreshToken = verifiedSecret(value.refreshToken, "web_evidence:v3_firebase_refresh_token");
  options.maskSecret?.(idToken); options.maskSecret?.(refreshToken);
  return { authorization: idToken, appCheckToken: authentication.appCheckToken,
    leaseCredential: authentication.leaseCredential, evidenceCorrelationId: authentication.evidenceCorrelationId,
    orchestratorActor: authentication.orchestratorActor, courseId: authentication.courseId,
    progressPlanner: authentication.progressPlanner, expiresAtMs: authentication.expiresAtMs };
}

export async function collectStageBaselineComparison(request, options) {
  if (typeof options.identityTokenFor !== "function" || !DIGEST.test(options.requestSha256 ?? "")
      || !FIREBASE_WEB_API_KEY.test(options.firebaseWebApiKey ?? "")) {
    throw new Error("web_evidence:v3_http_identity");
  }
  const warmups = [];
  const baselineAttestation = await attestStageTarget(request, request.targets.baseline, options);
  const candidateAttestation = await attestStageTarget(request, request.targets.candidate, options);
  for (const key of ["prescriptionId", "sourceRequestId", "proposalId", "fixtureDigest"]) {
    if (baselineAttestation.progressPlanner[key] === candidateAttestation.progressPlanner[key]) {
      throw new Error("web_evidence:v3_progress_target_reuse");
    }
  }
  const baselineAuth = await exchangeFirebaseCustomToken(baselineAttestation, { ...options, targetName: "baseline" });
  const baseline = await observeTarget(request, request.targets.baseline,
    { ...options, ...baselineAuth, targetName: "baseline", warmups });
  const candidateAuth = await exchangeFirebaseCustomToken(candidateAttestation, { ...options, targetName: "candidate" });
  const candidate = await observeTarget(request, request.targets.candidate,
    { ...options, ...candidateAuth, targetName: "candidate", warmups });
  const baselineP95Ms = p95(baseline.observations.map((item) => item.latencyMs));
  const candidateP95Ms = p95(candidate.observations.map((item) => item.latencyMs));
  for (let index = 0; index < FOUR_AXIS_CASES.length; index += 1) {
    if (baseline.observations[index].requestDigest !== candidate.observations[index].requestDigest
        || baseline.observations[index].fixtureDigest !== candidate.observations[index].fixtureDigest) {
      throw new Error("web_evidence:v3_cross_target_request_drift");
    }
  }
  const requestKeys = [...baseline.observations, ...candidate.observations]
    .map((item) => item.productExecution.requestKey);
  if (new Set(requestKeys).size !== requestKeys.length) throw new Error("web_evidence:v3_product_request_key_reuse");
  if (baseline.fiveXx !== 0 || candidate.fiveXx !== 0 || candidateP95Ms > baselineP95Ms * 1.2) {
    throw new Error("web_evidence:v3_live_gate");
  }
  return { evidence: { warmups, baseline: baseline.observations, candidate: candidate.observations,
    metrics: { baselineP95Ms, candidateP95Ms, baselineFiveXx: baseline.fiveXx,
      candidateFiveXx: candidate.fiveXx, measuredTurnsPerTarget: FOUR_AXIS_CASES.length } },
  evidenceLeaseDigests: { baseline: baselineAttestation.leaseCredential,
    candidate: candidateAttestation.leaseCredential },
  captures: [...baseline.captures, ...candidate.captures] };
}

export async function collectLiveComparison(request, options) {
  if (!options.authorization || !options.testIdentity) throw new Error("web_evidence:http_identity");
  const warmups = [];
  const production = await observeLegacyTarget(request, request.targets.production, { ...options, warmups });
  const candidate = await observeLegacyTarget(request, request.targets.candidate, { ...options, warmups });
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

function validateObservationSet(observations, target, correlationId, targetFingerprintValue, directProduct = false) {
  if (!Array.isArray(observations) || observations.length !== FOUR_AXIS_CASES.length) throw new Error(`web_evidence:${target}_count`);
  observations.forEach((observation, index) => {
    const item = FOUR_AXIS_CASES[index];
    const hasProductExecution = observation?.productExecution !== undefined;
    exactKeys(observation, ["caseId", "fixtureDigest", "requestDigest", "httpStatus", "latencyMs", "providerCalls",
      "quotaConsumed", "userDataWrites", "card", "response", ...(hasProductExecution ? ["productExecution"] : []),
      "receiptDigest"],
    `web_evidence:${target}_observation_keys`);
    const requestBody = directProduct
      ? { caseId: item.caseId, questionCode: item.questionCode, question: item.question }
      : { schemaVersion: "ai-coach-four-axis-synthetic-request-v1", correlationId,
        fixtureDigest: prefixedEvidenceDigest(FOUR_AXIS_LEGACY_TURNS), caseId: item.caseId,
        questionCode: item.questionCode };
    const expectedRequestDigest = directProduct
      ? prefixedEvidenceDigest(requestBody) : prefixedDigest(JSON.stringify(requestBody));
    if (observation.caseId !== item.caseId || observation.httpStatus !== 200 || observation.providerCalls !== item.providerCalls
        || observation.quotaConsumed !== item.quotaConsumed || observation.userDataWrites !== 0
        || !Number.isSafeInteger(observation.latencyMs) || observation.latencyMs < 0
        || observation.fixtureDigest !== prefixedEvidenceDigest(directProduct
          ? FOUR_AXIS_DISPATCH_TURNS : FOUR_AXIS_LEGACY_TURNS)
        || observation.requestDigest !== expectedRequestDigest
        || !DIGEST.test(observation.receiptDigest)) throw new Error(`web_evidence:${target}_observation`);
    exactKeys(observation.response, PROJECTION_KEYS, `web_evidence:${target}_response`);
    if (Object.values(observation.response).some((digest) => !DIGEST.test(digest))) {
      throw new Error(`web_evidence:${target}_response_digest`);
    }
    if (item.card) {
      exactKeys(observation.card, [...PROJECTION_KEYS, "providerCalls", "quotaConsumed", "userDataWrites"],
        `web_evidence:${target}_card`);
      if (observation.card.providerCalls !== 0 || observation.card.quotaConsumed !== 0 || observation.card.userDataWrites !== 0
          || PROJECTION_KEYS.some((key) => observation.card[key] !== observation.response[key])) {
        throw new Error(`web_evidence:${target}_parity`);
      }
    } else if (observation.card !== null) throw new Error(`web_evidence:${target}_card_absence`);
    if (hasProductExecution) validateProductExecution(observation.productExecution, item);
    const receipt = { schemaVersion: "ai-coach-four-axis-http-receipt-v1",
      correlationDigest: prefixedDigest(correlationId), caseId: observation.caseId,
      fixtureDigest: observation.fixtureDigest, requestDigest: observation.requestDigest,
      targetFingerprint: targetFingerprintValue, outcome: "answer", providerCalls: observation.providerCalls,
      quotaConsumed: observation.quotaConsumed, userDataWrites: observation.userDataWrites,
      card: observation.card, response: observation.response,
      ...(hasProductExecution && { productExecution: observation.productExecution }) };
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
  exactKeys(value.dispatch.workflow, ["repository", "runId", "runAttempt", "event",
    ...(expected.workflowActor ? ["actor"] : [])], "web_evidence:workflow_keys");
  if (value.dispatch.workflow.repository !== "miranae/orider-web" || value.dispatch.workflow.event !== "workflow_dispatch"
      || value.dispatch.workflow.runId !== expected.workflowRunId
      || value.dispatch.workflow.runAttempt !== expected.workflowRunAttempt
      || expected.workflowActor && value.dispatch.workflow.actor !== expected.workflowActor) {
    throw new Error("web_evidence:workflow_binding");
  }
  if (JSON.stringify(value.dispatch.orchestrator) !== JSON.stringify(expected.orchestrator)
      || JSON.stringify(value.dispatch.consumer) !== JSON.stringify({ repository: "miranae/orider-web", sha: expected.sha })) {
    throw new Error("web_evidence:request_provenance");
  }
  validateWebEvidenceSubstance(value, expected);
  return value;
}

function validateWebEvidenceSubstance(value, expected) {
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
  const directProduct = value.targets.production.environment === "tagged-stage-baseline";
  const warmupEnvironments = directProduct
    ? ["tagged-stage-baseline", "tagged-stage-candidate"] : ["production-warm", "tagged-stage"];
  if (!Array.isArray(value.liveComparison.warmups) || value.liveComparison.warmups.length !== 2
      || value.liveComparison.warmups.some((item) => {
        exactKeys(item, directProduct
          ? ["environment", "path", "httpStatus", "providerCalls", "quotaConsumed", "userDataWrites", "receiptDigest"]
          : ["environment", "receiptDigest"], "web_evidence:warmup_keys");
        return !DIGEST.test(item.receiptDigest) || directProduct && (item.providerCalls !== 0
          || item.quotaConsumed !== 0 || item.userDataWrites !== 0 || item.path !== "/v1/coach/status"
          || item.httpStatus !== 200);
      })
      || value.liveComparison.warmups[0].environment !== warmupEnvironments[0]
      || value.liveComparison.warmups[1].environment !== warmupEnvironments[1]) {
    throw new Error("web_evidence:warmup");
  }
  validateObservationSet(value.liveComparison.production, "production", expected.correlationId,
    expected.targets.production.targetFingerprint, directProduct);
  validateObservationSet(value.liveComparison.candidate, "candidate", expected.correlationId,
    expected.targets.candidate.targetFingerprint, directProduct);
  if (!directProduct && (value.liveComparison.warmups[0].receiptDigest !== value.liveComparison.production[0].receiptDigest
      || value.liveComparison.warmups[1].receiptDigest !== value.liveComparison.candidate[0].receiptDigest)) {
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

export function validateWebStageBaselineEvidenceArtifact(value, expected) {
  if (value?.schemaVersion !== "ai-coach-four-axis-web-stage-baseline-evidence-v3"
      || value?.targets?.production !== undefined || !value?.targets?.baseline
      || value.targets.baseline.environment !== "tagged-stage-baseline"
      || value.targets.candidate?.environment !== "tagged-stage-candidate") {
    throw new Error("web_evidence:v3_artifact_contract");
  }
  exactKeys(value.targets.baseline, ["environment", "targetFingerprint", "tag", "revision", "imageDigest",
    "stageRunId", "productionAuditDigest"], "web_evidence:v3_artifact_baseline");
  exactKeys(value.targets.candidate, ["environment", "targetFingerprint", "tag", "revision", "imageDigest",
    "stageRunId"], "web_evidence:v3_artifact_candidate");
  exactKeys(value.liveComparison, ["warmups", "baseline", "candidate", "metrics"], "web_evidence:v3_live_keys");
  exactKeys(value.liveComparison.metrics, ["baselineP95Ms", "candidateP95Ms", "baselineFiveXx", "candidateFiveXx",
    "measuredTurnsPerTarget"], "web_evidence:v3_metrics_keys");
  for (const target of ["baseline", "candidate"]) {
    if (!Array.isArray(value.liveComparison[target]) || value.liveComparison[target].length !== FOUR_AXIS_CASES.length) {
      throw new Error("web_evidence:v3_product_execution_count");
    }
    value.liveComparison[target].forEach((observation, index) => {
      if (observation.productExecution === undefined) throw new Error("web_evidence:v3_product_execution_missing");
      validateProductExecution(observation.productExecution, FOUR_AXIS_CASES[index]);
    });
  }
  const requestKeys = [...value.liveComparison.baseline, ...value.liveComparison.candidate]
    .map((observation) => observation.productExecution.requestKey);
  if (new Set(requestKeys).size !== requestKeys.length) throw new Error("web_evidence:v3_product_request_key_reuse");
  const projected = { ...structuredClone(value), schemaVersion: "ai-coach-four-axis-web-dispatch-evidence-v2",
    targets: { production: value.targets.baseline, candidate: value.targets.candidate },
    liveComparison: { ...value.liveComparison, production: value.liveComparison.baseline,
      metrics: { productionP95Ms: value.liveComparison.metrics.baselineP95Ms,
        candidateP95Ms: value.liveComparison.metrics.candidateP95Ms,
        productionFiveXx: value.liveComparison.metrics.baselineFiveXx,
        candidateFiveXx: value.liveComparison.metrics.candidateFiveXx,
        measuredTurnsPerTarget: value.liveComparison.metrics.measuredTurnsPerTarget } } };
  delete projected.liveComparison.baseline;
  validateWebEvidenceArtifact(projected, { ...expected,
    targets: { production: expected.targets.baseline, candidate: expected.targets.candidate } });
  return value;
}

export function validateLocalWebStageBaselineEvidenceArtifact(value, expected) {
  exactKeys(value, ["schemaVersion", "artifactName", "repository", "commitSha", "producerPath", "localExecution",
    "request", "targets", "staticEvidence", "browserEvidence", "evidenceLeaseDigests", "liveComparison", "privacyScan"],
  "web_evidence:local_artifact_keys");
  if (value.schemaVersion !== LOCAL_ARTIFACT_SCHEMA
      || value.artifactName !== localWebEvidenceArtifactName(expected.sha, expected.context.contextId)
      || value.repository !== "miranae/orider-web" || value.commitSha !== expected.sha
      || value.producerPath !== "scripts/run-ai-coach-four-axis-web-evidence-local.mjs") {
    throw new Error("web_evidence:local_artifact_provenance");
  }
  exactKeys(value.localExecution, ["contextId", "contextSha256", "operator", "identity", "backend", "issuedAt",
    "expiresAt", "treeSha", "statusClean"], "web_evidence:local_execution_keys");
  if (value.localExecution.contextId !== expected.context.contextId
      || value.localExecution.contextSha256 !== expected.contextSha256
      || JSON.stringify(value.localExecution.operator) !== JSON.stringify(expected.context.operator)
      || JSON.stringify(value.localExecution.identity) !== JSON.stringify(expected.context.identity)
      || JSON.stringify(value.localExecution.backend) !== JSON.stringify(expected.context.backend)
      || value.localExecution.issuedAt !== expected.context.issuedAt
      || value.localExecution.expiresAt !== expected.context.expiresAt
      || value.localExecution.treeSha !== expected.context.treeSha || value.localExecution.statusClean !== true) {
    throw new Error("web_evidence:local_execution_binding");
  }
  exactKeys(value.request, ["correlationId", "requestSha256", "issuedAt", "expiresAt", "consumer", "backend",
    "operator", "identity"],
    "web_evidence:local_artifact_request_keys");
  if (value.request.correlationId !== expected.request.correlationId
      || value.request.requestSha256 !== expected.context.request.sha256
      || value.request.issuedAt !== expected.request.issuedAt
      || value.request.expiresAt !== expected.request.expiresAt
      || JSON.stringify(value.request.consumer) !== JSON.stringify(expected.request.consumer)
      || JSON.stringify(value.request.backend) !== JSON.stringify(expected.request.backend)
      || JSON.stringify(value.request.operator) !== JSON.stringify(expected.request.operator)
      || JSON.stringify(value.request.identity) !== JSON.stringify(expected.request.identity)) {
    throw new Error("web_evidence:local_artifact_request_binding");
  }
  exactKeys(value.targets, ["baseline", "candidate"], "web_evidence:local_artifact_targets");
  exactKeys(value.evidenceLeaseDigests, ["baseline", "candidate"], "web_evidence:local_lease_keys");
  if (Object.values(value.evidenceLeaseDigests).some((digest) => !DIGEST.test(digest))
      || value.evidenceLeaseDigests.baseline === value.evidenceLeaseDigests.candidate) {
    throw new Error("web_evidence:local_lease_binding");
  }
  exactKeys(value.liveComparison, ["warmups", "baseline", "candidate", "metrics"], "web_evidence:local_live_keys");
  exactKeys(value.liveComparison.metrics, ["baselineP95Ms", "candidateP95Ms", "baselineFiveXx", "candidateFiveXx",
    "measuredTurnsPerTarget"], "web_evidence:local_metrics_keys");
  if (JSON.stringify(value.targets) !== JSON.stringify(expected.targets)) {
    throw new Error("web_evidence:local_artifact_target_binding");
  }
  for (const target of ["baseline", "candidate"]) {
    if (!Array.isArray(value.liveComparison[target]) || value.liveComparison[target].length !== FOUR_AXIS_CASES.length) {
      throw new Error("web_evidence:local_product_execution_count");
    }
    value.liveComparison[target].forEach((observation, index) => {
      if (observation.productExecution === undefined) throw new Error("web_evidence:local_product_execution_missing");
      validateProductExecution(observation.productExecution, FOUR_AXIS_CASES[index]);
    });
  }
  const requestKeys = [...value.liveComparison.baseline, ...value.liveComparison.candidate]
    .map((observation) => observation.productExecution.requestKey);
  if (new Set(requestKeys).size !== requestKeys.length) throw new Error("web_evidence:local_product_request_key_reuse");
  const projected = { ...value, targets: { production: value.targets.baseline, candidate: value.targets.candidate },
    liveComparison: { ...value.liveComparison, production: value.liveComparison.baseline,
      metrics: { productionP95Ms: value.liveComparison.metrics.baselineP95Ms,
        candidateP95Ms: value.liveComparison.metrics.candidateP95Ms,
        productionFiveXx: value.liveComparison.metrics.baselineFiveXx,
        candidateFiveXx: value.liveComparison.metrics.candidateFiveXx,
        measuredTurnsPerTarget: value.liveComparison.metrics.measuredTurnsPerTarget } } };
  delete projected.liveComparison.baseline;
  validateWebEvidenceSubstance(projected, { correlationId: expected.request.correlationId,
    targets: { production: expected.targets.baseline, candidate: expected.targets.candidate },
    fileShas: expected.fileShas });
  return value;
}

export function createLocalEvidenceEnvelope({ headSha, treeSha, evidencePath, evidenceBytes, evidenceSha256 }) {
  const value = { executionMode: "local-file-v1", headSha, treeSha, statusClean: true,
    evidence: { path: evidencePath, bytes: evidenceBytes, sha256: evidenceSha256 } };
  validateLocalEvidenceEnvelope(value, value);
  return value;
}

export function validateLocalEvidenceEnvelope(value, expected) {
  exactKeys(value, ["executionMode", "headSha", "treeSha", "statusClean", "evidence"],
    "web_evidence:local_envelope_keys");
  exactKeys(value.evidence, ["path", "bytes", "sha256"], "web_evidence:local_envelope_evidence_keys");
  if (value.executionMode !== "local-file-v1" || value.headSha !== expected.headSha || !SHA.test(value.headSha)
      || value.treeSha !== expected.treeSha || !SHA.test(value.treeSha) || value.statusClean !== true
      || value.evidence.path !== expected.evidence.path
      || !/^artifacts\/ai-coach-four-axis-web-local-evidence-[0-9a-f-]+\/ai-coach-four-axis-web-local-evidence-[0-9a-f-]+\.json$/u
        .test(value.evidence.path)
      || value.evidence.bytes !== expected.evidence.bytes || !Number.isSafeInteger(value.evidence.bytes)
      || value.evidence.bytes < 2 || value.evidence.sha256 !== expected.evidence.sha256
      || !DIGEST.test(value.evidence.sha256)) throw new Error("web_evidence:local_envelope_binding");
  return value;
}
