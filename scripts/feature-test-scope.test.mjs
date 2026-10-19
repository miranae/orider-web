import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { isJsxDeletionOnly, validateScope } from "./feature-test-scope.mjs";

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
