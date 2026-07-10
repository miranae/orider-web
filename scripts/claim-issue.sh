#!/usr/bin/env bash
#
# 병렬 이슈 처리 세션 클레임 헬퍼 (GitHub 라벨 기반).
#
# 여러 Claude 세션이 같은 repo 이슈를 동시 처리할 때 중복 선점을 막는다.
#   - 클레임 = `wip:sess-N` 라벨. 라벨 존재="선점됨", N="어느 세션" 을 동시에 표현한다.
#     (구버전의 assignee=@me 는 사람계정 단위라 사용자의 일반 self-assign 과 충돌 → 제거)
#   - check-then-claim: 라벨뿐 아니라 **경쟁 PR·원격 브랜치까지** 스캔(라벨 미준수 세션 대비 2차 잠금).
#   - claim→verify→yield: 라벨 부착은 원자적 CAS 가 아니다. 부착 직후 재조회해 동시 클레임이
#     감지되면 사전식 최소 라벨이 승자, 나머지는 자기 라벨을 제거하고 양보한다(더블클레임 사후 해소).
#   - TTL: 클레임 라벨이 CLAIM_TTL_DAYS(기본 3일) 이상 묵으면 stale 로 보고, 죽은 세션의 고아
#     클레임을 자동 탈취(steal)한다. `release --force <issue>` 로 강제 해제도 가능.
#
# 사용 (Claude Code 세션 안에서는 세션명 생략 가능 — 아래 자동 규칙):
#   scripts/claim-issue.sh acquire <issue>                        # 세션명 = sess-<세션해시 8자> 자동
#   CLAIM_SESSION=sess-3 scripts/claim-issue.sh acquire <issue>   # 또는: acquire <issue> sess-3 (명시)
#   scripts/claim-issue.sh release <issue> [sess-N]
#   scripts/claim-issue.sh release --force <issue>                # 모든 wip:sess 라벨 제거(고아 회수)
#   scripts/claim-issue.sh status [issue]      # issue 생략 시 전체
#   scripts/claim-issue.sh list
#
# 세션명 우선순위: 인자 > CLAIM_SESSION > Claude Code 세션 해시(`sess-<CLAUDE_CODE_SESSION_ID 앞8자>`,
#   `ma`/`myagents` 모니터 표기와 동일 → 모니터의 세션과 클레임 라벨이 교차 참조됨).
# 환경변수: CLAIM_SESSION(세션명 강제), CLAIM_TTL_DAYS(stale 임계 일수, 기본 3).
#
# 표준 패턴:
#   if CLAIM_SESSION=sess-3 scripts/claim-issue.sh acquire 244; then
#     ... fix/244-slug 워크트리에서 처리 → 머지 ...
#     CLAIM_SESSION=sess-3 scripts/claim-issue.sh release 244
#   else
#     echo "이미 선점됨 — 다음 이슈로"; fi
set -euo pipefail

LABEL_COLOR="1d76db"
CLAIM_TTL_DAYS="${CLAIM_TTL_DAYS:-3}"

need_gh() { command -v gh >/dev/null || { echo "✗ gh CLI 필요" >&2; exit 2; }; }
# 세션명 결정: 인자 > CLAIM_SESSION > Claude Code 세션 해시(CLAUDE_CODE_SESSION_ID 앞 8자 —
# `ma`/`myagents` 세션 모니터 표기와 동일). 비-Claude 셸이면 셋 다 비어 require_sess 가 막는다.
resolve_sess() {
  local s="${1:-${CLAIM_SESSION:-}}"
  if [[ -z "$s" && -n "${CLAUDE_CODE_SESSION_ID:-}" ]]; then
    s="sess-${CLAUDE_CODE_SESSION_ID:0:8}"
  fi
  echo "$s"
}
require_sess() { [[ -n "$1" ]] || { echo "✗ 세션 이름 필요 — CLAIM_SESSION=sess-N 또는 인자로 지정" >&2; exit 2; }; }
require_issue() { [[ "$1" =~ ^[0-9]+$ ]] || { echo "✗ 이슈 번호는 숫자만 허용: '$1'" >&2; exit 2; }; }

ensure_label() { # $1=wip:sess-N $2=sess-N
  gh label create "$1" --color "$LABEL_COLOR" --description "세션 $2 작업 중 (충돌 방지 클레임)" 2>/dev/null || true
}

