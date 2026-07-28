#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_TMP="$(mktemp -d -t orider-codex-review-test)"
trap 'rm -rf "$TEST_TMP"' EXIT

export REAL_GIT="$(command -v git)"
export MOCK_ARGS_FILE="$TEST_TMP/codex-args"
export MOCK_PROMPT_FILE="$TEST_TMP/codex-prompt"

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
[[ "${1:-}" == "exec" ]] || exit 64
shift
out=""
prompt=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sandbox|-C|-c) shift 2 ;;
    -o|--output-last-message) out="$2"; shift 2 ;;
    --ephemeral) shift ;;
    -*) echo "unexpected option: $1" >&2; exit 64 ;;
    *) [[ -z "$prompt" && $# -eq 1 ]] || { echo "unexpected positional argument: $1" >&2; exit 64; }; prompt="$1"; shift ;;
  esac
done
printf '%s\n' "$prompt" >"$MOCK_PROMPT_FILE"
case "${MOCK_RESPONSE_MODE:-verdict}" in
  verdict) printf 'mock Codex comment\nMERGE_VERDICT: %s\n' "${MOCK_VERDICT:-PASS}" >"$out" ;;
  crlf) printf 'mock Codex comment\r\nMERGE_VERDICT: PASS\r\n' >"$out" ;;
  postscript) printf 'mock Codex comment\nMERGE_VERDICT: PASS\ntrailing postscript\n' >"$out" ;;
  embedded) printf 'summary contains MERGE_VERDICT: PASS\n' >"$out" ;;
  quoted) printf '"MERGE_VERDICT: PASS"\n' >"$out" ;;
  case_mismatch) printf 'MERGE_VERDICT: pass\n' >"$out" ;;
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
  TMPDIR="$TEST_TMP" PATH="$TEST_TMP/bin:$PATH" "$REPO_ROOT/scripts/merge-pr.sh" 1 --no-merge --no-wait --skip-build 2>&1
}

pass_output="$(MOCK_VERDICT=PASS run_gate)"
grep -q "리뷰 PASS" <<<"$pass_output"
grep -qx "exec" "$MOCK_ARGS_FILE"
grep -qx -- "--ephemeral" "$MOCK_ARGS_FILE"
grep -qx -- "-o" "$MOCK_ARGS_FILE"
grep -qx 'model_reasoning_effort="low"' "$MOCK_ARGS_FILE"
awk 'previous == "--sandbox" && $0 == "read-only" { found++ } { previous=$0 } END { exit found == 1 ? 0 : 1 }' "$MOCK_ARGS_FILE"
awk -v root="$REPO_ROOT" 'previous == "-C" && $0 == root { found++ } { previous=$0 } END { exit found == 1 ? 0 : 1 }' "$MOCK_ARGS_FILE"
grep -q "당신은 머지 직전 엄격한 코드 리뷰어다" "$MOCK_PROMPT_FILE"
grep -q 'origin/main\.\.\.HEAD' "$MOCK_PROMPT_FILE"
grep -q "MERGE_VERDICT: PASS" "$MOCK_PROMPT_FILE"
if grep -Eq '^-m$|^--model$' "$MOCK_ARGS_FILE"; then
  echo "fast review must not pin a model" >&2
  exit 1
fi

full_output="$(MOCK_CHANGED=src/example.ts MOCK_VERDICT=PASS run_gate)"
grep -q "리뷰 PASS" <<<"$full_output"
grep -qx 'model_reasoning_effort="medium"' "$MOCK_ARGS_FILE"

crlf_output="$(MOCK_RESPONSE_MODE=crlf run_gate)"
grep -q "리뷰 PASS" <<<"$crlf_output"

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

for invalid_mode in postscript embedded quoted case_mismatch; do
  set +e
  invalid_output="$(MOCK_RESPONSE_MODE="$invalid_mode" run_gate)"
  invalid_rc=$?
  set -e
  [[ "$invalid_rc" -ne 0 ]]
  grep -q "MERGE_VERDICT.*누락" <<<"$invalid_output"
done

echo "merge-pr Codex review tests passed"
