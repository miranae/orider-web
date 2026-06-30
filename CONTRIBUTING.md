# 기여 가이드

Orider Web에 기여해 주셔서 감사합니다. 이 저장소는 실제 라이더가 사용하는 프로덕션 프론트엔드이므로, 변경은 작고 검토 가능하며 실제 개인 데이터에 안전해야 합니다.

영문 문서는 [CONTRIBUTING-en.md](CONTRIBUTING-en.md)를 참고하세요.

## 좋은 첫 기여 영역

- `src/i18n/resources/`의 한국어/영어 번역과 제품 문구
- 접근성 라벨, 키보드 흐름, focus 순서, semantic markup, contrast
- 모바일 레이아웃, 빈 상태, 로딩 상태, 오류 상태
- 차트 가독성, 지도 fallback, 집중된 테스트
- 문서, 설정 안내, demo-safe screenshot
- `docs/recipes/`의 개인 데이터 recipe 초안

큰 제품 변경은 먼저 issue나 draft PR로 범위, 백엔드 의존성, 개인정보 영향, 디자인 방향을 맞춰 주세요.

## 개발 환경

```bash
cp .env.example .env
npm ci
npm run dev
```

일부 흐름은 Firebase 서비스나 emulator 데이터가 필요합니다. 로컬 모드와 maintainer-only 연동 제한은 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)를 보세요.

## 브랜치와 PR

짧게 사는 topic branch에서 작업하고 Pull Request를 여세요. 외부 기여자는 fork에서 브랜치를 만들고, maintainer도 `main`에 직접 push하지 않습니다.

브랜치 이름과 PR gate는 [docs/BRANCHING.md](docs/BRANCHING.md)에 정리되어 있습니다. 주요 체크는 다음입니다.

- `PR metadata`
- `DCO`
- `CI / check`

PR 제목은 Conventional Commit 스타일을 사용합니다. 예: `fix: handle mobile tab overflow`, `docs: simplify README`.

## PR 전에 확인할 것

변경 범위에 맞는 검사를 실행하세요.

```bash
npm run lint:budget
npm run quality:budget
npm test
npm run build
npm run e2e
```

문서만 바꾸는 PR은 문서가 실제 동작을 설명하지 않는 한 로컬 빌드가 필수는 아닙니다. 사용자에게 보이는 흐름 변경은 가능하면 screenshot, recording, Playwright coverage를 포함하세요.

## 코드 구조

기존 경계를 우선 사용합니다.

- route composition: `src/pages/`
- 재사용 UI: `src/components/`
- feature logic: `src/features/<domain>/`
- data loading: `src/hooks/`
- Firebase/API wrapper: `src/services/`
- pure calculation: `shared/`

새 write, API call, logging, feature extraction은 [docs/CONTRIBUTOR_ARCHITECTURE.md](docs/CONTRIBUTOR_ARCHITECTURE.md)를 따르세요.

## 개인 데이터와 recipe

Recipe PR에는 다음을 적습니다.

- 라이더에게 주는 가치
- 필요한 scope
- privacy note
- 안전한 기본 visibility
- 공유 가능한 결과 형태
- demo input/output 또는 screenshot

access token, 실제 user ID, 이메일, 정확한 비공개 경로, 운영 export, provider secret, private data가 보이는 screenshot은 포함하지 마세요. 관련 문서: [docs/PERSONAL_DATA_API.md](docs/PERSONAL_DATA_API.md), [docs/CREATOR_SHOWCASE.md](docs/CREATOR_SHOWCASE.md), [docs/recipes/personal-data.md](docs/recipes/personal-data.md).

## DCO와 라이선스

커밋에는 sign-off를 붙입니다.

```bash
git commit -s
```

기여는 [Developer Certificate of Origin](DCO.md)을 따르며, 별도의 광범위한 저작권 양도를 요구하지 않습니다. 기여 내용은 [AGPL-3.0](LICENSE)으로 제공됩니다.

## 보안

취약점은 공개 issue나 PR comment에 쓰지 마세요. [SECURITY.md](SECURITY.md)를 따르세요.
