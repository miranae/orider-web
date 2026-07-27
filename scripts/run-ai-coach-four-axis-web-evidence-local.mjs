#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { collectBrowserEvidence } from "./lib/ai-coach-four-axis-browser-evidence.mjs";
import { bindLocalContextToRequest, collectStageBaselineComparison, createLocalEvidenceEnvelope,
  decodeEvidenceRequest, decodeLocalOperatorContext, evidenceFileSha256,
  localWebEvidenceArtifactName,
  passedVitestAssertions, prefixedEvidenceDigest, privacyScan, REQUIRED_RENDER_ASSERTIONS,
  validateLocalOperatorContext, validateLocalOperatorRequest, validateLocalWebStageBaselineEvidenceArtifact,
  verifyLocalCheckpointBinding, verifyLocalGoogleIdentity, verifyLocalRepositoryState, WEB_EVIDENCE_TEST_FILES } from
  "./lib/ai-coach-four-axis-web-evidence.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith("--")) {
    throw new Error(`web_evidence:local_argument_${name.slice(2).replaceAll("-", "_")}`);
  }
  return process.argv[index + 1];
}
function required(name) { const value = process.env[name]; if (!value) throw new Error(`web_evidence:env_${name}`); return value; }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

const root = process.cwd();
const contextPath = resolve(argument("--local-context"));
const expectedContextSha256 = argument("--context-sha256");
const decodedContext = decodeLocalOperatorContext(readFileSync(contextPath), expectedContextSha256);
const context = validateLocalOperatorContext(decodedContext.value,
  { repository: "miranae/orider-web", sha: decodedContext.value.commitSha });
verifyLocalRepositoryState(root, context.commitSha, context.treeSha);
verifyLocalGoogleIdentity(context);
const requestPath = resolve(dirname(contextPath), context.request.path);
const decodedRequest = decodeEvidenceRequest(readFileSync(requestPath, "utf8"), context.request.sha256.slice(7));
const request = validateLocalOperatorRequest(decodedRequest.value, { repository: context.repository,
  sha: context.commitSha, treeSha: context.treeSha, operator: context.operator, identity: context.identity,
  backend: context.backend, stageHostSuffix: context.stage.hostSuffix });
verifyLocalCheckpointBinding(request, required("AI_COACH_LOCAL_CHECKPOINT_PATH"),
  required("AI_COACH_LOCAL_CHECKPOINT_SHA256"));
const targets = bindLocalContextToRequest(context, request, requestPath);

const identityTokenFor = async (audience) => {
  const minted = spawnSync("gcloud", ["auth", "print-identity-token",
    `--impersonate-service-account=${context.identity.serviceAccount}`, `--audiences=${audience}`, "--include-email"],
  { cwd: root, encoding: "utf8", maxBuffer: 64_000 });
  const token = minted.stdout.trim();
  if (minted.status !== 0 || token.length < 8 || token.length > 16_384 || /\s/u.test(token)) {
    throw new Error("web_evidence:local_oidc_mint");
  }
  return token;
};

const temporary = mkdtempSync(resolve(tmpdir(), "four-axis-web-local-evidence-"));
const resultFile = resolve(temporary, "vitest.json");
try {
  const run = spawnSync("npx", ["--no-install", "vitest", "run", ...WEB_EVIDENCE_TEST_FILES,
    "--reporter=json", `--outputFile=${resultFile}`], { cwd: root, encoding: "utf8", maxBuffer: 10_000_000 });
  const testLogs = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  if (run.status !== 0) throw new Error("web_evidence:local_render_tests_failed");
  const machineResult = JSON.parse(readFileSync(resultFile, "utf8"));
  const assertions = passedVitestAssertions(machineResult);
  const fileShas = Object.fromEntries(WEB_EVIDENCE_TEST_FILES.map((file) => [file, evidenceFileSha256(resolve(root, file))]));
  const browser = await collectBrowserEvidence(root);
  const live = await collectStageBaselineComparison(request, { fetchImpl: fetch,
    clock: performance.now.bind(performance), identityTokenFor, maskSecret: () => undefined,
    firebaseWebApiKey: required("AI_COACH_STAGE_FIREBASE_WEB_API_KEY"), requestSha256: decodedRequest.requestSha256 });
  validateLocalOperatorContext(context, { repository: context.repository, sha: context.commitSha });
  verifyLocalRepositoryState(root, context.commitSha, context.treeSha);
  verifyLocalGoogleIdentity(context);
  const artifactName = localWebEvidenceArtifactName(context.commitSha, context.contextId);
  const base = { schemaVersion: "ai-coach-four-axis-web-stage-baseline-local-evidence-v1", artifactName,
    repository: context.repository, commitSha: context.commitSha,
    producerPath: "scripts/run-ai-coach-four-axis-web-evidence-local.mjs",
    localExecution: { contextId: context.contextId, contextSha256: decodedContext.contextSha256,
      operator: context.operator, identity: context.identity, backend: context.backend, issuedAt: context.issuedAt,
      expiresAt: context.expiresAt, treeSha: context.treeSha, statusClean: true },
    request: { correlationId: request.correlationId, requestSha256: decodedRequest.requestSha256,
      issuedAt: request.issuedAt, expiresAt: request.expiresAt, consumer: request.consumer,
      backend: request.backend, operator: request.operator, identity: request.identity },
    targets, evidenceLeaseDigests: live.evidenceLeaseDigests,
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
  if (Object.values(scan.matches).some((count) => count !== 0)) throw new Error("web_evidence:local_privacy_scan");
  const artifact = { ...base, privacyScan: scan };
  validateLocalWebStageBaselineEvidenceArtifact(artifact, { sha: context.commitSha, context,
    contextSha256: decodedContext.contextSha256, request, targets, fileShas });
  const directory = resolve(root, "artifacts", artifactName); mkdirSync(directory, { recursive: true });
  const artifactPath = resolve(directory, `${artifactName}.json`);
  const artifactBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(artifactPath, artifactBytes, { mode: 0o600, flag: "wx" });
  const artifactRelativePath = relative(root, artifactPath);
  const envelope = createLocalEvidenceEnvelope({ headSha: context.commitSha, treeSha: context.treeSha,
    evidencePath: artifactRelativePath, evidenceBytes: artifactBytes.length,
    evidenceSha256: `sha256:${sha256(artifactBytes)}` });
  const envelopeBytes = Buffer.from(`${JSON.stringify(envelope)}\n`);
  const envelopePath = resolve(directory, `${artifactName}.local-file.json`);
  writeFileSync(envelopePath, envelopeBytes, { mode: 0o600, flag: "wx" });
  writeFileSync(`${envelopePath}.sha256`, `${sha256(envelopeBytes)}\n`, { mode: 0o600, flag: "wx" });
  process.stdout.write(`${relative(root, envelopePath)} sha256:${sha256(envelopeBytes)}\n`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
