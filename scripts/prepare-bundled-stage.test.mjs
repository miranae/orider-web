import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { snapshotStageHosting, rollbackStageHosting } from "./bundled-stage-hosting-release.mjs";
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
  git("update-ref", "refs/remotes/origin/main", frontendSourceSha);
  let health = { status: "ok", exposure: "public", sourceSha: backend, topologyHash: topology };
  const fetcher = async (url, options) => {
    calls.push(url);
    if (url === "https://orider.co.kr/runtime-config.json") return Response.json(source);
    if (url.endsWith("/healthz")) return Response.json(health);
    if (/\/oriderReadinessMissing[a-f0-9]+$/u.test(url)) return Response.json({ error: "unknown-bundle-function" }, { status: 404 });
    if (url.endsWith("/getActivityDiscovery")) return options.method === "OPTIONS" ? new Response(null, { status: 204, headers: { "access-control-allow-origin": "https://orider-dev.web.app", "access-control-allow-methods": "POST", "access-control-allow-headers": "authorization,content-type,x-firebase-appcheck" } }) : Response.json({ error: { status: "UNAUTHENTICATED" } }, { status: 401, headers: { "access-control-allow-origin": "https://orider-dev.web.app" } });
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
  return { root, workspace, directory, git, frontendSourceSha, calls, fetcher, prepare, build, setHealth: value => { health = value; }, cleanup: () => rmSync(root, { recursive: true, force: true }) };
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
test("source must belong to reviewed main/dev history before any backend request", async () => {
  for (const approved of [false, true]) {
    const f = fixture();
    try {
      writeFileSync(resolve(f.workspace, "reviewed-source.txt"), "selected source");
      f.git("add", "."); f.git("commit", "-m", "selected source");
      const sha = f.git("rev-parse", "HEAD");
      if (approved) {
        f.git("update-ref", "refs/remotes/origin/dev", sha);
        assert.equal((await f.prepare({ frontendSourceSha: sha })).frontendSourceSha, sha);
      } else {
        await assert.rejects(f.prepare({ frontendSourceSha: sha }), /reviewed source.*expected=.*actual=/);
        assert.equal(f.calls.length, 0);
      }
    } finally { f.cleanup(); }
  }
});
test("development workflow is manual-only and seals the selected artifact before credentialed deployment", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy-stage.yml", import.meta.url), "utf8");
  const events = workflow.split("\npermissions:")[0].match(/^  [a-z_]+:/gm)?.map(value => value.trim());
  assert.deepEqual(events, ["workflow_dispatch:"]);
  assert.match(workflow, /source_ref:/);
  assert.match(workflow, /git merge-base --is-ancestor "\$selected_sha" origin\/main/);
  assert.match(workflow, /git merge-base --is-ancestor "\$selected_sha" origin\/dev/);
  assert.ok(workflow.indexOf("git merge-base --is-ancestor") < workflow.indexOf("run: node scripts/prepare-bundled-stage.mjs")); assert.match(workflow, /backend_source_sha:/);
  assert.match(workflow, /default: bundled-development/);
  assert.match(workflow, /--project orider-dev/); assert.doesNotMatch(workflow, /--project miranae-orider-g1/);
  assert.ok(workflow.indexOf("--phase seal") < workflow.indexOf("google-github-actions/auth"));
  assert.match(workflow, /config=firebase\.bundled-stage\.json/);
  assert.match(workflow, /steps\.source\.outputs\.sha/);
  assert.doesNotMatch(workflow, /--token/);
  assert.match(workflow, /orider-dev\.web\.app\/ko\/course\/nonexistent/);
  assert.match(workflow, /curl -sS -A 'Mozilla\/5\.0 ORiderStageAcceptance'/);
  assert.doesNotMatch(workflow, /curl -fsSL -A/);
  assert.match(workflow, /Built entry is missing/);
  assert.match(workflow, /Development detail response mismatch/);
  assert.match(workflow, /Development detail transport failed: url=\$detail_url expected=HTTP200/);
  assert.match(workflow, /does not support bundled transport: missing/);
  assert.ok(workflow.indexOf("does not support bundled transport") < workflow.indexOf("run: node scripts/prepare-bundled-stage.mjs"));
  assert.match(workflow, /Development detail entry mismatch: expected=\$built actual=/);
});

test("development metadata failures identify the failing endpoint", async () => {
  const f = fixture();
  try { await assert.rejects(f.prepare({ fetcher: async () => new Response(null, { status: 503 }) }), /https:\/\/orider.co.kr\/runtime-config.json HTTP 503/); }
  finally { f.cleanup(); }
});

