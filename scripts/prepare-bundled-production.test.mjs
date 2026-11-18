import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { verifyBundledCallable, verifyBundledRouteControl } from "./lib/bundled-callable-probe.mjs";
import { prepareBundledProduction, verifyBundledProduction } from "./prepare-bundled-production.mjs";
import { bundledFunctionsConfig } from "./lib/bundled-functions-config.mjs";
const source = { appEnvironment: "production", firebaseProjectId: "miranae-orider-g1", firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com",
  firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app", firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878", firebaseMessagingSenderId: "289663940841",
  firebaseFunctionsRegion: "asia-northeast3", firebaseApiKey: "public", appCheckRecaptchaSiteKey: "public", stravaClientId: "public", mapboxToken: "public",
  stravaRedirectUri: "https://orider-strava.web.app/strava/callback", aiApiBase: "https://orider-ai-api-h5zqzw3n4a-du.a.run.app",
  publicClubApiUrl: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net/publicClubs", activitySubscriptionsEnabled: true, activitySubscriptionsBackendReady: false, trainingDecisionEnabled: true };
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "bundled-production-contract-")), workspace = resolve(root, "source"), directory = resolve(root, "prepared");
  mkdirSync(workspace); copyFileSync(new URL("../firebase.json", import.meta.url), resolve(workspace, "firebase.json"));
  writeFileSync(resolve(workspace, ".gitignore"), "dist/\nfirebase.bundled-production.json\nfirebase-deploy.log\ngha-creds-*.json\n");
  const git = (...args) => execFileSync("git", args, { cwd: workspace, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "fixture"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test"); git("add", "."); git("commit", "-m", "fixture");
  let health = { status: "ok", exposure: "public", sourceSha: "b".repeat(40), topologyHash: "c".repeat(64) };
  const calls = [], fetcher = async (url, options) => { calls.push(url); return url.endsWith("/healthz") ? Response.json(health) : /\/oriderReadinessMissing[a-f0-9]+$/u.test(url) ? Response.json({ error: "unknown-bundle-function" }, { status: 404 }) : options.method === "OPTIONS" ? new Response(null, { status: 204, headers: { "access-control-allow-origin": "https://orider.co.kr", "access-control-allow-methods": "POST", "access-control-allow-headers": "authorization,content-type,x-firebase-appcheck" } }) : Response.json({ error: url.endsWith("/webHandoffRedeem") ? { status: "INVALID_ARGUMENT" } : url.endsWith("/v1/activity-narrative") ? { code: "unauthenticated" } : { status: "UNAUTHENTICATED" } }, { status: url.endsWith("/webHandoffRedeem") ? 400 : 401, headers: { "access-control-allow-origin": "https://orider.co.kr" } }); };
  const prepare = (patch = {}) => prepareBundledProduction({ source, workspace, directory, fetcher, backendSourceSha: "b".repeat(40), backendTopologyHash: "c".repeat(64), ...patch });
  const build = runtime => { mkdirSync(resolve(workspace, "dist")); writeFileSync(resolve(workspace, "dist/runtime-config.json"), JSON.stringify(runtime)); };
  return { workspace, directory, prepare, fetcher, calls, build, setHealth: next => { health = next; }, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test("production opt-in derives routing from normal release flags and keeps canonical AI", async () => {
  const f = fixture();
  try {
    await f.prepare();
    const runtime = bundledFunctionsConfig(source, "production"); f.build(runtime);
    assert.equal(runtime.firebaseFunctionsBase, "https://orider-bundle-default-api-289663940841.asia-northeast3.run.app");
    assert.equal(runtime.aiApiBase, source.aiApiBase);
    assert.equal(runtime.trainingDecisionEnabled, true); assert.equal(runtime.activitySubscriptionsBackendReady, false);
    const config = JSON.parse(readFileSync(resolve(f.workspace, "firebase.bundled-production.json"))).hosting;
    assert.equal(config.site, "miranae-orider-g1"); assert.ok(config.rewrites.filter(rule => rule.run).every(rule => rule.run.serviceId === "orider-bundle-default-api"));
    assert.match(config.predeploy, /predeploy-guard/); assert.match(config.predeploy, /prepare-bundled-production\.mjs --phase verify/);
    await verifyBundledProduction(f.directory, f.fetcher);
    assert.equal(f.calls.filter(url => !url.endsWith("/healthz")).length, 87);
    assert.ok(f.calls.includes(`${runtime.firebaseFunctionsBase}/getActivityDiscovery`));
  } finally { f.cleanup(); }
});
test("a development snapshot is not a valid production release configuration source", async () => {
  const f = fixture();
  try { await assert.rejects(f.prepare({ source: bundledFunctionsConfig(source, "development") }), /normal release flags/); assert.equal(f.calls.length, 0); }
  finally { f.cleanup(); }
});
test("backend drift and replaced runtime block production deployment preparation", async () => {
  const f = fixture();
  try {
    await f.prepare(); f.build(bundledFunctionsConfig(source, "production"));
    f.setHealth({ status: "ok", exposure: "public", sourceSha: "d".repeat(40), topologyHash: "c".repeat(64) });
    await assert.rejects(verifyBundledProduction(f.directory, f.fetcher), /backend changed/);
    writeFileSync(resolve(f.workspace, "dist/runtime-config.json"), JSON.stringify(source));
    await assert.rejects(verifyBundledProduction(f.directory, f.fetcher), /built production runtime/);
  } finally { f.cleanup(); }
});
test("production workflow remains tag-only and routing changes are explicit default-off", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /vars\.ORIDER_FUNCTIONS_TRANSPORT \|\| 'legacy'/);
  assert.match(workflow, /normal-production-runtime\.json/);
  assert.match(workflow, /vars\.ORIDER_BUNDLED_BACKEND_SOURCE_SHA/);
  assert.match(workflow, /vars\.ORIDER_BUNDLED_TOPOLOGY_HASH/);
  assert.match(workflow, /'PRODUCTION_RUNTIME_CONFIG_PATH='.*'STAGE_PARITY_PRODUCTION_RUNTIME_PATH='.*>> "\$GITHUB_ENV"/);
  assert.match(workflow, /'BUNDLED_RUNTIME_CONFIG_PATH='.*'BUNDLED_FUNCTIONS_ENVIRONMENT='.*>> "\$GITHUB_ENV"/);
  assert.match(workflow, /config=firebase\.bundled-production\.json/);
  assert.match(workflow, /if: env\.ORIDER_FUNCTIONS_TRANSPORT == 'legacy'/);
  assert.match(workflow, /startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.ok(workflow.indexOf("Verify release commit is on main") < workflow.indexOf("Prepare selected production transport"));
  assert.ok(workflow.indexOf("prepare-bundled-production.mjs --phase verify") < workflow.indexOf("firebase deploy --config"));
});

test("production preparation rejects absent or mismatched approved backend pins", async () => {
  for (const pins of [{ backendSourceSha: undefined }, { backendTopologyHash: undefined }, { backendSourceSha: "d".repeat(40) }, { backendTopologyHash: "d".repeat(64) }]) {
    const f = fixture();
    try { await assert.rejects(f.prepare(pins), /pins required|backend changed/); } finally { f.cleanup(); }
  }
});
test("bundled production rejects a missing social callable before Hosting", async () => {
  const f = fixture();
  try {
    await f.prepare(); f.build(bundledFunctionsConfig(source, "production"));
    await assert.rejects(verifyBundledProduction(f.directory, url => url.endsWith("/healthz") ? f.fetcher(url) : Promise.resolve(Response.json({}, { status: 404 }))), /bundled (callable|missing-route control)/);
  } finally { f.cleanup(); }
});

test("browser callable gate rejects missing CORS headers and attributes transport failures", async () => {
  const base = "https://orider-bundle-default-api-289663940841.asia-northeast3.run.app", origin = "https://orider.co.kr";
  for (const allowed of ["authorization,content-type", "content-type,x-firebase-appcheck"]) {
    await assert.rejects(verifyBundledCallable({ base, origin, name: "getActivityDiscovery", fetcher: async () => new Response(null, { status: 204,
      headers: { "access-control-allow-origin": origin, "access-control-allow-methods": "POST", "access-control-allow-headers": allowed } }) }), /getActivityDiscovery browser preflight/);
  }
  await assert.rejects(verifyBundledCallable({ base, origin, name: "getActivityDiscovery", fetcher: async (_url, options) => {
    if (options.method === "POST") return Response.json({ error: { status: "UNAUTHENTICATED" } }, { status: 401 });
    return new Response(null, { status: 204, headers: { "access-control-allow-origin": origin, "access-control-allow-methods": "POST", "access-control-allow-headers": "authorization,content-type,x-firebase-appcheck" } });
  } }), /getActivityDiscovery rejected unauthenticated browser contract/);
  await assert.rejects(verifyBundledCallable({ base, origin, name: "getActivityDiscovery", fetcher: async () => { throw new Error("DNS"); } }), /getActivityDiscovery OPTIONS transport failed/);
  await assert.rejects(verifyBundledCallable({ base, origin, name: "getActivityDiscovery", fetcher: async (_url, options) => {
    if (options.method === "POST") throw new Error("timeout");
    return new Response(null, { status: 204, headers: { "access-control-allow-origin": origin, "access-control-allow-methods": "POST", "access-control-allow-headers": "authorization,content-type,x-firebase-appcheck" } });
  } }), /getActivityDiscovery POST transport failed/);
});

test("null production health reports the exact metadata endpoint", async () => {
  const f = fixture();
  try { f.setHealth(null); await assert.rejects(f.prepare(), /identity missing at https:\/\/orider-bundle-default-api-289663940841.asia-northeast3.run.app\/healthz/); }
  finally { f.cleanup(); }
});

test("a blanket401 middleware cannot establish callable registration", async () => {
  const base = "https://orider-bundle-default-api-289663940841.asia-northeast3.run.app", origin = "https://orider.co.kr";
  await assert.rejects(verifyBundledRouteControl({ base, origin, fetcher: async () => Response.json({ error: { status: "UNAUTHENTICATED" } }, { status: 401 }) }), /missing-route control POST failed.*expected=404/);
  await verifyBundledRouteControl({ base, origin, fetcher: async (url, options) => {
    assert.ok(url.startsWith(`${base}/oriderReadinessMissing`)); assert.equal(options.headers.Origin, origin);
    assert.equal(options.method, "POST"); assert.equal(options.headers.Authorization, undefined);
    return Response.json({ error: "unknown-bundle-function" }, { status: 404 });
  } });
});

test("production publication rejects missing handoff and AI browser routes too", async () => {
  for (const path of ["/webHandoffRedeem", "/v1/activity-narrative"]) {
    const f = fixture();
    try {
      await f.prepare(); f.build(bundledFunctionsConfig(source, "production"));
      await assert.rejects(verifyBundledProduction(f.directory, (url, options) => url.endsWith(path)
        ? Promise.resolve(Response.json({ error: "missing" }, { status: 404 })) : f.fetcher(url, options)), new RegExp(path));
    } finally { f.cleanup(); }
  }
});
