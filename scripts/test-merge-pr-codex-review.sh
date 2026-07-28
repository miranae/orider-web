#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_TMP="$(mktemp -d -t orider-codex-review-test)"
SECRET_FIXTURE_DIR="$REPO_ROOT/.codex-review-secret-fixture-$$"
cleanup_test() {
  rm -rf -- "$TEST_TMP" "$SECRET_FIXTURE_DIR"
}
trap cleanup_test EXIT
mkdir -p "$SECRET_FIXTURE_DIR"
printf 'must-not-be-archived\n' >"$SECRET_FIXTURE_DIR/.env"

export REAL_GIT="$(command -v git)"
export REPO_ROOT
export SECRET_FIXTURE_NAME="$(basename "$SECRET_FIXTURE_DIR")"
export MOCK_ARGS_FILE="$TEST_TMP/codex-args"
export MOCK_PROMPT_FILE="$TEST_TMP/codex-prompt"
export MOCK_ARCHIVE_ARGS_FILE="$TEST_TMP/git-archive-args"
export MOCK_REVIEW_DIR_FILE="$TEST_TMP/review-dir"

mkdir -p "$TEST_TMP/bin"
cat >"$TEST_TMP/bin/git" <<'MOCK'
#!/usr/bin/env bash
if [[ "${1:-}" == "fetch" ]]; then
  exit 0
fi
if [[ "${1:-}" == "status" && "${2:-}" == "--porcelain" ]]; then
  exit 0
fi
if [[ "${1:-}" == "diff" && " $* " == *" --name-only "* ]]; then
  echo "${MOCK_CHANGED:-scripts/merge-pr.sh}"
  exit 0
fi
if [[ "${1:-}" == "diff" && " $* " == *" :(glob)src/"* ]]; then
  exit 0
fi
if [[ "${1:-}" == "archive" ]]; then
  printf '%s\n' "$@" >"$MOCK_ARCHIVE_ARGS_FILE"
fi
exec "$REAL_GIT" "$@"
MOCK
cat >"$TEST_TMP/bin/gh" <<'MOCK'
#!/usr/bin/env bash
if [[ "${1:-}" == "pr" && "${2:-}" == "view" ]]; then
  head_oid="$($REAL_GIT rev-parse HEAD)"
  printf '{"state":"OPEN","isDraft":false,"baseRefName":"main","headRefName":"hotfix/codex-review-test","headRefOid":"%s","reviewDecision":"","mergeStateStatus":"CLEAN","url":"https://example.test/pr/1"}\n' "$head_oid"
  exit 0
fi
echo "unexpected gh invocation: $*" >&2
exit 99
MOCK
cat >"$TEST_TMP/bin/codex" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$@" >"$MOCK_ARGS_FILE"
[[ "${1:-}" == "exec" ]] || exit 64
shift
out=""
prompt=""
review_dir=""
schema=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sandbox|-c) shift 2 ;;
    -C) review_dir="$2"; shift 2 ;;
    --output-schema) schema="$2"; shift 2 ;;
    -o|--output-last-message) out="$2"; shift 2 ;;
    --ephemeral|--skip-git-repo-check) shift ;;
    -*) echo "unexpected option: $1" >&2; exit 64 ;;
    *) [[ -z "$prompt" && $# -eq 1 ]] || { echo "unexpected positional argument: $1" >&2; exit 64; }; prompt="$1"; shift ;;
  esac
done
[[ -n "$review_dir" && "$review_dir" != "$REPO_ROOT" ]] || exit 66
[[ "$schema" == "$review_dir/scripts/codex-review-output.schema.json" && -f "$schema" ]] || exit 67
[[ ! -e "$review_dir/.env" && ! -e "$review_dir/$SECRET_FIXTURE_NAME/.env" ]] || exit 68
[[ -s "$review_dir/.codex-review/diff.patch" ]] || exit 69
grep -q '^base=origin/main$' "$review_dir/.codex-review/metadata.txt" || exit 70
grep -q "^head=$($REAL_GIT rev-parse HEAD)$" "$review_dir/.codex-review/metadata.txt" || exit 71
printf '%s\n' "$review_dir" >"$MOCK_REVIEW_DIR_FILE"
printf '%s\n' "$prompt" >"$MOCK_PROMPT_FILE"
case "${MOCK_RESPONSE_MODE:-valid}" in
  valid) printf '{"findings":"mock Codex comment","verdict":"%s"}\n' "${MOCK_VERDICT:-PASS}" >"$out" ;;
  malformed) printf '{"findings":"broken"' >"$out" ;;
  trailing) printf '{"findings":"mock","verdict":"PASS"}\ntrailing postscript\n' >"$out" ;;
  missing) printf '{"findings":"mock"}\n' >"$out" ;;
  extra) printf '{"findings":"mock","verdict":"PASS","extra":true}\n' >"$out" ;;
  invalid_verdict) printf '{"findings":"mock","verdict":"UNKNOWN"}\n' >"$out" ;;
  *) exit 65 ;;
