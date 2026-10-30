# Merge review fallback / 머지 리뷰 대체 경로

`scripts/merge-pr.sh` tries **Codex → Claude → recorded self-review**. A valid
`BLOCK` always stops the gate; another reviewer cannot override it. Missing
executables/authentication, transport failures, timeouts and unusable responses
advance to the next provider. Tests, type checks, GitHub checks and commit/base
freshness checks still apply. No provider failure is converted into an automatic
`PASS`.

기본 리뷰 기준은 기존과 같은 `--blockers-only`입니다. `--all-findings`는
기존의 전체 발견 보고 기준을 사용합니다. 실제 적용한 제공자와 판정은 게이트
로그와 로컬 리뷰 기록에 남습니다.

## When both CLIs are unavailable / 두 CLI를 사용할 수 없을 때

The gate pauses for an actual review of the exact input. The working agent or
author must inspect the saved input and record findings; filling the template
without reviewing the diff is not a review.

두 CLI가 모두 실패하면 다음 파일을 보존하고 머지를 중단합니다. 위치는 일반
작업트리가 아닌 Git common directory의 `merge-reviews/pr-<PR>/<head>/`입니다.

- `report.json`: 제공자별 실패 이유와 현재 상태
- `input.txt`, `diff.patch`: 검토해야 할 정확한 입력
- `self-review.json`: 작성할 결과 양식

양식의 `binding`은 그대로 유지하고, 실제 검토 후 아래 네 필드를 작성합니다.
다음은 수정할 필드만 보여 주는 예시입니다.

```json
{
  "reviewer": "Actual reviewer name or agent",
  "reviewedAt": "2026-10-24T00:00:00+09:00",
  "findings": "Actual findings, or why no blocking defect was found",
  "verdict": "PASS"
}
```

실제 파일에는 생성된 `binding` 객체도 포함돼 있어야 합니다. `verdict`는 `PASS`
또는 `BLOCK`입니다.

```sh
scripts/merge-pr.sh <PR> --self-review-file /absolute/path/to/self-review.json
```

PR 번호·head·base·리뷰 시작 커밋·리뷰 범위·diff SHA-256이 모두 일치해야 결과를
수용합니다. 코드나 base가 바뀌면 다시 검토해야 합니다. 같은 입력에 대한 기존
`BLOCK`은 셀프리뷰 파일로 바꿀 수 없습니다. 셀프리뷰의 `PASS`는 독립 AI 리뷰의
증분 검토 기준점으로 기록하지 않습니다.

## Isolation and credentials / 격리와 인증

Both CLI reviewers receive only the prepared review input in a temporary,
restricted environment. Tools, MCP integrations and project hooks are disabled;
the existing macOS sandbox confines file access and process execution. A failed
isolation check stops the gate rather than selecting a weaker reviewer.

Codex는 기존 인증 파일의 격리 복사본을 사용합니다. Claude는 기존 API key/OAuth
환경 값 또는 로그인된 자격 증명을 사용하며, 필요한 macOS 키체인 값은 부모
프로세스에서 메모리로만 읽습니다. 토큰과 원본 CLI 오류 출력은 리뷰 기록에
저장하지 않습니다. 새 로그인이나 키 발급은 이 스크립트가 수행하지 않습니다.

The review records contain code diffs and must remain local. Do not attach them
to public PRs if they include private source or identifiers.
