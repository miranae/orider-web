#!/usr/bin/env bash
#
# Production release tag gate for Orider Web.
#
# v* 태그 push가 곧 운영 배포이므로, 태그 전에 "이번에 함께 나가는 변경 전체"를
# 반드시 눈으로 확인한다 (#374: runtime-config 복구 배포에 스티키 배너가 편승해
# 운영 장애 — 태그 시점에 release diff를 아무도 보지 않았다).
#
# Usage:
#   scripts/release-tag.sh                # 대화형 — diff 요약 확인 후 y 입력 시 태그 push
#   scripts/release-tag.sh --yes "이유"   # 비대화형 — 배포 이유(릴리스 노트 한 줄) 필수
#
# 태그는 항상 최신 origin/main 에 붙는다. 로컬 상태와 무관.
set -euo pipefail

CONFIRM=""
REASON=""
if [[ "${1:-}" == "--yes" ]]; then
  CONFIRM=1
  REASON="${2:-}"
  [[ -n "$REASON" ]] || { echo "✗ --yes 사용 시 배포 이유를 함께 적으세요: scripts/release-tag.sh --yes \"<이유>\"" >&2; exit 2; }
fi

git fetch origin main --tags --quiet
MAIN_SHA="$(git rev-parse origin/main)"
# --match 'v*' — 배포 트리거는 v* 태그뿐이므로 비릴리스 태그가 diff 범위를 오염시키지 않게 한다.
LAST_TAG="$(git describe --tags --match 'v*' --abbrev=0 origin/main 2>/dev/null || true)"

printf '\n\033[1;36m▶ Release diff — %s → origin/main(%s)\033[0m\n' "${LAST_TAG:-<태그 없음>}" "${MAIN_SHA:0:12}"

if [[ -n "$LAST_TAG" ]]; then
  RANGE="$LAST_TAG..origin/main"
  COUNT="$(git rev-list --count "$RANGE")"
  if [[ "$COUNT" -eq 0 ]]; then
    echo "  마지막 태그($LAST_TAG)와 origin/main 이 동일합니다 — 새로 나갈 변경 없음."
    echo "  (동일 커밋 재배포가 필요하면 기존 태그 재사용 대신 사유를 남기고 진행하세요)"
  else
    echo
    git log "$RANGE" --format='  %h %ad %s' --date=format:'%m-%d %H:%M'
    echo
    printf '  \033[1m커밋 %s건 / 변경 파일:\033[0m\n' "$COUNT"
    git diff --stat "$RANGE" | tail -1 | sed 's/^/ /'
    # 사용자 대면 위험 신호 — 뷰포트 점유 요소·워크플로·rules 변경은 별도 표시
    RISK="$(git diff "$RANGE" -- 'src/**' | grep -E '^\+' | grep -cE 'position:\s*["'"'"']?(sticky|fixed)|className=.*(^|[^a-z-])(sticky|fixed)([^a-z-]|$)' || true)"
    [[ "$RISK" -gt 0 ]] && printf '  \033[1;33m⚠ sticky/fixed 요소 추가 %s건 — 모바일 뷰포트 확인 권장\033[0m\n' "$RISK"
    WF="$(git diff --name-only "$RANGE" -- '.github/workflows/' | wc -l | tr -d ' ')"
    [[ "$WF" -gt 0 ]] && printf '  \033[1;33m⚠ workflow 변경 %s개 파일 포함\033[0m\n' "$WF"
  fi
else
  echo "  기존 v* 태그가 없습니다 — 최초 릴리스."
fi

TAG="v$(date +%Y.%m.%d-%H%M)"
echo
printf '  태그: \033[1m%s\033[0m → %s\n' "$TAG" "${MAIN_SHA:0:12}"

if [[ -z "$CONFIRM" ]]; then
  printf '\n위 변경 전체가 운영에 배포됩니다. 진행할까요? [y/N] '
  read -r ANSWER
  [[ "$ANSWER" == "y" || "$ANSWER" == "Y" ]] || { echo "중단."; exit 1; }
else
  echo "  --yes 확인: $REASON"
fi

git tag -a "$TAG" "$MAIN_SHA" -m "${REASON:-release $TAG}"
git push origin "$TAG"
printf '\n\033[1;32m✓ %s push 완료 — deploy.yml 실행을 확인하세요 (environment 승인 필요)\033[0m\n' "$TAG"
echo "  gh run watch \$(gh run list --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')"
