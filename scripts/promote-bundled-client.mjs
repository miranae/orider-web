#!/usr/bin/env node
// 검증한 개발 산출물 전체를 재사용하고 실행 주소만 운영으로 바꾼다. 빌드는 하지 않는다.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { stageArtifactManifest, assertStageEntryArtifact } from "./lib/stage-artifact-manifest.mjs";
import { bundledFunctionsConfig, bundledHostingConfig } from "./lib/bundled-functions-config.mjs";
import { verifyBundledProductionBackend } from "./prepare-bundled-production.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const sha = /^[a-f0-9]{40}$/u, digest = /^[a-f0-9]{64}$/u;

export function validateCandidateRun(run, artifact, attempt) {
  if (run.repository?.full_name !== "miranae/orider-web" || run.path !== ".github/workflows/deploy-stage.yml"
    || run.event !== "workflow_dispatch" || run.status !== "completed" || run.conclusion !== "success"
    || run.run_attempt !== Number(attempt) || !Number.isSafeInteger(run.id) || run.id < 1) throw new Error("successful selected development run/attempt required");
  if (!artifact || artifact.expired || !Number.isSafeInteger(artifact.id) || artifact.id < 1
    || !/^stage-client-[a-f0-9]{40}$/u.test(artifact.name)) throw new Error("unexpired selected client artifact required");
  return artifact.name.slice("stage-client-".length);
}

function findFiles(root, name) {
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("candidate archive contains a symlink");
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...findFiles(path, name));
    else if (entry.name === name) found.push(path);
  }
  return found;
}
export function prepareClientPromotion({ archive, workspace = process.cwd(), directory, run, artifact, attempt, toolingSourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() }) {
  const frontendSourceSha = validateCandidateRun(run, artifact, attempt);
  if (!sha.test(toolingSourceSha)) throw new Error("tooling source SHA required");
  archive = resolve(archive); workspace = resolve(workspace); directory = resolve(directory);
  const receipts = findFiles(archive, "build.json"), configs = findFiles(archive, "firebase.bundled-stage.json");
  if (receipts.length !== 1 || configs.length !== 1) throw new Error("one sealed development client artifact required");
  const candidate = json(receipts[0]), sourceDist = join(dirname(configs[0]), "dist");
  if (candidate.schemaVersion !== 1 || candidate.mode !== "bundled-development-client" || candidate.complete !== true
    || candidate.frontendSourceSha !== frontendSourceSha || !sha.test(candidate.backendSourceSha || "") || !digest.test(candidate.backendTopologyHash || "")
    || candidate.artifactHash !== hash(JSON.stringify(candidate.artifactManifest))
    || !isDeepStrictEqual(stageArtifactManifest(sourceDist), candidate.artifactManifest)
    || hash(readFileSync(configs[0])) !== candidate.hostingHash) throw new Error("sealed development artifact source/files mismatch");
  const candidateRuntime = json(join(sourceDist, "runtime-config.json"));
  if (candidateRuntime.deploymentProfile !== "bundled-development"
    || hash(readFileSync(join(sourceDist, "runtime-config.json"))) !== candidate.runtimeHash) throw new Error("sealed development runtime mismatch");
  const runtime = bundledFunctionsConfig(candidateRuntime, "production");
  const hosting = bundledHostingConfig(json(configs[0]), "production");
  if (hosting.hosting.site !== "orider-dev" || hosting.hosting.public !== "dist" || hosting.hosting.target) throw new Error("development Hosting identity mismatch");
  hosting.hosting.site = "miranae-orider-g1";
  hosting.hosting.predeploy = "node scripts/promote-bundled-client.mjs --phase verify";
  if (existsSync(join(workspace, "dist")) || existsSync(directory)) throw new Error("promotion requires fresh output directories");
  mkdirSync(directory, { recursive: true });
  cpSync(sourceDist, join(workspace, "dist"), { recursive: true });
  writeFileSync(join(workspace, "dist/runtime-config.json"), JSON.stringify(runtime, null, 2) + "\n");
  const expected = candidate.artifactManifest.map(([path, value]) => [path, path === "runtime-config.json" ? hash(readFileSync(join(workspace, "dist", path))) : value]);
  if (!isDeepStrictEqual(stageArtifactManifest(join(workspace, "dist")), expected)) throw new Error("promotion changed compiled/static files");
  save(join(workspace, "firebase.bundled-production.json"), hosting);
  const receipt = { schemaVersion: 1, mode: "bundled-client-promotion", frontendSourceSha, toolingSourceSha,
    candidateRunId: run.id, candidateRunAttempt: run.run_attempt, candidateArtifactId: artifact.id,
    backend: { sourceSha: candidate.backendSourceSha, topologyHash: candidate.backendTopologyHash },
    originalArtifactHash: candidate.artifactHash, artifactManifest: expected, runtime,
    hostingHash: hash(readFileSync(join(workspace, "firebase.bundled-production.json"))),
    entry: assertStageEntryArtifact(join(workspace, "dist")), rebuilt: false };
  save(join(directory, "promotion.json"), receipt);
  return receipt;
}
export function verifyPromotionFiles({ workspace = process.cwd(), directory }) {
  const receipt = json(join(directory, "promotion.json"));
  if (receipt.schemaVersion !== 1 || receipt.mode !== "bundled-client-promotion" || receipt.rebuilt !== false
    || !sha.test(receipt.toolingSourceSha || "") || !sha.test(receipt.frontendSourceSha || "") || !sha.test(receipt.backend?.sourceSha || "") || !digest.test(receipt.backend?.topologyHash || "")
    || !isDeepStrictEqual(stageArtifactManifest(join(workspace, "dist")), receipt.artifactManifest)
    || hash(readFileSync(join(workspace, "firebase.bundled-production.json"))) !== receipt.hostingHash
    || !isDeepStrictEqual(json(join(workspace, "dist/runtime-config.json")), receipt.runtime)
    || !isDeepStrictEqual(receipt.runtime, bundledFunctionsConfig(receipt.runtime, "production"))) throw new Error("prepared promotion files changed");
  return receipt;
}
export async function verifyClientPromotion(options, fetcher = fetch) {
  const receipt = verifyPromotionFiles(options);
  await verifyBundledProductionBackend(receipt.runtime, receipt.backend, fetcher);
  verifyPromotionFiles(options);
  return receipt;
}
async function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    if (!["--phase", "--archive", "--directory", "--run", "--artifact", "--attempt"].includes(process.argv[i]) || !process.argv[i + 1] || args[process.argv[i]]) throw new Error("invalid client promotion arguments");
    args[process.argv[i]] = process.argv[i + 1];
  }
  const directory = args["--directory"] || process.env.CLIENT_PROMOTION_DIRECTORY;
  if (!directory) throw new Error("promotion directory required");
  const options = { directory };
  let receipt;
  if (args["--phase"] === "prepare") receipt = prepareClientPromotion({ ...options, archive: args["--archive"], run: json(args["--run"]), artifact: json(args["--artifact"]), attempt: args["--attempt"] });
  else if (args["--phase"] === "verify") receipt = await verifyClientPromotion(options);
  else if (args["--phase"] === "check-files") receipt = verifyPromotionFiles(options);
  else throw new Error("prepare/verify/check-files phase required");
  console.log(JSON.stringify({ phase: args["--phase"], frontendSourceSha: receipt.frontendSourceSha, backend: receipt.backend, candidateRunId: receipt.candidateRunId, rebuilt: false, entry: receipt.entry }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
