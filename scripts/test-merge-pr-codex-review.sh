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
export CODEX_HOME="$TEST_TMP/codex-home"
export EXPECTED_HEAD="$($REAL_GIT rev-parse HEAD)"
export BOOTSTRAP_PROFILE_SHA256="$(shasum -a 256 "$REPO_ROOT/scripts/codex-review.sb" | awk '{print $1}')"

mkdir -p "$TEST_TMP/bin" "$CODEX_HOME"
printf '{}\n' >"$CODEX_HOME/auth.json"
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
if [[ "${1:-}" == "cat-file" && "${2:-}" == "-e" && "${3:-}" == *:scripts/codex-review.sb ]]; then
  exit 1
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
[[ "${1:-}" == "exec" ]] || exit 64
shift
out=""
prompt=""
review_dir=""
schema=""
disabled=""
ignore_user_config=0
read_only=0
skip_git=0
effort=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sandbox) [[ "$2" == "danger-full-access" ]] || exit 72; read_only=1; shift 2 ;;
    -c)
      [[ "$2" == 'shell_environment_policy.inherit="none"' ]] || effort="$2"
      shift 2
      ;;
    -C) review_dir="$2"; shift 2 ;;
    --output-schema) schema="$2"; shift 2 ;;
    --disable) disabled="$disabled $2"; shift 2 ;;
    -o|--output-last-message) out="$2"; shift 2 ;;
    --ignore-user-config) ignore_user_config=1; shift ;;
    --skip-git-repo-check) skip_git=1; shift ;;
    --ephemeral) shift ;;
    -) prompt="$(/bin/cat)"; shift ;;
    -*) echo "unexpected option: $1" >&2; exit 64 ;;
    *) [[ -z "$prompt" && $# -eq 1 ]] || { echo "unexpected positional argument: $1" >&2; exit 64; }; prompt="$1"; shift ;;
  esac
done
[[ "$ignore_user_config" == 1 && "$read_only" == 1 && "$skip_git" == 1 ]] || exit 73
for feature in shell_tool unified_exec code_mode_host multi_agent browser_use in_app_browser computer_use image_generation \
  apps plugins skill_search skill_mcp_dependency_install auth_elicitation goals; do
  [[ " $disabled " == *" $feature "* ]] || exit 83
done
expected_effort='model_reasoning_effort="low"'
[[ "${MOCK_CHANGED:-scripts/merge-pr.sh}" == src/* ]] && expected_effort='model_reasoning_effort="medium"'
[[ "$effort" == "$expected_effort" ]] || exit 74
[[ -n "$review_dir" && "$review_dir" != "$REPO_ROOT" && "$review_dir" == */runtime/cwd ]] || exit 66
snapshot_dir="${schema%/scripts/codex-review-output.schema.json}"
[[ -n "$snapshot_dir" && "$snapshot_dir" != "$review_dir" && -f "$schema" ]] || exit 67
/bin/cat "$CODEX_HOME/auth.json" >/dev/null || exit 82
[[ ! -e "$snapshot_dir/.env" && ! -e "$snapshot_dir/$SECRET_FIXTURE_NAME/.env" ]] || exit 68
[[ -s "$snapshot_dir/.codex-review/diff.patch" ]] || exit 69
grep -q '^base=origin/main$' "$snapshot_dir/.codex-review/metadata.txt" || exit 70
grep -q "^head=$EXPECTED_HEAD$" "$snapshot_dir/.codex-review/metadata.txt" || exit 71
/bin/cat "$snapshot_dir/.codex-review/diff.patch" >/dev/null || exit 75
if /bin/cat "$REPO_ROOT/$SECRET_FIXTURE_NAME/.env" >/dev/null 2>&1; then exit 76; fi
if /bin/cat "$snapshot_dir/scripts/codex-review-external-link.fixture" >/dev/null 2>&1; then exit 77; fi
[[ "$prompt" == *'당신은 머지 직전 엄격한 코드 리뷰어다'* ]] || exit 78
[[ "$prompt" == *'origin/main...HEAD'* ]] || exit 79
[[ "$prompt" == *'--- diff ---'* ]] || exit 80
[[ "$prompt" == *'프로젝트 설정을 읽지 말라'* ]] || exit 81
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
mkdir -p "$TEST_TMP/node_modules/@openai/codex/bin" "$TEST_TMP/node_modules/@openai/codex-darwin-arm64/bin"
mv "$TEST_TMP/bin/codex" "$TEST_TMP/node_modules/@openai/codex-darwin-arm64/bin/codex"
cat >"$TEST_TMP/node_modules/@openai/codex/bin/codex" <<'MOCK'
#!/usr/bin/env bash
exec "$(dirname "$0")/../../codex-darwin-arm64/bin/codex" "$@"
MOCK
printf '{"name":"@openai/codex"}\n' >"$TEST_TMP/node_modules/@openai/codex/package.json"
ln -s ../node_modules/@openai/codex/bin/codex "$TEST_TMP/bin/codex"
chmod +x "$TEST_TMP/bin/git" "$TEST_TMP/bin/gh" "$TEST_TMP/bin/codex" "$TEST_TMP/bin/npm" \
  "$TEST_TMP/node_modules/@openai/codex-darwin-arm64/bin/codex"

run_gate() {
  local rc=0
  CODEX_REVIEW_BOOTSTRAP_PROFILE_SHA256="$BOOTSTRAP_PROFILE_SHA256" \
    TMPDIR="$TEST_TMP" PATH="$TEST_TMP/bin:$PATH" \
    "$REPO_ROOT/scripts/merge-pr.sh" 1 --no-merge --no-wait --skip-build 2>&1 || rc=$?
  ! compgen -G "$TEST_TMP/orider-codex-review-parent.*" >/dev/null || return 98
  return "$rc"
}

set +e
missing_bootstrap_output="$(TMPDIR="$TEST_TMP" PATH="$TEST_TMP/bin:$PATH" \
  "$REPO_ROOT/scripts/merge-pr.sh" 1 --no-merge --no-wait --skip-build 2>&1)"
missing_bootstrap_rc=$?
set -e
[[ "$missing_bootstrap_rc" -ne 0 ]]
grep -q 'CODEX_REVIEW_BOOTSTRAP_PROFILE_SHA256 필요' <<<"$missing_bootstrap_output"

pass_output="$(MOCK_VERDICT=PASS run_gate)"
grep -q "리뷰 PASS" <<<"$pass_output"
expected_head="$($REAL_GIT rev-parse HEAD)"
grep -qx "archive" "$MOCK_ARCHIVE_ARGS_FILE"
grep -qx "$expected_head" "$MOCK_ARCHIVE_ARGS_FILE"

full_output="$(MOCK_CHANGED=src/example.ts MOCK_VERDICT=PASS run_gate)"
grep -q "리뷰 PASS" <<<"$full_output"

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
