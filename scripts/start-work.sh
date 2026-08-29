#!/usr/bin/env bash
#
# 표준 작업 시작 헬퍼 — "이슈 클레임 → 신선한 워크트리 → dev 셋업" 을 한 명령으로.
#
# 세션이 수동 규약을 빠뜨리는 사고(신선한 origin 기준이 아닌 낡은 체크아웃에서 분기,
# 워크트리 없이 primary 에서 직접 작업, 클레임 없이 이슈 중복 선점, .env/node_modules
# 미링크로 빌드 실패)를 막는다. **새 작업은 반드시 이 스크립트로 시작할 것.**
#
# 사용:
#   scripts/start-work.sh <slug> [--issue N] [--base BRANCH] [--kind fix|feat|chore|docs|ci|refactor]
#
#   slug        브랜치/워크트리 이름 조각 (kebab-case). '/' 포함 시 브랜치명으로 그대로 사용.
#   --issue N   scripts/claim-issue.sh acquire N 으로 선점 — 실패하면 워크트리를 만들지 않고
#               종료(다른 세션이 작업 중). 브랜치명에 "N-" 접두가 들어가 claim-issue 의
#               경쟁 브랜치 스캔과 교차 참조된다.
#   --base B    예외적인 분기 시작점 override. 기본: dev. 이 옵션으로 만든 topic 브랜치도
#               main 직접 머지는 허용되지 않는다. dev→main 승격 PR은 기존 dev 브랜치에서 연다.
#   --kind K    브랜치 접두. 기본: --issue 있으면 fix, 없으면 feat.
#
# 동작:
#   1) git fetch origin                          — 항상 신선한 origin/<base> 에서 분기
#   2) (--issue) claim-issue.sh acquire          — 선점 실패 시 여기서 중단
#   3) <모노레포루트>/_worktrees/<repo>-<slug>   — 규약 위치에 git worktree add -b <branch>
#      (저장소 내부 worktrees/ 나 임의 경로에 만들지 말 것 — 루트 CLAUDE.md 규약)
#   4) dev 셋업: primary 체크아웃의 .env / node_modules (web/·functions/ 포함)를 심볼릭 링크
#   5) 다음 단계 안내 (작업 → PR → scripts/merge-pr.sh 로 머지+클레임 해제+정리)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SLUG=""
ISSUE=""
BASE=""
KIND=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue) ISSUE="${2:-}"; shift ;;
    --base)  BASE="${2:-}"; shift ;;
    --kind)  KIND="${2:-}"; shift ;;
    -*) echo "✗ 알 수 없는 옵션: $1" >&2; exit 2 ;;
    *) [[ -z "$SLUG" ]] || { echo "✗ slug 는 하나만: '$SLUG' vs '$1'" >&2; exit 2; }; SLUG="$1" ;;
  esac
  shift
