#!/usr/bin/env bash
#
# PR merge gate for Orider Web.
#
# This wrapper keeps the actual merge behind the same checks we expect from PRs:
# local lint/test/build, optional local AI review, GitHub check status, and review
# decision inspection. Use it instead of calling `gh pr merge` directly.
#
# Usage:
#   scripts/merge-pr.sh [PR_NUMBER] [options]
#
# Options:
#   --no-merge                Run gates only.
#   --no-review               Skip local AI code review.
#   --require-github-review   Require GitHub reviewDecision=APPROVED before merge.
#   --skip-build              Skip `npm run build`.
#   --e2e                     Run Playwright E2E.
#   --no-wait                 Do not wait for GitHub checks.
#   --keep-worktree           Do not remove the current worktree/branch after merge.
set -euo pipefail

DO_MERGE=1
RUN_REVIEW=1
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

run_claude_review_with_timeout() {
  local out="$1" timeout_s="${CLAUDE_REVIEW_TIMEOUT_SEC:-900}" pid watchdog rc

  "${REVIEW_CMD[@]}" >"$out" 2>&1 &
  pid=$!
  (
    sleep "$timeout_s"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 2
      kill -9 "$pid" 2>/dev/null || true
    fi
  ) &
  watchdog=$!

  wait "$pid" || rc=$?
  rc="${rc:-0}"
  kill "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true
  return "$rc"
}

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

if [[ -n "$(git status --porcelain)" ]]; then
  die "워크트리가 깨끗하지 않습니다. 커밋/스태시 후 재실행하세요."
fi
assert_local_head_matches_pr "게이트 시작"

git fetch origin "$BASE" --quiet || true
CHANGED="$(git diff --name-only "origin/$BASE...HEAD" 2>/dev/null || true)"
if [[ -z "$CHANGED" ]]; then
  warn "origin/$BASE...HEAD 변경 파일이 비어 있습니다. PR head가 현재 checkout과 다른지 확인하세요."
fi

code_changes=0
if [[ -n "$CHANGED" ]] && grep -qEv '(^docs/|^\.github/(ISSUE_TEMPLATE/|PULL_REQUEST_TEMPLATE)|\.md$)' <<<"$CHANGED"; then
  code_changes=1
fi

log "PR #$PR_NUM 머지 게이트"
echo "  URL: $PR_URL"
echo "  base=$BASE head=$HEADREF branch=$BRANCH"
echo "  headSha=${HEAD_OID:0:12}"
echo "  reviewDecision=${REVIEW_DECISION:-<none>} mergeState=${MERGE_STATE:-<unknown>}"
echo "  code_changes=$code_changes"

if [[ "$code_changes" == 1 ]]; then
  [[ -d node_modules ]] || die "node_modules 없음 — 'npm ci' 후 재실행하세요."

  log "ESLint budget"
  run_step "lint:budget" "error|warning|problem" npm run lint:budget

  log "Quality budget"
  run_step "quality:budget" "error|warning|budget|PASS|FAIL" npm run quality:budget

  log "Unit tests"
  run_step "npm test" "Test Files|Tests |FAIL|passed|failed" npm test

  if [[ "$DO_BUILD" == 1 ]]; then
    log "Build"
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
else
  log "문서/메타데이터 변경만 감지 — 로컬 npm 게이트 생략"
fi

if [[ "$RUN_E2E" == 1 ]]; then
  [[ "$code_changes" == 1 ]] || log "E2E 요청됐지만 코드 변경 없음 — 생략"
  if [[ "$code_changes" == 1 ]]; then
    log "Playwright E2E"
    run_step "e2e" "passed|failed|flaky|Error|✓|✘" npm run e2e
  fi
fi

