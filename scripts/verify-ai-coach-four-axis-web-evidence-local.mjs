#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { bindLocalContextToRequest, decodeEvidenceRequest, decodeLocalOperatorContext, evidenceFileSha256,
  localWebEvidenceArtifactName, validateLocalEvidenceEnvelope, validateLocalOperatorContext,
  validateLocalWebStageBaselineEvidenceArtifact, validateStageBaselineDispatchRequest, verifyLocalGoogleIdentity,
  verifyLocalRepositoryState, WEB_EVIDENCE_TEST_FILES } from "./lib/ai-coach-four-axis-web-evidence.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith("--")) {
    throw new Error(`web_evidence:local_argument_${name.slice(2).replaceAll("-", "_")}`);
  }
  return process.argv[index + 1];
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

const root = process.cwd();
const contextPath = resolve(argument("--local-context"));
const decodedContext = decodeLocalOperatorContext(readFileSync(contextPath), argument("--context-sha256"));
const context = validateLocalOperatorContext(decodedContext.value,
  { repository: "miranae/orider-web", sha: decodedContext.value.commitSha });
verifyLocalGoogleIdentity(context);
const requestPath = resolve(dirname(contextPath), context.request.path);
const decodedRequest = decodeEvidenceRequest(readFileSync(requestPath, "utf8"), context.request.sha256);
const request = validateStageBaselineDispatchRequest(decodedRequest.value, { correlationId: decodedRequest.value.correlationId,
  repository: context.repository, sha: context.commitSha, stageHostSuffix: context.stage.hostSuffix,
  stageHostSuffixSha256: context.stage.hostSuffixSha256,
  orchestratorActors: [context.identity.orchestratorActor] });
const targets = bindLocalContextToRequest(context, request, requestPath);
const artifactName = localWebEvidenceArtifactName(context.commitSha, context.contextId);
const expectedDirectory = resolve(root, "artifacts", artifactName);
const artifactPath = resolve(argument("--artifact"));
const envelopePath = resolve(argument("--envelope"));
if (artifactPath !== resolve(expectedDirectory, `${artifactName}.json`)
    || envelopePath !== resolve(expectedDirectory, `${artifactName}.local-file.json`)) {
  throw new Error("web_evidence:local_exact_path");
}
verifyLocalRepositoryState(root, context.commitSha, context.treeSha, undefined,
  [relative(root, artifactPath), relative(root, envelopePath), `${relative(root, envelopePath)}.sha256`]);
const artifactBytes = readFileSync(artifactPath);
const artifact = JSON.parse(artifactBytes.toString("utf8"));
const fileShas = Object.fromEntries(WEB_EVIDENCE_TEST_FILES.map((file) => [file, evidenceFileSha256(resolve(root, file))]));
validateLocalWebStageBaselineEvidenceArtifact(artifact, { sha: context.commitSha, context,
  contextSha256: decodedContext.contextSha256, request, targets, fileShas });
const envelopeBytes = readFileSync(envelopePath);
const expectedEnvelopeSha256 = argument("--envelope-sha256");
if (!/^[0-9a-f]{64}$/u.test(expectedEnvelopeSha256) || sha256(envelopeBytes) !== expectedEnvelopeSha256) {
  throw new Error("web_evidence:local_envelope_digest");
}
const envelope = JSON.parse(envelopeBytes.toString("utf8"));
validateLocalEvidenceEnvelope(envelope, { headSha: context.commitSha, treeSha: context.treeSha,
  statusClean: true, executionMode: "local-file-v1",
  evidence: { path: relative(root, artifactPath), bytes: artifactBytes.length,
    sha256: `sha256:${sha256(artifactBytes)}` } });
process.stdout.write(`${relative(root, envelopePath)} verified sha256:${expectedEnvelopeSha256}\n`);
