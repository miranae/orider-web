#!/usr/bin/env node
// GitHub의 짧은 artifact 보관 기간과 분리된 FE 후보 보관. 기존 비공개 릴리스 버킷을 사용한다.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { stageArtifactManifest } from "./lib/stage-artifact-manifest.mjs";

export const HOSTING_CANDIDATE_BUCKET = "miranae-orider-g1-release-evidence";
const sha = /^[a-f0-9]{40}$/u, digest = /^[a-f0-9]{64}$/u, positive = /^[1-9][0-9]*$/u;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
export function hostingCandidateObject(runId, attempt) {
  if (![runId, attempt].every(value => positive.test(String(value)))) throw new Error("positive candidate run/attempt required");
  return `deploy-candidates/hosting/${runId}/${attempt}/candidate.tgz`;
}
function validateRun(run, attempt) {
  if (run.repository?.full_name !== "miranae/orider-web" || run.path !== ".github/workflows/deploy-stage.yml"
    || run.event !== "workflow_dispatch" || (run.kind === "archived-stage-acceptance" ? run.stageAcceptanceComplete !== true : run.status !== "completed" || run.conclusion !== "success")
    || run.run_attempt !== Number(attempt) || !Number.isSafeInteger(run.id) || run.id < 1 || !sha.test(run.head_sha || "")) throw new Error("successful selected development run/attempt required");
}
export function validateArchivedCandidate(run, archive, attempt) {
  validateRun(run, attempt);
  if (!archive || archive.kind !== "gcs" || archive.bucket !== HOSTING_CANDIDATE_BUCKET
    || archive.object !== hostingCandidateObject(run.id, attempt) || !positive.test(archive.generation || "")
    || !digest.test(archive.sha256 || "") || !sha.test(archive.frontendSourceSha || "") || !digest.test(archive.artifactHash || "")
    || archive.workflowSourceSha !== run.head_sha) throw new Error("pinned private client archive required");
  return archive.frontendSourceSha;
}
const metadataUrl = object => `https://storage.googleapis.com/storage/v1/b/${HOSTING_CANDIDATE_BUCKET}/o/${encodeURIComponent(object)}`;
function auth(token) {
  if (!token || /[\r\n]/u.test(token)) throw new Error("candidate archive access token required");
  return { Authorization: `Bearer ${token}` };
}
async function readObject(object, token, fetcher) {
  const response = await fetcher(metadataUrl(object), { headers: auth(token), redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`private client archive metadata HTTP${response.status}`); }
  return response.json();
}
export async function archiveHostingCandidate({ workspace = process.cwd(), buildReceipt, directory, runId, attempt, workflowSourceSha, token, fetcher = fetch }) {
  const object = hostingCandidateObject(runId, attempt), candidate = json(buildReceipt), dist = join(workspace, "dist"), hosting = join(workspace, "firebase.bundled-stage.json");
  if (candidate.schemaVersion !== 1 || candidate.mode !== "bundled-development-client" || candidate.complete !== true
    || !sha.test(candidate.frontendSourceSha || "") || !sha.test(workflowSourceSha || "")
    || candidate.artifactHash !== hash(JSON.stringify(candidate.artifactManifest))
    || !isDeepStrictEqual(stageArtifactManifest(dist), candidate.artifactManifest)
    || hash(readFileSync(hosting)) !== candidate.hostingHash || hash(readFileSync(join(dist, "runtime-config.json"))) !== candidate.runtimeHash) throw new Error("verified client archive files changed");
  directory = resolve(directory); mkdirSync(directory, { recursive: true });
  const payload = join(directory, "payload"); mkdirSync(payload);
  cpSync(dist, join(payload, "dist"), { recursive: true }); cpSync(hosting, join(payload, "firebase.bundled-stage.json")); cpSync(buildReceipt, join(payload, "build.json"));
  const provenance = { schemaVersion: 1, repository: "miranae/orider-web", workflowPath: ".github/workflows/deploy-stage.yml",
    runId: String(runId), attempt: String(attempt), stageAcceptanceComplete: true, workflowSourceSha, frontendSourceSha: candidate.frontendSourceSha, artifactHash: candidate.artifactHash };
  save(join(payload, "candidate.json"), provenance);
  const path = join(directory, "candidate.tgz");
  execFileSync("tar", ["-czf", path, "-C", payload, "dist", "firebase.bundled-stage.json", "build.json", "candidate.json"], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  const bytes = readFileSync(path), checksum = hash(bytes);
  const metadata = { name: object, contentType: "application/gzip", metadata: { ...Object.fromEntries(Object.entries(provenance).map(([key, value]) => [key, String(value)])), sha256: checksum } };
  const boundary = `orider-client-${checksum.slice(0, 32)}`;
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  let response;
  try { response = await fetcher(`https://storage.googleapis.com/upload/storage/v1/b/${HOSTING_CANDIDATE_BUCKET}/o?uploadType=multipart&ifGenerationMatch=0`,
    { method: "POST", headers: { ...auth(token), "Content-Type": `multipart/related; boundary=${boundary}` }, body, redirect: "error", signal: AbortSignal.timeout(120000) }); }
  catch { response = { status: 412 }; } // 응답을 잃어도 create-only object를 읽고 같은 checksum인지 확인한다.
  let stored;
  if ([409, 412].includes(response.status)) { await response.body?.cancel(); stored = await readObject(object, token, fetcher); }
  else if (!response.ok) { await response.body?.cancel(); throw new Error(`private client archive create HTTP${response.status}`); }
  else stored = await response.json();
  if (stored.name !== object || stored.bucket !== HOSTING_CANDIDATE_BUCKET || !positive.test(stored.generation || "")
    || Number(stored.size) !== bytes.length || Object.entries(metadata.metadata).some(([key, value]) => stored.metadata?.[key] !== value)) throw new Error("immutable private client archive differs");
  const receipt = { kind: "gcs", bucket: HOSTING_CANDIDATE_BUCKET, object, generation: stored.generation, sha256: checksum,
    frontendSourceSha: candidate.frontendSourceSha, workflowSourceSha, artifactHash: candidate.artifactHash };
  save(join(directory, "archive.json"), receipt);
  return receipt;
}
export async function restoreHostingCandidate({ run, runId, attempt, directory, token, fetcher = fetch }) {
  const object = hostingCandidateObject(runId, attempt), stored = await readObject(object, token, fetcher), metadata = stored.metadata;
  const archive = { kind: "gcs", bucket: stored.bucket, object: stored.name, generation: stored.generation, sha256: metadata?.sha256,
    frontendSourceSha: metadata?.frontendSourceSha, workflowSourceSha: metadata?.workflowSourceSha, artifactHash: metadata?.artifactHash };
  const archivedRun = { kind: "archived-stage-acceptance", repository: { full_name: metadata?.repository }, path: metadata?.workflowPath, event: "workflow_dispatch",
    id: Number(runId), run_attempt: Number(attempt), head_sha: archive.workflowSourceSha, stageAcceptanceComplete: metadata?.stageAcceptanceComplete === "true" };
  validateArchivedCandidate(archivedRun, archive, attempt);
  if (run) { validateArchivedCandidate(run, archive, attempt); if (run.id !== Number(runId)) throw new Error("selected run identity mismatch"); }
  else run = archivedRun;
  if (metadata.repository !== "miranae/orider-web" || metadata.workflowPath !== run.path || metadata.runId !== String(run.id) || metadata.attempt !== String(attempt)) throw new Error("private client archive provenance mismatch");
  const url = `https://storage.googleapis.com/download/storage/v1/b/${HOSTING_CANDIDATE_BUCKET}/o/${encodeURIComponent(object)}?alt=media&generation=${archive.generation}`;
  const response = await fetcher(url, { headers: auth(token), redirect: "error", signal: AbortSignal.timeout(120000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`private client archive download HTTP${response.status}`); }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== archive.sha256) throw new Error("private client archive checksum mismatch");
  directory = resolve(directory); mkdirSync(directory);
  const path = join(directory, "candidate.tgz"), payload = join(directory, "payload"); writeFileSync(path, bytes, { flag: "wx" }); mkdirSync(payload);
  const members = execFileSync("tar", ["-tzf", path], { encoding: "utf8" }).trim().split("\n");
  if (members.some(name => !/^(?:dist(?:\/|$)|firebase\.bundled-stage\.json$|build\.json$|candidate\.json$)/u.test(name) || name.split("/").includes(".."))) throw new Error("private client archive contains invalid paths");
  execFileSync("tar", ["-xzf", path, "-C", payload]);
  const provenance = json(join(payload, "candidate.json"));
  if (provenance.runId !== String(run.id) || provenance.attempt !== String(attempt) || provenance.frontendSourceSha !== archive.frontendSourceSha
    || provenance.workflowSourceSha !== run.head_sha || provenance.artifactHash !== archive.artifactHash || provenance.stageAcceptanceComplete !== true) throw new Error("private client archive payload provenance mismatch");
  save(join(directory, "archive.json"), archive);
  save(join(directory, "run.json"), run);
  return { ...archive, payload, validation: run.kind || "github-successful-run" };
}
async function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    if (!["--phase", "--directory", "--build", "--run", "--run-id", "--attempt"].includes(process.argv[i]) || !process.argv[i + 1] || args[process.argv[i]]) throw new Error("invalid archive arguments");
    args[process.argv[i]] = process.argv[i + 1];
  }
  const common = { directory: args["--directory"], token: process.env.HOSTING_CANDIDATE_ACCESS_TOKEN };
  if (!common.directory) throw new Error("archive directory required");
  const result = args["--phase"] === "archive" ? await archiveHostingCandidate({ ...common, buildReceipt: args["--build"], runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT, workflowSourceSha: process.env.GITHUB_SHA })
    : args["--phase"] === "restore" ? await restoreHostingCandidate({ ...common, run: args["--run"] ? json(args["--run"]) : undefined, runId: args["--run-id"], attempt: args["--attempt"] }) : null;
  if (!result) throw new Error("archive/restore phase required");
  console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
