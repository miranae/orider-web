import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const detailSources = ["/:lang/activity/:activityId", "/:lang/segment/:segmentId", "/:lang/course/:courseId", "/:lang/event/:eventId", "/:lang/club/:groupId"];
const readConfig = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
function run(mutate = () => {}) {
  const fixture = mkdtempSync(join(tmpdir(), "orider-deploy-config-"));
  try {
    const production = readConfig("firebase.json");
    const stage = readConfig("firebase.stage.json");
    mutate({ production, stage });
    for (const directory of [".github", "scripts"]) symlinkSync(join(root, directory), join(fixture, directory), "dir");
    writeFileSync(join(fixture, "firebase.json"), JSON.stringify(production));
    writeFileSync(join(fixture, "firebase.stage.json"), JSON.stringify(stage));
    return spawnSync(process.execPath, [join(root, "scripts/check-deploy-config.mjs")], { cwd: fixture, encoding: "utf8" });
  } finally { rmSync(fixture, { recursive: true, force: true }); }
}

test("stage detail entries resolve to the site's SPA while production keeps SEO and service rewrites", () => {
  const stage = readConfig("firebase.stage.json");
  const production = readConfig("firebase.json");
  const matches = (source, path) => source === "!/@(assets)/**" ? !path.startsWith("/assets/")
    : new RegExp(`^${source.split("/").map(part => part.startsWith(":") ? "[^/]+" : part === "**" ? ".*" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/")}$`).test(path);
  for (const source of detailSources) {
    for (const language of ["ko", "en"]) {
      const path = source.replace(":lang", language).replace(/:[^/]+$/, "fixture-id");
      assert.equal(stage.hosting.rewrites.find(rule => matches(rule.source, path))?.destination, "/index.html", path);
    }
    assert.equal(production.hosting.rewrites.find(rule => rule.source === source)?.function?.functionId, "seoPrerender");
  }
  for (const source of ["/api/v1/**", "/api/strava/webhook", "/og-thumbnail/**", "/sitemap.xml"]) {
    assert.equal(stage.hosting.rewrites.find(rule => rule.source === source), undefined);
    assert.ok(production.hosting.rewrites.find(rule => rule.source === source)?.function);
  }
  const result = run();
  assert.equal(result.status, 0, result.stderr);
});
for (const source of detailSources) test(`rejects reintroducing stage SEO rewrite ${source}`, () => {
  const result = run(({ stage }) => stage.hosting.rewrites.splice(-1, 0, { source, function: { functionId: "seoPrerender", region: "asia-northeast3" } }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /detail routes must use the local SPA fallback/);
});
test("rejects a generic stage prerender rewrite", () => {
  const result = run(({ stage }) => stage.hosting.rewrites.splice(-1, 0, { source: "/**", function: "seoPrerender" }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /detail routes must use the local SPA fallback/);
});
test("rejects removing production SEO rewrites", () => {
  const result = run(({ production }) => { production.hosting.rewrites = production.hosting.rewrites.filter(rule => !detailSources.includes(rule.source)); });
  assert.equal(result.status, 1);
  for (const source of detailSources) assert.ok(result.stderr.includes(`must route ${source} to seoPrerender`));
});
test("rejects stage fallback ordering and assets being rewritten to HTML", () => {
  for (const mutate of [
    ({ stage }) => stage.hosting.rewrites.unshift(stage.hosting.rewrites.pop()),
    ({ stage }) => { stage.hosting.rewrites.at(-1).source = "**"; },
  ]) {
    const result = run(mutate);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SPA rewrite/);
  }
});
test("rejects adding server rewrites to isolated stage", () => {
  const result = run(({ stage }) => { stage.hosting.rewrites.unshift({ source: "/api/v1/**", function: "api" }); });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /isolated stage must have no server rewrites/);
});

test("development CSP requires the production AI source expression", () => {
  const result = run(({ stage }) => {
    const csp = stage.hosting.headers.find(rule => rule.source === "**").headers.find(header => header.key.toLowerCase() === "content-security-policy");
    csp.value = csp.value.replace("https://orider-ai-api-h5zqzw3n4a-du.a.run.app", "");
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production data AI origin/);
});
test("stage CSP does not mistake a production URL embedded in another source path for its origin", () => {
  const result = run(({ stage }) => {
    const csp = stage.hosting.headers.find(rule => rule.source === "**").headers.find(header => header.key.toLowerCase() === "content-security-policy");
    csp.value = csp.value.replace("connect-src ", "connect-src https://example.invalid/https://orider-ai-api-h5zqzw3n4a-du.a.run.app ");
  });
  assert.equal(result.status, 0, result.stderr);
});

test("development CSP preserves the production Cloud Functions policy", () => {
  for (const replacement of ["", "https:", "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net:8443"]) {
    const result = run(({ stage }) => {
      const csp = stage.hosting.headers.find(rule => rule.source === "**").headers.find(header => header.key.toLowerCase() === "content-security-policy");
      csp.value = csp.value.replace("https://*.cloudfunctions.net", replacement);
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /preserve production CSP directive connect-src/);
  }
});

test("manual-only development intentionally freezes publication for missing/false assertion before auth", () => {
  const workflow = readFileSync(join(root, ".github/workflows/deploy-stage.yml"), "utf8");
  const events = workflow.split("\npermissions:")[0].match(/^  [a-z_]+:/gm)?.map(value => value.trim());
  assert.deepEqual(events, ["workflow_dispatch:"]);
  assert.match(workflow, /group: deploy-hosting-stage/); assert.match(workflow, /cancel-in-progress: false/);
  const start = workflow.indexOf('          if [ "$ORIDER_STAGE_HOSTING_SERIALIZED_WRITES" != true ]; then');
  const end = workflow.indexOf("\n          fi\n", start);
  assert.ok(start > 0 && end > start);
  assert.ok(start < workflow.indexOf("google-github-actions/auth")); assert.ok(start < workflow.indexOf("firebase deploy"));
  for (const value of ["", "false", "true"]) {
    const actual = spawnSync("bash", ["-euc", `${workflow.slice(start, end)}\nfi\nprintf 'writer-authorized'`], { encoding: "utf8", env: { ...process.env, ORIDER_STAGE_HOSTING_SERIALIZED_WRITES: value } });
    assert.equal(actual.status, value === "true" ? 0 : 1);
    assert.equal(actual.stdout.includes("writer-authorized"), value === "true");
  }
});
