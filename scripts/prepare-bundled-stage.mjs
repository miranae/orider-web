#!/usr/bin/env node
// 개발 배포는 선택한 소스와 검증한 backend를 고정하며 운영 리소스는 변경하지 않는다.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { bundledFunctionsConfig, bundledHostingConfig } from "./lib/bundled-functions-config.mjs";
import { productionBuildEnv, resolveProductionBuildFlags, PRODUCTION_ORIGIN } from "./lib/production-data-config.mjs";
import { assertStageArtifactManifest, assertStageEntryArtifact, stageArtifactManifest } from "./lib/stage-artifact-manifest.mjs";
import { verifyBundledCallable, verifyBundledRouteControl, verifyBundledHttpAliases } from "./lib/bundled-callable-probe.mjs";
import { verifyPublicClubApi } from "./lib/public-club-deploy-config.mjs";

const SHA = /^[a-f0-9]{40}$/u;
const hash = value => createHash("sha256").update(value).digest("hex");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const git = (workspace, ...args) => execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim();
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });

function assertSource(workspace, expected) {
  const actual = git(workspace, "rev-parse", "HEAD");
  if (!SHA.test(expected || "") || actual !== expected || git(workspace, "status", "--porcelain", "--untracked-files=normal")) {
    throw new Error(`bundled stage requires the pinned clean source: expected=${expected} actual=${actual}`);
  }
  const reviewed = ["origin/main", "origin/dev"].some(ref => {
    const result = spawnSync("git", ["merge-base", "--is-ancestor", actual, ref], { cwd: workspace, stdio: "ignore" });
    return !result.error && result.status === 0;
  });
  if (!reviewed) throw new Error(`bundled stage requires reviewed source: expected=ancestor of origin/main or origin/dev actual=${actual}`);
}

