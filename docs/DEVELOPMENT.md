# 개발과 배포

이 문서는 Orider Web을 로컬에서 실행하고 검증하는 방법을 설명합니다. 영문 문서는 [DEVELOPMENT-en.md](DEVELOPMENT-en.md)를 참고하세요.

## 요구 사항

- Node.js 24 계열
- npm
- Firebase CLI는 배포/에뮬레이터 작업이 필요할 때만 사용

## 빠른 시작

```bash
cp .env.example .env
npm ci
npm run dev
```

로컬 앱은 Vite dev server로 실행됩니다. production Firebase 프로젝트 접근이 없어도 UI shell, routing, 다수의 component/test 작업은 가능합니다.

## 빌드 확인

placeholder Firebase 값으로 compile-only build를 확인할 수 있습니다.

```bash
VITE_FIREBASE_API_KEY=dummy \
VITE_FIREBASE_AUTH_DOMAIN=dummy.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=dummy \
VITE_FIREBASE_APP_ID=dummy \
npm run build
```

## 주요 명령

| 명령 | 설명 |
|---|---|
| `npm run dev` | 로컬 개발 서버 |
| `npm test` | Vitest test |
| `npm run lint:budget` | lint budget 검사 |
| `npm run quality:budget` | 품질 budget 검사 |
| `npm run build` | production build |
| `npm run e2e` | Playwright E2E |

변경 범위가 작아도 최소한 관련 테스트는 실행하세요. UI 변경은 screenshot이나 Playwright 확인이 있으면 좋습니다.

## 환경 변수

대표적인 browser-safe 변수:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_APPCHECK_RECAPTCHA_SITE_KEY`
- `VITE_MAPBOX_TOKEN`
- `VITE_STRAVA_CLIENT_ID`
- `VITE_STRAVA_REDIRECT_URI`

secret, service account, private key, production export는 `.env`나 git에 넣지 않습니다.

## 로컬 데이터와 provider

일부 기능은 Firebase Auth, Firestore, Mapbox, Strava, App Check 설정이 있어야 완전히 동작합니다. provider가 없어도 UI는 empty/loading/error state로 검토 가능해야 합니다.

App Check debug token은 maintainer-only 테스트에서만 사용하고, 사용 후 Firebase App Check에서 삭제합니다. 공개 repository, screenshot, log, GitHub secret에 저장하지 않습니다.

## Personal Data API와 recipe

개인 데이터 recipe는 라이더가 자신의 Orider 데이터를 chart, report, alert, export, automation에 쓰는 흐름입니다. Swagger/OpenAPI에 문서화된 owner-only endpoint가 있으면 Personal Data API를 사용하고, 아직 없는 endpoint는 mock response, sample JSON, exported file로 시작합니다.

관련 문서:

- [PERSONAL_DATA_API.md](PERSONAL_DATA_API.md)
- [CREATOR_SHOWCASE.md](CREATOR_SHOWCASE.md)
- [recipes/personal-data.md](recipes/personal-data.md)

## 배포

배포는 GitHub Actions와 Firebase Hosting workflow가 관리합니다. `main` merge가 곧바로 production 배포를 의미하지 않을 수 있습니다. 현재 repository의 release/tag 정책과 environment approval을 확인하세요.

배포 관련 변경은 다음을 함께 확인합니다.

- workflow trigger
- required secret/variable
- environment approval
- rollback 경로
- release note 필요 여부
