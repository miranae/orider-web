import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { productionDataConfig, productionBuildEnv, resolveProductionBuildFlags, verifyProductionDataCors } from "./lib/production-data-config.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const requiredEnv = {
  VITE_FIREBASE_API_KEY: "api-key", VITE_FIREBASE_AUTH_DOMAIN: "auth.example", VITE_FIREBASE_PROJECT_ID: "project",
  VITE_FIREBASE_APP_ID: "app", VITE_APPCHECK_RECAPTCHA_SITE_KEY: "site", VITE_STRAVA_CLIENT_ID: "strava",
  VITE_STRAVA_REDIRECT_URI: "https://example.test/callback", VITE_MAPBOX_TOKEN: "map", VITE_ORIDER_AI_API_BASE: "https://ai.example",
};

function render(extraEnv = {}) {
  const directory = mkdtempSync(join(tmpdir(), "orider-runtime-config-"));
  const output = join(directory, "runtime-config.json");
  try {
    execFileSync(process.execPath, ["scripts/write-runtime-config.mjs", "--out", output], {
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
  const buildOnly = new Set(["VITE_USE_BUILD_ENV_FALLBACK"]);
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
  VITE_ORIDER_PERSONAL_API_BASE: "", VITE_SEGMENT_TILES_BASE: "", VITE_HEATMAP_BASE: "", VITE_USE_EMULATORS: "false",
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
