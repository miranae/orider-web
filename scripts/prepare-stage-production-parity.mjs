#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stageProductionParityConfig, stageProductionParityBuildEnv } from "./lib/stage-production-parity.mjs";

const args = process.argv.slice(2);
const read = name => args[args.indexOf(name) + 1];
const sourceSha = args.includes("--source-sha") ? read("--source-sha") : "";
const directory = args.includes("--out") ? resolve(read("--out")) : "";
if (!/^[a-f0-9]{40}$/.test(sourceSha) || !directory) throw new Error("--source-sha <production SHA> and --out <private directory> required");
// 배포 도구 수정과 운영 앱 버전을 분리한다. 미출시 앱 코드는 섞지 않는다.
const sourcePaths = ["src", "shared", "public", "package.json", "package-lock.json", "vite.config.ts"];
const changed = execFileSync("git", ["diff", "--name-only", sourceSha, "--", ...sourcePaths], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const transportPaths = ["src/services/runtimeConfig.ts", "src/services/runtimeConfig.stage.test.ts"];
if (changed.some(path => !transportPaths.includes(path))) throw new Error(`application source differs from pinned production: ${changed.join(", ")}`);
const transportPatch = execFileSync("git", ["diff", sourceSha, "--", ...transportPaths], { encoding: "utf8" });
const response = await fetch("https://orider.co.kr/runtime-config.json", { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error(`production runtime snapshot unavailable: ${response.status}`);
const source = await response.json();
const runtime = stageProductionParityConfig(source);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const sourcePath = resolve(directory, "production-runtime-config.json");
const write = (name, value) => writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
write("production-runtime-config.json", source);
write("runtime-config.json", runtime);
const buildEnv = { ...stageProductionParityBuildEnv(source), STAGE_PARITY_PRODUCTION_RUNTIME_PATH: sourcePath, PRODUCTION_RUNTIME_CONFIG_PATH: "" };
write("build-env.json", buildEnv);
write("preparation.json", {
  sourceSha, preparedAt: new Date().toISOString(),
  transportPatchFiles: changed,
  transportPatchSha256: createHash("sha256").update(transportPatch).digest("hex"),
  sourceRuntimeSha256: createHash("sha256").update(JSON.stringify(source)).digest("hex"),
  stageRuntimeSha256: createHash("sha256").update(JSON.stringify(runtime)).digest("hex"),
  dataProject: runtime.firebaseProjectId, computeProject: "orider-dev",
  sharedProductionWrites: true,
  oauthAcceptance: "Canonical proxy allows the development returnOrigin; live user consent/token exchange requires separate verification",
});
if (args.includes("--build")) {
  const env = { ...process.env, ...buildEnv };
  delete env.SENTRY_AUTH_TOKEN;
  execFileSync("npm", ["run", "build"], { env, stdio: "inherit" });
  execFileSync(process.execPath, ["scripts/write-runtime-config.mjs"], { env, stdio: "inherit" });
  const html = readFileSync("dist/index.html", "utf8");
  const entry = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!entry) throw new Error("built entry not found");
  write("build.json", {
    sourceSha, builtAt: new Date().toISOString(), entry,
    entrySha256: createHash("sha256").update(readFileSync(resolve("dist", entry))).digest("hex"),
    runtimeSha256: createHash("sha256").update(readFileSync("dist/runtime-config.json")).digest("hex"),
  });
}
console.log(`[stage-production-parity] prepared production source ${sourceSha}; shared production data, development compute; no deployment performed`);
