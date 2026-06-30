# 기여자 아키텍처 가이드

이 문서는 Orider Web에서 변경을 어디에 두어야 하는지 설명합니다. 영문 문서는 [CONTRIBUTOR_ARCHITECTURE-en.md](CONTRIBUTOR_ARCHITECTURE-en.md)를 참고하세요.

## 기본 구조

| 위치 | 역할 |
|---|---|
| `src/pages/` | route 단위 화면 조립 |
| `src/components/` | 재사용 UI와 domain component |
| `src/hooks/` | data loading, subscription, UI state hook |
| `src/services/` | Firebase, API, analytics, provider wrapper |
| `src/utils/` | browser-side utility와 export helper |
| `shared/` | frontend/backend 양쪽에서 재사용 가능한 pure TypeScript |
| `docs/` | contribution, API, recipe, release 문서 |

## 변경 위치 선택

- route 전체 흐름은 `src/pages/`에 둡니다.
- 여러 화면에서 쓰는 UI는 `src/components/`로 분리합니다.
- Firestore나 API 호출은 component에 직접 흩뿌리지 말고 `src/services/`나 hook에 둡니다.
- 계산 로직은 가능하면 pure function으로 두고 테스트를 붙입니다.
- provider secret이나 privileged call은 프론트엔드에 넣지 않습니다.

## 데이터 접근

프론트엔드는 Firebase client SDK와 public API만 사용합니다. 보안은 UI 조건문이 아니라 server-side authorization, Firestore/Storage rules, App Check, Cloud Functions에서 강제되어야 합니다.

개인 데이터 API나 recipe를 다룰 때는 다음을 명시하세요.

- 필요한 scope
- owner-only 접근 여부
- public-safe output인지 여부
- 민감 데이터 redaction 방식
- 실패/권한 부족 상태

## UI 기준

- 반복 사용 화면은 조밀하지만 읽기 쉽게 만듭니다.
- loading, empty, error, permission state를 함께 구현합니다.
- 모바일에서 텍스트가 겹치거나 버튼이 잘리지 않게 확인합니다.
- chart/map은 provider가 없을 때도 fallback을 보여야 합니다.

## 테스트 기준

변경 위험에 맞게 테스트를 선택합니다.

- pure utility: unit test
- hook/service: mock 기반 test
- route/page: React Testing Library
- 주요 사용자 흐름: Playwright 또는 screenshot/recording

최소 확인:

```bash
npm run lint:budget
npm run quality:budget
npm test
npm run build
```

## 피해야 할 것

- production data나 secret을 fixture로 사용
- Firebase callable을 공개 API처럼 문서화
- UI component 안에 복잡한 Firestore query와 변환 로직을 직접 작성
- unrelated refactor를 기능 PR에 섞기
- `*-en.md`가 있는데 기본 문서를 영어로만 유지하기