# 라벨 $2 의 가장 최근 부착 후 경과 일수(정수)를 출력. 부착 이력 없으면 빈 출력.
# issue events API(라벨 add/remove 만)를 --slurp(전 페이지 수집)로 받아 외부 jq(now/fromdateiso8601)
# 로 계산 → date 플랫폼 차이 회피. (gh 의 --slurp 는 --jq 와 동시 사용 불가 → 외부 jq 로 분리,
# 라벨명은 --arg 로 안전 주입.) .[][] 는 [[page],[page]] 평탄화.
label_age_days() { # $1=issue $2=label
  gh api --paginate --slurp "repos/{owner}/{repo}/issues/$1/events" 2>/dev/null \
    | jq -r --arg lbl "$2" '[.[][] | select(.event=="labeled" and .label.name==$lbl) | .created_at | fromdateiso8601] | max // empty | ((now - .) / 86400 | floor)' 2>/dev/null || true
}

is_stale() { # $1=issue $2=label → stale(≥TTL)면 0(true)
  local age; age="$(label_age_days "$1" "$2")"
  [[ -n "$age" && "$age" -ge "$CLAIM_TTL_DAYS" ]]
}

# 이슈번호가 fix/feat 브랜치명(fix/NNN-…)에 들어간 열린 PR / 원격 브랜치 = 경쟁. (라벨 미준수 대비)
competing_refs() { # $1=issue → 경쟁 ref 출력(없으면 빈 출력)
  local issue="$1" pat="(^|[-/_])0*${issue}([-/_]|\$)"
  git ls-remote --heads origin 2>/dev/null \
    | sed 's#.*refs/heads/##' \
    | grep -E "(^|[-/_])0*${issue}([-/_]|$)" | sed 's/^/    branch /' || true
  gh pr list --state open --json number,headRefName \
    -q ".[] | select(.headRefName|test(\"$pat\")) | \"    PR#\(.number) \(.headRefName)\"" 2>/dev/null || true
}

acquire() {
  need_gh
  local issue="$1" sess; sess="$(resolve_sess "${2:-}")"
  require_issue "$issue"; require_sess "$sess"
  local mylabel="wip:$sess"

  local json
  json="$(gh issue view "$issue" --json labels,state 2>/dev/null)" \
    || { echo "✗ 이슈 #$issue 조회 실패 (번호/권한 확인)" >&2; return 2; }

  local state wips
  state="$(jq -r '.state' <<<"$json")"
  [[ "$state" == "OPEN" ]] || { echo "✗ 이슈 #$issue 상태=$state — 클레임 불가" >&2; return 1; }
  wips="$(jq -r '.labels[].name | select(startswith("wip:sess"))' <<<"$json" || true)"

  # 1) 이미 내 라벨 → 멱등
  if grep -qx "$mylabel" <<<"$wips"; then
    echo "✓ 이슈 #$issue 이미 내 클레임 ($mylabel)"; return 0
  fi
  # 2) 다른 세션 wip 라벨 → 충돌. 단 TTL 초과(stale)면 죽은 세션 고아로 보고 탈취.
  local other_wip; other_wip="$(grep -vx "$mylabel" <<<"$wips" | grep -v '^$' || true)"
  if [[ -n "$other_wip" ]]; then
    local fresh="" lbl
    while IFS= read -r lbl; do
      [[ -n "$lbl" ]] || continue
      if is_stale "$issue" "$lbl"; then
        echo "  ↻ stale 클레임 회수: $lbl (≥${CLAIM_TTL_DAYS}일 경과)" >&2
        gh issue edit "$issue" --remove-label "$lbl" >/dev/null 2>&1 || true
      else
        fresh+="$lbl "
      fi
    done <<<"$other_wip"
    if [[ -n "$fresh" ]]; then
      echo "✗ 이슈 #$issue 충돌 — 활성 세션 라벨: ${fresh% }" >&2; return 1
    fi
  fi
  # 3) 경쟁 PR/브랜치 → 충돌
  local comp; comp="$(competing_refs "$issue")"
  if [[ -n "$comp" ]]; then
    { echo "✗ 이슈 #$issue 충돌 — 경쟁 PR/브랜치:"; echo "$comp"; } >&2; return 1
  fi

  # 선점
  ensure_label "$mylabel" "$sess"
  gh issue edit "$issue" --add-label "$mylabel" >/dev/null

  # 4) claim→verify→yield: 라벨 부착은 원자적이지 않다. 재조회해 동시 클레임이 있으면
  #    사전식 최소 라벨이 승자, 나머지는 자기 라벨 제거 후 양보(더블클레임 사후 해소).
  local after winner
  after="$(gh issue view "$issue" --json labels \
    -q '.labels[].name | select(startswith("wip:sess"))' 2>/dev/null | sort || true)"
  winner="$(head -n1 <<<"$after")"
  if [[ "$winner" != "$mylabel" ]]; then
    gh issue edit "$issue" --remove-label "$mylabel" >/dev/null 2>&1 || true
    echo "✗ 이슈 #$issue 경쟁 패배 — 승자: $winner (내 클레임 철회)" >&2; return 1
  fi
  echo "✓ 이슈 #$issue 클레임 ($mylabel)"
}

