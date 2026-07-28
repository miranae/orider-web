#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { collectBrowserEvidence } from "./lib/ai-coach-four-axis-browser-evidence.mjs";
import { collectStageBaselineComparison, decodeEvidenceRequest, evidenceFileSha256, passedVitestAssertions,
  parseOrchestratorActorAllowlist, prefixedEvidenceDigest, privacyScan, REQUIRED_RENDER_ASSERTIONS,
  readStageProductLedgerReceipts,
  validateStageBaselineDispatchRequest,
  validateWebStageBaselineEvidenceArtifact,
  verifyOrchestratorRun, WEB_EVIDENCE_TEST_FILES, webEvidenceArtifactName } from "./lib/ai-coach-four-axis-web-evidence.mjs";

function required(name) { const value = process.env[name]; if (!value) throw new Error(`web_evidence:env_${name}`); return value; }

const root = process.cwd(); const commitSha = required("GITHUB_SHA"); const correlationId = required("CORRELATION_ID");
const workflowRunId = Number(required("GITHUB_RUN_ID")); const workflowRunAttempt = Number(required("GITHUB_RUN_ATTEMPT"));
const repository = required("GITHUB_REPOSITORY"); const eventName = required("GITHUB_EVENT_NAME");
const actor = required("GITHUB_ACTOR");
const dispatcherActor = required("AI_COACH_EVIDENCE_DISPATCHER_ACTOR");
const orchestratorActors = parseOrchestratorActorAllowlist(required("AI_COACH_EVIDENCE_ORCHESTRATOR_ACTORS_JSON"));
if (repository !== "miranae/orider-web" || eventName !== "workflow_dispatch"
    || actor !== dispatcherActor
    || !Number.isSafeInteger(workflowRunId) || workflowRunId < 1
    || !Number.isSafeInteger(workflowRunAttempt) || workflowRunAttempt < 1) throw new Error("web_evidence:workflow_context");
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
if (head.status !== 0 || head.stdout.trim() !== commitSha) throw new Error("web_evidence:head_binding");
const decoded = decodeEvidenceRequest(required("EVIDENCE_REQUEST"), required("REQUEST_SHA256"));
const request = validateStageBaselineDispatchRequest(decoded.value, { correlationId, repository, sha: commitSha,
  stageHostSuffix: required("AI_COACH_STAGE_HOST_SUFFIX"),
  stageHostSuffixSha256: required("AI_COACH_STAGE_HOST_SUFFIX_SHA256"), orchestratorActors });
const orchestrator = await verifyOrchestratorRun(request,
  { token: required("AI_COACH_ORCHESTRATOR_TOKEN"), allowedActors: orchestratorActors });
const identityTokenFor = async (audience) => {
  const minted = spawnSync("gcloud", ["auth", "print-identity-token", `--audiences=${audience}`, "--include-email"],
    { cwd: root, encoding: "utf8", maxBuffer: 64_000 });
  const token = minted.stdout.trim();
  if (minted.status !== 0 || !token || /\s/u.test(token)) throw new Error("web_evidence:oidc_mint");
  return token;
};
const maskSecret = (token) => process.stdout.write(`::add-mask::${token}\n`);
const accessTokenResult = spawnSync("gcloud", ["auth", "print-access-token"],
  { cwd: root, encoding: "utf8", maxBuffer: 64_000 });
const accessToken = accessTokenResult.stdout.trim();
if (accessTokenResult.status !== 0 || accessToken.length < 8 || accessToken.length > 16_384 || /\s/u.test(accessToken)) {
  throw new Error("web_evidence:access_token_mint");
}
maskSecret(accessToken);

