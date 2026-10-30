import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { IsolationError, claudeJsonSchema, parseReview, reviewBinding, reviewWithFallback, runChild, validateSelfReview } from "./merge-review.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "merge-review-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const binding = reviewBinding({ pr: 42, head: "a".repeat(40), base: "b".repeat(40), baseRef: "dev", reviewFrom: "b".repeat(40), scope: "blockers-only" }, "real diff\n");
  return { root, binding, diff: "real diff\n", input: "review prompt and diff", evidenceDir: join(root, "evidence") };
}
const result = (verdict, code = 0) => ({ code, stdout: JSON.stringify({ verdict, findings: verdict === "BLOCK" ? "BLOCKER src/file.ts:1 broken" : "결함 없음" }) });
const unavailable = () => ({ code: 1, reason: "auth_unavailable", stdout: "" });
const report = binding => ({ binding, reviewer: "current-agent", reviewedAt: "2026-10-24T00:00:00Z", findings: "정확한 diff의 변경/호출 경로와 회귀를 검토했고 결함 없음", verdict: "PASS" });

test("Codex PASS ends review without calling Claude", async t => {
  const f = fixture(t), calls = [];
  const actual = await reviewWithFallback({ ...f, providers: [
    { name: "codex", run: async () => { calls.push("codex"); return result("PASS"); } },
    { name: "claude", run: async () => { calls.push("claude"); return result("PASS"); } },
  ] });
  assert.equal(actual.provider, "codex"); assert.equal(actual.state, "PASS"); assert.deepEqual(calls, ["codex"]);
});

test("valid BLOCK is terminal even if Codex exits nonzero, including later self-review attempts", async t => {
  const f = fixture(t), calls = [];
  const providers = [
    { name: "codex", run: async () => { calls.push("codex"); return result("BLOCK", 42); } },
    { name: "claude", run: async () => { calls.push("claude"); return result("PASS"); } },
  ];
  assert.equal((await reviewWithFallback({ ...f, providers })).state, "BLOCK");
  const selfReviewFile = join(f.root, "self.json"); writeFileSync(selfReviewFile, JSON.stringify(report(f.binding)));
  assert.equal((await reviewWithFallback({ ...f, selfReviewFile, providers })).state, "BLOCK");
  assert.deepEqual(calls, ["codex"]);
});

test("Codex unavailable uses Claude structured output; Claude nonzero BLOCK is terminal", async t => {
  for (const [verdict, code] of [["PASS", 0], ["BLOCK", 1]]) {
    const f = fixture(t);
    const actual = await reviewWithFallback({ ...f, providers: [
      { name: "codex", run: async () => unavailable() },
      { name: "claude", run: async () => ({ code, stdout: JSON.stringify({ structured_output: JSON.parse(result(verdict).stdout) }) }) },
    ] });
    assert.equal(actual.provider, "claude"); assert.equal(actual.state, verdict);
  }
});

test("a concurrent late PASS cannot overwrite an earlier same-input BLOCK", async t => {
  const f = fixture(t);
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const slow = reviewWithFallback({ ...f, providers: [{ name: "codex", run: () => waiting }] });
  const blocked = await reviewWithFallback({ ...f, providers: [{ name: "codex", run: async () => result("BLOCK") }] });
  release(result("PASS"));
  assert.equal(blocked.state, "BLOCK"); assert.equal((await slow).state, "BLOCK");
  assert.equal(JSON.parse(readFileSync(join(f.evidenceDir, "report.json"), "utf8")).state, "BLOCK");
});

test("an interrupted provider cannot pass from a partial PASS response", async t => {
  const f = fixture(t);
  const actual = await reviewWithFallback({ ...f, providers: [
    { name: "codex", run: async () => ({ ...result("PASS"), reason: "timeout" }) },
    { name: "claude", run: async () => result("PASS") },
  ] });
  assert.equal(actual.provider, "claude");
});

