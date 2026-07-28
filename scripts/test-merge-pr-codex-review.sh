#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_TMP="$(mktemp -d -t orider-codex-review-test)"
trap 'rm -rf "$TEST_TMP"' EXIT

export REAL_GIT="$(command -v git)"
export MOCK_ARGS_FILE="$TEST_TMP/codex-args"
export MOCK_STDIN_FILE="$TEST_TMP/codex-stdin"

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
cat >"$MOCK_STDIN_FILE"
[[ "${1:-}" == "exec" && "${2:-}" == "review" ]] || exit 64
shift 2
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base|-c) shift 2 ;;
    -o|--output-last-message) out="$2"; shift 2 ;;
    --ephemeral) shift ;;
    *) echo "unexpected positional argument: $1" >&2; exit 64 ;;
  esac
done
printf 'mock Codex comment\nMERGE_VERDICT: %s\n' "${MOCK_VERDICT:-PASS}" >"$out"
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
  TMPDIR="$TEST_TMP" PATH="$TEST_TMP/bin:$PATH" "$REPO_ROOT/scripts/merge-pr.sh" 1 --no-merge --no-wait --skip-build 2>&1
}

pass_output="$(MOCK_VERDICT=PASS run_gate)"
grep -q "리뷰 PASS" <<<"$pass_output"
grep -qx "exec" "$MOCK_ARGS_FILE"
grep -qx "review" "$MOCK_ARGS_FILE"
grep -qx "origin/main" "$MOCK_ARGS_FILE"
grep -qx -- "--ephemeral" "$MOCK_ARGS_FILE"
grep -qx -- "-o" "$MOCK_ARGS_FILE"
grep -qx 'model_reasoning_effort="low"' "$MOCK_ARGS_FILE"
awk 'previous == "-c" && $0 == "sandbox_mode=\"read-only\"" { found++ } { previous=$0 } END { exit found == 1 ? 0 : 1 }' "$MOCK_ARGS_FILE"
grep -q "당신은 머지 직전 엄격한 코드 리뷰어다" "$MOCK_STDIN_FILE"
grep -q "MERGE_VERDICT: PASS" "$MOCK_STDIN_FILE"
if grep -q "당신은 머지 직전 엄격한 코드 리뷰어다" "$MOCK_ARGS_FILE"; then
  echo "review prompt must be passed through stdin, not as a positional argument" >&2
  exit 1
fi
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

set +e
missing_output="$(MOCK_VERDICT=UNKNOWN run_gate)"
missing_rc=$?
set -e
[[ "$missing_rc" -ne 0 ]]
grep -q "MERGE_VERDICT.*누락" <<<"$missing_output"

echo "merge-pr Codex review tests passed"