if [[ "$RUN_REVIEW" == 1 && "$code_changes" == 1 ]]; then
  command -v claude >/dev/null 2>&1 || die "claude CLI 없음 — 코드 리뷰 게이트 실행 불가. 설치하거나 --no-review 로 우회하세요."

  log "로컬 AI 코드리뷰 (origin/$BASE...HEAD)"
  REVIEW_OUT="$(mktemp -t orider-merge-review)"
  REVIEW_PROMPT="당신은 머지 직전 엄격한 코드 리뷰어다. 이 브랜치의 origin/$BASE 대비 diff(\`git diff origin/$BASE...HEAD\`)만 리뷰하라. 필요한 맥락은 허용된 git diff/show/log/status 출력만 사용하고, 일반 파일 읽기는 사용하지 말라. 이 diff가 새로 들여온 정확성 버그, 로직 오류, 깨진 엣지케이스, 레이스, 보안 결함, 사용자 영향 회귀를 찾아라. 기존 결함은 제외한다.

로깅/관측성도 점검하라:
- 신규 무음 에러 스왈로우(catch {}, .catch(() => {}), 실패 숨김)가 있는지.
- 운영 가시성이 필요한 프론트 에러가 logClientError/Sentry 경로 없이 raw console 또는 무시로 끝나는지.
- 새 외부 호출/Firebase IO가 실패 맥락을 남기는지.

출력 형식:
1) 발견 목록. 각 항목은 BLOCKER / MAJOR / MINOR 중 하나로 시작하고 file:line을 포함한다. 없으면 '결함 없음'.
2) 마지막 줄은 반드시 정확히 하나:
MERGE_VERDICT: BLOCK
MERGE_VERDICT: PASS"

  REVIEW_CMD=(claude -p "$REVIEW_PROMPT" \
    --allowedTools "Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(git status:*)")

  review_rc=0
  run_claude_review_with_timeout "$REVIEW_OUT" || review_rc=$?
  verdict="$(grep -oE 'MERGE_VERDICT:[[:space:]]*(BLOCK|PASS)' "$REVIEW_OUT" | tail -1 || true)"
  if [[ "$verdict" == *BLOCK ]]; then
    sed 's/^/  │ /' "$REVIEW_OUT"
    echo "  리뷰 로그: $REVIEW_OUT"
    die "코드 리뷰 BLOCK — 머지 중단"
  elif [[ "$verdict" == *PASS ]]; then
    grep -vE '^[[:space:]]*MERGE_VERDICT:' "$REVIEW_OUT" | tail -60 | sed 's/^/  │ /' || true
    printf '  \033[1;32m리뷰 PASS\033[0m\n'
    rm -f "$REVIEW_OUT"
  else
    sed 's/^/  │ /' "$REVIEW_OUT" || true
    echo "  리뷰 로그: $REVIEW_OUT"
    [[ "$review_rc" -eq 0 ]] || die "코드 리뷰 실행 실패 (claude exit=$review_rc)"
    die "코드 리뷰 판정(MERGE_VERDICT) 누락"
  fi
else
  [[ "$RUN_REVIEW" == 0 ]] && log "로컬 AI 코드리뷰 생략 (--no-review)" || log "코드 변경 없음 — 로컬 AI 코드리뷰 생략"
fi

if [[ "$WAIT_CHECKS" == 1 ]]; then
  log "GitHub PR checks 대기"
  gh pr checks "$PR_NUM" --watch --interval 10
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

if [[ -n "$HEADREF" ]]; then
  REPO_SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
  if [[ -n "$REPO_SLUG" ]]; then
    gh api --method DELETE "repos/$REPO_SLUG/git/refs/heads/$HEADREF" >/dev/null 2>&1 \
      && echo "  원격 브랜치 삭제: $HEADREF" \
      || echo "  원격 브랜치 삭제 스킵: $HEADREF"
  fi
fi

if [[ "$KEEP_WORKTREE" == 0 ]]; then
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
fi

printf '\n\033[1;32m✓ PR #%s 머지 완료\033[0m\n' "$PR_NUM"
