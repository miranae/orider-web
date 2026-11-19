import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, cpSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { verifyBundledHosting } from "./verify-bundled-hosting.mjs";
import { stageHtmlEntry } from "./lib/stage-artifact-manifest.mjs";
import { snapshotStageHosting, rollbackStageHosting, verifyStagePublishPointer, verifyHostedAssets, assertSerializedStageHostingWrites } from "./bundled-stage-hosting-release.mjs";
import { prepareBundledStage, sealBundledStage, verifyBundledStage, verifyStageAiRevision } from "./prepare-bundled-stage.mjs";
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
    if (url.endsWith("/readyz")) return Response.json(health);
    if (/\/oriderReadinessMissing[a-f0-9]+$/u.test(url)) return Response.json({ error: "unknown-bundle-function" }, { status: 404 });
    if (/\/(getActivityDiscovery|getActivityPublicMaps|getCreatorRecipeEmailQuota|sendCreatorRecipeEmail|socialAuthStart|webHandoffRedeem|v1\/activity-narrative)$/u.test(url)) return options.method === "OPTIONS" ? new Response(null, { status: 204, headers: { "access-control-allow-origin": options.headers.Origin, "access-control-allow-methods": "POST", "access-control-allow-headers": "authorization,content-type,x-firebase-appcheck" } }) : Response.json({ error: url.endsWith("/webHandoffRedeem") ? { status: "INVALID_ARGUMENT" } : url.endsWith("/v1/activity-narrative") ? { code: "unauthenticated" } : { status: "UNAUTHENTICATED" } }, { status: url.endsWith("/webHandoffRedeem") ? 400 : 401, headers: { "access-control-allow-origin": options.headers.Origin } });
    if (url.endsWith("/api/v1/profile")) return Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
    if (url.endsWith("/api/strava/webhook")) return new Response("Forbidden", { status: 403 });
    if (url.endsWith("/publicClubs?size=1")) {
      assert.equal(options.credentials, "omit");
      return Response.json({ clubs: [], nextCursor: null }, { headers: { "Access-Control-Allow-Origin": "https://orider-dev.web.app", "Cache-Control": "no-store" } });
    }
    throw new Error(`unexpected request ${url}`);
  };
  const prepare = (patch = {}) => prepareBundledStage({ workspace, directory, backendSourceSha: backend, frontendSourceSha, fetcher, ...patch });
  const build = () => {
    mkdirSync(resolve(workspace, "dist/assets"), { recursive: true });
    writeFileSync(resolve(workspace, "dist/index.html"), '<script type="module" src="/assets/index-fixture.js"></script>');
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
    assert.deepEqual([...new Set(f.calls.map(url => new URL(url).origin))].sort(), ["https://orider.co.kr", gatewayOrigin, "https://dev-bundle-ai-api-818364001341.asia-northeast3.run.app"].sort());
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
  const mainSourceGuard = workflow.indexOf("[ \"$GITHUB_REF\" = refs/heads/main ] && [ \"$selected_sha\" != \"$GITHUB_SHA\" ]");
  assert.ok(mainSourceGuard >= 0 && mainSourceGuard < workflow.indexOf("run: node scripts/prepare-bundled-stage.mjs"));
  assert.match(workflow, /default: bundled-development/);
  assert.match(workflow, /--project orider-dev/); assert.doesNotMatch(workflow, /--project miranae-orider-g1/);
  assert.ok(workflow.indexOf("--phase seal") < workflow.indexOf("google-github-actions/auth"));
  assert.match(workflow, /config=firebase\.bundled-stage\.json/);
  assert.match(workflow, /steps\.source\.outputs\.sha/);
  assert.doesNotMatch(workflow, /--token/);
  assert.match(workflow, /orider-dev\.web\.app\/ko\/course\/nonexistent/);
  assert.match(workflow, /curl -sS --connect-timeout 10 --max-time 30 -A 'Mozilla\/5\.0 ORiderStageAcceptance'/);
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
    for (const path of ["scripts/hosting-candidate-archive.mjs", "scripts/prepare-bundled-stage.mjs", "scripts/lib/bundled-callable-probe.mjs", "scripts/bundled-stage-hosting-release.mjs", "scripts/stage-html-entry.mjs", "scripts/verify-bundled-hosting.mjs"]) {
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
    await assert.rejects(f.prepare(), /source\/topology mismatch at https:\/\/dev-bundle-default-api-818364001341.asia-northeast3.run.app\/readyz/);
  } finally { f.cleanup(); }
});

