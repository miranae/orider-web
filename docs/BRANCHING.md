# 브랜치 모델

이 문서는 Orider Web의 브랜치와 PR 흐름을 설명합니다. 영문 문서는 [BRANCHING-en.md](BRANCHING-en.md)를 참고하세요.

## 기본 원칙

- `dev`는 통합 브랜치, `main`은 보호된 프로덕션 브랜치입니다.
- 기능/수정은 짧게 사는 topic branch에서 작업하고 `dev`로 PR을 엽니다.
- `dev`에 쌓인 변경은 승격 PR로 `main`에 올립니다.
- 외부 기여자는 fork에서 PR을 엽니다.
- maintainer도 `dev`와 `main`에 직접 push하지 않습니다.
- 배포는 release workflow와 tag 정책을 따릅니다.

```text
fork/topic branch ──┐
                    ├─ pull request ── review/merge gate ── squash ── dev ── promotion PR ── main ── tag v* ── protected deploy
maintainer/topic ───┘
```

## 브랜치 이름

`pr-gate.yml`이 허용하는 prefix:

| prefix | 용도 | 예시 |
|---|---|---|
| `feat/` | 기능 | `feat/creator-hub-card` |
| `fix/` | 버그 수정 | `fix/mobile-tab-overflow` |
| `hotfix/` | `main`에서 분기해 `main`으로 직접 보내는 긴급 최소 수정 | `hotfix/remove-app-install-banner` |
| `docs/` | 문서 | `docs/personal-data-recipe` |
| `test/` | 테스트만 변경 | `test/activity-detail-e2e` |
| `refactor/` | 동작 변화 없는 정리 | `refactor/settings-pane-boundary` |
| `ci/` | GitHub Actions와 릴리스 자동화 | `ci/pr-gate-node-version` |
| `chore/` | 유지보수 | `chore/update-deps` |
| `security/` | 보안 수정 | `security/harden-profile-reads` |
| `style/` | 포맷, 문구 스타일, 비기능 UI 다듬기 | `style/readme-language` |
| `perf/` | 성능 | `perf/lazy-route-chunks` |
| `build/` | 빌드 도구와 의존성 | `build/vite-config` |

prefix 뒤는 소문자, 숫자, 하이픈만 사용합니다(`<prefix>/[a-z0-9][a-z0-9-]*`). 브랜치 이름은 짧고 변경 의도를 드러내야 합니다. fork PR의 브랜치 이름은 거부하지 않습니다.

## PR 대상

일반 PR의 base는 `dev`입니다(`gh pr create --base dev`). `main`은 `dev` 또는 그 고정 스냅샷(`promote/snapshot-*`)의 승격 PR과 `hotfix/*` PR만 받으며, 그 외 head는 `main-promote-guard.yml`이 거부합니다.

예외는 `hotfix/*` 브랜치입니다. 운영에서 즉시 고쳐야 하는 최소 변경은 `origin/main`에서 분기한 `hotfix/*` 브랜치로 `main`에 직접 PR을 열 수 있습니다. hotfix도 full merge gate를 통과해야 하며, 머지 후에는 `main`을 `dev`로 되병합해 다음 승격에서 변경이 유실되지 않게 합니다(로컬 머지 게이트가 자동 수행).

PR을 열기 전에 최신 base를 가져오세요.

```bash
git fetch origin
git rebase origin/dev
```

`hotfix/*` 브랜치는 `origin/main`을 기준으로 합니다.

## PR gate

GitHub 체크는 PR 대상에 따라 다릅니다.

| 체크 | 실행 대상 | 확인 내용 |
|---|---|---|
| `DCO` | `dev`, `main` 대상 PR | 모든 커밋의 `Signed-off-by:` |
| `PR metadata` | `main` 대상 PR | Conventional Commit 스타일 제목, 브랜치 prefix, env/secret/build 산출물 미포함 |
| `CI / check` | `main` 대상 PR | `lint:budget`, `quality:budget`, `check:i18n`, `check:deploy-config`, `npm test`, placeholder 설정 build |
| `Require dev or hotfix head` | `main` 대상 PR | head가 `dev`, `promote/snapshot-*`, `hotfix/*` 중 하나 |

`dev` 대상 PR의 lint/quality/test/build는 GitHub CI 대신 maintainer가 머지 게이트(`scripts/merge-pr.sh`)에서 확인하고, 누적 변경 전체에 대한 CI는 승격 PR에서 실행됩니다.

리뷰에서 함께 보는 것:

- 문서 변경 시 링크와 언어 쌍 확인
- 사용자-facing 변경 시 screenshot 또는 테스트

