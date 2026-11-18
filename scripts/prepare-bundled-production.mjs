#!/usr/bin/env node
// 태그 릴리스의 정상 플래그에서 실행 주소만 선택한다. 개발 설정과 운영 리소스는 변경하지 않는다.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { classifyCallableProbe } from "./lib/social-callable-contract.mjs";
import { bundledFunctionsConfig, bundledHostingConfig } from "./lib/stage-production-parity.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
const head = workspace => execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
function assertSource(workspace, expected = head(workspace)) {
  if (head(workspace) !== expected || execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: workspace, encoding: "utf8" }).trim()) throw new Error("bundled production requires the pinned clean source");
  return expected;
}
async function health(runtime, fetcher, expected) {
  const response = await fetcher(`${runtime.firebaseFunctionsBase}/healthz`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error("bundled production gateway is unavailable"); }
  const value = await response.json();
  if (value.status !== "ok" || value.exposure !== "public" || !/^[a-f0-9]{40}$/u.test(value.sourceSha || "")
    || !/^[a-f0-9]{64}$/u.test(value.topologyHash || "")) throw new Error("bundled production gateway identity missing");
  const identity = { sourceSha: value.sourceSha, topologyHash: value.topologyHash };
  if (expected && !isDeepStrictEqual(expected, identity)) throw new Error("bundled production backend changed during frontend build");
  return identity;
}
export async function prepareBundledProduction({ source, workspace = process.cwd(), directory, githubEnv, fetcher = fetch, backendSourceSha, backendTopologyHash }) {
  workspace = resolve(workspace); directory = resolve(directory);
  if (source.deploymentProfile !== undefined || source.socialAuthFunctionsBase) throw new Error("production profile requires normal release flags, not a stage runtime");
  if (directory === workspace || directory.startsWith(`${workspace}/`)) throw new Error("private production preparation directory must be outside source");
  const frontendSourceSha = assertSource(workspace);
  const runtime = bundledFunctionsConfig(source, "production");
  if (!/^[a-f0-9]{40}$/u.test(backendSourceSha || "") || !/^[a-f0-9]{64}$/u.test(backendTopologyHash || "")) throw new Error("reviewed production backend source and topology pins required");
  const backend = await health(runtime, fetcher, { sourceSha: backendSourceSha, topologyHash: backendTopologyHash });
  const hosting = bundledHostingConfig(json(resolve(workspace, "firebase.json")), "production");
  delete hosting.hosting.target;
  hosting.hosting.site = "miranae-orider-g1";
  hosting.hosting.predeploy += " && node scripts/prepare-bundled-production.mjs --phase verify";
  const hostingPath = resolve(workspace, "firebase.bundled-production.json");
  mkdirSync(directory, { mode: 0o700 });
  save(resolve(directory, "source-runtime.json"), source);
  save(hostingPath, hosting);
  const receipt = { schemaVersion: 1, mode: "bundled-production-client", frontendSourceSha, workspace,
    sourceRuntimeHash: hash(readFileSync(resolve(directory, "source-runtime.json"))), hostingPath, hostingHash: hash(readFileSync(hostingPath)), backend };
  save(resolve(directory, "preparation.json"), receipt);
  const environment = { BUNDLED_PRODUCTION_DIRECTORY: directory, BUNDLED_RUNTIME_CONFIG_PATH: resolve(directory, "source-runtime.json"), BUNDLED_FUNCTIONS_ENVIRONMENT: "production" };
  if (Object.values(environment).some(value => /[\r\n]/u.test(value))) throw new Error("invalid production preparation path");
  if (githubEnv) appendFileSync(githubEnv, Object.entries(environment).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  return receipt;
}
export async function verifyBundledProduction(directory, fetcher = fetch) {
  directory = resolve(directory);
  const receipt = json(resolve(directory, "preparation.json"));
  assertSource(receipt.workspace, receipt.frontendSourceSha);
  if (receipt.schemaVersion !== 1 || receipt.mode !== "bundled-production-client" || head(receipt.workspace) !== receipt.frontendSourceSha
    || hash(readFileSync(resolve(directory, "source-runtime.json"))) !== receipt.sourceRuntimeHash
    || hash(readFileSync(receipt.hostingPath)) !== receipt.hostingHash) throw new Error("bundled production preparation changed");
  const expected = bundledFunctionsConfig(json(resolve(directory, "source-runtime.json")), "production");
  const actual = json(resolve(receipt.workspace, "dist/runtime-config.json"));
  if (!isDeepStrictEqual(actual, expected)) throw new Error("built production runtime differs from normal release flags");
  await health(expected, fetcher, receipt.backend);
  const manifest = json(new URL("./contracts/social-callables.json", import.meta.url));
  for (const { name } of manifest.callables) {
    const response = await fetcher(`${expected.firebaseFunctionsBase}/${name}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: {} }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) });
    let payload;
    try { payload = await response.json(); } catch { throw new Error(`bundled social callable ${name} returned invalid JSON`); }
    if (!classifyCallableProbe(response.status, payload).ok) throw new Error(`bundled social callable ${name} rejected its unauthenticated contract`);
  }
  await health(expected, fetcher, receipt.backend);
  if (hash(readFileSync(receipt.hostingPath)) !== receipt.hostingHash
    || !isDeepStrictEqual(json(resolve(receipt.workspace, "dist/runtime-config.json")), expected)) throw new Error("production output changed during verification");
  return receipt;
}
async function main() {
  const args = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    if (!["--phase", "--source", "--directory"].includes(key) || !process.argv[index + 1] || args[key]) throw new Error("invalid production preparation arguments");
    args[key] = process.argv[index + 1];
  }
  if (process.env.ORIDER_FUNCTIONS_TRANSPORT !== "production") throw new Error("explicit production bundled transport required");
  const phase = args["--phase"], directory = args["--directory"] || process.env.BUNDLED_PRODUCTION_DIRECTORY;
  if (!["prepare", "verify"].includes(phase) || !directory || phase === "prepare" && !args["--source"]
    || phase === "verify" && args["--source"]) throw new Error("production phase/source/directory required");
  const receipt = phase === "prepare" ? await prepareBundledProduction({ source: json(resolve(args["--source"])), directory, githubEnv: process.env.GITHUB_ENV, backendSourceSha: process.env.BUNDLED_BACKEND_SOURCE_SHA, backendTopologyHash: process.env.BUNDLED_BACKEND_TOPOLOGY_HASH })
    : await verifyBundledProduction(directory);
  console.log(JSON.stringify({ phase, frontendSourceSha: receipt.frontendSourceSha, backendSourceSha: receipt.backend.sourceSha, backendTopologyHash: receipt.backend.topologyHash }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