release() {
  need_gh
  # release --force <issue> : 모든 wip:sess 라벨 제거 (죽은 세션 고아 회수)
  if [[ "${1:-}" == "--force" ]]; then
    local issue="${2:-}"; require_issue "$issue"
    local labels; labels="$(gh issue view "$issue" --json labels \
      -q '.labels[].name | select(startswith("wip:sess"))' 2>/dev/null || true)"
    [[ -n "$labels" ]] || { echo "✓ 이슈 #$issue 활성 wip 라벨 없음"; return 0; }
    local lbl
    while IFS= read -r lbl; do
      [[ -n "$lbl" ]] || continue
      gh issue edit "$issue" --remove-label "$lbl" >/dev/null 2>&1 || true
      echo "✓ 강제 해제: #$issue $lbl"
    done <<<"$labels"
    return 0
  fi
  local issue="$1" sess; sess="$(resolve_sess "${2:-}")"
  require_issue "$issue"; require_sess "$sess"
  # 소유권 확인 — 내 라벨이 없으면 타 세션 라벨을 건드리지 않고 생략.
  if ! gh issue view "$issue" --json labels -q '.labels[].name' 2>/dev/null | grep -qx "wip:$sess"; then
    echo "⚠ 이슈 #$issue 에 내 클레임(wip:$sess) 없음 — 해제 생략 (고아 회수는 --force)"; return 0
  fi
  gh issue edit "$issue" --remove-label "wip:$sess" >/dev/null 2>&1 || true
  echo "✓ 이슈 #$issue 클레임 해제 (wip:$sess)"
}

list() {
  need_gh
  local rows; rows="$(gh issue list --state open --limit 100 --json number,title,labels \
    -q '.[] | select(.labels|map(.name)|any(startswith("wip:sess")))
         | "\(.number)\t\(.labels|map(.name)|map(select(startswith("wip:")))|join(","))\t\(.title[0:48])"')"
  [[ -n "$rows" ]] || { echo "  활성 클레임 없음"; return 0; }
  # 각 행에 가장 이른 wip 라벨의 경과일 / stale 표식 부가.
  local num labelsCsv title firstLabel age tag
  while IFS=$'\t' read -r num labelsCsv title; do
    [[ -n "$num" ]] || continue
    firstLabel="${labelsCsv%%,*}"
    age="$(label_age_days "$num" "$firstLabel")"
    tag=""
    if [[ -n "$age" ]]; then
      if [[ "$age" -ge "$CLAIM_TTL_DAYS" ]]; then tag="${age}d STALE"; else tag="${age}d"; fi
    fi
    printf "  #%s [%s] %s— %s\n" "$num" "$labelsCsv" "${tag:+($tag) }" "$title"
  done <<<"$rows"
}

status() {
  local issue="${1:-}"
  if [[ -z "$issue" ]]; then list; return; fi
  need_gh; require_issue "$issue"
  local json; json="$(gh issue view "$issue" --json number,title,labels,state 2>/dev/null)" \
    || { echo "✗ 이슈 #$issue 조회 실패" >&2; return 2; }
  local line; line="$(jq -r '"#\(.number) \(.state) [\(.labels|map(.name)|map(select(startswith("wip:")))|join(","))] — \(.title)"' <<<"$json")"
  local first; first="$(jq -r '.labels[].name | select(startswith("wip:sess"))' <<<"$json" | sort | head -n1 || true)"
  if [[ -n "$first" ]]; then
    local age; age="$(label_age_days "$issue" "$first")"
    if [[ -n "$age" ]]; then
      if [[ "$age" -ge "$CLAIM_TTL_DAYS" ]]; then line+="  (클레임 ${age}일차, STALE)"; else line+="  (클레임 ${age}일차)"; fi
    fi
  fi
  echo "$line"
}

cmd="${1:-}"; a2="${2:-}"; a3="${3:-}"
case "$cmd" in
  acquire) [[ -n "$a2" ]] || { echo "사용: $0 acquire <issue> [sess-N]" >&2; exit 2; }; acquire "$a2" "$a3" ;;
  release) [[ -n "$a2" ]] || { echo "사용: $0 release <issue> [sess-N] | release --force <issue>" >&2; exit 2; }; release "$a2" "$a3" ;;
  status)  status "$a2" ;;
  list)    list ;;
  *) echo "사용: $0 {acquire|release|status|list|release --force} [issue] [sess-N]" >&2; exit 2 ;;
esac
