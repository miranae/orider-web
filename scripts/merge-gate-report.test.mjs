import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MARKER, renderGateReport } from "./merge-gate-report.mjs";

const base = {
  head: "a".repeat(40), base: "dev", baseSha: "b".repeat(40), tier: "feature", runner: "leeyonghwan", at: "2026-10-31T00:00:00Z",
  steps: "targeted Vitest\ntest:contracts\nTypeScript typecheck\n", notes: "", scriptHash: "c".repeat(40), baseScriptHash: "c".repeat(40),
  reviewDecision: "APPROVED", mergeState: "CLEAN", runReview: true, reviewMode: "full", rangeLabel: "full(origin/dev...aaaaaaaa)", scope: "blockers-only",
};
const claudePass = JSON.stringify({ state: "PASS", provider: "claude", findings: "결함 없음", attempts: [{ provider: "codex", state: "unavailable", reason: "auth_unavailable" }, { provider: "claude", state: "PASS" }] });

test("records the head, runner, passed steps and the reviewer that actually ran", () => {
  const body = renderGateReport({ ...base, reviewJson: claudePass });
  assert.ok(body.startsWith(MARKER));
  assert.match(body, new RegExp(`head \`${"a".repeat(40)}\``));
  assert.match(body, /@leeyonghwan/);
  for (const step of ["targeted Vitest", "test:contracts", "TypeScript typecheck"]) assert.match(body, new RegExp(`✅ ${step}`));
  assert.match(body, /AI 리뷰: \*\*PASS\*\* — 리뷰어 `claude`/);
  assert.match(body, /codex=unavailable\(auth_unavailable\), claude=PASS/);
  assert.match(body, /`origin\/dev` 판과 동일/);
});

test("makes a skipped review and a modified gate script visible", () => {
  const body = renderGateReport({ ...base, runReview: false, scriptHash: "d".repeat(40), notes: "Build 생략 (--skip-build)" });
  assert.match(body, /AI 리뷰: \*\*생략\*\* \(`--no-review`\)/);
  assert.match(body, /\*\*origin\/dev 판과 다름\*\*/);
  assert.match(body, /⚠️ Build 생략 \(--skip-build\)/);
});

test("names the self reviewer and keeps long findings inside a closed code block", () => {
  const findings = "MAJOR src/a.ts:1 ```x```\n" + "y".repeat(5000);
  const body = renderGateReport({ ...base, reviewJson: JSON.stringify({ state: "PASS", provider: "self", reviewer: "moon", findings, attempts: [] }) });
  assert.match(body, /리뷰어 `self` \(moon\)/);
  assert.match(body, /자 생략\)/);
  assert.equal(body.split("```").length, 3, "findings must not break out of the code block");
});

test("the CLI reads the review result file and environment", () => {
  const dir = mkdtempSync(join(tmpdir(), "merge-gate-report-"));
  try {
    const file = join(dir, "review.json"); writeFileSync(file, claudePass);
    const out = execFileSync("node", ["scripts/merge-gate-report.mjs"], { encoding: "utf8", env: { ...process.env,
      GATE_HEAD: "a".repeat(40), GATE_BASE: "dev", GATE_BASE_SHA: "b".repeat(40), GATE_TIER_NAME: "feature", GATE_RUNNER: "r", GATE_AT: "t",
      GATE_STEPS: "targeted Vitest\n", GATE_NOTES: "\n", GATE_SCRIPT_HASH: "c", GATE_BASE_SCRIPT_HASH: "c", GATE_RUN_REVIEW: "1",
      GATE_REVIEW_MODE: "full", GATE_REVIEW_RANGE: "full", GATE_REVIEW_SCOPE: "blockers-only", GATE_REVIEW_FILE: file } });
    assert.match(out, /리뷰어 `claude`/);
    assert.match(out, /✅ targeted Vitest/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("merge-pr.sh posts the report before merging and refuses to merge without it", () => {
  const script = readFileSync("scripts/merge-pr.sh", "utf8");
  const comment = script.indexOf('gh pr comment "$PR_NUM" --body-file "$GATE_REPORT"');
  const merge = script.indexOf('gh pr merge "$PR_NUM" --squash');
  const noMerge = script.indexOf('log "--no-merge: 모든 게이트 통과');
  assert.ok(comment > 0 && merge > comment && comment > noMerge, "the report is posted after the --no-merge exit and right before the merge");
  assert.match(script, /gh pr comment "\$PR_NUM" --body-file "\$GATE_REPORT" >\/dev\/null \|\| die /);
  assert.match(script, /node scripts\/merge-gate-report\.mjs >"\$GATE_REPORT" \|\| die /);
  assert.match(script, /GATE_STEPS\+=\("\$desc"\)/, "every passed run_step is recorded");
  assert.match(script, /cp "\$REVIEW_OUT" "\$REVIEW_RESULT_FILE"/, "the review result survives until the report");
});

test("a review record that cannot be read fails the report instead of showing no result", () => {
  const input = { head: "a".repeat(40), base: "dev", baseSha: "b".repeat(40), tier: "t", runner: "r", at: "t", steps: "", notes: "",
    scriptHash: "c", baseScriptHash: "c", reviewDecision: "", mergeState: "CLEAN", runReview: true, reviewMode: "full", rangeLabel: "", scope: "blockers-only" };
  assert.throws(() => renderGateReport({ ...input, reviewJson: "{broken" }));
  assert.throws(() => renderGateReport({ ...input, reviewJson: "[]" }), /리뷰 기록 형식/u);
  assert.match(renderGateReport({ ...input, reviewJson: "" }), /AI 리뷰: \*\*결과 없음\*\*/u);
});
