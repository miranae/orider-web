#!/usr/bin/env bash
#
# PR merge gate for Orider Web.
#
# This wrapper keeps the actual merge behind the same checks we expect from PRs:
# local lint/test/build, optional local AI review, GitHub check status, and review
# decision inspection. Use it instead of calling `gh pr merge` directly.
# Feature PR은 dev로 통합하고 로컬 게이트를 실행한다. GitHub의 무거운 CI는 dev→main
# 승격 PR에서만 실행하며, main으로는 head=dev(승격) 또는 hotfix/*(긴급 단건) PR만 허용한다.
# hotfix→main 도 승격과 동일하게 full 게이트를 타고, 머지 후 main→dev 동기화로 유실을 막는다.
#
# Usage:
#   scripts/merge-pr.sh [PR_NUMBER] [options]
#
# Options:
#   --no-merge                Run gates only.
#   --no-review               Skip local AI code review.
#   --no-visual-check         Skip the sticky/fixed screenshot-evidence gate.
#   --require-github-review   Require GitHub reviewDecision=APPROVED before merge.
#   --skip-build              Skip `npm run build`.
#   --e2e                     Run Playwright E2E.
#   --no-wait                 Do not wait for GitHub checks.
#   --keep-worktree           Do not remove the current worktree/branch after merge.
#
# 속도 설계 (2026-07-10):
#   - 변경 분류는 AI 리뷰 강도만 결정한다: 제품 코드=full(medium), 툴링=fast(low), 문서=skip.
#     로컬 검증은 별도로 feature→dev(변경 영향 테스트+타입체크) / dev→main(full) 2단계다.
#   - AI 리뷰는 npm 게이트와 **병렬** 실행 — 리뷰(수 분)가 크리티컬 패스에서 빠진다.
#   - base 전진(BEHIND)은 게이트 시작 시 자동으로 origin/base 머지+푸시 — CI 재실행이
#     로컬 게이트와 겹쳐 돌아 마지막 대기가 짧다.
set -euo pipefail

DO_MERGE=1
RUN_REVIEW=1
REQUIRE_VISUAL_CHECK=1
REQUIRE_GITHUB_REVIEW=0
DO_BUILD=1
RUN_E2E=0
WAIT_CHECKS=1
KEEP_WORKTREE=0
PR_NUM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-merge) DO_MERGE=0 ;;
    --no-review) RUN_REVIEW=0 ;;
    --no-visual-check) REQUIRE_VISUAL_CHECK=0 ;;
    --require-github-review) REQUIRE_GITHUB_REVIEW=1 ;;
    --skip-build) DO_BUILD=0 ;;
    --e2e) RUN_E2E=1 ;;
    --no-wait) WAIT_CHECKS=0 ;;
    --keep-worktree) KEEP_WORKTREE=1 ;;
    [0-9]*) PR_NUM="$1" ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
  esac
  shift
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '  \033[1;33m⚠ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

run_step() {
  local desc="$1" pat="$2"; shift 2
  local logf rc
  logf="$(mktemp -t orider-merge-gate)"
  rc=0
  "$@" >"$logf" 2>&1 || rc=$?
  grep -E "$pat" "$logf" | tail -40 || true
  [[ "$rc" -eq 0 ]] || { echo "  로그: $logf"; die "$desc 실패 — 머지 중단"; }
  rm -f "$logf"
}

json_field() {
  local json="$1" field="$2"
  node -e "const o=JSON.parse(process.argv[1]); const v=o[process.argv[2]]; if (v == null) process.exit(0); process.stdout.write(String(v));" "$json" "$field"
}

assert_local_head_matches_pr() {
  local where="$1" local_head
  local_head="$(git rev-parse HEAD)"
  [[ -n "$HEAD_OID" ]] || die "$where: PR head SHA를 확인하지 못했습니다."
  if [[ "$local_head" != "$HEAD_OID" ]]; then
    die "$where: 로컬 HEAD(${local_head:0:8})와 PR head(${HEAD_OID:0:8})가 다릅니다. git fetch/pull 또는 push 후 재실행하세요."
  fi
}

