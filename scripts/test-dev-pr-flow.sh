#!/usr/bin/env bash
# dev 통합/승격 흐름의 핵심 정적 계약. 스크립트나 workflow 변경 시 함께 실행한다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local file="$1" pattern="$2" message="$3"
  grep -Eq -- "$pattern" "$file" || fail "$message ($file)"
}

assert_contains scripts/start-work.sh 'BASE="\$\{BASE:-dev\}"' \
  'start-work default base must be dev'
assert_contains scripts/start-work.sh 'gh pr create -B \$BASE' \
  'start-work guidance must create the PR against the selected base'
assert_contains scripts/merge-pr.sh '\[\[ "\$BASE" == "main" && "\$HEADREF" != "dev" \]\]' \
  'merge gate must reject non-dev heads targeting main'
assert_contains scripts/merge-pr.sh 'WAIT_CHECKS.*BASE.*main' \
  'GitHub check waiting must be limited to main promotion PRs'
assert_contains scripts/merge-pr.sh 'BASE.*== "dev".*HEADREF.*!= "dev"' \
  'feature gate must be selected only for topic PRs targeting dev'
assert_contains scripts/merge-pr.sh 'npm test -- --changed "origin/\$BASE" --passWithNoTests' \
  'feature gate must run changed-file Vitest with no-test allowance'
assert_contains scripts/merge-pr.sh 'VITEST_FEATURE_MAX_WORKERS:-2' \
  'feature gate must cap Vitest workers so parallel worktrees do not exhaust the host'
assert_contains scripts/merge-pr.sh 'npx tsc -b --pretty false' \
  'feature gate must run TypeScript typecheck'
feature_gate="$(sed -n '/if \[\[ "\$GATE_TIER" == "feature" \]\]; then/,/^else$/p' scripts/merge-pr.sh)"
for forbidden in 'npm run lint:budget' 'npm run quality:budget' 'run_step "npm test"' 'npm run build'; do
  grep -Fq "$forbidden" <<<"$feature_gate" \
    && fail "feature gate must not execute full-gate command: $forbidden"
done
assert_contains scripts/merge-pr.sh 'Full 게이트: ESLint budget' \
  'promotion and non-dev bases must retain full lint gate'
assert_contains scripts/merge-pr.sh 'Full 게이트: Quality budget' \
  'promotion and non-dev bases must retain full quality gate'
assert_contains scripts/merge-pr.sh 'Full 게이트: 전체 Unit tests' \
  'promotion and non-dev bases must retain full test gate'
assert_contains scripts/merge-pr.sh 'Full 게이트: Build' \
  'promotion and non-dev bases must retain full build gate'
assert_contains scripts/merge-pr.sh 'gh pr merge.*--squash' \
  'promotion must use squash because main requires linear history'
assert_contains scripts/merge-pr.sh 'HEADREF.*!= "dev"' \
  'merge cleanup must preserve the dev integration branch'
assert_contains scripts/merge-pr.sh 'sync_main_back_to_dev' \
  'squash promotion must synchronize main back into dev'
assert_contains scripts/merge-pr.sh 'git merge origin/dev --no-edit' \
  'post-promotion sync must preserve concurrent dev advances first'
assert_contains scripts/merge-pr.sh 'git merge origin/main --no-edit' \
  'post-promotion sync must merge promoted main back into dev'
assert_contains scripts/merge-pr.sh 'git push --quiet origin HEAD:dev' \
  'post-promotion sync must update dev with a normal push'
if grep -Eq 'git push[^#]*(--force|-f([[:space:]]|$))' scripts/merge-pr.sh; then
  fail 'dev synchronization must never force-push'
fi

for workflow in ci.yml dco.yml pr-gate.yml main-promote-guard.yml; do
  assert_contains ".github/workflows/$workflow" 'branches: \[main\]' \
    "$workflow must run only for PRs targeting main"
done

assert_contains .github/workflows/dco.yml 'git rebase -i origin/\$base_ref' \
  'DCO repair guidance must use the PR actual base branch'
assert_contains .github/workflows/main-promote-guard.yml 'GITHUB_HEAD_REF.*dev' \
  'promotion guard must allow only dev as the PR head'
assert_contains .github/workflows/pr-gate.yml 'BASE_REF.*main.*HEAD_REF.*dev' \
  'PR metadata gate must accept the dev to main promotion branch'
if sed -n '/dev → main promotion branch accepted/,/^[[:space:]]*fi$/p' \
  .github/workflows/pr-gate.yml | grep -Eq 'exit 0'; then
  fail 'dev promotion branch exception must not exit before remaining metadata checks'
fi
assert_contains .github/workflows/pr-gate.yml 'name: Check changed-file risk' \
  'PR metadata workflow must retain changed-file risk validation'
assert_contains .github/workflows/deploy-stage.yml 'branches:' \
  'stage deploy must retain a push branch filter'
assert_contains .github/workflows/deploy-stage.yml '^      - main$' \
  'stage deploy must remain on main push'

echo 'PASS: dev PR flow contracts'
