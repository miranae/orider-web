import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { prepareBundledStage, sealBundledStage, verifyBundledStage } from "./prepare-bundled-stage.mjs";
const backend = "b".repeat(40), topology = "c".repeat(64);
const source = { appEnvironment: "production", firebaseProjectId: "miranae-orider-g1", firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com",
  firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app", firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878", firebaseMessagingSenderId: "289663940841",
  firebaseFunctionsRegion: "asia-northeast3", firebaseApiKey: "public", appCheckRecaptchaSiteKey: "public", stravaClientId: "public", mapboxToken: "public",
  stravaRedirectUri: "https://orider-strava.web.app/strava/callback", aiApiBase: "https://orider-ai-api-h5zqzw3n4a-du.a.run.app",
  publicClubApiUrl: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net/publicClubs", activitySubscriptionsEnabled: true, activitySubscriptionsBackendReady: true };
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "bundled-stage-contract-")), workspace = resolve(root, "source"), directory = resolve(root, "prepared");
  mkdirSync(workspace);
  copyFileSync(new URL("../firebase.json", import.meta.url), resolve(workspace, "firebase.json"));
  writeFileSync(resolve(workspace, ".gitignore"), "dist/\nfirebase.bundled-stage.json\nfirebase-stage-deploy.log\ngha-creds-*.json\n");
  const git = (...args) => execFileSync("git", args, { cwd: workspace, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "fixture"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
  git("add", "."); git("commit", "-m", "fixture");
  const frontendSourceSha = git("rev-parse", "HEAD"), calls = [];
  let health = { status: "ok", exposure: "public", sourceSha: backend, topologyHash: topology };
  const fetcher = async (url, options) => {
    calls.push(url);
    if (url === "https://orider.co.kr/runtime-config.json") return Response.json(source);
    if (url.endsWith("/healthz")) return Response.json(health);
    if (url.endsWith("/publicClubs?size=1")) {
      assert.equal(options.credentials, "omit");
      return Response.json({ clubs: [], nextCursor: null }, { headers: { "Access-Control-Allow-Origin": "https://orider-dev.web.app", "Cache-Control": "no-store" } });
    }
    throw new Error(`unexpected request ${url}`);
  };
  const prepare = (patch = {}) => prepareBundledStage({ workspace, directory, backendSourceSha: backend, frontendSourceSha, fetcher, ...patch });
  const build = () => {
    mkdirSync(resolve(workspace, "dist/assets"), { recursive: true });
    writeFileSync(resolve(workspace, "dist/index.html"), '<script src="/assets/index-fixture.js"></script>');
    writeFileSync(resolve(workspace, "dist/assets/index-fixture.js"), "export {};");
    copyFileSync(resolve(directory, "runtime-config.json"), resolve(workspace, "dist/runtime-config.json"));
  };
  return { root, workspace, directory, frontendSourceSha, calls, fetcher, prepare, build, setHealth: value => { health = value; }, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test("manual development preparation binds paired runtime/Hosting, source and actual backend without old Functions probes", async () => {
  const f = fixture();
  try {
    const env = resolve(f.root, "github-env");
    const prepared = await f.prepare({ githubEnv: env });
    assert.equal(prepared.frontendSourceSha, f.frontendSourceSha); assert.equal(prepared.backendSourceSha, backend);
    const runtime = JSON.parse(readFileSync(resolve(f.directory, "runtime-config.json")));
    assert.equal(runtime.deploymentProfile, "bundled-development");
    const hosting = JSON.parse(readFileSync(resolve(f.workspace, "firebase.bundled-stage.json"))).hosting;
    assert.equal(hosting.site, "orider-dev"); assert.ok(hosting.rewrites.filter(rule => rule.run).every(rule => rule.run.serviceId === "dev-bundle-default-api"));
    const environment = readFileSync(env, "utf8");
    assert.match(environment, /BUNDLED_RUNTIME_CONFIG_PATH=/); assert.match(environment, /BUNDLED_FUNCTIONS_ENVIRONMENT=development/);
    const gatewayOrigin = "https://dev-bundle-default-api-818364001341.asia-northeast3.run.app";
    assert.equal(runtime.firebaseFunctionsBase, gatewayOrigin);
    assert.deepEqual([...new Set(f.calls.map(url => new URL(url).origin))].sort(), ["https://orider.co.kr", gatewayOrigin].sort());
    const connectSources = hosting.headers.flatMap(row => row.headers).filter(header => header.key === "Content-Security-Policy")
      .flatMap(header => header.value.split(";").flatMap(directive => {
        const [name, ...sources] = directive.trim().split(/\s+/u);
        return name === "connect-src" ? sources : [];
      }));
    assert.ok(new Set(connectSources).has(gatewayOrigin));
  } finally { f.cleanup(); }
});
test("seal and predeploy verify the actual dist runtime and every artifact file", async () => {
  const f = fixture();
  try {
    await f.prepare(); f.build();
    const receipt = await sealBundledStage(f.directory, f.fetcher);
    assert.equal(receipt.complete, true); assert.equal(receipt.backendTopologyHash, topology);
    writeFileSync(resolve(f.workspace, "firebase-stage-deploy.log"), "development deploy output");
    writeFileSync(resolve(f.workspace, "gha-creds-fixture.json"), "{}");
    assert.equal((await verifyBundledStage(f.directory, f.fetcher)).artifactHash, receipt.artifactHash);
    const count = f.calls.length;
    writeFileSync(resolve(f.workspace, "dist/assets/index-fixture.js"), "replaced");
    await assert.rejects(verifyBundledStage(f.directory, f.fetcher), /artifact differs/);
    assert.equal(f.calls.length, count, "tampered local build must fail before any remote probe");
  } finally { f.cleanup(); }
});
test("backend source/topology changes and malformed client output block development deployment", async () => {
  const f = fixture();
  try {
    await f.prepare(); f.build();
    writeFileSync(resolve(f.workspace, "dist/runtime-config.json"), JSON.stringify({ deploymentProfile: "legacy" }));
    await assert.rejects(sealBundledStage(f.directory, f.fetcher), /built runtime differs/);
    copyFileSync(resolve(f.directory, "runtime-config.json"), resolve(f.workspace, "dist/runtime-config.json"));
    f.setHealth({ status: "ok", exposure: "public", sourceSha: backend, topologyHash: "d".repeat(64) });
    await assert.rejects(sealBundledStage(f.directory, f.fetcher), /source\/topology mismatch/);
  } finally { f.cleanup(); }
});
test("unknown or dirty frontend and missing validated backend SHA cannot be prepared", async () => {
  for (const patch of [{ frontendSourceSha: "a".repeat(40) }, { backendSourceSha: "" }]) {
    const f = fixture(); try { await assert.rejects(f.prepare(patch), /pinned clean source|backend source SHA/); } finally { f.cleanup(); }
  }
  const f = fixture();
  try { writeFileSync(resolve(f.workspace, "unexpected.ts"), "changed"); await assert.rejects(f.prepare(), /pinned clean source/); } finally { f.cleanup(); }
});
test("development workflow is manual-only and seals the selected artifact before credentialed deployment", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy-stage.yml", import.meta.url), "utf8");
  const events = workflow.split("\npermissions:")[0].match(/^  [a-z_]+:/gm)?.map(value => value.trim());
  assert.deepEqual(events, ["workflow_dispatch:"]);
  assert.match(workflow, /source_ref:/); assert.match(workflow, /backend_source_sha:/);
  assert.match(workflow, /default: bundled-development/);
  assert.match(workflow, /--project orider-dev/); assert.doesNotMatch(workflow, /--project miranae-orider-g1/);
  assert.ok(workflow.indexOf("--phase seal") < workflow.indexOf("google-github-actions/auth"));
  assert.match(workflow, /config=firebase\.bundled-stage\.json/);
  assert.match(workflow, /steps\.source\.outputs\.sha/);
  assert.doesNotMatch(workflow, /--token/);
  assert.match(workflow, /orider-dev\.web\.app\/ko\/course\/nonexistent/);
  assert.match(workflow, /Development detail entry mismatch/);
  assert.match(workflow, /git merge-base --is-ancestor "\$selected_sha" origin\/dev/);
  assert.match(workflow, /git merge-base --is-ancestor "\$selected_sha" origin\/main/);
  assert.ok(workflow.indexOf("Selected source is not an approved") < workflow.indexOf("node scripts/prepare-bundled-stage.mjs"));
});