문서만 변경한 PR은 빌드가 필요하지 않을 수 있지만, 문서가 실제 동작을 설명한다면 관련 테스트나 코드 확인을 함께 해야 합니다.

## 머지

머지는 maintainer가 수행합니다. squash merge를 기본으로 하며, commit title은 Conventional Commit 스타일을 유지합니다.

maintainer는 직접 `gh pr merge`를 호출하지 않고 로컬 머지 게이트를 사용합니다.

```bash
scripts/merge-pr.sh <PR번호>
```

이 스크립트는 로컬 lint/quality/test/build, 로컬 AI 코드리뷰, GitHub checks, GitHub reviewDecision을 확인한 뒤 squash merge를 수행합니다. `--no-review`로 중복 리뷰를 생략할 때는 아래 승격 시간 정책의 근거 기록과 재사용 조건을 따릅니다.

```bash
scripts/merge-pr.sh <PR번호> --no-merge
scripts/merge-pr.sh <PR번호> --require-github-review
```

예:

- `fix: show saved ai summary on cache miss`
- `docs: restore korean default docs`
- `ci: deploy production from release tags`

## main 승격 시간 정책

1. PR을 열기 전에 최신 `main`과 후보를 비교해 포함할 변경, 실제 실패 영향, 확인할 항목을 정합니다. 정기 승격은 저장소의 고정 스냅샷 경로를 사용합니다. 승인 범위 밖의 변경이 섞여 있으면 기존 분리 승격 경로를 사용합니다. 사전 점검이 필요하면 바뀐 계약만 읽기 전용으로 확인하고, 같은 검사를 기본 배포 경로에 추가하기 전에 기존 검사와 중복되는지 확인합니다.
2. 변경 범위에 맞는 로컬 확인을 마치면 승격 PR을 열어 필수 CI를 시작합니다. 독립적으로 수행할 수 있는 리뷰와 검증은 CI와 병행합니다. 리뷰에서 머지를 막는 블로커만 수정하고 나머지 의견은 기록합니다. 웹 머지 게이트가 동일 head의 GitHub `check` 성공을 확인하면 해당 CI가 수행한 lint·테스트·빌드를 로컬에서 반복하지 않습니다.
3. 필수 CI가 일시 장애나 기존 간헐 테스트 때문에 실패한 정황이 있으면 로그와 변경 범위를 확인한 뒤 같은 커밋의 실패 작업만 한 번 재실행합니다. 재실행도 실패하거나 변경으로 인한 실패가 확인되면 원인을 확인해 블로커만 수정합니다. 머지에는 필수 검사 성공이 필요합니다.
4. 재실행 뒤에는 PR의 전체 base·head SHA와 검사 입력이 동일한 경우에만 이미 완료한 리뷰와 검증 결과를 재사용합니다. 검토 범위와 PASS 근거, 성공한 CI 실행 링크를 PR에 남기고 표준 머지 게이트로 마무리합니다. base·head 또는 검사 입력이 바뀌면 영향을 받는 검사와 리뷰를 새 후보 기준으로 다시 확인합니다.
5. 요청 시각부터 최종 확인까지의 총시간과 범위 확인·준비, 리뷰, CI(대기·재시도 포함), 머지·`dev` 동기화 시간을 기록합니다. 병행 구간은 총시간에 겹쳐 더하지 않습니다. 배포 요청이 포함되면 배포 준비부터 실제 환경 확인까지 별도로 기록합니다.

## 릴리스

`main`에 머지하는 것과 production 배포는 동일하지 않을 수 있습니다. release tag가 배포를 트리거하는 경우 tag 생성, release note, environment approval을 별도로 관리합니다.

production 태그는 `scripts/release-tag.sh`로 만듭니다. 이 스크립트는 마지막 태그 이후 `origin/main`에 쌓인 커밋 전체(release diff)를 보여주고 확인을 받은 뒤에만 태그를 push합니다 — 다른 목적의 배포에 검토되지 않은 변경이 편승하는 것을 막기 위한 절차입니다. 배포 성공 후에는 `prod-smoke.yml`이 모바일 뷰포트 스모크(고정 요소 과점유·렌더 실패 감지)를 자동 실행합니다.

### CodeQL 머지 정책

CodeQL 스캔은 유지하지만 `scripts/merge-pr.sh`의 필수 머지 검사에서는 제외합니다. GitHub 공식 앱과 같은 head·check suite의 CodeQL workflow로 확인된 검사만 비차단으로 취급합니다. 다른 검사의 실패·미확인 상태, 충돌, 보호 규칙 및 head 변경은 계속 머지를 막습니다. 기본 실행은 일반 검사를 기다리고, `--no-wait`도 대기 중인 일반 검사를 통과시키지 않습니다.