test("failed development release restores only its own marker to the exact previous finalized version", async () => {
  const marker = `bundled-stage:${"a".repeat(40)}:123:1`;
  const channelName = "sites/orider-dev/channels/live", previous = "sites/orider-dev/versions/previous", next = "sites/orider-dev/versions/new";
  let active = previous, message = "previous deployment"; const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, method: options.method });
    assert.equal(options.headers.Authorization, "Bearer fixture"); assert.equal(options.redirect, "error");
    if (url.endsWith("/channels/live")) return Response.json({ name: channelName, release: { name: `sites/orider-dev/releases/${active.split("/").at(-1)}`, version: { name: active }, message } });
    if (options.method === "POST") { assert.equal(url, `https://firebasehosting.googleapis.com/v1beta1/${channelName}/releases?versionName=${encodeURIComponent(previous)}`); active = previous; return Response.json({}); }
    return Response.json({ name: previous, status: "FINALIZED" });
  };
  const snapshot = await snapshotStageHosting({ serializedWrites: "true", token: "fixture", marker, fetcher });
  assert.equal(calls.some(call => call.method !== "GET"), false);
  assert.deepEqual(await verifyStagePublishPointer(snapshot, { serializedWrites: "true", token: "fixture", fetcher }), { verified: true, version: previous });
  active = next; message = marker;
  assert.deepEqual(await rollbackStageHosting(snapshot, { serializedWrites: "true", token: "fixture", fetcher }), { restored: true, unchanged: false, version: previous });
  assert.equal(calls.filter(call => call.method === "POST").length, 1);
  active = next; message = marker;
  const uncertain = await rollbackStageHosting(snapshot, { serializedWrites: "true", token: "fixture", fetcher: async (url, options) => {
    if (options.method === "POST") { active = previous; throw new Error("PRIVATE_TIMEOUT"); }
    return fetcher(url, options);
  } });
  assert.equal(uncertain.restored, true); assert.equal(uncertain.requestOutcome, "readback-confirmed-after-error");
  assert.match(uncertain.requestDiagnostic, /POST transport failed/); assert.doesNotMatch(uncertain.requestDiagnostic, /PRIVATE_TIMEOUT/);
  active = next; message = marker;
  for (const readbackFails of [false, true]) {
    let channelReads = 0;
    await assert.rejects(rollbackStageHosting(snapshot, { serializedWrites: "true", token: "fixture", fetcher: async (url, options) => {
      if (options.method === "POST") return new Response(null, { status: 403 });
      if (url.endsWith("/channels/live") && ++channelReads > 2 && readbackFails) throw new Error("PRIVATE_GET_FAILURE");
      return fetcher(url, options);
    } }), error => /POST.*HTTP403/u.test(error.message) && (readbackFails ? /GET transport failed/u : /readback mismatch/u).test(error.message) && !/PRIVATE_GET_FAILURE/u.test(error.message));
  }
  active = next; message = "another operator deployment"; calls.length = 0;
  await assert.rejects(rollbackStageHosting(snapshot, { serializedWrites: "true", token: "fixture", fetcher }), /not this deployment/);
  assert.equal(calls.some(call => call.method === "POST"), false);
  await assert.rejects(rollbackStageHosting({ ...snapshot, site: "miranae-orider-g1" }, { serializedWrites: "true", token: "fixture", fetcher }), /snapshot invalid/);
});
test("development rollback is wired after the live checks and before artifact publication", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy-stage.yml", import.meta.url), "utf8");
  assert.ok(workflow.indexOf("--phase snapshot") < workflow.indexOf("firebase deploy --config"));
  assert.ok(workflow.indexOf("--phase rollback") > workflow.indexOf("Development detail response mismatch"));
  assert.ok(workflow.indexOf("--phase rollback") < workflow.indexOf("Retain verified bundled client artifact"));
  assert.match(workflow, /if: always\(\) && \(failure\(\) \|\| cancelled\(\)\).*steps\.hosting_snapshot\.outcome == 'success'/);
});

