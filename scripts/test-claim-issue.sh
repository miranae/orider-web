#!/usr/bin/env bash
# `scripts/claim-issue.sh` 의 경쟁 ref 판정 단위 테스트 (#2271).
#
# 핵심 계약: **내 브랜치는 경쟁자가 아니다.** 인계받은 워크트리에서 재클레임이 막히면
# 병렬 세션이 많은 환경에서 충돌 방지 장치가 정확히 필요한 순간에 꺼진다.
#
# `git`·`gh` 를 PATH 스텁으로 대체해 네트워크 없이 돌린다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/scripts/claim-issue.sh"
STUB_DIR="$(mktemp -d -t claim-issue-stubs.XXXX)"
trap 'rm -rf "$STUB_DIR"' EXIT

# ── 스텁: 원격 브랜치·열린 PR 목록을 파일로 주입한다 ────────────────────────────
cat >"$STUB_DIR/git" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  "ls-remote --heads origin")
    while IFS= read -r branch; do
      [[ -n "$branch" ]] || continue
      printf 'deadbeef\trefs/heads/%s\n' "$branch"
    done < "$STUB_BRANCHES"
    ;;
  "rev-parse --abbrev-ref HEAD") cat "$STUB_HEAD" ;;
  *) exit 0 ;;
esac
STUB
cat >"$STUB_DIR/gh" <<'STUB'
#!/usr/bin/env bash
# `gh pr list --state open --json number,headRefName -q <jq>` 만 흉내 낸다.
# 스텁 파일은 "번호 브랜치명" 줄 목록이며, 이슈 번호 필터는 호출부의 jq 대신
# 여기서 하지 않는다 — 필터링은 claim-issue.sh 의 책임이므로 전부 넘긴다.
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  printf '%s\n' "$line"
done < "$STUB_PRS"
STUB
chmod +x "$STUB_DIR/git" "$STUB_DIR/gh"
export PATH="$STUB_DIR:$PATH"
export STUB_BRANCHES="$STUB_DIR/branches" STUB_PRS="$STUB_DIR/prs" STUB_HEAD="$STUB_DIR/head"

fail() { echo "✗ $1" >&2; exit 1; }

# competing_refs 를 스텁 환경에서 호출한다.
refs_for() { # $1=issue $2=현재 브랜치 $3..=원격 브랜치들
  local issue="$1" head="$2"; shift 2
  printf '%s\n' "$head" >"$STUB_HEAD"
  printf '%s\n' "$@" >"$STUB_BRANCHES"
  : >"$STUB_PRS"
  ( source "$TARGET"; competing_refs "$issue" )
}

# ── 1) 인계받은 자기 브랜치는 경쟁자가 아니다 (이 이슈의 본체) ─────────────────
out="$(refs_for 2257 "feat/2257-home-greeting-locale-fallback" "feat/2257-home-greeting-locale-fallback")"
[[ -z "${out//[[:space:]]/}" ]] \
  || fail "체크아웃된 자기 브랜치가 경쟁자로 잡혔다 — 인계 재클레임이 막힌다: $out"

# ── 2) 같은 이슈의 **다른** 브랜치는 여전히 충돌 ──────────────────────────────
out="$(refs_for 2257 "feat/2257-mine" "feat/2257-mine" "fix/2257-someone-else")"
grep -q "fix/2257-someone-else" <<<"$out" \
  || fail "다른 세션의 같은 이슈 브랜치를 놓쳤다 — 방어력이 줄었다: $out"
grep -q "feat/2257-mine" <<<"$out" \
  && fail "자기 브랜치가 함께 보고됐다: $out"

# ── 3) detached HEAD — 제외 대상이 없으니 기존 거동 유지 ──────────────────────
out="$(refs_for 2257 "HEAD" "feat/2257-anything")"
grep -q "feat/2257-anything" <<<"$out" \
  || fail "detached HEAD 에서 경쟁 브랜치를 놓쳤다: $out"

# ── 4) 무관한 이슈 번호는 매칭되지 않는다 ────────────────────────────────────
out="$(refs_for 2257 "HEAD" "feat/22570-other" "feat/12257-other")"
[[ -z "${out//[[:space:]]/}" ]] \
  || fail "이슈 번호가 부분 일치로 오검출됐다: $out"

# ── 5) 열린 PR 중 자기 브랜치 PR 만 제외된다 ─────────────────────────────────
printf '%s\n' "HEAD" >"$STUB_HEAD"; : >"$STUB_BRANCHES"
printf '%s\n' "111 feat/2257-mine" "222 fix/2257-theirs" >"$STUB_PRS"
out="$( ( source "$TARGET"; competing_refs 2257 "feat/2257-mine" ) )"
grep -q "PR#222" <<<"$out" || fail "다른 세션 PR 을 놓쳤다: $out"
grep -q "PR#111" <<<"$out" && fail "자기 브랜치 PR 이 경쟁자로 잡혔다: $out"

echo "✅ claim-issue 경쟁 ref 판정 5케이스 통과"