test("reviewed historical sources without bundled tooling are rejected before a missing-module invocation", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy-stage.yml", import.meta.url), "utf8");
  const start = workflow.indexOf('          if [ "$SELECTED_TRANSPORT" = bundled-development ]; then');
  const end = workflow.indexOf('          echo "sha=$selected_sha"', start);
  assert.ok(start >= 0 && end > start);
  const check = workflow.slice(start, end);
  const root = mkdtempSync(resolve(tmpdir(), "bundled-source-capability-"));
  try {
    const run = () => spawnSync("bash", ["-euc", check], { cwd: root, encoding: "utf8", env: { ...process.env, SELECTED_TRANSPORT: "bundled-development", selected_sha: "a".repeat(40) } });
    const missing = run();
    assert.equal(missing.status, 1); assert.match(missing.stdout, /does not support bundled transport: missing/);
    for (const path of ["scripts/prepare-bundled-stage.mjs", "scripts/lib/bundled-callable-probe.mjs", "scripts/bundled-stage-hosting-release.mjs"]) {
      mkdirSync(resolve(root, path, ".."), { recursive: true }); writeFileSync(resolve(root, path), "// capability fixture");
    }
    assert.equal(run().status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("missing HTML or entry chunks fail before seal or any remote verification", async () => {
  for (const missing of ["index.html", "assets/index-fixture.js"]) {
    const f = fixture();
    try {
      await f.prepare(); f.build();
      rmSync(resolve(f.workspace, "dist", missing)); const calls = f.calls.length;
      await assert.rejects(sealBundledStage(f.directory, f.fetcher), /stage entry (HTML|asset) missing/);
      assert.equal(f.calls.length, calls);
    } finally { f.cleanup(); }
  }
  const f = fixture();
  try {
    await f.prepare(); f.build(); await sealBundledStage(f.directory, f.fetcher);
    rmSync(resolve(f.workspace, "dist/assets/index-fixture.js")); const calls = f.calls.length;
    await assert.rejects(verifyBundledStage(f.directory, f.fetcher), /stage entry asset missing/); assert.equal(f.calls.length, calls);
  } finally { f.cleanup(); }
});
test("null development health identifies the gateway instead of throwing an unscoped TypeError", async () => {
  const f = fixture();
  try {
    f.setHealth(null);
    await assert.rejects(f.prepare(), /source\/topology mismatch at https:\/\/dev-bundle-default-api-818364001341.asia-northeast3.run.app\/healthz/);
  } finally { f.cleanup(); }
});

test("failed development release restores only its own marker to the exact previous finalized version", async () => {
  const marker = `bundled-stage:${"a".repeat(40)}:123:1`;
  const channelName = "sites/orider-dev/channels/live", previous = "sites/orider-dev/versions/previous", next = "sites/orider-dev/versions/new";
  let active = previous, message = "previous deployment"; const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, method: options.method });
    assert.equal(options.headers.Authorization, "Bearer fixture"); assert.equal(options.redirect, "error");
    if (url.endsWith("/channels/live")) return Response.json({ name: channelName, release: { version: { name: active }, message } });
    if (options.method === "POST") { assert.equal(url, `https://firebasehosting.googleapis.com/v1beta1/${channelName}/releases?versionName=${encodeURIComponent(previous)}`); active = previous; return Response.json({}); }
    return Response.json({ name: previous, status: "FINALIZED" });
  };
  const snapshot = await snapshotStageHosting({ token: "fixture", marker, fetcher });
  assert.equal(calls.some(call => call.method !== "GET"), false);
  active = next; message = marker;
  assert.deepEqual(await rollbackStageHosting(snapshot, { token: "fixture", fetcher }), { restored: true, unchanged: false, version: previous });
  assert.equal(calls.filter(call => call.method === "POST").length, 1);
  active = next; message = marker;
  const uncertain = await rollbackStageHosting(snapshot, { token: "fixture", fetcher: async (url, options) => {
    if (options.method === "POST") { active = previous; throw new Error("PRIVATE_TIMEOUT"); }
    return fetcher(url, options);
  } });
  assert.equal(uncertain.restored, true); assert.equal(uncertain.requestOutcome, "readback-confirmed-after-error");
  assert.match(uncertain.requestDiagnostic, /POST transport failed/); assert.doesNotMatch(uncertain.requestDiagnostic, /PRIVATE_TIMEOUT/);
  active = next; message = "another operator deployment"; calls.length = 0;
  await assert.rejects(rollbackStageHosting(snapshot, { token: "fixture", fetcher }), /not this deployment/);
  assert.equal(calls.some(call => call.method === "POST"), false);
  await assert.rejects(rollbackStageHosting({ ...snapshot, site: "miranae-orider-g1" }, { token: "fixture", fetcher }), /snapshot invalid/);
});
test("development rollback is wired after the live checks and before artifact publication", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy-stage.yml", import.meta.url), "utf8");
  assert.ok(workflow.indexOf("--phase snapshot") < workflow.indexOf("firebase deploy --config"));
  assert.ok(workflow.indexOf("--phase rollback") > workflow.indexOf("Development detail response mismatch"));
  assert.ok(workflow.indexOf("--phase rollback") < workflow.indexOf("Retain verified bundled client artifact"));
  assert.match(workflow, /if: failure\(\).*steps\.hosting_snapshot\.outcome == 'success'/);
});
