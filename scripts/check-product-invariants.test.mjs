import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RULES, scanFiles } from "./check-product-invariants.mjs";

const rule = (overrides = {}) => ({ id: "PX", title: "x", pattern: /forbidden/u, allow: {}, ...overrides });
const run = (files, rules) => scanFiles(Object.keys(files), file => { if (!(file in files)) throw new Error("missing"); return files[file]; }, rules);

test("a new file using a guarded pattern fails, an allowlisted one passes, tests are ignored", () => {
  const rules = [rule({ allow: { "src/old.ts": "" } })];
  assert.deepEqual(run({ "src/old.ts": "forbidden", "src/a.test.ts": "forbidden" }, rules), []);
  assert.match(run({ "src/old.ts": "forbidden", "src/new.ts": "forbidden" }, rules).join(), /PX src\/new\.ts/u);
});

test("an allowlisted file that no longer matches must be removed from the list", () => {
  assert.match(run({ "src/old.ts": "clean" }, [rule({ allow: { "src/old.ts": "" } })]).join(), /허용 목록에 있지만/u);
});

test("P5 rejects reading the impersonation token from the query even in an allowed file, and requires its guard test", () => {
  const p5 = RULES.find(r => r.id === "P5");
  const allowed = Object.fromEntries(Object.keys(p5.allow).map(file => [file, "#impersonateToken="]));
  const guard = { [p5.guardTest.file]: "?impersonateToken=" };
  assert.deepEqual(run({ ...allowed, ...guard }, [p5]), []);
  const query = { ...allowed, ...guard, "src/main.tsx": 'new URLSearchParams(location.search).get("impersonateToken")' };
  assert.match(run(query, [p5]).join(), /쿼리 문자열에서 토큰/u);
  assert.match(run(allowed, [p5]).join(), /원칙을 지키는 테스트/u);
});

test("P1 and P10 catch the removed metric hiding and static map image APIs", () => {
  const p1 = RULES.find(r => r.id === "P1"), p10 = RULES.find(r => r.id === "P10");
  assert.match(run({ ...Object.fromEntries(Object.keys(p1.allow).map(f => [f, "hidePower"])), "src/x.tsx": "activity.hideHr" }, [p1]).join(), /P1 src\/x\.tsx/u);
  assert.match(run({ ...Object.fromEntries(Object.keys(p10.allow).map(f => [f, "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/"])),
    "src/thumb.ts": "https://maps.googleapis.com/maps/api/staticmap?size=1" }, [p10]).join(), /P10 src\/thumb\.ts/u);
});

test("the current tree passes and every [검사] principle in the document has a rule", () => {
  execFileSync("node", ["scripts/check-product-invariants.mjs"], { encoding: "utf8" });
  const doc = readFileSync("docs/product-invariants.md", "utf8");
  const checked = [...doc.matchAll(/^### (P\d+)\..*\[검사\]/gmu)].map(m => m[1]);
  assert.deepEqual(checked, RULES.map(r => r.id));
});

test("merge-pr.sh reviews against the base copy and requires admin approval for principle changes", () => {
  const script = readFileSync("scripts/merge-pr.sh", "utf8");
  assert.match(script, /git show "origin\/\$BASE:\$INVARIANTS_PATH"/u, "the review uses the base branch copy, not the PR's");
  assert.ok(script.indexOf('--blockers-only 기준으로 리뷰하라') < script.indexOf("INVARIANTS_DOC=\"$(git show"),
    "principles are appended after the blockers-only instruction so they are not filtered out as product choices");
  const pat = script.match(/INVARIANTS_PAT='([^']+)'/u)?.[1];
  for (const path of ["docs/product-invariants.md", "scripts/check-product-invariants.mjs", "scripts/check-product-invariants.test.mjs"]) {
    assert.match(path, new RegExp(pat, "u"), `${path} changes need approval`);
  }
  const guard = script.indexOf('die "제품 원칙(문서·검사)을 바꾸는 PR');
  assert.ok(guard > 0 && guard < script.indexOf('if [[ "$DO_MERGE" == 0 ]]'), "the approval check runs before --no-merge exits and before merging");
  assert.ok(guard > script.lastIndexOf('REVIEW_DECISION="$(json_field "$META" reviewDecision)"'), "the approval check uses the final metadata");
});
