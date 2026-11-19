import { PUBLIC_CLUB_ENDPOINT, publicClubEndpoint, withPublicClubEndpoint, verifyPublicClubApi } from "./lib/public-club-deploy-config.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, rmSync, writeFileSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { productionDataConfig, productionBuildEnv, resolveProductionBuildFlags, verifyProductionDataCors } from "./lib/production-data-config.mjs";
import { bundledFunctionsConfig, bundledHostingConfig, BUNDLED_FUNCTIONS, BUNDLED_AI } from "./lib/bundled-functions-config.mjs";
import { stageProductionParityConfig, stageProductionParityBuildEnv, STAGE_FUNCTIONS, STAGE_AI_API, STAGE_PERSONAL_API } from "./lib/stage-production-parity.mjs";
import { readPinnedProductionRuntime, checkedJsonFetch } from "./lib/production-release-attestation.mjs";
import { stageArtifactManifest, verifyStageArtifacts } from "./lib/stage-artifact-manifest.mjs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const requiredEnv = {
  VITE_FIREBASE_API_KEY: "api-key", VITE_FIREBASE_AUTH_DOMAIN: "auth.example", VITE_FIREBASE_PROJECT_ID: "project",
  VITE_FIREBASE_APP_ID: "app", VITE_APPCHECK_RECAPTCHA_SITE_KEY: "site", VITE_STRAVA_CLIENT_ID: "strava",
  VITE_STRAVA_REDIRECT_URI: "https://example.test/callback", VITE_MAPBOX_TOKEN: "map", VITE_ORIDER_AI_API_BASE: "https://ai.example",
};

