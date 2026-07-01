# API와 연동 경계

Orider Web은 프로덕션 프론트엔드입니다. Firebase, Mapbox, Strava, App Check의 브라우저 설정은 클라이언트 번들에 포함되는 공개 설정이며 secret이 아닙니다. 영문 문서는 [API_AND_INTEGRATIONS-en.md](API_AND_INTEGRATIONS-en.md)를 참고하세요.

이 문서는 웹 클라이언트의 연동 모델을 설명합니다. 안정적인 third-party API 계약은 Swagger/OpenAPI를 기준으로 하고, [PERSONAL_DATA_API.md](PERSONAL_DATA_API.md)는 방향과 사용 원칙을 설명합니다.

## 빠른 기준

| 필요 | 사용할 것 | 안정성 |
|---|---|---|
| 프론트 UI 개발/테스트 | Vite, React page, mock/emulator data | 지원되는 기여 경로 |
| 스포츠 계산 재사용 | `shared/training/*`, `src/utils/*` | 테스트가 있는 비교적 안정적인 pure function |
| export 동작 재사용 | `src/utils/exportGpx.ts`, `exportTcx.ts`, `exportFit.ts`, `exportCsv.ts` | 테스트가 있는 reference behavior |
| Firebase wiring 이해 | `src/services/firebase.ts`, hooks, settings panes | 참고용 |
| 본인 Orider 데이터로 도구 만들기 | Settings -> Developer API, Personal Data API, recipe docs | owner-only read 기반은 live, broader platform은 초기 단계 |
| callable function 직접 호출 | Firebase callable endpoint | 공개 API 아님 |
| Orider backend self-host | Cloud Functions/rules/pipelines | 이 저장소에서 제공하지 않음 |

## 개발 경로

프론트만 확인할 때:

```bash
npm install
cp .env.example .env
npm run dev
```

빌드만 확인할 때는 placeholder Firebase 값으로 충분합니다.

```bash
VITE_FIREBASE_API_KEY=dummy \
VITE_FIREBASE_AUTH_DOMAIN=dummy.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=dummy \
VITE_FIREBASE_APP_ID=dummy \
npm run build
```

provider-backed 로컬 개발에는 `VITE_MAPBOX_TOKEN`, `VITE_STRAVA_CLIENT_ID`, `VITE_APPCHECK_RECAPTCHA_SITE_KEY` 같은 browser-safe 값만 사용합니다. production secret, service account, private rule, backend job은 UI 기여에 필요하지 않고 이 저장소에도 포함하지 않습니다.

App Check debug token은 commit하지 마세요. 테스트 전용 우회 자격증명이며 production bundle이나 공개 문서에 들어가면 안 됩니다.

## 공개 클라이언트 설정

다음 Vite 변수는 browser-safe config입니다.

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

이 값들은 웹 앱이 provider project를 찾게 해 줄 뿐 backend admin 권한을 주지 않습니다. 실제 접근은 Firebase Auth, App Check, backend authorization, Firestore/Storage rules, provider 설정으로 제한됩니다.

## Firebase 접근 모델

- 로그아웃 사용자는 public surface만 사용할 수 있습니다.
- 로그인 사용자는 자신의 private data에 접근할 수 있습니다.
- public document와 public media는 의도적으로 읽을 수 있습니다.
- root user document는 public-safe 필드만 두고, 민감한 사용자 필드는 owner-only private subdocument로 분리합니다.
- 비용이 큰 callable은 Firebase App Check와 인증을 요구합니다.

이 저장소는 production Cloud Functions source, Firestore rules, Storage rules, service account, 운영 export를 포함하지 않습니다.

## Cloud Functions와 공개 API

웹 앱은 Firebase client SDK로 callable function을 호출합니다. 이 callable들은 Orider 제품 내부 surface이며 automation이나 scraping을 위한 공개 API가 아닙니다.

외부 개발자는 다음 경계를 지켜야 합니다.

1. 공개 브라우저 설정은 `VITE_*` 변수에 둡니다.
2. secret과 privileged provider call은 프론트엔드에 넣지 않습니다.
3. provider가 없거나 차단된 상태도 UI에서 확인 가능해야 합니다.
4. 별도 공개 API 문서가 없는 callable payload/response는 내부 계약으로 봅니다.
5. provider data에 연결하기 전에 pure transformation logic을 테스트합니다.

공개 개발자 경로는 Personal Data API입니다. 라이더는 **Settings -> Developer API**에서 scoped key를 만들고, 자신의 profile, activities, streams, fitness summary를 읽을 수 있습니다. endpoint 계약은 Swagger/OpenAPI에서 확인하고, 사용 원칙과 recipe 방향은 [PERSONAL_DATA_API.md](PERSONAL_DATA_API.md)와 [recipes/personal-data.md](recipes/personal-data.md)를 보세요.

## 재사용 가능한 영역

| 영역 | 용도 |
|---|---|
| `shared/training/` | fitness/readiness, workout import, weekly load, recovery, metabolism, VO2max |
| `shared/sim/courseSim.ts` | power, mass, CdA, Crr, grade 기반 course simulation |
| `src/utils/export*.ts` | GPX, TCX, FIT, CSV, calendar export 참고 구현 |
| `src/components/`, `src/pages/` | sports analytics UI, map fallback, chart state, mobile workflow |
| `src/i18n/resources/` | 한국어/영어 cycling, training, event, settings 용어 |
| `.github/workflows/` | Firebase Hosting frontend CI/deploy 패턴 |

## 안정성 기대치

| Surface | 기대 |
|---|---|
| 테스트가 있는 pure utility | public library code처럼 검토하고 backward-compatible signature를 선호 |
| React component/page | 제품 UI는 바뀔 수 있지만 placeholder/mock data로 테스트 가능해야 함 |
| Vite env name | release note 없이 자주 바꾸지 않음 |
| Firebase callable name/payload | 내부 제품 API이며 공개 deprecation 정책 대상 아님 |
| Firestore document shape | 제품 데이터 모델이며 이 저장소의 공개 계약 아님 |

## 현재 제공하지 않는 것

- 광범위한 third-party app registration
- 외부 개발자용 OAuth app consent 일반 공개
- 외부 app webhook subscription
- callable endpoint에 대한 서비스 수준 보장
- self-hostable backend service
- production Firestore/Storage rules
