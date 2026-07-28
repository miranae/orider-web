#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_TMP="$(mktemp -d -t orider-codex-review-test)"
SECRET_FIXTURE_DIR="$REPO_ROOT/.codex-review-secret-fixture-$$"
ABSOLUTE_SENTINEL="$TEST_TMP/absolute-sentinel"
cleanup_test() {
  rm -rf -- "$TEST_TMP" "$SECRET_FIXTURE_DIR"
}
trap cleanup_test EXIT
mkdir -p "$SECRET_FIXTURE_DIR"
printf 'must-not-be-archived\n' >"$SECRET_FIXTURE_DIR/.env"
printf 'must-not-be-overwritten\n' >"$ABSOLUTE_SENTINEL"

export REAL_GIT="$(command -v git)"
export TEST_TMP ABSOLUTE_SENTINEL
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
  archive_stage="$(mktemp -d "$TEST_TMP/archive-stage.XXXXXX")"
  "$REAL_GIT" "$@" | tar -xf - -C "$archive_stage"
  mkdir -p "$archive_stage/.codex-review"
  ln -sf ../../external-sentinel "$archive_stage/.codex-review/diff.patch"
  ln -sf ../../external-sentinel "$archive_stage/.codex-review/input.txt"
  ln -sf "$ABSOLUTE_SENTINEL" "$archive_stage/.codex-review/metadata.txt"
  tar -cf - -C "$archive_stage" .
  exit 0
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
cat >"$TEST_TMP/bin/npm" <<'MOCK'
#!/usr/bin/env bash
echo "mock npm PASS"
exit 0
MOCK
mkdir -p "$TEST_TMP/node_modules/@openai/codex/bin" "$TEST_TMP/node_modules/@openai/codex-darwin-arm64/bin"
cat >"$TEST_TMP/codex-mock.c" <<'MOCK'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static char *read_all(FILE *f) {
  size_t cap = 4096, len = 0;
  char *buf = malloc(cap);
  if (!buf) exit(90);
  for (;;) {
    if (len + 2048 > cap) { cap *= 2; buf = realloc(buf, cap); if (!buf) exit(90); }
    size_t n = fread(buf + len, 1, cap - len - 1, f);
    len += n;
    if (n == 0) break;
  }
  buf[len] = '\0';
  return buf;
}

int main(int argc, char **argv) {
  if (getenv("REVIEW_ENV_SECRET_SENTINEL") || getenv("GH_TOKEN") || getenv("VITE_SECRET_SENTINEL")) return 91;
  const char *out = NULL, *schema = NULL, *cwd = NULL;
  int disabled = 0, required = 0;
  for (int i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "exec")) required++;
    else if (!strcmp(argv[i], "--ignore-user-config") || !strcmp(argv[i], "--skip-git-repo-check") || !strcmp(argv[i], "--ephemeral")) required++;
    else if (!strcmp(argv[i], "--disable") && i + 1 < argc) { disabled++; i++; }
    else if ((!strcmp(argv[i], "--sandbox") || !strcmp(argv[i], "-c")) && i + 1 < argc) i++;
    else if (!strcmp(argv[i], "-C") && i + 1 < argc) cwd = argv[++i];
    else if (!strcmp(argv[i], "--output-schema") && i + 1 < argc) schema = argv[++i];
    else if ((!strcmp(argv[i], "-o") || !strcmp(argv[i], "--output-last-message")) && i + 1 < argc) out = argv[++i];
  }
  if (required < 4 || disabled < 14 || !out || !schema || !cwd || !strstr(cwd, "/runtime/cwd")) return 64;
  char *input_dir = strdup(schema);
  char *suffix = strstr(input_dir, "/input/output.schema.json");
  if (!suffix) return 67;
  *suffix = '\0';
  char path[4096];
  snprintf(path, sizeof(path), "%s/input/diff.patch", input_dir);
  if (access(path, R_OK) != 0) return 69;
  char *prompt = read_all(stdin);
  if (!strstr(prompt, "origin/main...HEAD") || !strstr(prompt, "--- diff ---")) return 79;
  const char *codex_home = getenv("CODEX_HOME");
  if (!codex_home) return 82;
  snprintf(path, sizeof(path), "%s/auth.json", codex_home);
  FILE *auth = fopen(path, "r");
  if (!auth) return 82;
  char *mode = read_all(auth);
  fclose(auth);
  if (strstr(mode, "exit42")) { fprintf(stderr, "mock Codex execution log\n"); return 42; }
  FILE *output = fopen(out, "w");
  if (!output) return 84;
  if (strstr(mode, "malformed")) fputs("{\"findings\":\"broken\"", output);
  else if (strstr(mode, "trailing")) fputs("{\"findings\":\"mock\",\"verdict\":\"PASS\"}\ntrailing postscript\n", output);
  else if (strstr(mode, "missing")) fputs("{\"findings\":\"mock\"}\n", output);
  else if (strstr(mode, "extra")) fputs("{\"findings\":\"mock\",\"verdict\":\"PASS\",\"extra\":true}\n", output);
  else if (strstr(mode, "invalid_verdict")) fputs("{\"findings\":\"mock\",\"verdict\":\"UNKNOWN\"}\n", output);
  else fprintf(output, "{\"findings\":\"mock Codex comment\",\"verdict\":\"%s\"}\n", strstr(mode, "BLOCK") ? "BLOCK" : "PASS");
  fclose(output);
  fprintf(stderr, "mock Codex execution log\n");
  return 0;
}
MOCK
cc -O2 -o "$TEST_TMP/node_modules/@openai/codex-darwin-arm64/bin/codex" "$TEST_TMP/codex-mock.c"
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
  printf '%s|%s|%s\n' "${MOCK_RESPONSE_MODE:-valid}" "${MOCK_VERDICT:-PASS}" "${MOCK_EXIT:-0}" >"$CODEX_HOME/auth.json"
  [[ "${MOCK_EXIT:-0}" == 42 ]] && printf 'exit42\n' >"$CODEX_HOME/auth.json"
  CODEX_REVIEW_BOOTSTRAP_PROFILE_SHA256="$BOOTSTRAP_PROFILE_SHA256" \
    REVIEW_ENV_SECRET_SENTINEL=must-not-reach-codex GH_TOKEN=must-not-reach-codex VITE_SECRET_SENTINEL=must-not-reach-codex \
    TMPDIR="$TEST_TMP" PATH="$TEST_TMP/bin:$PATH" \
    "$REPO_ROOT/scripts/merge-pr.sh" 1 --no-merge --no-wait --skip-build 2>&1 || rc=$?
  grep -qx 'must-not-be-overwritten' "$ABSOLUTE_SENTINEL" || return 97
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
