#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stageProductionParityConfig, stageProductionParityBuildEnv } from "./lib/stage-production-parity.mjs";
import { readPinnedProductionRuntime } from "./lib/production-release-attestation.mjs";

const args = process.argv.slice(2);
const read = name => args[args.indexOf(name) + 1];
const sourceSha = args.includes("--source-sha") ? read("--source-sha") : "";
const directory = args.includes("--out") ? resolve(read("--out")) : "";
if (!/^[a-f0-9]{40}$/.test(sourceSha) || !directory) throw new Error("--source-sha <production SHA> and --out <private directory> required");
// 배포 도구 수정과 운영 앱 버전을 분리한다. 미출시 앱 코드는 섞지 않는다.
const transportPaths = [
  "src/services/runtimeConfig.ts", "src/services/firebase.ts", "src/embedded/embeddedFirebase.ts",
  "src/services/activityDiscovery.ts", "src/services/friendInvitePreview.ts", "src/services/nativeActivityPhoto.ts",
  "src/services/accountDeletion.ts", "src/services/activityMapPrivacy.ts", "src/services/activitySocialFunctions.ts",
  "src/services/publicActivityMaps.ts", "src/services/webNotifications.ts", "src/services/publicActivityDetail.ts",
  "src/features/group/groupCalendar.ts", "src/features/board/useBoardBlocks.ts", "src/services/analysisCapability.ts",
  "src/services/personalDataApi.ts", "src/services/canonicalApi.ts",
];
const allowedTools = ["firebase.stage.json", "docs/STAGE_PRODUCTION_PARITY.md", "scripts/check-isolated-stage.mjs",
  "scripts/lib/isolated-stage-config.mjs", "scripts/lib/public-club-deploy-config.mjs", "scripts/lib/stage-production-parity.mjs",
  "scripts/lib/production-release-attestation.mjs", "scripts/prepare-stage-production-parity.mjs", "scripts/write-runtime-config.mjs",
  "scripts/write-runtime-config.test.mjs"];
const changed = execFileSync("git", ["diff", "--name-only", sourceSha], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).trim();
if (untracked) throw new Error(`untracked build inputs are not allowed: ${untracked}`);
const unexpected = changed.filter(path => !transportPaths.includes(path) && !allowedTools.includes(path) && !/^src\/.*\.test\.tsx?$/.test(path));
if (unexpected.length) throw new Error(`application source differs from pinned production: ${unexpected.join(", ")}`);
const transportPatch = execFileSync("git", ["diff", sourceSha, "--", ...transportPaths], { encoding: "utf8" });
const { source, release } = await readPinnedProductionRuntime(sourceSha);
const runtime = stageProductionParityConfig(source, { sourceSha, hostingVersion: release.version });
mkdirSync(directory, { recursive: true, mode: 0o700 });
const sourcePath = resolve(directory, "production-runtime-config.json");
const write = (name, value) => writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
write("production-runtime-config.json", source);
write("runtime-config.json", runtime);
write("production-release.json", release);
const buildEnv = { ...stageProductionParityBuildEnv(source), STAGE_PARITY_PRODUCTION_RUNTIME_PATH: sourcePath, PRODUCTION_RUNTIME_CONFIG_PATH: "",
  STAGE_PARITY_SOURCE_SHA: sourceSha, STAGE_PARITY_HOSTING_VERSION: release.version };
write("build-env.json", buildEnv);
write("preparation.json", {
  sourceSha, preparedAt: new Date().toISOString(),
  transportPatchFiles: changed.filter(path => transportPaths.includes(path)),
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