async function requestJson(url, fetcher) {
  let response;
  try { response = await fetcher(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error(`bundled stage metadata transport failed at ${url}`); }
  if (!response.ok) {
    const error = new Error(`bundled stage public metadata unavailable at ${url} HTTP ${response.status}`);
    try { await response.body?.cancel(); } catch (cause) { error.cause = cause; }
    throw error;
  }
  try { return await response.json(); } catch { throw new Error(`bundled stage metadata invalid JSON at ${url}`); }
}
async function readBackendIdentity(runtime, sourceSha, topologyHash, fetcher) {
  if (!SHA.test(sourceSha || "")) throw new Error("bundled development backend source SHA required");
  const health = await requestJson(`${runtime.firebaseFunctionsBase}/readyz`, fetcher);
  if (!health || typeof health !== "object" || Array.isArray(health) || health.status !== "ok" || health.sourceSha !== sourceSha || health.exposure !== "public"
    || typeof health.topologyHash !== "string" || !/^[a-f0-9]{64}$/u.test(health.topologyHash) || topologyHash && health.topologyHash !== topologyHash) {
    throw new Error(`bundled development backend source/topology mismatch at ${runtime.firebaseFunctionsBase}/readyz`);
  }
  return health.topologyHash;
}
export async function verifyBundledStageBackend(runtime, sourceSha, topologyHash, fetcher = fetch) {
  const pinnedTopology = await readBackendIdentity(runtime, sourceSha, topologyHash, fetcher);
  for (const origin of ["https://orider-dev.web.app", "https://orider-dev.firebaseapp.com"]) {
    await verifyBundledRouteControl({ base: runtime.firebaseFunctionsBase, origin, fetcher });
    await verifyBundledCallable({ base: runtime.firebaseFunctionsBase, origin, name: "getActivityDiscovery", fetcher });
    await verifyBundledCallable({ base: runtime.firebaseFunctionsBase, origin, name: "socialAuthStart", fetcher });
    await verifyBundledCallable({ base: runtime.firebaseFunctionsBase, origin, name: "webHandoffRedeem", fetcher, requestHeaders: ["content-type"], responseContract: { status: 400, field: "status", value: "INVALID_ARGUMENT" } });
    await verifyBundledCallable({ base: runtime.aiApiBase, origin, name: "v1/activity-narrative", fetcher, requestBody: {}, responseContract: { status: 401, field: "code", value: "unauthenticated" } });
  }
  await verifyBundledHttpAliases({ base: runtime.firebaseFunctionsBase, fetcher });
  await verifyPublicClubApi(runtime, "https://orider-dev.web.app", fetcher);
  return readBackendIdentity(runtime, sourceSha, pinnedTopology, fetcher);
}
export async function prepareBundledStage({ workspace = process.cwd(), directory, backendSourceSha, frontendSourceSha, githubEnv, fetcher = fetch }) {
  workspace = resolve(workspace); directory = resolve(directory);
  assertSource(workspace, frontendSourceSha);
  if (directory === workspace || directory.startsWith(`${workspace}/`)) throw new Error("private preparation directory must be outside source");
  const source = await resolveProductionBuildFlags(await requestJson(`${PRODUCTION_ORIGIN}/runtime-config.json`, fetcher), fetcher);
  const runtime = bundledFunctionsConfig(source, "development");
  const topologyHash = await readBackendIdentity(runtime, backendSourceSha, undefined, fetcher);
  const hosting = bundledHostingConfig(json(resolve(workspace, "firebase.json")), "development");
  delete hosting.hosting.target;
  hosting.hosting.site = "orider-dev";
  hosting.hosting.predeploy = "node scripts/prepare-bundled-stage.mjs --phase verify";
  hosting.hosting.public = "dist";
  const hostingPath = resolve(workspace, "firebase.bundled-stage.json");
  mkdirSync(directory, { mode: 0o700 });
  save(resolve(directory, "source-runtime.json"), source);
  save(resolve(directory, "runtime-config.json"), runtime);
  save(hostingPath, hosting);
  const preparation = { schemaVersion: 1, mode: "bundled-development-client", frontendSourceSha, backendSourceSha, backendTopologyHash: topologyHash,
    workspace, artifactDirectory: resolve(workspace, "dist"), hostingPath,
    sourceRuntimeHash: hash(readFileSync(resolve(directory, "source-runtime.json"))),
    runtimeHash: hash(readFileSync(resolve(directory, "runtime-config.json"))), hostingHash: hash(readFileSync(hostingPath)) };
  save(resolve(directory, "preparation.json"), preparation);
  const buildEnv = { ...productionBuildEnv(runtime), VITE_SOCIAL_AUTH_FUNCTIONS_BASE: runtime.socialAuthFunctionsBase,
    ...Object.fromEntries(Object.entries(runtime).filter(([key, value]) => (key.endsWith("Enabled") || key === "activitySubscriptionsBackendReady") && typeof value === "boolean")
      .map(([key, value]) => [`VITE_${key.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toUpperCase()}`, String(value)])),
    BUNDLED_RUNTIME_CONFIG_PATH: resolve(directory, "source-runtime.json"), BUNDLED_FUNCTIONS_ENVIRONMENT: "development",
    BUNDLED_STAGE_DIRECTORY: directory, BUNDLED_STAGE_BACKEND_SOURCE_SHA: backendSourceSha };
  if (Object.values(buildEnv).some(value => /[\r\n]/u.test(value))) throw new Error("invalid bundled stage environment value");
  if (githubEnv) appendFileSync(githubEnv, Object.entries(buildEnv).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  assertSource(workspace, frontendSourceSha);
  return preparation;
}
function readPrepared(directory) {
  directory = resolve(directory);
  const prepared = json(resolve(directory, "preparation.json"));
  if (prepared.schemaVersion !== 1 || prepared.mode !== "bundled-development-client") throw new Error("bundled stage preparation required");
  assertSource(prepared.workspace, prepared.frontendSourceSha);
  const runtime = json(resolve(directory, "runtime-config.json"));
  const source = json(resolve(directory, "source-runtime.json"));
  if (hash(readFileSync(resolve(directory, "source-runtime.json"))) !== prepared.sourceRuntimeHash
    || hash(readFileSync(resolve(directory, "runtime-config.json"))) !== prepared.runtimeHash
    || hash(readFileSync(prepared.hostingPath)) !== prepared.hostingHash
    || !isDeepStrictEqual(runtime, bundledFunctionsConfig(source, "development"))) throw new Error("bundled stage prepared configuration changed");
  const hosting = json(prepared.hostingPath).hosting;
  if (hosting.site !== "orider-dev" || hosting.target || hosting.public !== "dist" || hosting.rewrites.some(rule => rule.function)) throw new Error("bundled stage Hosting boundary mismatch");
  return { directory, prepared, runtime };
}
export async function sealBundledStage(directory) {
  const state = readPrepared(directory), { prepared } = state;
  if (hash(readFileSync(resolve(prepared.artifactDirectory, "runtime-config.json"))) !== prepared.runtimeHash) throw new Error("built runtime differs from the prepared development profile");
  const entry = assertStageEntryArtifact(prepared.artifactDirectory);
  const productionEntry = assertStageEntryArtifact(prepared.artifactDirectory, "https://orider.co.kr");
  if (productionEntry !== entry) throw new Error("development and production must resolve the same Vite entry");
  const manifest = stageArtifactManifest(prepared.artifactDirectory);
  const receipt = { ...prepared, complete: true, entry, productionEntry, artifactManifest: manifest, artifactHash: hash(JSON.stringify(manifest)), verifiedAt: new Date().toISOString() };
  save(resolve(state.directory, "build.json"), receipt);
  return receipt;
}
export async function verifyBundledStage(directory, fetcher = fetch, { identityOnly = false } = {}) {
  const { prepared, runtime } = readPrepared(directory), receipt = json(resolve(directory, "build.json"));
  if (receipt.complete !== true || Object.entries(prepared).some(([key, value]) => !isDeepStrictEqual(receipt[key], value))
    || receipt.artifactHash !== hash(JSON.stringify(receipt.artifactManifest))) throw new Error("bundled stage build receipt mismatch");
  if (!identityOnly) {
    assertStageEntryArtifact(prepared.artifactDirectory);
    await verifyBundledStageBackend(runtime, prepared.backendSourceSha, prepared.backendTopologyHash, fetcher);
    assertStageArtifactManifest(prepared.artifactDirectory, receipt.artifactManifest);
  } else {
    await readBackendIdentity(runtime, prepared.backendSourceSha, prepared.backendTopologyHash, fetcher);
  }
  readPrepared(directory);
  return receipt;
}
async function main() {
  const args = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    if (!["--phase", "--directory", "--backend-source"].includes(key) || !process.argv[index + 1] || args[key]) throw new Error("invalid bundled stage arguments");
    args[key] = process.argv[index + 1];
  }
  const phase = args["--phase"], directory = args["--directory"] || process.env.BUNDLED_STAGE_DIRECTORY;
  if (!["prepare", "seal", "verify", "verify-identity"].includes(phase) || !directory) throw new Error("bundled stage phase/directory required");
  if (phase !== "prepare" && args["--backend-source"]) throw new Error("backend source is fixed by the preparation receipt");
  if (process.env.STAGE_FIREBASE_PROJECT_ID !== "orider-dev") throw new Error("bundled stage project must be orider-dev");
  const receipt = phase === "prepare" ? await prepareBundledStage({ directory,
    backendSourceSha: args["--backend-source"], frontendSourceSha: git(process.cwd(), "rev-parse", "HEAD"), githubEnv: process.env.GITHUB_ENV })
    : phase === "seal" ? await sealBundledStage(directory) : await verifyBundledStage(directory, fetch, { identityOnly: phase === "verify-identity" });
  console.log(JSON.stringify({ phase, frontendSourceSha: receipt.frontendSourceSha, backendSourceSha: receipt.backendSourceSha, backendTopologyHash: receipt.backendTopologyHash, complete: receipt.complete === true }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
