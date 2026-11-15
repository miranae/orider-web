#!/usr/bin/env bash
# dev 커밋 하나를 승격 브랜치로 고정하고 main 승격 PR을 연다(orider-g1-app 과 같은 방식).
# 고정 뒤 dev 가 움직여도 이 PR 은 따라가지 않으므로 게이트가 head 변경으로 다시 시작되지 않는다.
#
# 사용법: scripts/start-promotion-snapshot.sh [DEV_SHA]
#   DEV_SHA 생략 시 지금의 origin/dev. 지정하면 origin/dev 에 포함된 커밋이어야 한다.
set -euo pipefail

[[ $# -le 1 ]] || { echo "사용법: $0 [DEV_SHA]" >&2; exit 2; }
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
git fetch origin +refs/heads/dev:refs/remotes/origin/dev +refs/heads/main:refs/remotes/origin/main --quiet

dev_sha="$(git rev-parse "${1:-origin/dev}^{commit}")"
git merge-base --is-ancestor "$dev_sha" origin/dev \
  || { echo "스냅샷 커밋 ${dev_sha:0:12} 이 origin/dev 에 없습니다." >&2; exit 1; }
git merge-base --is-ancestor origin/main "$dev_sha" \
  || { echo "origin/main 이 스냅샷 ${dev_sha:0:12} 의 조상이 아닙니다 — 직전 승격의 이력 동기화(sync/promotion-*) PR 을 먼저 병합하세요." >&2; exit 1; }
[[ "$(git rev-parse "$dev_sha^{tree}")" != "$(git rev-parse "origin/main^{tree}")" ]] \
  || { echo "스냅샷과 main 의 내용이 같습니다 — 승격할 변경이 없습니다." >&2; exit 1; }

# pr-gate.yml 의 브랜치 이름 규칙(소문자)에 맞춘다.
snapshot="promote/snapshot-$(date -u +%Y%m%dt%H%M%Sz)-${dev_sha:0:8}"
git push origin "$dev_sha:refs/heads/$snapshot"
[[ "$(git ls-remote origin "refs/heads/$snapshot" | cut -f1)" == "$dev_sha" ]] \
  || { echo "승격 스냅샷 브랜치의 SHA가 다릅니다." >&2; exit 1; }

changes="$(git log --no-merges --format='- %s' origin/main.."$dev_sha" | grep -E '\(#[0-9]+\)$' || true)"
body="$(printf '승격 시작 시점의 dev 커밋 %s 를 고정했습니다. 이후 dev 변경은 이 PR에 포함되지 않습니다.\n\n## 포함된 변경\n%s\n' "$dev_sha" "${changes:-- (PR 번호 없는 커밋만)}")"
pr_url="$(gh pr create --repo "$repo" --base main --head "$snapshot" \
  --title "chore(release): dev 스냅샷 ${dev_sha:0:8} 승격" --body "$body")"
printf '승격 스냅샷: %s\n커밋: %s\nPR: %s\n' "$snapshot" "$dev_sha" "$pr_url"
printf 'GitHub 검사가 끝나면: scripts/merge-pr.sh %s\n' "$(gh pr view "$pr_url" --repo "$repo" --json number -q .number)"