esac
echo "mock Codex execution log" >&2
exit "${MOCK_EXIT:-0}"
MOCK
cat >"$TEST_TMP/bin/npm" <<'MOCK'
#!/usr/bin/env bash
echo "mock npm PASS"
exit 0
MOCK
chmod +x "$TEST_TMP/bin/git" "$TEST_TMP/bin/gh" "$TEST_TMP/bin/codex" "$TEST_TMP/bin/npm"

run_gate() {
  local rc=0 review_dir=""
  TMPDIR="$TEST_TMP" PATH="$TEST_TMP/bin:$PATH" "$REPO_ROOT/scripts/merge-pr.sh" 1 --no-merge --no-wait --skip-build 2>&1 || rc=$?
  if [[ -s "$MOCK_REVIEW_DIR_FILE" ]]; then
    review_dir="$(tail -1 "$MOCK_REVIEW_DIR_FILE")"
    [[ ! -e "$review_dir" ]] || return 98
  fi
  return "$rc"
}

pass_output="$(MOCK_VERDICT=PASS run_gate)"
grep -q "리뷰 PASS" <<<"$pass_output"
grep -qx "exec" "$MOCK_ARGS_FILE"
grep -qx -- "--ephemeral" "$MOCK_ARGS_FILE"
grep -qx -- "--skip-git-repo-check" "$MOCK_ARGS_FILE"
grep -qx -- "-o" "$MOCK_ARGS_FILE"
grep -qx -- "--output-schema" "$MOCK_ARGS_FILE"
grep -qx 'model_reasoning_effort="low"' "$MOCK_ARGS_FILE"
awk 'previous == "--sandbox" && $0 == "read-only" { found++ } { previous=$0 } END { exit found == 1 ? 0 : 1 }' "$MOCK_ARGS_FILE"
if awk -v root="$REPO_ROOT" 'previous == "-C" && $0 == root { found=1 } { previous=$0 } END { exit found ? 0 : 1 }' "$MOCK_ARGS_FILE"; then exit 1; fi
grep -q '/scripts/codex-review-output\.schema\.json$' "$MOCK_ARGS_FILE"
expected_head="$($REAL_GIT rev-parse HEAD)"
grep -qx "archive" "$MOCK_ARCHIVE_ARGS_FILE"
grep -qx "$expected_head" "$MOCK_ARCHIVE_ARGS_FILE"
grep -q "당신은 머지 직전 엄격한 코드 리뷰어다" "$MOCK_PROMPT_FILE"
grep -q 'origin/main\.\.\.HEAD' "$MOCK_PROMPT_FILE"
grep -q '\.codex-review/diff\.patch' "$MOCK_PROMPT_FILE"
grep -q "디렉터리 밖 경로" "$MOCK_PROMPT_FILE"
grep -q "findings" "$MOCK_PROMPT_FILE"
grep -q "verdict" "$MOCK_PROMPT_FILE"
if grep -Eq '^-m$|^--model$' "$MOCK_ARGS_FILE"; then
  echo "fast review must not pin a model" >&2
  exit 1
fi

full_output="$(MOCK_CHANGED=src/example.ts MOCK_VERDICT=PASS run_gate)"
grep -q "리뷰 PASS" <<<"$full_output"
grep -qx 'model_reasoning_effort="medium"' "$MOCK_ARGS_FILE"

set +e
failure_output="$(MOCK_EXIT=42 run_gate)"
failure_rc=$?
set -e
[[ "$failure_rc" -ne 0 ]]
grep -q "mock Codex execution log" <<<"$failure_output"
grep -q "exit=42" <<<"$failure_output"

set +e
block_output="$(MOCK_VERDICT=BLOCK run_gate)"
block_rc=$?
set -e
[[ "$block_rc" -ne 0 ]]
grep -q "mock Codex comment" <<<"$block_output"
grep -q "코드 리뷰 BLOCK" <<<"$block_output"

for invalid_mode in malformed trailing missing extra invalid_verdict; do
  set +e
  invalid_output="$(MOCK_RESPONSE_MODE="$invalid_mode" run_gate)"
  invalid_rc=$?
  set -e
  [[ "$invalid_rc" -ne 0 ]]
  grep -q "구조화 출력 JSON 검증 실패" <<<"$invalid_output"
done

node -e 'const s=require(process.argv[1]); if (s.additionalProperties !== false || s.properties.findings.type !== "string" || s.properties.verdict.enum.join(",") !== "PASS,BLOCK") process.exit(1)' \
  "$REPO_ROOT/scripts/codex-review-output.schema.json"

echo "merge-pr Codex review tests passed"