test("both providers unavailable persist pending evidence, then exact self review resumes without rerunning CLIs", async t => {
  const f = fixture(t); let calls = 0;
  const providers = ["codex", "claude"].map(name => ({ name, run: async () => { calls++; return unavailable(); } }));
  const pending = await reviewWithFallback({ ...f, providers });
  assert.equal(pending.state, "needs-self-review"); assert.equal(calls, 2);
  assert.equal(readFileSync(join(f.evidenceDir, "diff.patch"), "utf8"), f.diff);
  const value = JSON.parse(readFileSync(pending.template, "utf8"));
  assert.equal(value.verdict, "PENDING"); assert.equal(value.reviewer, "");
  writeFileSync(pending.template, JSON.stringify(report(f.binding)));
  const actual = await reviewWithFallback({ ...f, providers, selfReviewFile: pending.template });
  assert.equal(actual.provider, "self"); assert.equal(actual.state, "PASS"); assert.equal(calls, 2);
});

test("self review rejects changed PR/head/base/from/digest/scope and missing actual reviewer evidence", t => {
  const f = fixture(t);
  for (const key of ["pr", "head", "base", "reviewFrom", "baseRef", "diffSha256", "scope"]) {
    assert.throws(() => validateSelfReview(report({ ...f.binding, [key]: "tampered" }), f.binding));
  }
  for (const change of [{ reviewer: "" }, { findings: "" }, { verdict: "PENDING" }, { reviewedAt: "" }, { extra: true }]) {
    assert.throws(() => validateSelfReview({ ...report(f.binding), ...change }, f.binding));
  }
  assert.equal(validateSelfReview({ ...report(f.binding), verdict: "BLOCK" }, f.binding).verdict, "BLOCK");
});

test("invalid structured responses fall back but isolation failures never do", async t => {
  for (const output of ["", "not json", '{"verdict":"PASS"}', result("PASS").stdout + "trailing", '{"verdict":"PASS","findings":"ok","extra":true}']) {
    const f = fixture(t);
    const actual = await reviewWithFallback({ ...f, providers: [
      { name: "codex", run: async () => ({ code: 0, stdout: output }) },
      { name: "claude", run: async () => unavailable() },
    ] });
    assert.equal(actual.state, "needs-self-review");
  }
  assert.equal(parseReview(JSON.stringify({ is_error: true, structured_output: JSON.parse(result("PASS").stdout) }), "claude"), null);
  let fallback = false;
  await assert.rejects(reviewWithFallback({ ...fixture(t), providers: [
    { name: "codex", run: async () => { throw new IsolationError("probe failed"); } },
    { name: "claude", run: async () => { fallback = true; return result("PASS"); } },
  ] }), IsolationError);
  assert.equal(fallback, false);
});

test("evidence symlinks cannot overwrite external files or redirect the evidence directory", async t => {
  for (const leaf of ["report.json", "diff.patch", "input.txt", "self-review.json"]) {
    const f = fixture(t); mkdirSync(f.evidenceDir);
    const sentinel = join(f.root, "sentinel"); writeFileSync(sentinel, "keep");
    symlinkSync(sentinel, join(f.evidenceDir, leaf));
    await assert.rejects(reviewWithFallback({ ...f, providers: ["codex", "claude"].map(name => ({ name, run: async () => unavailable() })) }), IsolationError);
    assert.equal(readFileSync(sentinel, "utf8"), "keep");
  }
  const f = fixture(t), other = join(f.root, "other"); mkdirSync(other); symlinkSync(other, f.evidenceDir);
  await assert.rejects(reviewWithFallback({ ...f, providers: [] }), IsolationError);
});

test("timeout kills the provider process group and its child", async () => {
  const source = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log(child.pid);setInterval(()=>{},1000)`;
  const actual = await runChild(process.execPath, ["-e", source], { timeoutMs: 200 });
  assert.equal(actual.reason, "timeout"); assert.notEqual(actual.code, 0);
  const pid = Number(actual.stdout.trim()); assert.ok(pid > 0);
  // 종료된 자식도 OS가 회수할 때까지 잠시 zombie 상태로 보일 수 있다.
  const check = await runChild("/bin/ps", ["-o", "stat=", "-p", String(pid)], { timeoutMs: 1000 });
  assert.ok(!check.stdout.trim() || check.stdout.trim().startsWith("Z"), check.stdout);
});

test("Claude schema drops only the draft 2020-12 declaration the CLI rejects", () => {
  const source = readFileSync(new URL("./codex-review-output.schema.json", import.meta.url), "utf8");
  const { $schema, ...rest } = JSON.parse(source);
  assert.ok($schema);
  assert.deepEqual(JSON.parse(claudeJsonSchema(source)), rest);
});