function render(extraEnv = {}, stripBundledEnvironment = false) {
  const directory = mkdtempSync(join(tmpdir(), "orider-runtime-config-"));
  const output = join(directory, "runtime-config.json");
  try {
    execFileSync(stripBundledEnvironment ? "env" : process.execPath, [...(stripBundledEnvironment ? ["-u", "BUNDLED_RUNTIME_CONFIG_PATH", "-u", "BUNDLED_FUNCTIONS_ENVIRONMENT", process.execPath] : []), "scripts/write-runtime-config.mjs", "--out", output], {
      cwd: process.cwd(), env: { ...process.env, ...requiredEnv, ...extraEnv }, stdio: "pipe",
    });
    return JSON.parse(readFileSync(output, "utf8"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("writes the G1 workout delivery runtime gate default-off and opt-in true", () => {
  assert.equal(render().riderWorkoutDeliveryEnabled, false);
  assert.equal(render({ VITE_RIDER_WORKOUT_DELIVERY_ENABLED: "true" }).riderWorkoutDeliveryEnabled, true);
});

test("writes the canonical consumer gates default-off and opt-in true", () => {
  const defaults = render();
  for (const key of [
    "trainingDecisionCanonicalEnabled",
    "canonicalConsumersEnabled",
    "canonicalWeatherEnabled",
    "canonicalCourseEnabled",
    "canonicalMaintenanceEnabled",
    "canonicalMilestonesEnabled",
    "canonicalRolloutEnabled",
  ]) {
    assert.equal(defaults[key], false, `${key} must default to false`);
  }
  assert.equal(render({ VITE_CANONICAL_ROLLOUT_ENABLED: "true" }).canonicalRolloutEnabled, true);
  assert.equal(render({ VITE_CANONICAL_MILESTONES: "true" }).canonicalMilestonesEnabled, true);
});

/**
 * 런타임이 읽는 이름과 배포 산출물이 쓰는 이름이 갈리면, 플래그를 켜도 화면은 꺼진 채로 남는다
 * (2026-09-07: canonical 소비 플래그 6개가 writer 에 없어 운영에서 영원히 undefined 였다).
 * 두 파일에서 `VITE_*` 불리언 이름을 뽑아 집합으로 대조한다.
 */
test("boolean VITE flags read at runtime are all emitted by the writer", () => {
  const reader = readFileSync("src/services/runtimeConfig.ts", "utf8");
  const writer = readFileSync("scripts/write-runtime-config.mjs", "utf8");
  // 빌드 시점에만 의미가 있는 스위치 — runtime-config.json 에 실릴 값이 아니다.
  const buildOnly = new Set(["VITE_USE_BUILD_ENV_FALLBACK", "VITE_REQUIRE_BUNDLED_RUNTIME"]);
  const readerFlags = new Set(
    [...reader.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+) === "true"/g)]
      .map((m) => m[1])
      .filter((flag) => !buildOnly.has(flag)),
  );
  const writerFlags = new Set(
    [...writer.matchAll(/readBoolEnv\("(VITE_[A-Z0-9_]+)"\)/g)].map((m) => m[1]),
  );
  const missingInWriter = [...readerFlags].filter((flag) => !writerFlags.has(flag)).sort();
  const missingInReader = [...writerFlags].filter((flag) => !readerFlags.has(flag)).sort();
  assert.deepEqual(missingInWriter, [], `writer never emits: ${missingInWriter.join(", ")}`);
  assert.deepEqual(missingInReader, [], `runtime never reads: ${missingInReader.join(", ")}`);
});

test("writes coordinated activity analysis expansion gate default-off and only exact true opts in", () => {
  for (const value of ["", "false", "1", "TRUE"]) assert.equal(render({ VITE_ACTIVITY_ANALYSIS_EXPANSION_ENABLED: value }).activityAnalysisExpansionEnabled, false);
  assert.equal(render({ VITE_ACTIVITY_ANALYSIS_EXPANSION_ENABLED: "true" }).activityAnalysisExpansionEnabled, true);
});

test("development uses the pinned production runtime instead of an independent activity analysis flag", () => {
  const stage = readFileSync(".github/workflows/deploy-stage.yml", "utf8");
  const production = readFileSync(".github/workflows/deploy.yml", "utf8");
  assert.match(stage, /PRODUCTION_RUNTIME_CONFIG_PATH:/);
  assert.match(production, /VITE_ACTIVITY_ANALYSIS_EXPANSION_ENABLED: \$\{\{ vars\.VITE_ACTIVITY_ANALYSIS_EXPANSION_ENABLED \}\}/);
});

const isolatedStage = {
  VITE_MODE: "stage", VITE_FIREBASE_PROJECT_ID: "miranae-orider-g1", VITE_FIREBASE_AUTH_DOMAIN: "miranae-orider-g1.firebaseapp.com",
  VITE_FIREBASE_STORAGE_BUCKET: "miranae-orider-g1.firebasestorage.app", VITE_FIREBASE_APP_ID: "1:289663940841:web:ba08cdae154286e6499878",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "289663940841", VITE_FIREBASE_FUNCTIONS_REGION: "asia-northeast3", VITE_FIREBASE_FUNCTIONS_BASE: "https://asia-northeast3-orider-dev.cloudfunctions.net",
  VITE_STRAVA_CLIENT_ID: "", VITE_STRAVA_REDIRECT_URI: "", VITE_ORIDER_AI_API_BASE: "",
  VITE_ORIDER_PERSONAL_API_BASE: "", VITE_SEGMENT_TILES_BASE: "", VITE_USE_EMULATORS: "false",
};
test("writes isolated stage without enabling unavailable production providers", () => {
  const config = render(isolatedStage);
  assert.equal(config.appEnvironment, "stage");
  assert.equal(config.firebaseProjectId, "miranae-orider-g1");
  assert.equal(config.firebaseFunctionsBase, "https://asia-northeast3-orider-dev.cloudfunctions.net");
  assert.equal(config.aiApiBase, undefined);
  assert.equal(config.socialAuthFunctionsBase, undefined);
});
test("Stage canonical Auth opt-in is explicit, exact and absent in normal production", () => {
  const endpoint = "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net";
  const config = render({ ...isolatedStage, VITE_SOCIAL_AUTH_FUNCTIONS_BASE: endpoint });
  assert.equal(config.socialAuthFunctionsBase, endpoint);
  assert.equal(config.firebaseFunctionsBase, isolatedStage.VITE_FIREBASE_FUNCTIONS_BASE);
  assert.throws(() => render({ VITE_SOCIAL_AUTH_FUNCTIONS_BASE: endpoint }));
  for (const value of [endpoint + ".evil.example", endpoint + "/other", "https://asia-northeast3-orider-dev.cloudfunctions.net"]) {
    assert.throws(() => render({ ...isolatedStage, VITE_SOCIAL_AUTH_FUNCTIONS_BASE: value }));
  }
  const workflow = readFileSync(".github/workflows/deploy-stage.yml", "utf8");
  assert.doesNotMatch(workflow, /STAGE_VITE_SOCIAL_AUTH_FUNCTIONS_BASE/);
});
test("rejects fixture data Firebase or production callable services in stage output", () => {
  for (const extra of [{ VITE_FIREBASE_PROJECT_ID: "orider-dev" }, { VITE_FIREBASE_STORAGE_BUCKET: "orider-dev.firebasestorage.app" }, { VITE_ORIDER_AI_API_BASE: "https://orider-ai-api-h5zqzw3n4a-du.a.run.app" }]) {
    assert.throws(() => render({ ...isolatedStage, ...extra }));
  }
});

test("training period capability defaults off and development copies the production snapshot", () => {
  for (const value of ["", "false", "1", "TRUE"]) assert.equal(render({ VITE_TRAINING_ANALYSIS_PERIODS_ENABLED: value }).trainingAnalysisPeriodsEnabled, false);
  assert.equal(render({ VITE_TRAINING_ANALYSIS_PERIODS_ENABLED: "true" }).trainingAnalysisPeriodsEnabled, true);
  const stage = readFileSync(new URL("../.github/workflows/deploy-stage.yml", import.meta.url), "utf8");
  assert.match(stage, /prepare-production-data-runtime\.mjs/);
});

function productionFixture() {
  return {
    firebaseApiKey: "public-api-key", appCheckRecaptchaSiteKey: "public-appcheck-key", stravaClientId: "test-client", mapboxToken: "public-map-token",
    appEnvironment: "production", firebaseProjectId: "miranae-orider-g1", firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com",
    firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app", firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878",
    firebaseMessagingSenderId: "289663940841", firebaseFunctionsRegion: "asia-northeast3",
    stravaRedirectUri: "https://orider-strava.web.app/strava/callback", aiApiBase: "https://orider-ai-api-h5zqzw3n4a-du.a.run.app",
    activityAnalysisExpansionEnabled: true, canonicalRolloutEnabled: false,
    activitySubscriptionsEnabled: true, activitySubscriptionsBackendReady: true, futureFeatureEnabled: true,
  };
}

test("stage parity preserves production data and every flag while routing execution to development", () => {
  const source = productionFixture();
  const stage = stageProductionParityConfig(source);
  for (const [key, value] of Object.entries(source)) {
    if (key.endsWith("Enabled") || key === "activitySubscriptionsBackendReady" || key.startsWith("firebase") && !["firebaseFunctionsBase"].includes(key)) assert.equal(stage[key], value, key);
  }
  assert.equal(stage.appEnvironment, "production");
  assert.equal(stage.deploymentProfile, "production-parity-stage");
  assert.equal(stage.firebaseFunctionsBase, STAGE_FUNCTIONS);
  assert.equal(stage.aiApiBase, STAGE_AI_API);
  assert.equal(stage.personalApiBase, STAGE_PERSONAL_API);
  assert.equal(stage.publicClubApiUrl, `${STAGE_FUNCTIONS}/publicClubs`);
  assert.equal(stage.socialAuthFunctionsBase, "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net");
  assert.equal(stage.stravaRedirectUri, source.stravaRedirectUri);
  assert.equal(source.appEnvironment, "production");
  const env = stageProductionParityBuildEnv(source);
  assert.equal(env.VITE_MODE, "production");
  assert.equal(env.VITE_FIREBASE_FUNCTIONS_BASE, STAGE_FUNCTIONS);
  assert.equal(env.VITE_ACTIVITY_ANALYSIS_EXPANSION_ENABLED, "true");
  assert.equal(env.VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED, "true");
  assert.equal(env.VITE_CANONICAL_ROLLOUT_ENABLED, "false");
  for (const patch of [{ appEnvironment: "stage" }, { firebaseProjectId: "orider-dev" }, { useEmulators: true }]) assert.throws(() => stageProductionParityConfig({ ...source, ...patch }));
});

test("stage parity runtime writer ignores conflicting local and production routes", () => {
  const directory = mkdtempSync(join(tmpdir(), "orider-stage-parity-"));
  try {
    const source = join(directory, "source.json"), output = join(directory, "runtime.json");
    writeFileSync(source, JSON.stringify(productionFixture()));
    execFileSync(process.execPath, ["scripts/write-runtime-config.mjs", "--out", output], {
      env: { ...process.env, STAGE_PARITY_PRODUCTION_RUNTIME_PATH: source, STAGE_PARITY_SOURCE_SHA: "a".repeat(40), STAGE_PARITY_HOSTING_VERSION: "sites/miranae-orider-g1/versions/abc", VITE_MODE: "production", VITE_FIREBASE_FUNCTIONS_BASE: "https://evil.example" }, stdio: "pipe",
    });
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), stageProductionParityConfig(productionFixture(), {sourceSha:"a".repeat(40),hostingVersion:"sites/miranae-orider-g1/versions/abc"}));
    for (const conflicting of [{ env: { PRODUCTION_RUNTIME_CONFIG_PATH: source }, args: [] }, { env: {}, args: ["--production-source", source] }]) {
      assert.throws(() => execFileSync(process.execPath, ["scripts/write-runtime-config.mjs", "--out", output, ...conflicting.args], {
        env: { ...process.env, STAGE_PARITY_PRODUCTION_RUNTIME_PATH: source, ...conflicting.env }, stdio: "pipe",
      }), /mutually exclusive/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("parity source attestation rejects modified entry HTML and untracked build inputs before reading cloud state", () => {
  const directory = mkdtempSync(join(tmpdir(), "orider-stage-source-"));
  try {
    const git = args => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: directory, encoding: "utf8", stdio: "pipe" });
    git(["init"]); writeFileSync(join(directory, "index.html"), "production entry"); writeFileSync(join(directory, "firebase.stage.json"), "{}"); git(["add", "."]);
    git(["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "fixture"]);
    const sha = git(["rev-parse", "HEAD"]).trim();
    const run = () => execFileSync(process.execPath, [join(process.cwd(), "scripts/prepare-stage-production-parity.mjs"), "--source-sha", sha, "--reviewed-head", sha, "--out", directory + "-output"], { cwd: directory, stdio: "pipe" });
    writeFileSync(join(directory, "index.html"), "unreleased entry");
    assert.throws(run, /reviewed source HEAD, clean state or transport patch changed/);
    git(["checkout", "--", "index.html"]); writeFileSync(join(directory, "injected.js"), "unreleased input");
    assert.throws(run, /untracked build inputs.*injected.js/s);
    rmSync(join(directory,"injected.js")); writeFileSync(join(directory,"firebase.stage.json"),"changed allowed path");
    assert.throws(run, /reviewed source HEAD, clean state or transport patch changed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("parity runtime binds live bytes to a successful production SHA and unchanged Hosting version", async () => {
  const sha = "a".repeat(40), runtime = JSON.stringify(productionFixture()), html = '<script src="/assets/index-fixture.js"></script>', asset = "production bundle";
  const files = { "/runtime-config.json": runtime, "/index.html": html, "/assets/index-fixture.js": asset };
  const release = { version: "sites/miranae-orider-g1/versions/abc", releaseTime: "2026-11-17T00:01:00Z",
    fileHashes: Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, createHash("sha256").update(gzipSync(bytes, { level: 9 })).digest("hex")])) };
  const deployment = { sourceSha: sha, startedAt: "2026-11-17T00:00:00Z", succeededAt: "2026-11-17T00:02:00Z" };
  const options = { readRelease: async () => release, readDeployment: async () => deployment,
    readFile: async path => ({ raw: gzipSync(files[path], { level: 9 }), body: Buffer.from(files[path]) }) };
  const actual = await readPinnedProductionRuntime(sha, options);
  assert.deepEqual(actual.source, productionFixture()); assert.equal(actual.release.version, release.version);
  await assert.rejects(readPinnedProductionRuntime("b".repeat(40), options), /does not bind/);
  await assert.rejects(readPinnedProductionRuntime(sha, { ...options, readFile: async () => ({ raw: Buffer.from("{}"), body: Buffer.from("{}") }) }), /pinned Hosting version|entry missing/);
  let calls = 0;
  await assert.rejects(readPinnedProductionRuntime(sha, { ...options, readRelease: async () => ++calls === 1 ? release : { ...release, version: "other" } }), /Hosting changed/);
  const original = console.error, events = [];
  console.error = value => events.push(JSON.parse(value));
  try {
    await assert.rejects(checkedJsonFetch("read-production-runtime-config", "https://orider.co.kr/runtime-config.json", {}, async () => { throw new TypeError("network unavailable"); }), /read-production-runtime-config failed/);
    await assert.rejects(checkedJsonFetch("read-production-runtime-config", "https://orider.co.kr/runtime-config.json", {}, async () => new Response("invalid json")), /read-production-runtime-config failed/);
    assert.equal(events.length, 2); assert.ok(events.every(event => event.operation === "read-production-runtime-config" && event.target === "https://orider.co.kr/runtime-config.json"));
    assert.ok(events.every(event => !Object.keys(event).some(key => /token|header|body/i.test(key))));
  } finally { console.error = original; }
});

test("pins production read/write routes and all flags through runtime writer despite conflicting stage env", () => {
  const directory = mkdtempSync(join(tmpdir(), "orider-production-data-"));
  try {
    const source = join(directory, "source.json"), output = join(directory, "runtime-config.json");
    writeFileSync(source, JSON.stringify(productionFixture()));
    execFileSync(process.execPath, ["scripts/write-runtime-config.mjs", "--production-source", source, "--out", output], {
      env: { ...process.env, ...isolatedStage, VITE_ACTIVITY_ANALYSIS_EXPANSION_ENABLED: "false" }, stdio: "pipe",
    });
    const actual = JSON.parse(readFileSync(output, "utf8"));
    assert.deepEqual(actual, productionDataConfig(productionFixture()));
    assert.equal(actual.personalApiBase, "https://orider.co.kr");
    assert.equal(actual.futureFeatureEnabled, true);
    assert.equal(actual.activityAnalysisExpansionEnabled, true);
    assert.deepEqual(JSON.parse(readFileSync(source, "utf8")), productionFixture());
    const env = productionBuildEnv(actual);
    assert.equal(env.VITE_MODE, "production");
    assert.equal(env.VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED, "true");
    assert.equal(env.VITE_ACTIVITY_SUBSCRIPTIONS_BACKEND_READY, "true");
    assert.equal(env.VITE_FIREBASE_FUNCTIONS_BASE, "");
    assert.equal(env.VITE_CANONICAL_ROLLOUT_ENABLED, "false");
    assert.equal(env.VITE_SOCIAL_AUTH_FUNCTIONS_BASE, "");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("production snapshot rejects fixture projects, QA endpoints, base paths and env injection", () => {
  for (const patch of [
    { appEnvironment: "stage" }, { firebaseProjectId: "orider-dev" }, { useEmulators: true },
    { firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" },
    { aiApiBase: "https://orider-ai-api-qa-firstpass-ldfyfyx5da-du.a.run.app" },
    { personalApiBase: "https://orider.co.kr/other" }, { personalApiBase: "https://orider.co.kr?x=1" },
    { personalApiBase: "https://orider.co.kr.evil.example" }, { aiApiBase: "https://orider-ai-api-h5zqzw3n4a-du.a.run.app/path" },
    { canonicalRolloutEnabled: "true" }, { mapboxToken: "public\nINJECTED=true" },
  ]) assert.throws(() => productionDataConfig({ ...productionFixture(), ...patch }));
});

test("legacy subscription flags require the reviewed entry and chunk hashes, never missing=false", async () => {
  const source = productionFixture(); delete source.activitySubscriptionsEnabled; delete source.activitySubscriptionsBackendReady;
  assert.throws(() => productionDataConfig(source), /subscription runtime flags missing/);
  const entry = "reviewed production entry", chunk = "reviewed enabled subscription chunk";
  const legacy = { entry: "/assets/index-fixture.js", chunk: "/assets/subscription-fixture.js", entrySha256: createHash("sha256").update(entry).digest("hex"), chunkSha256: createHash("sha256").update(chunk).digest("hex") };
  const responses = new Map([["/", `<script src="${legacy.entry}"></script>`], [legacy.entry, entry], [legacy.chunk, chunk]]);
  const fetcher = async url => new Response(responses.get(new URL(url).pathname));
  const resolved = await resolveProductionBuildFlags(source, fetcher, legacy);
  assert.equal(resolved.activitySubscriptionsEnabled, true); assert.equal(resolved.activitySubscriptionsBackendReady, true);
  responses.set(legacy.chunk, "changed");
  await assert.rejects(resolveProductionBuildFlags(source, fetcher, legacy), /hash mismatch/);
  responses.set("/", '<script src="/assets/unreviewed.js"></script>');
  await assert.rejects(resolveProductionBuildFlags(source, fetcher, legacy), /unreviewed legacy/);
});

test("development deploy readiness checks reads, writes, AI and callable CORS including App Check", async () => {
  const config = productionDataConfig(productionFixture()), requests = [];
  const headers = { "access-control-allow-origin": "https://orider-dev.web.app", "access-control-allow-methods": "GET,PATCH,POST", "access-control-allow-headers": "Authorization,Content-Type,X-Firebase-AppCheck" };
  await verifyProductionDataCors(config, async (url, init) => { requests.push({ url, init }); return new Response(null, { status: 204, headers }); });
  assert.equal(requests.length, 4);
  assert.deepEqual(requests.map(request => request.init.headers["Access-Control-Request-Method"]), ["GET", "PATCH", "POST", "POST"]);
  assert.ok(requests.every(request => request.init.method === "OPTIONS" && request.init.headers["Access-Control-Request-Headers"].includes("x-firebase-appcheck")));
  for (const patch of [{ "access-control-allow-origin": "https://other.example" }, { "access-control-allow-methods": "GET,POST" }, { "access-control-allow-headers": "authorization,content-type" }]) {
    await assert.rejects(verifyProductionDataCors(config, async () => new Response(null, { status: 204, headers: { ...headers, ...patch } })), /CORS not ready/);
  }
});


test("public club endpoint is explicit runtime config with no production fallback", () => {
  assert.equal(render({ VITE_PUBLIC_CLUB_API_URL: "" }).publicClubApiUrl, undefined);
  const endpoint = PUBLIC_CLUB_ENDPOINT;
  assert.equal(render({ VITE_PUBLIC_CLUB_API_URL: endpoint }).publicClubApiUrl, endpoint);
});


test("public club production snapshot preserves routes and refuses endpoint injection", () => {
  const input = productionFixture();
  const selected = withPublicClubEndpoint(input, PUBLIC_CLUB_ENDPOINT);
  const config = productionDataConfig(selected);
  assert.equal(config.publicClubApiUrl, PUBLIC_CLUB_ENDPOINT);
  assert.equal(config.aiApiBase, input.aiApiBase);
  assert.equal(input.publicClubApiUrl, undefined);
  assert.equal(productionBuildEnv(config).VITE_PUBLIC_CLUB_API_URL, PUBLIC_CLUB_ENDPOINT);
  for (const value of ["http://localhost:8798/publicClubs", PUBLIC_CLUB_ENDPOINT + "?secret=x", PUBLIC_CLUB_ENDPOINT + ".evil", "https://user:password@example.test/"]) {
    assert.throws(() => publicClubEndpoint(value));
  }
});

test("public club deployment preflight is read only and fails closed on cache, fields or origin", async () => {
  let calls = 0;
  const origin = "https://orider-dev.web.app";
  const response = (data, cache = "no-store") => ({ ok: true, headers: new Headers({ "access-control-allow-origin": origin, "cache-control": cache }), json: async () => data });
  const fake = async (url, options) => {
    calls++;
    assert.equal(url, PUBLIC_CLUB_ENDPOINT + "?size=1");
    assert.equal(options.method, "GET"); assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error"); assert.equal(options.headers.Authorization, undefined);
    return response({ clubs: [], nextCursor: null });
  };
  assert.deepEqual(await verifyPublicClubApi({ publicClubApiUrl: PUBLIC_CLUB_ENDPOINT }, origin, fake), { ok: true, clubCount: 0 });
  await assert.rejects(verifyPublicClubApi({}, origin, fake), /not configured/);
  assert.equal(calls, 1);
  await assert.rejects(verifyPublicClubApi({ publicClubApiUrl: PUBLIC_CLUB_ENDPOINT }, origin, async () => response({ clubs: [], nextCursor: null }, "max-age=60")));
  await assert.rejects(verifyPublicClubApi({ publicClubApiUrl: PUBLIC_CLUB_ENDPOINT }, origin, async () => response({ clubs: [{ id: "fixture", name: "fixture", description: "", approval: "manual", members: [] }], nextCursor: null })));
  await assert.rejects(verifyPublicClubApi({ publicClubApiUrl: PUBLIC_CLUB_ENDPOINT }, "https://unapproved.test", fake));
});

test("parity public club read logs bounded operation context for transport and JSON failures", async () => {
  const config={appEnvironment:"production",deploymentProfile:"production-parity-stage",publicClubApiUrl:`${STAGE_FUNCTIONS}/publicClubs`};
  const original=console.error,events=[]; console.error=value=>events.push(JSON.parse(value));
  try {
    await assert.rejects(verifyPublicClubApi(config,"https://orider-dev.web.app",async()=>{throw Object.assign(new Error("sensitive raw message"),{code:"ENOTFOUND"});}),/verification failed/);
    await assert.rejects(verifyPublicClubApi(config,"https://orider-dev.web.app",async()=>({ok:true,status:200,headers:new Headers({"access-control-allow-origin":"https://orider-dev.web.app","cache-control":"no-store"}),json:async()=>{throw new SyntaxError("sensitive response body");}})),/verification failed/);
    assert.equal(events.length,2);assert.ok(events.every(event=>event.operation==="verify-public-club-api"&&event.method==="GET"&&event.target===`${STAGE_FUNCTIONS}/publicClubs?size=1`));
    assert.ok(!JSON.stringify(events).includes("sensitive"));
  } finally {console.error=original;}
});

test("Hosting predeploy rejects a replaced app bundle before consulting live production", () => {
  const directory=realpathSync(mkdtempSync(join(tmpdir(),"orider-stage-artifact-")));
  try {
    const source=join(directory,"source.json"),runtime=JSON.stringify(stageProductionParityConfig(productionFixture(),{sourceSha:"a".repeat(40),hostingVersion:"sites/miranae-orider-g1/versions/abc"}));
    mkdirSync(join(directory,"dist/assets"),{recursive:true});
    writeFileSync(source,JSON.stringify(productionFixture()));writeFileSync(join(directory,"firebase.stage.json"),readFileSync("firebase.stage.json"));
    const html='<script src="assets/index-fixture.js"></script>';
    writeFileSync(join(directory,"dist/index.html"),html);writeFileSync(join(directory,"dist/assets/index-fixture.js"),"replaced bundle");writeFileSync(join(directory,"dist/runtime-config.json"),runtime);
    const hash=value=>createHash("sha256").update(value).digest("hex"),receipt=join(directory,"build.json");
    writeFileSync(receipt,JSON.stringify({sourceSha:"a".repeat(40),reviewedHead:"b".repeat(40),artifactDirectory:join(directory,"dist"),deploymentDirectory:directory,entry:"assets/index-fixture.js",indexSha256:hash(html),entrySha256:hash("reviewed bundle"),runtimeSha256:hash(runtime)}));
    assert.throws(()=>execFileSync(process.execPath,[join(process.cwd(),"scripts/check-isolated-stage.mjs")],{cwd:directory,env:{...process.env,PRODUCTION_RUNTIME_CONFIG_PATH:"",STAGE_PARITY_PRODUCTION_RUNTIME_PATH:source,STAGE_PARITY_SOURCE_SHA:"a".repeat(40),STAGE_PARITY_HOSTING_VERSION:"sites/miranae-orider-g1/versions/abc",STAGE_PARITY_REVIEWED_HEAD:"b".repeat(40),STAGE_PARITY_BUILD_RECEIPT_PATH:receipt},stdio:"pipe"}),/prepared artifact differs/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test("parity artifact manifest checks every file and rejects missing, added or linked chunks before remote validation", async () => {
  for (const change of ["replaced", "missing", "added", "symlink", "directory-symlink"]) {
    const directory = mkdtempSync(join(tmpdir(), "orider-stage-manifest-"));
    try {
      mkdirSync(join(directory, "assets"));
      writeFileSync(join(directory, "index.html"), '<script src="assets/index-fixture.js"></script>');
      writeFileSync(join(directory, "assets/index-fixture.js"), "unchanged entry");
      const chunk = join(directory, "assets/lazy-fixture.js");
      writeFileSync(chunk, "reviewed dynamic chunk");
      const manifest = stageArtifactManifest(directory);
      assert.deepEqual(manifest.map(([path]) => path), ["assets/index-fixture.js", "assets/lazy-fixture.js", "index.html"]);
      assert.deepEqual(stageArtifactManifest(directory), manifest);
      let calls = 0;
      await verifyStageArtifacts(directory, manifest, async () => { calls++; });
      assert.equal(calls, 1);
      if (change === "replaced") writeFileSync(chunk, "unreviewed dynamic chunk");
      if (change === "missing") rmSync(chunk);
      if (change === "added") writeFileSync(join(directory, "assets/injected.js"), "unexpected");
      if (change === "symlink") { rmSync(chunk); symlinkSync("index-fixture.js", chunk); }
      if (change === "directory-symlink") symlinkSync("assets", join(directory, "linked-assets"));
      await assert.rejects(verifyStageArtifacts(directory, manifest, async () => { calls++; }), /prepared artifact/);
      assert.equal(calls, 1, "invalid local artifacts must fail before remote checks");
      assert.equal(readFileSync(join(directory, "assets/index-fixture.js"), "utf8"), "unchanged entry");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});

test("parity predeploy rechecks all artifacts after awaiting remote metadata", async () => {
  const directory = mkdtempSync(join(tmpdir(), "orider-stage-race-"));
  try {
    writeFileSync(join(directory, "index.html"), "unchanged entry");
    const chunk = join(directory, "lazy.js");
    writeFileSync(chunk, "reviewed chunk");
    const manifest = stageArtifactManifest(directory);
    await assert.rejects(verifyStageArtifacts(directory, manifest, async () => {
      await Promise.resolve();
      writeFileSync(chunk, "changed during remote validation");
    }), /prepared artifact differs/);
    assert.equal(readFileSync(join(directory, "index.html"), "utf8"), "unchanged entry");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test("bundled client promotion changes reviewed addresses while preserving all feature flags", () => {
  const source = productionFixture();
  const development = bundledFunctionsConfig(source, "development");
  const production = bundledFunctionsConfig(development, "production");
  for (const [environment, config] of [["development", development], ["production", production]]) {
    assert.equal(config.firebaseFunctionsBase, BUNDLED_FUNCTIONS[environment]);
    assert.equal(config.socialAuthFunctionsBase, BUNDLED_FUNCTIONS[environment]);
    assert.equal(config.personalApiBase, BUNDLED_FUNCTIONS[environment]);
    assert.equal(config.aiApiBase, BUNDLED_AI[environment]);
    assert.equal(config.publicClubApiUrl, `${BUNDLED_FUNCTIONS[environment]}/publicClubs`);
    for (const [key, value] of Object.entries(source)) if (typeof value === "boolean") assert.equal(config[key], value);
  }
  assert.throws(() => bundledFunctionsConfig(source, "other"), /unapproved/);
  assert.throws(() => bundledFunctionsConfig({ ...development, socialAuthFunctionsBase: "https://other.example" }, "production"), /identity/);
});

test("bundled Hosting preparation replaces every legacy function binding and preserves request paths", () => {
  const source = JSON.parse(readFileSync("firebase.json", "utf8"));
  for (const environment of ["development", "production"]) {
    const prepared = bundledHostingConfig(source, environment);
    assert.equal(prepared.hosting.rewrites.some(rewrite => rewrite.function), false);
    assert.deepEqual(prepared.hosting.rewrites.map(rewrite => rewrite.source), source.hosting.rewrites.map(rewrite => rewrite.source));
    assert.ok(prepared.hosting.rewrites.filter(rewrite => rewrite.run).every(rewrite => rewrite.run.serviceId === (environment === "development" ? "dev-bundle-default-api" : "orider-bundle-default-api")));
  }
  const promoted = bundledHostingConfig(bundledHostingConfig(source, "development"), "production");
  assert.ok(promoted.hosting.rewrites.filter(rewrite => rewrite.run).every(rewrite => rewrite.run.serviceId === "orider-bundle-default-api"));
  const unknown = structuredClone(source); unknown.hosting.rewrites[0].function.functionId = "unmapped";
  assert.throws(() => bundledHostingConfig(unknown, "production"), /unmapped/);
});

test("bundled runtime writer is explicit and rejects mixed deployment sources", () => {
  const directory = mkdtempSync(join(tmpdir(), "orider-bundled-runtime-"));
  try {
    const source = join(directory, "source.json"), output = join(directory, "runtime.json");
    writeFileSync(source, JSON.stringify(productionFixture()));
    const env = { ...process.env, STAGE_PARITY_PRODUCTION_RUNTIME_PATH: "", PRODUCTION_RUNTIME_CONFIG_PATH: "", BUNDLED_RUNTIME_CONFIG_PATH: source, BUNDLED_FUNCTIONS_ENVIRONMENT: "development" };
    execFileSync(process.execPath, ["scripts/write-runtime-config.mjs", "--out", output], { env, stdio: "pipe" });
    assert.equal(JSON.parse(readFileSync(output)).deploymentProfile, "bundled-development");
    for (const [path, environment] of [[undefined, "development"], [source, undefined], ["", "development"], ["", ""]]) {
      const partial = { ...env }; delete partial.BUNDLED_RUNTIME_CONFIG_PATH; delete partial.BUNDLED_FUNCTIONS_ENVIRONMENT;
      if (path !== undefined) partial.BUNDLED_RUNTIME_CONFIG_PATH = path;
      if (environment !== undefined) partial.BUNDLED_FUNCTIONS_ENVIRONMENT = environment;
      assert.throws(() => execFileSync(process.execPath, ["scripts/write-runtime-config.mjs", "--out", output], { env: partial, stdio: "pipe" }), /both nonempty/);
    }

    assert.throws(() => execFileSync(process.execPath, ["scripts/write-runtime-config.mjs", "--out", output], { env: { ...env, STAGE_PARITY_PRODUCTION_RUNTIME_PATH: source }, stdio: "pipe" }), /mixed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("legacy workflow explicitly removes empty inherited bundle variables before the strict writer", () => {
  const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
  assert.match(workflow, /env -u BUNDLED_RUNTIME_CONFIG_PATH -u BUNDLED_FUNCTIONS_ENVIRONMENT node scripts\/write-runtime-config.mjs/);
  const config = render({ BUNDLED_RUNTIME_CONFIG_PATH: "", BUNDLED_FUNCTIONS_ENVIRONMENT: "" }, true);
  assert.equal(config.deploymentProfile, undefined); assert.equal(config.firebaseProjectId, requiredEnv.VITE_FIREBASE_PROJECT_ID);
});

test("legacy Firebase CLI environment also strips empty bundle variables from the actual Hosting predeploy hook", () => {
  const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
  const start = workflow.indexOf("          deploy_env=(env)");
  const end = workflow.indexOf('          "${deploy_env[@]}" firebase deploy', start);
  assert.ok(start >= 0 && end > start);
  const predeploy = JSON.parse(readFileSync("firebase.json", "utf8")).hosting.predeploy;
  const directory = mkdtempSync(join(tmpdir(), "orider-predeploy-env-"));
  try {
    cpSync("scripts", join(directory, "scripts"), { recursive: true });
    execFileSync("bash", ["-euc", `${workflow.slice(start, end)}\n"\${deploy_env[@]}" sh -c "$HOSTING_PREDEPLOY"`], {
      cwd: directory, stdio: "pipe", env: { ...process.env, ...requiredEnv, GITHUB_ACTIONS: "true", MODE: "production", ORIDER_FUNCTIONS_TRANSPORT: "legacy", BUNDLED_RUNTIME_CONFIG_PATH: "", BUNDLED_FUNCTIONS_ENVIRONMENT: "", HOSTING_PREDEPLOY: predeploy },
    });
    const actual = JSON.parse(readFileSync(join(directory, "dist/runtime-config.json"), "utf8"));
    assert.equal(actual.deploymentProfile, undefined); assert.equal(actual.firebaseProjectId, requiredEnv.VITE_FIREBASE_PROJECT_ID);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
