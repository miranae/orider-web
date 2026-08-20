import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync("scripts/merge-pr.sh", "utf8");
const ci = readFileSync(".github/workflows/ci.yml", "utf8");

// 로컬 풀 게이트가 도는 항목을 CI 가 전부 돌지 않으면, 생략은 검증 구멍이 된다.
test("every command the local full gate skips is covered by the CI check job", () => {
  const localCommands = [...script.matchAll(/npm run ([a-z:-]+)/gu)].map((m) => m[1]);
  const gated = ["lint:budget", "quality:budget", "build"].filter((name) => localCommands.includes(name));
  assert.deepEqual(gated, ["lint:budget", "quality:budget", "build"],
    "the local gate must still be the thing we are reasoning about");
  for (const command of [...gated, ]) {
    assert.ok(ci.includes(`npm run ${command}`), `CI must also run ${command}`);
  }
  assert.ok(/^\s+- run: npm test$/mu.test(ci), "CI must run the full unit suite");
});

// 판정을 PR 이 아니라 정확한 head SHA 에 묶어야 한다. 커밋이 바뀌면 재사용이 무효다.
test("the reuse decision is bound to the exact head commit", () => {
  assert.match(script, /head_sha=\$\{HEAD_OID\}/u,
    "the CI conclusion must be looked up by the head commit, not by the PR");
  assert.match(script, /\.head_sha == \$ENV\.HEAD_OID/u,
    "the returned runs must be re-checked against the head commit");
  assert.match(script, /SKIP_REDUNDANT_LOCAL_GATE=1/u);
});

// 이름이 "check" 인 성공 체크를 찾는 방식은 다른 앱/워크플로가 만든 동명 체크로
// 로컬 게이트 전체를 생략시킬 수 있다. 워크플로 신원으로 조회해야 한다.
test("the reuse decision is bound to the ci.yml workflow, not to a check name", () => {
  assert.match(script, /actions\/workflows\/ci\.yml\/runs/u,
    "the lookup must target the ci.yml workflow by identity");
  assert.match(script, /\.path == "\.github\/workflows\/ci\.yml"/u,
    "the returned runs must be re-checked against the workflow path");
  assert.doesNotMatch(script, /select\(\.name == "check"\)/u,
    "a check-name match must not decide the skip");
});

// CI 가 아직 안 끝났으면 예전처럼 로컬에서 돌려 빨리 실패해야 한다.
test("only a completed successful CI run allows the skip", () => {
  const helper = script.slice(script.indexOf("ci_check_conclusion_for_head()"));
  assert.match(helper, /any\(\.status != "completed"\) then "pending"/u,
    "an unfinished run must not be treated as success");
  assert.match(helper, /any\(\.conclusion == "success"\) then "success"/u,
    "a successful run for this exact commit allows the skip");
  assert.match(helper, /length == 0 then "absent"/u,
    "a missing check must fall back to running the gate locally");
  const decision = script.slice(script.indexOf("SKIP_REDUNDANT_LOCAL_GATE=0"));
  assert.match(decision, /success\)\s*SKIP_REDUNDANT_LOCAL_GATE=1/u);
  assert.match(decision, /failure\)\s*die/u, "a failed CI run must stop the merge");
});

// feature→dev 경량 게이트는 CI 를 기다리지 않으므로 재사용 대상이 아니다.
test("the skip never applies to the feature gate or to --no-wait runs", () => {
  const decision = script.slice(script.indexOf("SKIP_REDUNDANT_LOCAL_GATE=0"),
    script.indexOf("log \"PR #$PR_NUM 머지 게이트\""));
  assert.match(decision, /GATE_TIER" == "full"/u);
  assert.match(decision, /WAIT_CHECKS" == 1/u);
});

test("the script still parses", () => {
  execFileSync("bash", ["-n", "scripts/merge-pr.sh"]);
});
