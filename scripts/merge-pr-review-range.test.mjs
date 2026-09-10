// 리뷰 범위 기본값(델타) 계약. 전체 diff 가 Codex 입력 상한(1,048,576자)을 넘겨 리뷰가 아예
// 실행되지 않은 사고(2026-09-10, #2476 = 1,077,018자) 이후 도입. 텍스트 매칭이 아니라 실제
// 임시 저장소에서 함수를 실행해 범위 판정을 검증한다.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const mergeScript = readFileSync(new URL("./merge-pr.sh", import.meta.url), "utf8");

function extractFunction(name) {
  const start = mergeScript.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `${name} 정의를 찾지 못했다`);
  const end = mergeScript.indexOf("\n}\n", start);
  assert.notEqual(end, -1, `${name} 종료를 찾지 못했다`);
  return mergeScript.slice(start, end + 3);
}

const resolveFn = extractFunction("resolve_review_range");

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "merge-pr-review-range-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  const commit = (msg) => {
    writeFileSync(join(dir, "f.txt"), `${msg}\n`);
    git("add", "-A");
    git("commit", "-q", "-m", msg);
    return git("rev-parse", "HEAD");
  };
  return { dir, git, commit };
}

// 함수만 떼어 실행한다. die/log 는 테스트용 스텁.
function runResolve(dir, { head, mode = "delta", since = "", prNum = "42" }) {
  const script = `
set -uo pipefail
die() { printf 'DIE:%s\\n' "$1"; exit 9; }
log() { printf 'LOG:%s\\n' "$1"; }
REVIEW_STATE_REF_PREFIX="refs/codex-review/pr-"
BASE="dev"
HEAD_OID="${head}"

REVIEW_RANGE_MODE="${mode}"
REVIEW_SINCE="${since}"
PR_NUM="${prNum}"
${resolveFn}
resolve_review_range
printf 'FROM=%s\\nLABEL=%s\\n' "$REVIEW_FROM_REV" "$REVIEW_RANGE_LABEL"
`;
  const r = spawnSync("bash", ["-c", script], { cwd: dir, encoding: "utf8" });
  return { ...r, out: `${r.stdout}${r.stderr}` };
}

test("기록된 시작점이 없으면 PR 전체를 본다", () => {
  const { dir, commit } = makeRepo();
  try {
    const base = commit("base");
    const head = commit("head");
    const { out } = runResolve(dir, { head });
    assert.match(out, /FROM=origin\/dev/);
    assert.match(out, /LABEL=full\(/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("직전 PASS head 가 HEAD 의 조상이면 그 이후만 본다", () => {
  const { dir, git, commit } = makeRepo();
  try {
    const base = commit("base");
    const reviewed = commit("reviewed");
    const head = commit("head");
    git("update-ref", "refs/codex-review/pr-42", reviewed);
    const { out } = runResolve(dir, { head });
    assert.match(out, new RegExp(`FROM=${reviewed}`));
    assert.match(out, /LABEL=delta\(/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("이미 PASS 한 head 를 다시 돌리면 전체로 본다 — 빈 diff 로 통과시키지 않는다", () => {
  const { dir, git, commit } = makeRepo();
  try {
    const base = commit("base");
    const head = commit("head");
    git("update-ref", "refs/codex-review/pr-42", head);
    const { out } = runResolve(dir, { head });
    assert.match(out, /FROM=origin\/dev/);
    assert.match(out, /LABEL=full\(/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("기록된 시작점이 조상이 아니면(force-push) 전체로 되돌린다", () => {
  const { dir, git, commit } = makeRepo();
  try {
    const base = commit("base");
    const head = commit("head");
    git("checkout", "-q", "-b", "other", base);
    const orphan = commit("orphan");
    git("checkout", "-q", "main");
    git("update-ref", "refs/codex-review/pr-42", orphan);
    const { out } = runResolve(dir, { head });
    assert.match(out, /FROM=origin\/dev/);
    assert.match(out, /LABEL=full\(/);
    assert.match(out, /조상이 아닙니다/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--review-full 은 기록을 무시하고 전체를 본다", () => {
  const { dir, git, commit } = makeRepo();
  try {
    const base = commit("base");
    const reviewed = commit("reviewed");
    const head = commit("head");
    git("update-ref", "refs/codex-review/pr-42", reviewed);
    const { out } = runResolve(dir, { head, mode: "full" });
    assert.match(out, /FROM=origin\/dev/);
    assert.match(out, /LABEL=full\(/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--review-since 는 기록보다 우선하고, 해석 불가면 머지를 멈춘다", () => {
  const { dir, git, commit } = makeRepo();
  try {
    const base = commit("base");
    const pinned = commit("pinned");
    const head = commit("head");
    git("update-ref", "refs/codex-review/pr-42", base);
    const ok = runResolve(dir, { head, since: pinned });
    assert.match(ok.out, new RegExp(`FROM=${pinned}`));
    assert.match(ok.out, /--review-since/);
    const bad = runResolve(dir, { head, since: "no-such-ref" });
    assert.equal(bad.status, 9);
    assert.match(bad.out, /DIE:.*--review-since/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("리뷰 입력 상한 가드와 PASS 시에만 기록하는 계약이 스크립트에 있다", () => {
  assert.match(mergeScript, /REVIEW_MAX_DIFF_BYTES=\d+/);
  assert.match(mergeScript, /리뷰 입력이 상한을 넘습니다/);
  const passBlock = mergeScript.slice(mergeScript.indexOf('elif [[ "$verdict" == "PASS" ]]'));
  assert.match(passBlock.slice(0, 400), /git update-ref "\$\{REVIEW_STATE_REF_PREFIX\}\$\{PR_NUM\}"/);
  const blockIdx = mergeScript.indexOf('if [[ "$verdict" == "BLOCK" ]]');
  const passIdx = mergeScript.indexOf('elif [[ "$verdict" == "PASS" ]]');
  assert.ok(blockIdx < passIdx, "BLOCK 분기가 PASS 분기보다 앞이어야 한다");
  assert.equal(mergeScript.slice(blockIdx, passIdx).includes("update-ref"), false,
    "BLOCK 경로에서 델타 시작점을 기록하면 안 된다");
});
