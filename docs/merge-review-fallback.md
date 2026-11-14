# Merge review fallback / 머지 리뷰 대체 경로

`scripts/merge-pr.sh` tries **Codex → Claude → recorded self-review**. A valid
`BLOCK` always stops the gate; another reviewer cannot override it. Missing
executables/authentication, transport failures, timeouts and unusable responses
advance to the next provider. Tests, type checks, GitHub checks and commit/base
freshness checks still apply. No provider failure is converted into an automatic
`PASS`.

기본 기준은 **BLOCKER와 MAJOR 차단**입니다. `--blockers-only`는 호환 별칭이며
MAJOR 차단을 해제하지 않습니다. `--all-findings`는 MINOR 보고만 추가합니다.
Codex·Claude·자체 리뷰 모두 findings의 BLOCKER/MAJOR 항목을 감지하면 모순된
`PASS`도 `BLOCK`으로 바꿉니다. 검토하지 못한 입력을 통과시키지 않습니다.

리뷰 입력에는 정확한 diff와 함께 **커밋된 head의 관련 소스**를 제공합니다.
새로 사용하거나 수정한 import의 의존성, 서비스·인증 로직의 전이 의존성,
직접 호출부, 일반/임베드 초기화와 전역 테스트 mock을 포함합니다. 이름 있는
barrel export는 사용하는 심벌을 따라갑니다. UI 전개는 기본 2단계이며 그 이후
경계는 manifest에 표시합니다. 모든 코드를 검토했다는 뜻은 아닙니다.
파일별 SHA-256과 전체 입력 SHA-256을 기록하고, 입력 상한을 넘으면 문맥을
조용히 자르지 않고 중단합니다. tracked blob만 읽으며 작업트리의 `.env`,
외부 symlink, node_modules 소스는 모델에 제공하지 않습니다.

feature→dev도 ESLint와 임베드 격리 회귀 테스트를 항상 실행한 뒤 변경 영향
Vitest·스크립트 계약·타입 검사를 실행합니다. 임베드 격리 테스트는 실제
bootstrap→선수 프로필→서비스 조회·추가 페이지를 실행하면서 일반 Firebase
싱글턴은 undefined로 둡니다. 페이지 전체를 mock하는 라우팅 테스트와 별개입니다.
ESLint 도달 범위는 AST의 런타임 import/export/dynamic import와 alias를 따르며
CI와 로컬 lint 모두 최신 목록인지 검사합니다. `./firebase`, 확장자, namespace,
재수출과 동적 import도 검사합니다. 일반 웹 기본값을 함께 제공하는 공유 서비스의
import 예외는 명시적으로 남기되, 그 예외가 임베드 호출의 안전성을 증명하지는
않습니다. 리뷰에서는 실제 서비스 전달과 계정·앱 교체 경로까지 확인해야 합니다.

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

PR 번호·head·base·리뷰 시작 커밋·리뷰 범위·diff SHA-256·전체 입력 SHA-256이 모두 일치해야 결과를
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
