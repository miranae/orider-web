#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeEvidenceRequest, evidenceFileSha256, validateDispatchRequest, validateWebEvidenceArtifact,
  verifyOrchestratorRun, WEB_EVIDENCE_TEST_FILES, webEvidenceArtifactName } from "./lib/ai-coach-four-axis-web-evidence.mjs";

function required(name) { const value = process.env[name]; if (!value) throw new Error(`web_evidence:env_${name}`); return value; }
const artifactPath = process.argv[2]; if (!artifactPath) throw new Error("web_evidence:path_required");
const root = process.cwd(); const sha = required("GITHUB_SHA"); const correlationId = required("CORRELATION_ID");
const repository = required("GITHUB_REPOSITORY"); const workflowRunId = Number(required("GITHUB_RUN_ID"));
const workflowRunAttempt = Number(required("GITHUB_RUN_ATTEMPT"));
if (required("GITHUB_EVENT_NAME") !== "workflow_dispatch") throw new Error("web_evidence:event");
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
if (head.status !== 0 || head.stdout.trim() !== sha) throw new Error("web_evidence:head_binding");
const name = webEvidenceArtifactName(sha, correlationId);
if (resolve(artifactPath) !== resolve(root, "artifacts", name, `${name}.json`)) throw new Error("web_evidence:exact_path");
const decoded = decodeEvidenceRequest(required("EVIDENCE_REQUEST"), required("REQUEST_SHA256"));
const expectedOrigins = { production: required("AI_COACH_EVIDENCE_PRODUCTION_ORIGIN"),
  candidate: required("AI_COACH_EVIDENCE_CANDIDATE_ORIGIN") };
const request = validateDispatchRequest(decoded.value, { correlationId, repository, sha, expectedOrigins });
const orchestrator = await verifyOrchestratorRun(request, { token: required("AI_COACH_ORCHESTRATOR_READ_TOKEN") });
const targets = { production: { targetFingerprint: request.targets.production.targetFingerprint,
  revisionIdentityDigest: request.targets.production.revisionIdentityDigest,
  productionAuditDigest: request.targets.production.productionAuditDigest },
candidate: { targetFingerprint: request.targets.candidate.targetFingerprint, tag: request.targets.candidate.tag,
  revision: request.targets.candidate.revision, imageDigest: request.targets.candidate.imageDigest,
  stageRunId: request.targets.candidate.stageRunId } };
const fileShas = Object.fromEntries(WEB_EVIDENCE_TEST_FILES.map((file) => [file, evidenceFileSha256(resolve(root, file))]));
validateWebEvidenceArtifact(JSON.parse(readFileSync(artifactPath, "utf8")), { sha, correlationId,
  requestSha256: decoded.requestSha256, expiresAt: request.expiresAt,
  workflowRunId, workflowRunAttempt, orchestrator, targets, fileShas });
process.stdout.write(`${name}: verified\n`);