test("stage AI serving revision must belong to the accepted backend source", async () => {
  const name = "projects/orider-dev/locations/asia-northeast3/services/dev-bundle-ai-api";
  const revision = `${name}/revisions/current`, sha = "b".repeat(40);
  const containers = [{ env: [{ name: "COACH_SESSION_EXECUTION_COMMIT_SHA", value: sha }] }];
  const service = { name, labels: { "orider-source": sha }, terminalCondition: { state: "CONDITION_SUCCEEDED" },
    template: { containers }, latestReadyRevision: revision, trafficStatuses: [{ revision, percent: 100 }] };
  await verifyStageAiRevision(sha, "fixture", async url => Response.json(url.endsWith(revision) ? { name: revision, containers } : service));
  await assert.rejects(verifyStageAiRevision("c".repeat(40), "fixture", async () => Response.json(service)), /serving revision differs/u);
  await assert.rejects(verifyStageAiRevision(sha, "fixture", async () => Response.json({ ...service,
    trafficStatuses: [{ revision: `${name}/revisions/previous`, percent: 100 }],
  })), /serving revision differs/u);
  await assert.rejects(verifyStageAiRevision(sha, "fixture", async url =>
    Response.json(url.endsWith(revision) ? { name: revision, containers: [] } : service)), /planned execution epoch/u);
});

test("the finalized live Hosting inventory must contain lazy JavaScript and CSS", async () => {
  const site = "sites/orider-dev", channel = `${site}/channels/live`, version = `${site}/versions/current`;
  const pages = [];
  const fetcher = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer fixture");
    if (url.endsWith(channel)) return Response.json({ name: channel, release: {
      name: `${site}/releases/current`, version: { name: version },
    } });
    const cursor = new URL(url).searchParams.get("pageToken");
    pages.push(cursor);
    return Response.json(cursor ? { files: [{ path: "/assets/lazy.css", status: "ACTIVE", hash: "css-hash" }] }
      : { files: [{ path: "/assets/entry.js", status: "ACTIVE", hash: "js-hash" }], nextPageToken: "second" });
  };
  const options = { token: "fixture", environment: "development", fetcher };
  await verifyHostedAssets([["/assets/entry.js", "js-hash"], ["/assets/lazy.css", "css-hash"]], options);
  assert.deepEqual(pages, [null, "second"]);
  await assert.rejects(verifyHostedAssets([["/assets/absent.js", "absent-hash"]], options), /missing 1 compiled assets.*absent.js/u);
  await assert.rejects(verifyHostedAssets([["/assets/entry.js", "other-hash"]], options), /different bytes for.*entry.js/u);
});

test("production rollback targets only the live production release owned by the attempt", async () => {
  const site = "sites/miranae-orider-g1", channel = `${site}/channels/live`;
  const previous = `${site}/versions/previous`, published = `${site}/versions/published`;
  const marker = `client-promotion:${"a".repeat(40)}:123:1`;
  let current = previous, message = "before", writes = 0;
  const fetcher = async (url, { method }) => {
    assert.ok(url.includes(site));
    if (url.endsWith(channel)) return Response.json({ name: channel, release: {
      name: `${site}/releases/${current.split("/").at(-1)}`, version: { name: current }, message,
    } });
    if (method === "POST") {
      assert.equal(new URL(url).searchParams.get("versionName"), previous);
      writes++;
      current = previous;
      return Response.json({});
    }
    return Response.json({ name: previous, status: "FINALIZED" });
  };
  const options = { environment: "production", serializedWrites: "true", token: "fixture", fetcher };
  const snapshot = await snapshotStageHosting({ ...options, marker });
  current = published;
  await assert.rejects(rollbackStageHosting(snapshot, options), /not this deployment/u);
  assert.equal(writes, 0);
  message = marker;
  assert.equal((await rollbackStageHosting(snapshot, options)).version, previous);
  assert.equal(writes, 1);
});

test("missing browser routes block development before publication without credentials", async () => {
  for (const path of ["/getActivityPublicMaps", "/getCreatorRecipeEmailQuota", "/sendCreatorRecipeEmail", "/webHandoffRedeem", "/v1/activity-narrative"]) {
    const f = fixture();
    try {
      await assert.rejects(f.prepare({ fetcher: (url, options) => url.endsWith(path)
        ? Promise.resolve(Response.json({ error: "missing" }, { status: 404 })) : f.fetcher(url, options) }), new RegExp(path));
    } finally { f.cleanup(); }
  }
});

