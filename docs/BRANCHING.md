# 브랜치 모델

이 문서는 Orider Web의 브랜치와 PR 흐름을 설명합니다. 영문 문서는 [BRANCHING-en.md](BRANCHING-en.md)를 참고하세요.

## 기본 원칙

- `main`은 보호 브랜치입니다.
- 기능/수정은 짧게 사는 topic branch에서 작업합니다.
- 외부 기여자는 fork에서 PR을 엽니다.
- maintainer도 `main`에 직접 push하지 않습니다.
- 배포는 release workflow와 tag 정책을 따릅니다.

## 브랜치 이름

권장 패턴:

| 유형 | 예시 |
|---|---|
| 기능 | `feat/creator-hub-card` |
| 버그 수정 | `fix/mobile-tab-overflow` |
| 문서 | `docs/personal-data-recipe` |
| CI/빌드 | `ci/pr-gate-node-version` |
| 리팩터 | `refactor/settings-pane-boundary` |

브랜치 이름은 짧고 변경 의도를 드러내야 합니다.

## PR 대상

일반 PR은 repository의 현재 contribution branch 정책을 따릅니다. `main` 승격이 별도 gate로 관리되는 경우 feature branch는 `dev`나 지정된 integration branch로 PR을 보내고, `main`은 승격 PR만 받습니다.

PR을 열기 전에 최신 base를 가져오세요.

```bash
git fetch origin
git rebase origin/main
```

또는 프로젝트가 `dev`를 사용하면:

```bash
git fetch origin
git rebase origin/dev
```

## PR gate

주요 gate:

- PR 제목/본문 metadata
- DCO sign-off
- lint/quality/test/build
- 문서 변경 시 링크와 언어 쌍 확인
- 사용자-facing 변경 시 screenshot 또는 테스트

문서만 변경한 PR은 빌드가 필요하지 않을 수 있지만, 문서가 실제 동작을 설명한다면 관련 테스트나 코드 확인을 함께 해야 합니다.

## 머지

머지는 maintainer가 수행합니다. squash merge를 기본으로 하며, commit title은 Conventional Commit 스타일을 유지합니다.

maintainer는 직접 `gh pr merge`를 호출하지 않고 로컬 머지 게이트를 사용합니다.

```bash
scripts/merge-pr.sh <PR번호>
```

이 스크립트는 로컬 lint/quality/test/build, 로컬 AI 코드리뷰, GitHub checks, GitHub reviewDecision을 확인한 뒤 squash merge를 수행합니다. 리뷰 생략이나 dry-run이 필요한 경우 명시적으로 옵션을 사용합니다.

```bash
scripts/merge-pr.sh <PR번호> --no-merge
scripts/merge-pr.sh <PR번호> --no-review
scripts/merge-pr.sh <PR번호> --require-github-review
```

예:

- `fix: show saved ai summary on cache miss`
- `docs: restore korean default docs`
- `ci: deploy production from release tags`

## 릴리스

`main`에 머지하는 것과 production 배포는 동일하지 않을 수 있습니다. release tag가 배포를 트리거하는 경우 tag 생성, release note, environment approval을 별도로 관리합니다.
