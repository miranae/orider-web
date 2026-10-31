import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { isJsxDeletionOnly, validateScope } from "./feature-test-scope.mjs";

const script = readFileSync("scripts/merge-pr.sh", "utf8");
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;

test("feature gate forwards changed flags only to Vitest while the full test chain stays complete", () => {
  assert.equal(packageScripts["test:vitest"], "NODE_OPTIONS=--no-experimental-webstorage vitest run");
  assert.equal(packageScripts.test, "npm run test:vitest && npm run test:contracts");
  assert.equal(packageScripts["test:contracts"], ["test:production-hosting-evidence", "test:merge-gate-ci-reuse",
    "test:social-callable-contract", "test:runtime-config-writer", "test:canonical-deploy-env", "test:deploy-config",
    "test:dco", "test:merge-pr-review-range", "test:script-tests-wired", "test:quality-alert-count",
    "check:canonical-contract", "test:test-script-forwarding", "test:merge-check-policy", "test:merge-review", "test:merge-gate-report", "check:product-invariants", "test:product-invariants", "test:linear-backport", "test:production-monitor"].map(name => `npm run ${name}`).join(" && "));
  const targeted = [...script.matchAll(/run_step "targeted Vitest"[^\n]*\\\n\s*([^\n]+)/gu)].map(match => match[1]).find(command => command.includes("--changed"));
  assert.ok(targeted, "the feature gate must have a targeted test command");
  assert.match(targeted, /^npm run test:vitest -- --changed "origin\/\$BASE" --passWithNoTests$/u);
  assert.match(script, /run_step "npm test"[^\n]* npm test\n/u, "the full gate must retain npm test");
  const dir = mkdtempSync(join(tmpdir(), "merge-gate-vitest-"));
  try {
    const bin = join(dir, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { "test:vitest": packageScripts["test:vitest"] } }));
    const vitest = join(bin, "vitest");
    writeFileSync(vitest, `#!/usr/bin/env node\nconsole.log('FORWARDED=' + JSON.stringify({ args: process.argv.slice(2), nodeOptions: process.env.NODE_OPTIONS }));\n`);
    chmodSync(vitest, 0o755);
    const output = execFileSync("bash", ["-c", `set -e\nBASE=dev\nrun_step() { shift 2; "$@"; }\nrun_step "targeted Vitest" "output" ${targeted}`], { cwd: dir, encoding: "utf8" });
    const forwarded = JSON.parse(output.match(/^FORWARDED=(.+)$/mu)?.[1] ?? "null");
    assert.deepEqual(forwarded, { args: ["run", "--changed", "origin/dev", "--passWithNoTests"], nodeOptions: "--no-experimental-webstorage" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

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

// JSX 삭제 전용 테스트 선택 회귀: 기존 계약 suite에 포함해 npm test 연결을 유지한다.
const before = `import { run } from './service'; export function Button({ ready }) {
 const handler = () => run('safe');
 return <div><button onClick={() => run('strava')}>Strava</button><span>{ready && 'Ready'}</span></div>;
}`;
const after = before.replace("<button onClick={() => run('strava')}>Strava</button>", "");

test("기존 JSX 자식 element 삭제만 허용한다", () => {
  assert.equal(isJsxDeletionOnly(before, after), true);
  assert.equal(isJsxDeletionOnly(after, before), false);
  assert.equal(isJsxDeletionOnly(before, before), false);
  assert.equal(isJsxDeletionOnly(before, after.replace("'safe'", "'danger'")), false);
  assert.equal(isJsxDeletionOnly(before, before.replace("'strava'", "'other'")), false);
  assert.equal(isJsxDeletionOnly(before, after.replace("./service", "./other")), false);
  assert.equal(isJsxDeletionOnly(before, after.replace("{ ready }", "{ ready, extra }")), false);
  assert.equal(isJsxDeletionOnly(before, after.replace("ready &&", "!ready &&")), false);
  assert.equal(isJsxDeletionOnly(before, after.replace("<span>", "<span onClick={handler}>")), false);
  assert.equal(isJsxDeletionOnly(before, "broken ("), false);
  assert.equal(isJsxDeletionOnly(`/** @jsxImportSource react */\n${before}`, `/** @jsxImportSource other */\n${after}`), false);
  assert.equal(isJsxDeletionOnly(before, `/** @jsxRuntime classic */\n${after}`), false);
  assert.equal(isJsxDeletionOnly(before.replace("ready &&", "!ready &&"), after.replace("ready &&", "~ready &&")), false);
  assert.equal(isJsxDeletionOnly(before, after.replace("const handler", "let handler")), false);
  assert.equal(isJsxDeletionOnly(before.replace("Ready", "Ready  now"), after.replace("Ready", "Ready now")), false);
});

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "feature-test-scope-"));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const write = (file, text) => { mkdirSync(dirname(join(cwd, file)), { recursive: true }); writeFileSync(join(cwd, file), text); };
  git("init", "-q"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
  write("tsconfig.json", JSON.stringify({ compilerOptions: { jsx: "react-jsx", moduleResolution: "bundler", baseUrl: ".", paths: { "@/*": ["src/*"] } } }));
  write("src/components/Button.tsx", before);
  write("src/components/Button.test.tsx", "test('button', () => {});");
  write("src/contexts/Auth.tsx", "import { Button } from '@/components/Button'; export const Auth = () => <Button />;");
  write("src/contexts/Auth.test.tsx", "test('auth', () => {});");
  write("src/components/Card.tsx", "export { Button } from './Button';");
  write("src/components/Card.test.tsx", "test('card', () => {});");
  write("src/pages/Unrelated.tsx", "import { Auth } from '../contexts/Auth'; export const Page = () => <Auth />;");
  git("add", "."); git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  write("src/components/Button.tsx", after);
  git("add", "."); git("commit", "-qm", "hide button");
  const tests = ["src/components/Button.test.tsx", "src/components/Card.test.tsx", "src/contexts/Auth.test.tsx"];
  const validate = (overrides = {}) => validateScope({ cwd, base, head: "HEAD", tier: "feature", tests, ...overrides });
  const commit = () => { git("add", "."); git("commit", "-qm", "change"); };
  return { cwd, write, git, base, tests, validate, commit, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

test("변경 컴포넌트와 직접 소비자 테스트만 필수, context 경유 무관 테스트는 제외", () => {
  const f = fixture();
  try {
    const result = f.validate();
    assert.deepEqual(result.tests, [...f.tests].sort());
    assert.equal(result.base, f.base);
    assert.equal(result.head, f.git("rev-parse", "HEAD"));
    assert.throws(() => f.validate({ tests: f.tests.slice(0, 1) }), /필수 테스트 누락/);
    assert.throws(() => f.validate({ tests: [...f.tests, "../outside.test.tsx"] }), /유효하지 않은/);
    assert.throws(() => f.validate({ tier: "full" }), /feature→dev/);
  } finally { f.cleanup(); }
});

test("changed test도 필수, 혼재하는 hook/설정 변경은 거부", () => {
  const f = fixture();
  try {
    f.write("src/pages/Unrelated.test.tsx", "test('extra', () => {});"); f.commit();
    assert.throws(() => f.validate(), /필수 테스트 누락.*Unrelated/);
    assert.equal(f.validate({ tests: [...f.tests, "src/pages/Unrelated.test.tsx"] }).tests.length, 4);
    f.write("src/hooks/useState.ts", "export const state = 1;"); f.commit();
    assert.throws(() => f.validate(), /기존 --changed/);
  } finally { f.cleanup(); }
});

test("직접 consumer 테스트 부재/handler 변경/컴포넌트 파일삭제는 fail closed", () => {
  for (const mutation of ["missing-test", "handler", "delete"]) {
    const f = fixture();
    try {
      if (mutation === "missing-test") f.git("rm", "src/contexts/Auth.test.tsx");
      if (mutation === "handler") f.write("src/components/Button.tsx", after.replace("'safe'", "'other'"));
      if (mutation === "delete") f.git("rm", "src/components/Button.tsx");
      f.commit();
      assert.throws(() => f.validate());
    } finally { f.cleanup(); }
  }
});

const mergeScript = readFileSync(new URL("./merge-pr.sh", import.meta.url), "utf8");
test("wrapper는 정확한 PR head의 범위를 검증하며 기본/full 게이트를 유지한다", () => {
  assert.match(mergeScript, /--head "\$HEAD_OID" --tier "\$GATE_TIER"/);
  assert.match(mergeScript, /test_scope=\$TEST_SCOPE_EVIDENCE/);
  assert.match(mergeScript, /검증 범위: \$\{TEST_SCOPE_EVIDENCE/);
  assert.match(mergeScript, /"npm test".*npm test/u);
  execFileSync("bash", ["-n", "scripts/merge-pr.sh"]);
});

test("명시적 파일은 Vitest에 전달하고 기존 changed 및 계약 게이트도 유지한다", () => {
  const feature = mergeScript.slice(mergeScript.indexOf('if [[ "$GATE_TIER" == "feature" ]]; then\n  [[ -d node_modules ]]'));
  assert.match(feature, /npm run test:vitest -- "\$\{TEST_FILES\[@\]\}"/);
  assert.match(feature, /npm run test:vitest -- --changed "origin\/\$BASE" --passWithNoTests/);
  assert.match(feature, /npm run test:contracts/);
  assert.ok(feature.indexOf('"${TEST_FILES[@]}"') < feature.indexOf('--passWithNoTests'));
});