# AI 리뷰를 백그라운드로 시작 (npm 게이트와 병렬) — 결과 처리는 아래 join 블록에서.
REVIEW_STARTED=0
start_codex_review() {
  local timeout_s="${CODEX_REVIEW_TIMEOUT_SEC:-900}"
  "${REVIEW_CMD[@]}" >"$REVIEW_LOG" 2>&1 &
  REVIEW_PID=$!
  (
    sleep "$timeout_s" &
    watchdog_sleep_pid=$!
    trap 'kill "$watchdog_sleep_pid" 2>/dev/null || true' EXIT
    trap 'exit 0' TERM INT
    wait "$watchdog_sleep_pid" || exit 0
    if kill -0 "$REVIEW_PID" 2>/dev/null; then
      kill "$REVIEW_PID" 2>/dev/null || true
      sleep 2
      kill -9 "$REVIEW_PID" 2>/dev/null || true
    fi
  ) &
  REVIEW_WATCHDOG=$!
  REVIEW_STARTED=1
}
# 게이트가 중간에 die 해도 백그라운드 Codex를 고아로 남기지 않는다.
cleanup_review() {
  # 주의: kill 의 인자가 빈값/0 이면 프로세스 그룹 전체가 죽는다 — 반드시 변수 존재를 확인.
  [[ "${REVIEW_STARTED:-0}" == 1 ]] || return 0
  [[ -n "${REVIEW_PID:-}" ]] && { kill "$REVIEW_PID" 2>/dev/null || true; }
  [[ -n "${REVIEW_WATCHDOG:-}" ]] && { kill "$REVIEW_WATCHDOG" 2>/dev/null || true; }
  return 0
}
trap cleanup_review EXIT

if [[ -z "$PR_NUM" ]]; then
  PR_NUM="$(gh pr view "$BRANCH" --json number -q .number 2>/dev/null || true)"
  [[ -n "$PR_NUM" ]] || die "현재 브랜치($BRANCH)의 PR을 찾지 못했습니다. PR 번호를 인자로 주세요."
fi

META="$(gh pr view "$PR_NUM" --json state,isDraft,baseRefName,headRefName,headRefOid,reviewDecision,mergeStateStatus,url)"
STATE="$(json_field "$META" state)"
IS_DRAFT="$(json_field "$META" isDraft)"
BASE="$(json_field "$META" baseRefName)"
HEADREF="$(json_field "$META" headRefName)"
HEAD_OID="$(json_field "$META" headRefOid)"
REVIEW_DECISION="$(json_field "$META" reviewDecision)"
MERGE_STATE="$(json_field "$META" mergeStateStatus)"
PR_URL="$(json_field "$META" url)"

[[ "$STATE" == "OPEN" ]] || die "PR #$PR_NUM 상태가 OPEN이 아닙니다: $STATE"
[[ "$IS_DRAFT" != "true" ]] || die "PR #$PR_NUM 이 draft입니다."
[[ -n "$BASE" ]] || BASE=main