const temporary = mkdtempSync(resolve(tmpdir(), "four-axis-web-evidence-")); const resultFile = resolve(temporary, "vitest.json");
try {
  const run = spawnSync("npx", ["--no-install", "vitest", "run", ...WEB_EVIDENCE_TEST_FILES,
    "--reporter=json", `--outputFile=${resultFile}`], { cwd: root, encoding: "utf8", maxBuffer: 10_000_000 });
  const testLogs = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  if (run.status !== 0) throw new Error("web_evidence:render_tests_failed");
  const machineResult = JSON.parse(readFileSync(resultFile, "utf8")); const assertions = passedVitestAssertions(machineResult);
  const fileShas = Object.fromEntries(WEB_EVIDENCE_TEST_FILES.map((file) => [file, evidenceFileSha256(resolve(root, file))]));
  const browser = await collectBrowserEvidence(root);
  const live = await collectStageBaselineComparison(request, { fetchImpl: fetch,
    clock: performance.now.bind(performance), identityTokenFor, maskSecret,
    firebaseWebApiKey: required("AI_COACH_STAGE_FIREBASE_WEB_API_KEY"), requestSha256: decoded.requestSha256,
    ledgerReceiptsFor: (requestKey, _item, target) => readStageProductLedgerReceipts(requestKey,
      { fetchImpl: fetch, accessToken, targetName: target.tag }) });
  const artifactName = webEvidenceArtifactName(commitSha, correlationId);
  const targets = { baseline: { targetFingerprint: request.targets.baseline.targetFingerprint,
    environment: request.targets.baseline.environment, tag: request.targets.baseline.tag,
    revision: request.targets.baseline.revision, imageDigest: request.targets.baseline.imageDigest,
    stageRunId: request.targets.baseline.stageRunId,
    productionAuditDigest: request.targets.baseline.productionAuditDigest },
  candidate: { targetFingerprint: request.targets.candidate.targetFingerprint, tag: request.targets.candidate.tag,
    environment: request.targets.candidate.environment,
    revision: request.targets.candidate.revision, imageDigest: request.targets.candidate.imageDigest,
    stageRunId: request.targets.candidate.stageRunId } };
  const base = { schemaVersion: "ai-coach-four-axis-web-stage-baseline-evidence-v3", artifactName,
    repository, commitSha, workflowPath: ".github/workflows/ai-coach-four-axis-evidence.yml",
    dispatch: { correlationId, requestSha256: decoded.requestSha256, expiresAt: request.expiresAt,
      consumer: request.consumer, orchestrator,
      workflow: { repository, runId: workflowRunId, runAttempt: workflowRunAttempt, actor, event: eventName } },
    targets,
    staticEvidence: { testFiles: WEB_EVIDENCE_TEST_FILES, testFileSha256: fileShas,
      results: { passed: machineResult.numPassedTests, failed: machineResult.numFailedTests,
        skipped: machineResult.numPendingTests, todo: machineResult.numTodoTests },
      assertionReceiptDigests: REQUIRED_RENDER_ASSERTIONS.filter((title) => assertions.includes(title))
        .map((title) => prefixedEvidenceDigest({ title, testFileSha256: fileShas })) },
    browserEvidence: browser.evidence, liveComparison: live.evidence };
  const receiptSidecars = [...live.evidence.baseline, ...live.evidence.candidate].map((item) => JSON.stringify({
    card: item.card, response: item.response, providerCalls: item.providerCalls, quotaConsumed: item.quotaConsumed,
    userDataWrites: item.userDataWrites, receiptDigest: item.receiptDigest }));
  const scan = privacyScan({ finalArtifact: JSON.stringify(base), renderedDom: browser.captures,
    networkUrls: live.captures.map((item) => item.url),
    networkBodies: live.captures.flatMap((item) => [item.requestBody, item.responseBody]), testLogs,
    providerSidecars: receiptSidecars });
  if (Object.values(scan.matches).some((count) => count !== 0)) throw new Error("web_evidence:privacy_scan");
  const artifact = { ...base, privacyScan: scan };
  validateWebStageBaselineEvidenceArtifact(artifact, { sha: commitSha, correlationId, requestSha256: decoded.requestSha256,
    expiresAt: request.expiresAt, workflowRunId, workflowRunAttempt, workflowActor: actor,
    orchestrator, targets, fileShas });
  const directory = resolve(root, "artifacts", artifactName); mkdirSync(directory, { recursive: true });
  const output = resolve(directory, `${artifactName}.json`); writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
  process.stdout.write(`${artifactName}: generated\n`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