test("serialized CI assertion fails before authentication or any Hosting request", async () => {
  let calls = 0; const fetcher = async () => { calls++; throw new Error("must not request"); };
  assert.throws(() => assertSerializedStageHostingWrites("false"), /SERIALIZED_WRITES=true/);
  for (const operation of [snapshotStageHosting, verifyStagePublishPointer, rollbackStageHosting]) {
    await assert.rejects(operation === snapshotStageHosting
      ? operation({ serializedWrites: "false", fetcher })
      : operation({}, { serializedWrites: "false", fetcher }), /SERIALIZED_WRITES=true/);
  }
  assert.equal(calls, 0);
  const workflow = readFileSync(new URL("../.github/workflows/deploy-stage.yml", import.meta.url), "utf8");
  const start = workflow.indexOf('          if [ "$ORIDER_STAGE_HOSTING_SERIALIZED_WRITES" != true ]; then');
  const end = workflow.indexOf('          git fetch --no-tags', start);
  assert.ok(start >= 0 && end > start);
  for (const later of ["google-github-actions/auth", "--phase snapshot", "firebase deploy --config"]) assert.ok(start < workflow.indexOf(later));
  assert.match(workflow, /group: deploy-hosting-stage/); assert.match(workflow, /cancel-in-progress: false/);
  const root = mkdtempSync(resolve(tmpdir(), "bundled-serialized-guard-"));
  try {
    for (const value of ["false", "true"]) {
      const marker = resolve(root, value);
      const actual = spawnSync("bash", ["-euc", `${workflow.slice(start, end)}\ntouch "$GUARD_MARKER"`], { cwd: root, encoding: "utf8", env: { ...process.env, ORIDER_STAGE_HOSTING_SERIALIZED_WRITES: value, GUARD_MARKER: marker } });
      assert.equal(actual.status, value === "true" ? 0 : 1); assert.equal(existsSync(marker), value === "true");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("observed intervening release changes abort publication and compensating rollback without POST", async () => {
  const previous = "sites/orider-dev/versions/previous", active = "sites/orider-dev/versions/ours";
  const snapshot = { schemaVersion: 1, site: "orider-dev", channel: "live", previousVersion: previous, previousRelease: "sites/orider-dev/releases/previous", marker: `bundled-stage:${"a".repeat(40)}:123:1` };
  for (const operation of [verifyStagePublishPointer, rollbackStageHosting]) {
    let reads = 0, writes = 0;
    const fetcher = async (url, options) => {
      if (options.method === "POST") writes++;
      if (url.endsWith("/channels/live")) {
        reads++;
        return Response.json({ name: "sites/orider-dev/channels/live", release: { name: `sites/orider-dev/releases/${reads === 1 ? operation === verifyStagePublishPointer ? "previous" : "ours" : "other"}`, version: { name: operation === verifyStagePublishPointer ? previous : active }, message: snapshot.marker } });
      }
      return Response.json({ name: previous, status: "FINALIZED" });
    };
    await assert.rejects(operation(snapshot, { serializedWrites: "true", token: "fixture", fetcher }), /live release changed/);
    assert.equal(writes, 0); assert.equal(reads, 2);
  }
  const workflow = readFileSync(new URL("../.github/workflows/deploy-stage.yml", import.meta.url), "utf8");
  assert.ok(workflow.indexOf("--phase check-publish") < workflow.indexOf("firebase deploy --config"));
});

test("development backend identity is re-read after callable probes and after the final public API probe", async () => {
  for (const finalPath of ["/v1/activity-narrative", "/publicClubs?size=1"]) {
    const f = fixture();
    const drift = async (url, options) => {
      const response = await f.fetcher(url, options);
      if (url.endsWith(finalPath) && (options.method === "POST" || finalPath.includes("publicClubs"))) f.setHealth({ status: "ok", exposure: "public", sourceSha: "d".repeat(40), topologyHash: topology });
      return response;
    };
    try {
      if (finalPath.includes("publicClubs")) {
        await f.prepare(); f.build(); await sealBundledStage(f.directory, f.fetcher);
        await assert.rejects(verifyBundledStage(f.directory, drift), /source\/topology mismatch/);
      } else await assert.rejects(f.prepare({ fetcher: drift }), /source\/topology mismatch/);
    } finally { f.cleanup(); }
  }
});
test("served HTML requires an executable script rather than a comment, preload or inert script", () => {
  for (const html of ['<!-- <script src="/assets/index-fixture.js"></script> -->', '<link rel="preload" href="/assets/index-fixture.js">', '<script type="application/json" src="/assets/index-fixture.js"></script>', '<template><script src="/assets/index-fixture.js"></script></template>', '<script nomodule src="/assets/index-fixture.js"></script>', '<svg><script src="/assets/index-fixture.js"></script></svg>', '<script src="assets/index-fixture.js"></script>', '<base href="https://orider.co.kr/"><script src="/assets/index-fixture.js"></script>']) {
    assert.throws(() => stageHtmlEntry(html, "fixture URL"), /script missing in fixture URL/);
  }
  assert.throws(() => stageHtmlEntry('<head><noscript><script type="module" src="/assets/index-fixture.js"></script></noscript></head>'), /entry script missing/u);
  assert.equal(stageHtmlEntry('<script type="module" crossorigin src="/assets/index-fixture.js"></script>'), "assets/index-fixture.js");
  const workflow = readFileSync(new URL("../.github/workflows/deploy-stage.yml", import.meta.url), "utf8");
  assert.match(workflow, /detail=\$\(entry /);
  assert.match(workflow, /node scripts\/stage-html-entry.mjs "\$1"/);
  assert.match(workflow, /always\(\) && \(failure\(\) \|\| cancelled\(\)\)/);
  assert.ok(workflow.split("\n").filter(line => line.includes("curl ")).every(line => line.includes("--connect-timeout 10 --max-time 30")));
});

test("fresh pre-install preparation loads without jsdom or node_modules", () => {
  const root = mkdtempSync(resolve(tmpdir(), "bundled-preinstall-"));
  try {
    cpSync(new URL("./", import.meta.url), resolve(root, "scripts"), { recursive: true });
    const actual = spawnSync(process.execPath, ["--input-type=module", "-e", 'import { createRequire } from "node:module"; try { createRequire(process.argv[1]).resolve("jsdom"); throw Error("fixture unexpectedly resolves jsdom"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; } await import(process.argv[1]); console.log("preinstall import ready")', new URL(`file://${resolve(root, "scripts/prepare-bundled-stage.mjs")}`).href], { cwd: root, encoding: "utf8", env: { ...process.env, NODE_PATH: "" } });
    assert.equal(actual.status, 0, actual.stderr); assert.match(actual.stdout, /preinstall import ready/);
    assert.equal(existsSync(resolve(root, "node_modules")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("explicit historical legacy verification never invokes a bundled-only source tool", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy-stage.yml", import.meta.url), "utf8");
  const start = workflow.indexOf("          entry() {");
  const end = workflow.indexOf("          built=$(entry ", start);
  assert.ok(start >= 0 && end > start);
  const root = mkdtempSync(resolve(tmpdir(), "bundled-legacy-entry-"));
  try {
    const file = resolve(root, "index.html"); writeFileSync(file, '<script src="/assets/index-historical.js"></script>');
    const actual = spawnSync("bash", ["-euc", `${workflow.slice(start, end)}\nentry "$LEGACY_HTML"`], { cwd: root, encoding: "utf8", env: { ...process.env, SELECTED_TRANSPORT: "legacy", LEGACY_HTML: file } });
    assert.equal(actual.status, 0, actual.stderr); assert.equal(actual.stdout.trim(), "assets/index-historical.js");
    assert.equal(existsSync(resolve(root, "scripts/stage-html-entry.mjs")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("published entry requires matching JavaScript bytes and live REST/webhook alias contracts", async () => {
  const f = fixture();
  try {
    await f.prepare(); f.build();
    const calls = [];
    const fetcher = async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/assets/index-fixture.js")) return new Response("export {};", { headers: { "content-type": "text/javascript; charset=utf-8" } });
      return f.fetcher(url, options);
    };
    assert.equal((await verifyBundledHosting({ environment: "development", directory: resolve(f.workspace, "dist"), fetcher })).verified, true);
    assert.ok(calls.some(({ url }) => url === "https://orider-dev.web.app/api/v1/profile"));
    assert.ok(calls.some(({ url }) => url === "https://orider-dev.web.app/api/strava/webhook"));
    assert.ok(calls.every(({ options }) => options.method !== "POST"));
    const production = { environment: "production", directory: resolve(f.workspace, "dist") };
    const readProduction = (url, options) => {
      if (url === "https://orider.co.kr/" || url.endsWith("/ko/course/nonexistent")) return new Response(readFileSync(resolve(production.directory, "index.html")), { headers: { "Content-Type": "text/html; charset=utf-8" } });
      if (url.endsWith("/runtime-config.json")) return new Response(readFileSync(resolve(production.directory, "runtime-config.json")));
      if (url.endsWith("/sitemap.xml")) return new Response('<?xml version="1.0"?><urlset></urlset>');
      if (url.endsWith("/og-thumbnail/.webp")) return new Response("activityId required", { status: 400 });
      return fetcher(url, options);
    };
    assert.equal((await verifyBundledHosting({ ...production, fetcher: readProduction })).verified, true);
    await assert.rejects(verifyBundledHosting({ ...production,
      fetcher: (url, options) => url.endsWith("/runtime-config.json") ? new Response("{}") : readProduction(url, options),
    }), /runtime differs at https:\/\/orider\.co\.kr\/runtime-config\.json/u);
    await assert.rejects(verifyBundledHosting({ ...production,
      fetcher: (url, options) => url.endsWith("/ko/course/nonexistent") ? new Response(null, { status: 404 }) : readProduction(url, options),
    }), /GET HTTP404 at https:\/\/orider\.co\.kr\/ko\/course\/nonexistent/u);
    await assert.rejects(verifyBundledHosting({ ...production,
      fetcher: (url, options) => url.endsWith("/ko/course/nonexistent") ? new Response('<script type="module" src="/assets/index-fixture.js"></script>') : readProduction(url, options),
    }), /content type differs.*expected=text\/html.*actual=text\/plain/u);
    await assert.rejects(verifyBundledHosting({ ...production,
      fetcher: (url, options) => url.endsWith("/sitemap.xml") ? new Response("<html></html>") : readProduction(url, options),
    }), /sitemap is not XML/u);
    for (const [status, mime, body] of [[404, "text/javascript", "missing"], [200, "text/html", "<html>fallback</html>"], [200, "application/javascript", "wrong bytes"]]) {
      await assert.rejects(verifyBundledHosting({ environment: "development", directory: resolve(f.workspace, "dist"), fetcher: async () => new Response(body, { status, headers: { "content-type": mime } }) }), /https:\/\/orider-dev.web.app\/assets\/index-fixture.js/);
    }
    await assert.rejects(verifyBundledHosting({ environment: "development", directory: resolve(f.workspace, "dist"), fetcher: (url, options) => url.endsWith("/api/strava/webhook") ? Promise.resolve(new Response("not found", { status: 404 })) : fetcher(url, options) }), /HTTP alias GET rejected/);
  } finally { f.cleanup(); }
});
test("uncertain same-run publication is observed boundedly and never reported restored merely from the old pointer", async () => {
  const previous = "sites/orider-dev/versions/previous", next = "sites/orider-dev/versions/new";
  const marker = `bundled-stage:${"a".repeat(40)}:123:1`;
  const snapshot = { schemaVersion: 1, site: "orider-dev", channel: "live", previousVersion: previous, previousRelease: "sites/orider-dev/releases/previous", marker };
  let reads = 0, pauses = 0, writes = 0, active = previous;
  const fetcher = async (url, options) => {
    if (url.endsWith("/channels/live")) { reads++; return Response.json({ name: "sites/orider-dev/channels/live", release: { name: `sites/orider-dev/releases/${active.split("/").at(-1)}`, version: { name: active }, message: active === next ? marker : "previous" } }); }
    if (options.method === "POST") { writes++; active = previous; return Response.json({}); }
    return Response.json({ name: previous, status: "FINALIZED" });
  };
  await assert.rejects(rollbackStageHosting(snapshot, { serializedWrites: "true", token: "fixture", fetcher, pause: async () => { pauses++; } }), /outcome unverified.*bounded observations.*retain the snapshot/);
  assert.equal(reads, 4); assert.equal(pauses, 3); assert.equal(writes, 0);
  reads = 0; pauses = 0;
  assert.equal((await rollbackStageHosting(snapshot, { serializedWrites: "true", token: "fixture", fetcher, pause: async () => { pauses++; active = next; } })).restored, true);
  assert.equal(pauses, 1); assert.equal(writes, 1);
  const workflow = readFileSync(new URL("../.github/workflows/deploy-stage.yml", import.meta.url), "utf8");
  assert.match(workflow, /Retain development release recovery receipt\n        if: always\(\)/);
});
