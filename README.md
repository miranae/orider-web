# Orider Web

[한국어](README.md) | [English](README-en.md)

**Orider Web**은 Orider 자전거 컴퓨터 플랫폼의 프로덕션 웹 프론트엔드입니다. 라이딩 분석, 피트니스/훈련 대시보드, 코스와 세그먼트 탐색, 커뮤니티, 그룹 이벤트 운영 화면을 제공합니다.

[서비스 바로가기](https://orider.co.kr) · [기여 안내](CONTRIBUTING.md) · [개발 문서](docs/DEVELOPMENT.md) · [브랜치 모델](docs/BRANCHING.md) · [기여자 아키텍처](docs/CONTRIBUTOR_ARCHITECTURE.md) · [API와 연동](docs/API_AND_INTEGRATIONS.md) · [보안](SECURITY.md)

## 저장소 범위

이 저장소는 공개 가능한 프론트엔드 소스입니다.

- 포함: React/Vite 앱, TypeScript UI 코드, i18n 리소스, 디자인 토큰, 순수 훈련/시뮬레이션 유틸리티, 테스트, 문서, 정적 자산
- 제외: Cloud Functions, Firestore/Storage 프로덕션 rules, 비공개 분석 파이프라인, 서버 사이드 AI/훈련 로직, 서비스 계정, 운영 비밀 값

프론트엔드 코드는 보안 경계가 아닙니다. 접근 제어와 개인정보 보호는 백엔드 서비스와 Firebase 보안 규칙에서 강제되어야 합니다.

## 빠른 시작

요구사항: Node.js 20 이상

```bash
cp .env.example .env
npm ci
npm run dev
```

자주 쓰는 확인 명령:

```bash
npm run lint
npm test
npm run build
npm run e2e
```

`npm run e2e`는 Firebase Auth/Firestore emulator와 Playwright를 함께 실행합니다.

## 프로젝트 구조

```text
src/
  pages/          라우트 화면
  components/     재사용 UI와 도메인 컴포넌트
  features/       기능 단위 query, mutation, type, utility
  hooks/          재사용 React 훅
  services/       Firebase, analytics, API client
  i18n/           한국어/영어 리소스
  theme/          디자인 토큰과 UI primitives
shared/
  training/       훈련, 피트니스, 회복, 부하 계산
  sim/            코스/세그먼트 시뮬레이션 순수 함수
e2e/tests/        Playwright 테스트
public/           정적 자산, 매뉴얼, locale payload
```

새 기능이나 큰 변경은 page 파일에 로직을 더 쌓기보다 `src/features/<domain>/`로 query, mutation, type, utility를 분리하는 방향을 우선합니다. 자세한 기준은 [Contributor Architecture Guide](docs/CONTRIBUTOR_ARCHITECTURE.md)를 참고하세요.

## 주요 제품 영역

- **라이딩 분석**: 활동 상세, 지도, 파워/존/랩/구간 분석, GPX/TCX/FIT/CSV 내보내기
- **피트니스와 훈련**: 자전거/러닝/수영/트라이애슬론 뷰, 훈련 계획, 로그, 오늘의 운동, 순수 훈련 계산
- **코스와 탐색**: `/discover`, `/explore`, 코스 생성/수정, 세그먼트, 리더보드, 히트맵/타일 연동
- **커뮤니티와 Creator Hub**: 게시판, 친구, 선수 프로필, 개인 데이터 레시피와 공유 카드
- **그룹과 이벤트**: 그룹 대시보드, 멤버/라이딩 관리, 이벤트 등록, 라이브, 결과, 운영자 화면

## 기여하기

좋은 첫 기여 영역:

- 한국어/영어 번역과 제품 문구
- 접근성 라벨, 키보드 흐름, focus order, semantic markup
- 모바일 웹 레이아웃과 빈/로딩/오류 상태
- 차트 가독성, 지도 fallback, 테스트 보강
- 문서, 스크린샷, 설정 안내

PR 전에는 변경 범위에 맞게 `npm run lint:budget`, `npm run quality:budget`, `npm test`, `npm run build`, `npm run e2e` 중 필요한 확인을 실행하세요. 모든 커밋은 DCO를 위해 `git commit -s`로 서명합니다.

## 브랜치와 PR 흐름

Orider Web은 오픈소스에 맞춘 단순한 trunk-based 흐름을 사용합니다.

```text
fork/topic branch ──┐
                    ├─ pull request ── CI/review ── squash/merge ── main ── protected deploy
maintainer/topic ───┘
```

- `main`은 보호된 프로덕션 브랜치입니다.
- `develop` 같은 장기 브랜치는 사용하지 않습니다.
- 모든 변경은 짧은 topic branch와 Pull Request를 거칩니다.
- 브랜치 이름은 `feat/`, `fix/`, `docs/`, `test/`, `refactor/`, `ci/`, `chore/`, `security/`, `style/`, `perf/`, `build/` 중 하나를 사용합니다.
- 외부 기여자는 fork에서 브랜치를 만들고 PR을 엽니다.
- 메인테이너도 직접 `main`에 push하지 않습니다.

세부 규칙과 예시는 [Branching Model](docs/BRANCHING.md)에 있습니다.

필수 PR 게이트는 `PR metadata`, `DCO`, `CI / check`입니다. 포크 PR에서도 시크릿 없이 실행되며, 문서만 바꾼 PR은 무거운 npm 단계를 건너뛰되 성공 상태를 남깁니다.

## 개인 데이터와 API

Orider는 로그인한 라이더가 자신의 데이터를 사용할 수 있도록 작은 owner-only Personal Data API를 제공합니다. 넓은 범위의 제3자 앱 플랫폼이나 OAuth 앱 등록은 아직 제공하지 않습니다. 외부 자동화는 Firebase callable endpoint를 긁지 말고 [Personal Data API](docs/PERSONAL_DATA_API.md)를 기준으로 해야 합니다.

레시피 예시는 [Personal Data Recipes](docs/recipes/personal-data.md)와 [Creator Showcase](docs/CREATOR_SHOWCASE.md)를 참고하세요.

## 공개 저장소 상태

공개 기준 저장소는 [`miranae/orider-web`](https://github.com/miranae/orider-web)입니다. 과거 private history를 그대로 공개하지 않고, 검토된 working tree에서 깨끗한 production-source 저장소를 재생성하는 방식으로 전환했습니다.

README 스크린샷은 데모용 안전 데이터로 다시 생성될 때까지 제외되어 있습니다. 전환 이력은 [Public Repository Cutover](docs/PUBLIC_REPOSITORY_CUTOVER.md)를 참고하세요.

## 라이선스와 상표

- 코드: [GNU AGPL-3.0](LICENSE)
- 기여: [DCO 1.1](DCO.md)
- 거버넌스와 미션: [MISSION.md](MISSION.md), [GOVERNANCE.md](GOVERNANCE.md), [FUNDING.md](FUNDING.md)
- 브랜드: "Orider", "ORIDER", Orider 로고는 상표이며 코드 라이선스로 허가되지 않습니다. Fork는 자체 브랜드를 사용해야 합니다. [TRADEMARK.md](TRADEMARK.md)를 참고하세요.
