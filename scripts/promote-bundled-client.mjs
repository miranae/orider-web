#!/usr/bin/env node
// 검증한 개발 산출물 전체를 재사용하고 실행 주소만 운영으로 바꾼다. 빌드는 하지 않는다.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { stageArtifactManifest } from "./lib/stage-artifact-manifest.mjs";
import { bundledFunctionsConfig, bundledHostingConfig } from "./lib/bundled-functions-config.mjs";
import { verifyBundledCallable } from "./lib/bundled-callable-probe.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const sha = /^[a-f0-9]{40}$/u, digest = /^[a-f0-9]{64}$/u;

export { validateArchivedCandidate as validateCandidateRun } from "./hosting-candidate-archive.mjs";
import { validateArchivedCandidate as validateCandidateRun } from "./hosting-candidate-archive.mjs";

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
/** squash 병합도 같은 Git tree라면 검증한 소스를 그대로 승격한다. */
export function assertReviewedSource(workspace, frontendSourceSha) {
  if (!sha.test(frontendSourceSha || "")) throw new Error("candidate source SHA required");
  const git = (...args) => execFileSync("git", args, { cwd: workspace, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const tree = git("rev-parse", `${frontendSourceSha}^{tree}`);
  const commits = git("log", "--format=%H %T", "origin/main").split("\n");
  const reviewedMainSha = commits.find(line => line.endsWith(` ${tree}`))?.split(" ")[0];
  if (reviewedMainSha) return reviewedMainSha;
  try { git("merge-base", "--is-ancestor", frontendSourceSha, "origin/main"); return frontendSourceSha; }
  catch { throw new Error("candidate source is not reviewed main history or an identical reviewed tree"); }
}
export function prepareClientPromotion({ archive, workspace = process.cwd(), directory, run, artifact, attempt, toolingSourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() }) {
  const frontendSourceSha = validateCandidateRun(run, artifact, attempt);
  if (!sha.test(toolingSourceSha)) throw new Error("tooling source SHA required");
  archive = resolve(archive); workspace = resolve(workspace); directory = resolve(directory);
  const reviewedMainSha = assertReviewedSource(workspace, frontendSourceSha);
  const receipts = findFiles(archive, "build.json"), configs = findFiles(archive, "firebase.bundled-stage.json");
  if (receipts.length !== 1 || configs.length !== 1) throw new Error("one sealed development client artifact required");
  const candidate = json(receipts[0]), sourceDist = join(dirname(configs[0]), "dist");
  if (candidate.schemaVersion !== 1 || candidate.mode !== "bundled-development-client" || candidate.complete !== true
    || candidate.frontendSourceSha !== frontendSourceSha || !sha.test(candidate.backendSourceSha || "") || !digest.test(candidate.backendTopologyHash || "")
    || candidate.artifactHash !== artifact.artifactHash || candidate.artifactHash !== hash(JSON.stringify(candidate.artifactManifest))
    || !isDeepStrictEqual(stageArtifactManifest(sourceDist), candidate.artifactManifest)
    || hash(readFileSync(configs[0])) !== candidate.hostingHash) throw new Error("sealed development artifact source/files mismatch");
  const candidateRuntime = json(join(sourceDist, "runtime-config.json"));
  if (candidateRuntime.deploymentProfile !== "bundled-development"
    || hash(readFileSync(join(sourceDist, "runtime-config.json"))) !== candidate.runtimeHash
    || !candidate.artifactManifest.some(([path]) => path === "index.html")) throw new Error("sealed development runtime/entry mismatch");
  // The Vite shell uses root-relative assets. A base element can redirect them
  // to the development origin when the same HTML is published to production.
  const html = readFileSync(join(sourceDist, "index.html"), "utf8");
  if (/<base(?:[\t\n\f\r />]|$)/iu.test(html)) {
    throw new Error("development entry HTML must not set a base URL");
  }
  const entry = candidate.entry ?? html.match(/\bsrc\s*=\s*(["'])\/(assets\/index-[A-Za-z0-9_-]+\.js)\1/u)?.[2];
  if (!/^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(entry ?? "") || !candidate.artifactManifest.some(([path]) => path === entry)) {
    throw new Error("verified Vite entry is missing from the development artifact");
  }
  const runtime = bundledFunctionsConfig(candidateRuntime, "production");
  const hosting = bundledHostingConfig(json(configs[0]), "production");
  if (hosting.hosting.site !== "orider-dev" || hosting.hosting.public !== "dist" || hosting.hosting.target) throw new Error("development Hosting identity mismatch");
  hosting.hosting.site = "miranae-orider-g1";
  delete hosting.hosting.predeploy;
  if (existsSync(join(workspace, "dist")) || existsSync(directory)) throw new Error("promotion requires fresh output directories");
  mkdirSync(directory, { recursive: true });
  cpSync(sourceDist, join(workspace, "dist"), { recursive: true });
  writeFileSync(join(workspace, "dist/runtime-config.json"), JSON.stringify(runtime, null, 2) + "\n");
  const expected = candidate.artifactManifest.map(([path, value]) => [path, path === "runtime-config.json" ? hash(readFileSync(join(workspace, "dist", path))) : value]);
  save(join(workspace, "firebase.bundled-production.json"), hosting);
  const receipt = { schemaVersion: 1, mode: "bundled-client-promotion", frontendSourceSha, toolingSourceSha, reviewedMainSha,
    candidateRunId: run.id, candidateRunAttempt: run.run_attempt,
    candidateRunValidation: run.kind || "github-successful-run",
    candidateArchive: { bucket: artifact.bucket, object: artifact.object, generation: artifact.generation, sha256: artifact.sha256 },
    backend: { sourceSha: candidate.backendSourceSha, topologyHash: candidate.backendTopologyHash },
    originalArtifactHash: candidate.artifactHash, artifactManifest: expected, runtime,
    hostingHash: hash(readFileSync(join(workspace, "firebase.bundled-production.json"))), entry, rebuilt: false };
  save(join(directory, "promotion.json"), receipt);
  return receipt;
}
async function fetchPromotionResource(url, fetcher) {
  try {
    return await fetcher(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  } catch (cause) {
    throw new Error(`Hosting promotion GET transport failed at ${url}`, { cause });
  }
}

async function rejectPromotionResponse(response, message) {
  const error = new Error(message);
  try { await response.body?.cancel(); }
  catch (cause) { error.cause = cause; }
  throw error;
}

async function verifyGatewayReadiness(url, fetcher) {
  const response = await fetchPromotionResource(url, fetcher);
  if (!response.ok) return rejectPromotionResponse(response, `production gateway unavailable at ${url}: HTTP${response.status}`);
  let ready;
  try { ready = await response.json(); }
  catch (cause) { throw new Error(`production gateway GET response body is invalid at ${url}`, { cause }); }
  if (ready?.status !== "ok") throw new Error(`production gateway is not ready at ${url}`);
}

export async function verifyClientPromotion(options, fetcher = fetch) {
  const receipt = json(join(options.directory, "promotion.json"));
  // Check reachability and the login callable for the production browser origin.
  await Promise.all([
    verifyGatewayReadiness(`${receipt.runtime.firebaseFunctionsBase}/readyz`, fetcher),
    verifyBundledCallable({
      base: receipt.runtime.socialAuthFunctionsBase, origin: "https://orider.co.kr", name: "socialAuthStart", fetcher,
      responseContract: [
        { status: 400, field: "status", value: "INVALID_ARGUMENT" },
        { status: 401, field: "status", value: "UNAUTHENTICATED" },
      ],
    }),
  ]);
  return receipt;
}
export async function verifyPublishedPromotion({ directory, origin = "https://orider.co.kr" }, fetcher = fetch) {
  const receipt = json(join(directory, "promotion.json")), expected = new Map(receipt.artifactManifest);
  // Check the previously validated Vite entry in parallel with the shell and sitemap.
  await Promise.all(["index.html", "runtime-config.json", receipt.entry, "sitemap.xml"].map(async path => {
    const url = new URL(path === "index.html" ? "/" : `/${path}`, origin); url.searchParams.set("promotion", receipt.frontendSourceSha);
    const response = await fetchPromotionResource(url, fetcher);
    if (!response.ok) return rejectPromotionResponse(response, `published ${url} HTTP${response.status}`);
    if (path === "sitemap.xml") {
      if (!/^(?:application|text)\/xml(?:;|$)/iu.test(response.headers.get("content-type") ?? "")) {
        return rejectPromotionResponse(response, `published sitemap alias did not return XML at ${url}`);
      }
      try { await response.body?.cancel(); }
      catch (cause) { throw new Error(`published sitemap GET response could not be closed at ${url}`, { cause }); }
      return;
    }
    const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (path === receipt.entry && !["application/javascript", "text/javascript"].includes(mime)) {
      return rejectPromotionResponse(response, `published entry did not return JavaScript at ${url}`);
    }
    let bytes;
    try { bytes = Buffer.from(await response.arrayBuffer()); }
    catch (cause) { throw new Error(`published GET response body could not be read at ${url}`, { cause }); }
    if (hash(bytes) !== expected.get(path)) throw new Error(`published ${path} differs from prepared artifact`);
  }));
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
  else if (args["--phase"] === "published") receipt = await verifyPublishedPromotion(options);
  else throw new Error("prepare/verify/published phase required");
  console.log(JSON.stringify({ phase: args["--phase"], frontendSourceSha: receipt.frontendSourceSha, backend: receipt.backend, candidateRunId: receipt.candidateRunId, rebuilt: false }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