done
[[ -n "$SLUG" ]] || { sed -n '3,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2; }
[[ -z "$ISSUE" || "$ISSUE" =~ ^[0-9]+$ ]] || { echo "✗ --issue 는 숫자만: '$ISSUE'" >&2; exit 2; }

log() { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }

# primary 체크아웃(= worktree list 첫 항목) 기준으로 저장소·모노레포 루트를 잡는다.
# 워크트리 안에서 실행해도 primary 를 찾아 같은 위치 규약을 쓴다.
# awk 가 첫 줄에서 exit 하면 git 이 아직 쓰는 중이라 SIGPIPE(141) 를 받는다.
# `set -o pipefail` 때문에 그 141 이 파이프라인 종료코드가 되고 `set -e` 가 여기서 스크립트를
# 죽인다 — 워크트리가 많을수록 재현되고, 출력 한 줄 없이 실패해 원인이 안 보인다.
# END 블록으로 첫 항목만 남기면 입력을 끝까지 읽어 SIGPIPE 자체가 생기지 않는다.
PRIMARY_WT="$(git -C "$SCRIPT_DIR" worktree list --porcelain | awk '/^worktree / && primary == "" { sub(/^worktree /, ""); primary = $0 } END { print primary }')"
REPO_NAME="$(basename "$PRIMARY_WT")"
MONO_ROOT="$(dirname "$PRIMARY_WT")"
WT_ROOT="$MONO_ROOT/_worktrees"

log "fetch origin ($REPO_NAME)"
git -C "$PRIMARY_WT" fetch origin --quiet

# 일반 작업은 항상 dev 에 통합한다. dev 가 없을 때 main 으로 조용히 폴백하면 feature PR이
# 다시 main 을 향하게 되므로, 설정 오류를 즉시 드러내고 중단한다.
BASE="${BASE:-dev}"
git -C "$PRIMARY_WT" rev-parse --verify -q "origin/$BASE" >/dev/null \
  || { echo "✗ origin/$BASE 없음 — 일반 작업의 통합 브랜치 dev를 먼저 생성/푸시하거나 --base를 명시하세요." >&2; exit 2; }

# 브랜치명: slug 에 '/' 가 있으면 그대로, 없으면 <kind>/<issue->slug
if [[ "$SLUG" == */* ]]; then
  BRANCH="$SLUG"
else
  [[ -n "$KIND" ]] || KIND="$([[ -n "$ISSUE" ]] && echo fix || echo feat)"
  BRANCH="$KIND/${ISSUE:+$ISSUE-}$SLUG"
fi
WT_NAME="$REPO_NAME-$(basename "$BRANCH")"
WT_DIR="$WT_ROOT/$WT_NAME"

[[ ! -e "$WT_DIR" ]] || { echo "✗ 워크트리 경로 이미 존재: $WT_DIR — 다른 slug 를 쓰거나 정리 후 재시도" >&2; exit 2; }
if git -C "$PRIMARY_WT" rev-parse --verify -q "$BRANCH" >/dev/null; then
  echo "✗ 로컬 브랜치 '$BRANCH' 이미 존재 — 기존 작업 확인 후 정리(git branch -D)하거나 다른 이름 사용" >&2; exit 2
fi
if git -C "$PRIMARY_WT" ls-remote --exit-code origin "refs/heads/$BRANCH" >/dev/null 2>&1; then
  echo "✗ 원격 브랜치 origin/$BRANCH 이미 존재 — 이전 세션 잔재인지 확인 후 정리하거나 다른 이름 사용" >&2; exit 2
fi

# 이슈 클레임 — 실패하면 워크트리를 만들지 않는다 (다른 세션 선점 존중)
CLAIM_SH="$SCRIPT_DIR/claim-issue.sh"
CLAIMED=0
if [[ -n "$ISSUE" ]]; then
  if [[ -x "$CLAIM_SH" ]]; then
    log "이슈 #$ISSUE 클레임"
    ( cd "$PRIMARY_WT" && "$CLAIM_SH" acquire "$ISSUE" ) || exit 1
    CLAIMED=1
  else
    printf '\033[1;33m⚠ claim-issue.sh 없음 — 클레임 생략 (병렬 세션 충돌 주의)\033[0m\n'
  fi
fi

log "워크트리 생성: $WT_DIR (branch $BRANCH ← origin/$BASE)"
mkdir -p "$WT_ROOT"
if ! git -C "$PRIMARY_WT" worktree add -b "$BRANCH" "$WT_DIR" "origin/$BASE"; then
  # 클레임 롤백 — 워크트리 생성 실패 시 고아 wip 라벨을 남기지 않는다
  if [[ "$CLAIMED" == 1 && -x "$CLAIM_SH" ]]; then
    ( cd "$PRIMARY_WT" && "$CLAIM_SH" release "$ISSUE" ) || true
  fi
  exit 1
fi

# dev 셋업 — primary 의 로컬 전용 자산(.env/node_modules)을 심볼릭 링크.
# (gitignore 대상이라 워크트리에 없음 — 없으면 빌드/테스트가 즉시 깨진다)
log "dev 셋업 (.env / node_modules 링크)"
LINKED=0
for rel in .env node_modules web/.env web/node_modules functions/node_modules functions/.env; do
  src="$PRIMARY_WT/$rel"; dst="$WT_DIR/$rel"
  if [[ -e "$src" && ! -e "$dst" ]]; then
    mkdir -p "$(dirname "$dst")"
    ln -s "$src" "$dst"
    echo "  링크: $rel → primary"
    LINKED=$((LINKED+1))
  fi
done
[[ "$LINKED" -gt 0 ]] || echo "  (링크할 로컬 자산 없음)"

printf '\n\033[1;32m✓ 작업 준비 완료\033[0m\n'
cat <<EOF
  cd "$WT_DIR"

다음 단계:
  1. 작업/커밋 (베이스: origin/$BASE)
  2. PR 생성:   gh pr create -B $BASE
  3. 머지:      scripts/merge-pr.sh   ← 반드시 이 워크트리 안에서.
     (로컬 게이트 + 리뷰 + squash 머지 + 워크트리/브랜치 정리${ISSUE:+ + 이슈 #$ISSUE 클레임 자동 해제})
EOF
