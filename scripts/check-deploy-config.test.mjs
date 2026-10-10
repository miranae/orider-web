import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const detailSources = ["/:lang/activity/:activityId", "/:lang/segment/:segmentId", "/:lang/course/:courseId", "/:lang/event/:eventId"];
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
    assert.deepEqual(stage.hosting.rewrites.find(rule => rule.source === source), production.hosting.rewrites.find(rule => rule.source === source));
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
test("rejects losing stage API routing", () => {
  const result = run(({ stage }) => { stage.hosting.rewrites = stage.hosting.rewrites.filter(rule => rule.source !== "/api/v1/**"); });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must route \/api\/v1\/\*\* to api/);
});