# dev 통합 브랜치 규칙. GitHub free-plan 저장소에서도 main 직접 머지를 이 래퍼가 차단한다.
# main-promote-guard.yml은 잘못 열린 PR에 즉시 빨간 신호를 주는 서버측 보조 안전망이다.
if [[ "$BASE" == "main" && "$HEADREF" != "dev" && "$HEADREF" != hotfix/* ]]; then
  die "main 으로의 머지는 dev 승격 또는 hotfix/* 만 허용됩니다 (현재 head=${HEADREF:-<unknown>}). feature는 'gh pr create --base dev'로 PR 하세요."
fi

if [[ -n "$(git status --porcelain)" ]]; then
  die "워크트리가 깨끗하지 않습니다. 커밋/스태시 후 재실행하세요."
fi
assert_local_head_matches_pr "게이트 시작"

# ── BEHIND 자동 갱신 ──────────────────────────────────────────────────────────
# base 전진으로 BEHIND 면 지금 origin/$BASE 를 머지해 푸시한다 — 로컬 게이트가 갱신된
# 코드 기준으로 돌고 CI 재실행도 병렬로 진행돼, 게이트 전부 통과 후 BEHIND 로 죽어
# 수동 갱신+전체 재실행하던 낭비(#227 사례)가 없어진다.
if [[ "$MERGE_STATE" == "BEHIND" ]]; then
  log "base 전진 감지(BEHIND) — origin/$BASE 자동 머지 후 푸시"
  git fetch origin "$BASE" --quiet || true
  git merge "origin/$BASE" --no-edit --quiet \
    || die "origin/$BASE 자동 머지 충돌 — 수동 해결 후 재실행하세요"
  git push --quiet origin "HEAD:$HEADREF" || die "갱신 커밋 푸시 실패"
  HEAD_OID="$(git rev-parse HEAD)"
  echo "  갱신 완료: headSha=${HEAD_OID:0:12} (CI 재실행 시작)"
fi

git fetch origin "$BASE" --quiet || true
CHANGED="$(git diff --name-only "origin/$BASE...HEAD" 2>/dev/null || true)"
if [[ -z "$CHANGED" ]]; then
  warn "origin/$BASE...HEAD 변경 파일이 비어 있습니다. PR head가 현재 checkout과 다른지 확인하세요."
fi

# 변경 분류 — AI 리뷰 강도를 diff 성격에 맞춘다. 미분류 경로는 안전하게 '코드'.
#   docs    (docs/·*.md·LICENSE 등)        → 리뷰 생략
#   tooling (merge gate scripts/schema·.github/) → low reasoning 리뷰
#   code    (그 외 전부)                   → 풀 리뷰
DOCS_PAT='^docs/|\.md$|^LICENSE|^\.gitignore$|^\.gitattributes$'
TOOLING_PAT='^scripts/[^/]+\.sh$|^scripts/codex-review-output\.schema\.json$|^\.github/'
code_changes=0; review_mode="skip"
if [[ -n "$CHANGED" ]]; then
  if grep -qEv "($DOCS_PAT)|($TOOLING_PAT)" <<<"$CHANGED"; then
    code_changes=1; review_mode="full"
  elif grep -qE "$TOOLING_PAT" <<<"$CHANGED"; then
    review_mode="fast"
  fi
fi

# ── 뷰포트 점유 요소 시각 증빙 게이트 ────────────────────────────────────────
# position: sticky/fixed 를 새로 추가하는 UI 변경은 화면을 상시 점유할 수 있어
# (#374 상·하단 스티키 배너 장애) PR 본문에 스크린샷 증빙이 있어야 머지한다.
# 우회는 --no-visual-check (스티키/픽스드와 무관한 리팩터 등 한정).
if [[ "$REQUIRE_VISUAL_CHECK" == 1 && -n "$CHANGED" ]]; then
  # :(glob) — 'src/**/*.tsx' 가 src/App.tsx 같은 최상위 파일도 매칭하게 한다.
  # 안전 게이트이므로 git diff 실패는 통과가 아니라 중단이다(fail-closed).
  STYLE_DIFF="$(git diff "origin/$BASE...HEAD" -- ':(glob)src/**/*.tsx' ':(glob)src/**/*.ts' ':(glob)src/**/*.css')" \
    || die "시각 증빙 게이트: git diff 실패 — origin/$BASE 상태를 확인하세요."
  STICKY_ADDED="$(grep -E '^\+' <<<"$STYLE_DIFF" | grep -cE 'position:\s*["'"'"']?(sticky|fixed)|className=.*(^|[^a-z-])(sticky|fixed)([^a-z-]|$)' || true)"
  if [[ "$STICKY_ADDED" -gt 0 ]]; then
    PR_BODY_TEXT="$(gh pr view "$PR_NUM" --json body -q .body 2>/dev/null || true)"
    if ! grep -qiE '!\[|<img|user-images\.githubusercontent\.com|github\.com/user-attachments|스크린샷|screenshot' <<<"$PR_BODY_TEXT"; then
      die "sticky/fixed 요소 추가 감지(${STICKY_ADDED}건) — PR 본문에 스크린샷(모바일 뷰포트 권장)을 첨부하세요. 무관한 변경이면 --no-visual-check 로 우회."
    fi
    echo "  시각 증빙 확인: sticky/fixed 추가 ${STICKY_ADDED}건 + PR 본문 스크린샷 존재"
  fi
fi

# 2단계 로컬 게이트:
# - topic→dev: 변경 영향 Vitest + TypeScript typecheck만 실행. 누적 전체 검증은 승격 때 1회.
# - dev→main 및 기타 base: 안전하게 기존 full gate(lint/quality/full test/build) 실행.
if [[ "$BASE" == "dev" && "$HEADREF" != "dev" ]]; then
  GATE_TIER="feature"
else
  GATE_TIER="full"
fi

log "PR #$PR_NUM 머지 게이트"
echo "  URL: $PR_URL"
echo "  base=$BASE head=$HEADREF branch=$BRANCH"
echo "  headSha=${HEAD_OID:0:12}"
echo "  reviewDecision=${REVIEW_DECISION:-<none>} mergeState=${MERGE_STATE:-<unknown>}"
echo "  gate_tier=$GATE_TIER code_changes=$code_changes review_mode=$review_mode"

# ── AI 리뷰 시작 (npm 게이트와 병렬) ─────────────────────────────────────────
if [[ "$RUN_REVIEW" == 1 && "$review_mode" != "skip" ]]; then
  command -v codex >/dev/null 2>&1 || die "Codex CLI 없음 — 코드 리뷰 게이트 실행 불가. 설치하거나 --no-review 로 우회하세요."

  REVIEW_OUT="$(mktemp -t orider-merge-review)"
  REVIEW_LOG="$(mktemp -t orider-merge-review-log)"
  REVIEW_PROMPT="당신은 머지 직전 엄격한 코드 리뷰어다. 이 브랜치의 origin/$BASE 대비 diff(\`git diff origin/$BASE...HEAD\`)만 리뷰하라. 필요한 맥락은 허용된 git diff/show/log/status 출력만 사용하고, 일반 파일 읽기는 사용하지 말라. 이 diff가 새로 들여온 정확성 버그, 로직 오류, 깨진 엣지케이스, 레이스, 보안 결함, 사용자 영향 회귀를 찾아라. 기존 결함은 제외한다.

로깅/관측성도 점검하라:
- 신규 무음 에러 스왈로우(catch {}, .catch(() => {}), 실패 숨김)가 있는지.
- 운영 가시성이 필요한 프론트 에러가 logClientError/Sentry 경로 없이 raw console 또는 무시로 끝나는지.
- 새 외부 호출/Firebase IO가 실패 맥락을 남기는지.

제공된 JSON Schema에 정확히 맞는 객체만 출력하라:
- findings: 발견 목록 문자열. 각 항목은 BLOCKER / MAJOR / MINOR 중 하나로 시작하고 file:line을 포함한다. 없으면 '결함 없음'.
- verdict: 중대한 결함이 있으면 BLOCK, 없으면 PASS.
다른 키, Markdown 코드 펜스, JSON 앞뒤의 설명은 출력하지 말라."

  review_effort="medium"
  if [[ "$review_mode" == "fast" ]]; then
    # 툴링 전용 diff — 모델은 설치된 기본값을 따르고 추론 강도만 낮춘다.
    review_effort="low"
  fi
  REVIEW_CMD=(codex exec --ephemeral --sandbox read-only -C "$REPO_ROOT" \
    -c "model_reasoning_effort=\"$review_effort\"" \
    --output-schema "$REPO_ROOT/scripts/codex-review-output.schema.json" \
    -o "$REVIEW_OUT" "$REVIEW_PROMPT")
  log "로컬 AI 코드리뷰 시작 (origin/$BASE...HEAD, mode=$review_mode) — 이후 게이트와 병렬"
  start_codex_review
fi

if [[ "$GATE_TIER" == "feature" ]]; then
  [[ -d node_modules ]] || die "node_modules 없음 — 'npm ci' 후 재실행하세요."

  log "Feature→dev 경량 게이트: 변경 영향 Vitest"
  run_step "targeted Vitest" "Test Files|Tests |FAIL|passed|failed|No test files" \
    npm test -- --changed "origin/$BASE" --passWithNoTests

  log "Feature→dev 경량 게이트: TypeScript typecheck"
  run_step "TypeScript typecheck" "error TS|Found 0 errors" npx tsc -b --pretty false

  log "Feature→dev 경량 게이트 완료 — lint/quality/full test/build는 dev→main 승격에서 실행"
else
  [[ -d node_modules ]] || die "node_modules 없음 — 'npm ci' 후 재실행하세요."

  log "Full 게이트: ESLint budget"
  run_step "lint:budget" "error|warning|problem" npm run lint:budget

  log "Full 게이트: Quality budget"
  run_step "quality:budget" "error|warning|budget|PASS|FAIL" npm run quality:budget

  log "Full 게이트: 전체 Unit tests"
  run_step "npm test" "Test Files|Tests |FAIL|passed|failed" npm test

  if [[ "$DO_BUILD" == 1 ]]; then
    log "Full 게이트: Build"
    if [[ -f .env ]]; then
      run_step "build" "error TS|built in|✓|error" npm run build
    else
      warn ".env 없음 — CI와 동일한 placeholder public config로 build 실행"
      run_step "build" "error TS|built in|✓|error" env \
        VITE_FIREBASE_API_KEY=ci-placeholder \
        VITE_FIREBASE_AUTH_DOMAIN=example.firebaseapp.com \
        VITE_FIREBASE_PROJECT_ID=ci-placeholder \
        VITE_FIREBASE_APP_ID=1:0:web:ci \
        VITE_FIREBASE_FUNCTIONS_REGION=asia-northeast3 \
        VITE_STRAVA_CLIENT_ID=ci-placeholder \
        VITE_STRAVA_REDIRECT_URI=https://example.com/strava/callback \
        npm run build
    fi
  else
    log "Build 생략 (--skip-build)"
  fi
fi

if [[ "$RUN_E2E" == 1 ]]; then
  [[ "$code_changes" == 1 ]] || log "E2E 요청됐지만 코드 변경 없음 — 생략"
  if [[ "$code_changes" == 1 ]]; then
    log "Playwright E2E"
    run_step "e2e" "passed|failed|flaky|Error|✓|✘" npm run e2e
  fi
fi

# ── AI 리뷰 join (병렬 시작분 결과 처리) ─────────────────────────────────────
if [[ "$REVIEW_STARTED" == 1 ]]; then
  log "로컬 AI 코드리뷰 결과 대기 (mode=$review_mode)"
  review_rc=0
  wait "$REVIEW_PID" || review_rc=$?
  kill "$REVIEW_WATCHDOG" 2>/dev/null || true
  wait "$REVIEW_WATCHDOG" 2>/dev/null || true
  REVIEW_STARTED=0
  if [[ "$review_rc" -ne 0 ]]; then
    [[ ! -s "$REVIEW_OUT" ]] || sed 's/^/  │ /' "$REVIEW_OUT"
    [[ ! -s "$REVIEW_LOG" ]] || { echo "  Codex 실행 로그:"; tail -80 "$REVIEW_LOG" | sed 's/^/  │ /'; }
    echo "  리뷰 답변: $REVIEW_OUT"
    echo "  실행 로그: $REVIEW_LOG"
    die "Codex 코드 리뷰 실행 실패 또는 시간 초과 (exit=$review_rc, timeout=${CODEX_REVIEW_TIMEOUT_SEC:-900}s)"
  fi
  REVIEW_FINDINGS="$(mktemp -t orider-merge-review-findings)"
  REVIEW_PARSE_LOG="$(mktemp -t orider-merge-review-parse)"
  verdict=""
  if ! verdict="$(node - "$REVIEW_OUT" "$REVIEW_FINDINGS" <<'NODE' 2>"$REVIEW_PARSE_LOG"
const fs = require('node:fs');
const [inputPath, findingsPath] = process.argv.slice(2);
const fail = (message) => { console.error(message); process.exit(1); };
let value;
try {
  value = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (error) {
  fail(`JSON parse failed: ${error.message}`);
}
if (value === null || Array.isArray(value) || typeof value !== 'object') fail('review output must be an object');
const keys = Object.keys(value).sort();
if (keys.length !== 2 || keys[0] !== 'findings' || keys[1] !== 'verdict') fail('review output must contain only findings and verdict');
if (typeof value.findings !== 'string') fail('findings must be a string');
if (value.verdict !== 'PASS' && value.verdict !== 'BLOCK') fail('verdict must be PASS or BLOCK');
fs.writeFileSync(findingsPath, value.findings);
process.stdout.write(value.verdict);
NODE
  )"; then
    sed 's/^/  │ /' "$REVIEW_OUT" || true
    sed 's/^/  │ /' "$REVIEW_PARSE_LOG" || true
    echo "  리뷰 답변: $REVIEW_OUT"
    echo "  JSON 검증 로그: $REVIEW_PARSE_LOG"
    die "Codex 코드 리뷰 구조화 출력 JSON 검증 실패"
  fi
  if [[ "$verdict" == "BLOCK" ]]; then
    sed 's/^/  │ /' "$REVIEW_FINDINGS"
    echo "  리뷰 로그: $REVIEW_OUT"
    die "코드 리뷰 BLOCK — 머지 중단"
  elif [[ "$verdict" == "PASS" ]]; then
    tail -60 "$REVIEW_FINDINGS" | sed 's/^/  │ /' || true
    printf '  \033[1;32m리뷰 PASS\033[0m\n'
    rm -f "$REVIEW_OUT" "$REVIEW_LOG" "$REVIEW_FINDINGS" "$REVIEW_PARSE_LOG"
  else
    die "Codex 코드 리뷰 verdict 누락"
  fi
else
  [[ "$RUN_REVIEW" == 0 ]] && log "로컬 AI 코드리뷰 생략 (--no-review)" || log "문서 전용 변경 — 로컬 AI 코드리뷰 생략"
fi

if [[ "$WAIT_CHECKS" == 1 && "$BASE" == "main" ]]; then
  log "GitHub PR checks 대기"
  gh pr checks "$PR_NUM" --watch --interval 10
elif [[ "$WAIT_CHECKS" == 1 ]]; then
  log "feature→$BASE PR — 무거운 GitHub CI는 dev→main 승격에서 실행하므로 체크 대기 생략"
else
  log "GitHub PR checks 대기 생략 (--no-wait)"
fi

META="$(gh pr view "$PR_NUM" --json state,isDraft,headRefOid,reviewDecision,mergeStateStatus)"
STATE="$(json_field "$META" state)"
IS_DRAFT="$(json_field "$META" isDraft)"
HEAD_OID="$(json_field "$META" headRefOid)"
REVIEW_DECISION="$(json_field "$META" reviewDecision)"
MERGE_STATE="$(json_field "$META" mergeStateStatus)"

[[ "$STATE" == "OPEN" ]] || die "PR #$PR_NUM 상태가 OPEN이 아닙니다: $STATE"
[[ "$IS_DRAFT" != "true" ]] || die "PR #$PR_NUM 이 draft입니다."
assert_local_head_matches_pr "머지 직전"
if [[ "$REVIEW_DECISION" == "CHANGES_REQUESTED" ]]; then
  die "GitHub reviewDecision=CHANGES_REQUESTED — 리뷰 반영 전 머지 중단"
fi
if [[ "$REQUIRE_GITHUB_REVIEW" == 1 && "$REVIEW_DECISION" != "APPROVED" ]]; then
  die "--require-github-review 지정됨: reviewDecision=$REVIEW_DECISION, APPROVED 필요"
fi
if [[ "$MERGE_STATE" != "CLEAN" ]]; then
  die "GitHub mergeStateStatus=$MERGE_STATE — CLEAN 상태가 아니므로 머지 중단"
fi

if [[ "$DO_MERGE" == 0 ]]; then
  log "--no-merge: 모든 게이트 통과. 머지는 수행하지 않음."
  exit 0
fi

log "PR #$PR_NUM squash merge"
# Do not use `--delete-branch`: gh tries to fast-forward the local checkout to
# the base branch after server-side merge and can fail when another worktree owns
# that branch. Delete the remote ref through the API after a successful merge.
gh pr merge "$PR_NUM" --squash --match-head-commit "$HEAD_OID" || die "gh pr merge 실패 (충돌/보호 규칙/head SHA 상태 확인)"

# squash 승격은 main에 새 커밋을 만들기 때문에 dev와 ancestry가 갈라진다. 승격 직후
# main을 dev에 되병합해 다음 승격 PR이 이미 배포된 변경을 다시 표시하지 않게 한다.
# fetch 후 origin/dev를 먼저 병합하므로 승격 도중 dev에 추가된 커밋도 잃지 않는다.
# push race는 최신 origin/dev를 다시 병합한 뒤 일반 push로 제한 재시도한다(강제 push 금지).
sync_main_back_to_dev() {
  local attempt max_attempts=3
  for attempt in $(seq 1 "$max_attempts"); do
    log "승격 후 main→dev 동기화 ($attempt/$max_attempts)"
    git fetch origin main dev --quiet \
      || die "main 승격은 완료됐지만 origin/main·origin/dev fetch에 실패했습니다. dev에서 origin/dev와 origin/main을 병합해 push하세요."

    if ! git merge origin/dev --no-edit --quiet; then
      git merge --abort >/dev/null 2>&1 || true
      die "main 승격은 완료됐지만 최신 origin/dev 병합이 충돌했습니다. dev에서 origin/dev를 병합한 뒤 origin/main을 병합·push하세요."
    fi
    if ! git merge origin/main --no-edit --quiet; then
      git merge --abort >/dev/null 2>&1 || true
      die "main 승격은 완료됐지만 origin/main→dev 동기화가 충돌했습니다. dev에서 origin/main을 병합·push하세요."
    fi

    if git push --quiet origin HEAD:dev; then
      echo "  dev 동기화 완료: $(git rev-parse --short=12 HEAD)"
      return 0
    fi
    warn "동시 dev 갱신으로 push 실패 — 최신 origin/dev 병합 후 재시도"
  done
  die "main 승격은 완료됐지만 dev 동기화 push가 $max_attempts회 실패했습니다. dev에서 origin/dev와 origin/main을 병합한 뒤 일반 push로 복구하세요."
}

# dev 승격뿐 아니라 hotfix→main 도 동기화 — hotfix 변경이 dev에 없으면 다음 승격에서 유실된다.
if [[ "$BASE" == "main" ]]; then
  sync_main_back_to_dev
fi

if [[ -n "$HEADREF" && "$HEADREF" != "dev" ]]; then
  REPO_SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
  if [[ -n "$REPO_SLUG" ]]; then
    gh api --method DELETE "repos/$REPO_SLUG/git/refs/heads/$HEADREF" >/dev/null 2>&1 \
      && echo "  원격 브랜치 삭제: $HEADREF" \
      || echo "  원격 브랜치 삭제 스킵: $HEADREF"
  fi
fi

# ── 클레임 자동 해제 ─────────────────────────────────────────────────────────
# 머지 완료 = 이슈 작업 종료. PR 의 closing 이슈 + 브랜치명(fix/NNN-…) 이슈의 wip:sess
# 클레임 라벨을 정리한다(scripts/claim-issue.sh — release --force 는 라벨 없으면 no-op).
# best-effort: 실패해도 머지는 이미 완료 상태라 진행을 막지 않는다.
CLAIM_SH="$REPO_ROOT/scripts/claim-issue.sh"
if [[ -x "$CLAIM_SH" ]]; then
  # closing 이슈(PR 메타데이터, 정확) → 전체 해제(--force).
  # 브랜치명 추출(휴리스틱, <kind>/NNN-…) → **내 세션 라벨만**(non-force) — 날짜 선두 slug
  # (feat/2026-07-… 등)를 이슈로 오인해도 타 세션의 활성 클레임은 건드리지 않는다.
  CLOSING_ISSUES="$(gh pr view "$PR_NUM" --json closingIssuesReferences \
    -q '.closingIssuesReferences[].number' 2>/dev/null | sort -un || true)"
  BRANCH_ISSUE="$(grep -oE '^[a-z]+/0*[0-9]+-' <<<"${HEADREF:-}" | grep -oE '[0-9]+' | sed 's/^0*//' || true)"
  for CLAIM_ISSUE in $CLOSING_ISSUES; do
    log "클레임 해제 (closing 이슈 #$CLAIM_ISSUE)"
    "$CLAIM_SH" release --force "$CLAIM_ISSUE" 2>&1 | sed 's/^/  /' || true
  done
  if [[ -n "$BRANCH_ISSUE" ]] && ! grep -qx "$BRANCH_ISSUE" <<<"${CLOSING_ISSUES:-}"; then
    log "클레임 해제 (브랜치명 이슈 #$BRANCH_ISSUE — 내 세션 라벨만)"
    "$CLAIM_SH" release "$BRANCH_ISSUE" 2>&1 | sed 's/^/  /' || true
  fi
fi
if [[ "$KEEP_WORKTREE" == 0 && "$HEADREF" != "dev" ]]; then
  log "워크트리/브랜치 정리"
  MAIN_WT="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
  WT_PATH="$REPO_ROOT"
  if [[ "$MAIN_WT" != "$WT_PATH" ]]; then
    cd "$MAIN_WT"
    if git worktree remove "$WT_PATH" --force 2>/dev/null; then
      echo "  worktree 제거: $WT_PATH"
    else
      warn "worktree 제거 실패: $WT_PATH"
    fi
    git branch -D "$BRANCH" 2>/dev/null || warn "로컬 브랜치 삭제 실패/스킵: $BRANCH"
  else
    git fetch origin "$BASE" --quiet || true
    git switch "$BASE" --quiet 2>/dev/null || warn "$BASE 브랜치 전환 실패"
    git branch -D "$BRANCH" 2>/dev/null || warn "로컬 브랜치 삭제 실패/스킵: $BRANCH"
  fi
elif [[ "$HEADREF" == "dev" ]]; then
  log "dev→main 승격 완료 — 통합 브랜치와 worktree 유지"
fi

printf '\n\033[1;32m✓ PR #%s 머지 완료\033[0m\n' "$PR_NUM"
