# orider-web 프론트엔드 아키텍처 리뷰 (2026-09-05)

> 보관 문서: 2026-09-05의 `main@2b22acf`를 조사한 기록입니다. 수치와 발견 사항은 당시 소스를 기준으로 하며, 후속 수정 여부는 해당 변경의 PR·검증 근거를 확인해야 합니다. 2026-09-29 로컬 작업 정리에서 원문을 보존했습니다.

- **대상**: `main` @ `2b22acf`
- **범위**: `src/` 비테스트 597파일, `shared/` 36파일, 테스트 410파일
- **검증 방법**: import 매트릭스 파싱, `madge --circular`, `npm run build` 실측, `eslint src --max-warnings 0` 실측, 임베드 import 폐포 재계산
- **코드 수정 없음**. 수치는 위 시점 로컬 실행값.

## 요약

순수 도메인 계층(`shared/`), 라우트 코드 분할, 린트 규율, 테스트 밀도는 이 규모에서 상위권이다. 반면 **문서에 적힌 레이어 규칙이 코드에 강제되지 않아** 데이터 접근이 UI 계층에 흩어졌고, **임베드 격리 게이트에는 지금 실제로 뚫린 구멍**이 있다.

| 심각도 | 건수 |
|---|---:|
| High | 8 |
| Medium | 12 |
| Low | 6 |
| 강점 | 5 |

세 가지 구조적 원인이 대부분의 발견을 설명한다.

1. **규칙이 문서에만 있다.** `docs/CONTRIBUTOR_ARCHITECTURE.md`는 Firestore 호출을 서비스나 훅에 두라고 명시하지만, 호출 지점의 7%만 `src/services`에 있다. error 레벨 아키텍처 ESLint 룰은 임베드 싱글턴 1개뿐이고 `shared/`는 lint 대상조차 아니다.
2. **게이트가 서버에서 강제되지 않는다.** 기능 PR은 `dev`로 가는데 GitHub CI는 `main` PR에만 걸려 있다. 임베드 스코프 `--check`는 어떤 게이트에도 배선되어 있지 않고 이미 stale 판정이 난다.
3. **좋은 패턴이 한 도메인에 갇혀 있다.** 코치·트레이닝 도메인의 contract → client → guard 3층, zod 검증, 임베드 DI 정적 강제는 정확히 옳은 패턴인데 그 밖으로 확산되지 않았다. 아래 처방 대부분은 "이 패턴을 다른 도메인으로 복사하라"이다.

권고 실행 순서 1~5번은 합쳐서 하루 이내 작업이며 신규 위반을 전부 가시화하거나 차단한다. 대규모 정리(god file 분해, features 이관)는 그 게이트가 선 다음에 시작해야 같은 속도로 다시 쌓이지 않는다.

## 저장소 실측

| 레이어 | 파일 | LOC |
|---|---:|---:|
| `src/pages` | 61 | 35,450 |
| `src/components` | 150 | 31,213 |
| `src/features` | 123 | 19,503 |
| `src/hooks` | 60 | 8,562 |
| `src/services` | 39 | 6,595 |
| `src/utils` | 73 | 6,247 |
| `shared/` | 36 | 5,016 |

| Firestore/Functions 호출 지점 | 건수 |
|---|---:|
| `src/pages` | 134 |
| `src/hooks` | 96 |
| `src/components` | 39 |
| `src/services` | 22 |
| `src/features` | 20 |

페이지 61개가 35k LOC를 들고 있는데 서비스 계층은 6.6k LOC뿐이다. High 항목 절반이 이 한 문장에서 파생된다.

역방향·수평 의존 (비테스트 import edge):

| 방향 | edge | 의미 |
|---|---:|---|
| `components → features` | 29 | 공용 컴포넌트가 특정 도메인에 의존 |
| `hooks → features` | 24 | 수평 참조 |
| `features → components` | 22 | 도메인이 공용 뷰를 참조(허용 범위) |
| `utils → services / features` | 5 | 가장 아래 계층이 위를 참조 |
| `hooks → components` | 3 | 데이터 계약을 뷰가 정의(H6) |
| `services → hooks` | 1 | 전송 계층이 훅의 타입을 되가져옴 |

---

## High

### H1. 임베드 lint 스코프가 도달 파일의 26%를 놓치고, 그중 2개는 이미 금지 싱글턴을 import 한다

`scripts/embed-reachable-files.mjs:39-40`의 import 추출 정규식이 큰따옴표만 본다. `src/components/redesign/index.ts`는 전부 작은따옴표 재export라 이 배럴 아래 서브트리가 폐포에서 통째로 증발한다.

```js
...source.matchAll(/from\s+"([^"]+)"/g),      // 큰따옴표만
...source.matchAll(/import\("([^"]+)"\)/g),

// src/components/redesign/index.ts
export { default as TopNav } from './TopNav';  // 작은따옴표 → 폐포 누락
```

| 측정 | 파일 |
|---|---:|
| 양쪽 따옴표로 재계산한 실제 도달 파일 | 166 |
| 체크인된 `eslint-embed-scope.json` | 124 |
| 무방비 | 43 |
| 무방비 중 실제 위반 | 2 |

실제 위반은 `src/hooks/useActivities.ts:20`과 `src/hooks/useCourses.ts:3`의 `import { firestore } from "../services/firebase"`. 도달 경로는 PlanSurface → PlanPresentation → redesign 배럴 → TopNav → useGlobalSearch → useActivities/useCourses. 임베드는 `initEmbeddedFirebase()`만 호출하므로 이 싱글턴은 영원히 `undefined`이고, 배럴에서 컴포넌트 하나만 더 꺼내 쓰면 #847과 동일한 화면 미렌더가 재현된다.

이 스크립트의 `--check`는 CI, `package.json`, `merge-pr.sh` 어디에도 배선되어 있지 않다. 현재 `main` HEAD에서 실행하면 이미 stale 판정(exit 1)이 난다. 이것이 #846, #847, #849가 반복된 구조적 원인이다.

**조치**
1. 정규식을 `/from\s+["'](.*?)["']/g`, `/import\(["'](.*?)["']\)/g`로 바꾸고 side-effect import도 추가. 스코프가 124 → 166으로 늘고 위반 2건이 즉시 error로 잡힌다.
2. `useGlobalSearch`, `useActivities`, `useCourses`를 `useFirebaseServices()` 기반으로 전환.
3. `PlanPresentation.tsx`의 배럴 import를 `redesign/states` 직접 경로로 교체해 폐포 축소.
4. `quality:budget`에 `node scripts/embed-reachable-files.mjs --check` 추가. 이 스크립트는 이미 `ci.yml`과 `merge-pr.sh` 양쪽에 배선되어 있어 한 줄로 두 게이트를 얻는다. 1~3번 이후에 넣어야 즉시 red가 되지 않는다.

### H2. 기능 PR에는 GitHub CI가 한 번도 실행되지 않는다

`.github/workflows/ci.yml:10`은 `pull_request: branches: [main]`이다. AGENTS.md는 기능 PR은 전부 `dev`를 향하라고 명시하므로, lint·quality·i18n·test·build 5개 게이트가 기능 PR에서 돌지 않고 `dev → main` 승격 PR에서 누적분에 대해 한 번만 돈다.

- 실패가 원인 PR이 아닌 승격 PR에서 드러나 여러 기능이 섞인 상태에서 귀속해야 한다.
- 게이트 집행자가 개발자 로컬의 `scripts/merge-pr.sh`이며 `--skip-build` 같은 우회 플래그가 있다.
- 공개 저장소의 fork PR은 `dev`로 오므로 자동 검증이 0이다. CI가 fork-safe하게 설계되어 있는데 정작 fork PR에 걸리지 않는다.
- e2e는 `ci.yml`에 아예 없고 `merge-pr.sh`와 배포 후 스모크에만 있다.

**조치**: 트리거를 `branches: [main, dev]`로 확장. 비용은 기존 docs-only 스킵 로직과 `paths-ignore`로 흡수하고, 최소한 lint + test만 `dev` PR에 거는 축소 job을 분리해도 외부 기여 PR의 검증 공백이 사라진다.

### H3. react-query가 죽은 의존성이고 데이터 계층 전체가 수제 재구현이다

`useQuery`, `useMutation`, `useInfiniteQuery` 호출 사이트 0건. `@tanstack/react-query` import는 `App.tsx`와 `EmbeddedBootstrapRoot.tsx`의 Provider 마운트 2곳뿐. 대신 `useEffect`와 Firestore 읽기를 동시에 가진 파일이 84개.

| react-query 기본 기능 | 재구현 위치 |
|---|---|
| in-flight dedup | `useActivities.ts:164` 모듈 전역 `Map<string, Promise>` |
| 타임아웃 · retry/backoff | `useActivities.ts:63-79, 430-465` |
| stale 응답 폐기 | `useActivities.ts:223-229`, `useFitnessModel.ts:218-222` |
| 결과 캐시 · 수동 무효화 | `features/board/useBoard.ts:70-77, 163-219` |
| staleTime · 서킷 브레이커 · 쿨다운 | `todayTrainingDecisionGuard.ts:33-41` 모듈 전역 Map 5개 |

크로스 훅 무효화 경로가 없다. `useBoard.ts`의 `useCreatePost`/`useDeletePost`/`useRestorePost`는 조회 캐시를 자동 무효화하지 않아 호출 컴포넌트가 `refresh()`를 손으로 부르지 않으면 stale UI가 남는다.

**조치**
1. 채택 또는 제거를 ADR 1장으로 결정. Provider만 마운트된 현 상태는 번들 비용만 내고 이득이 0.
2. 채택 시 `src/data/queryKeys.ts` 키 팩토리를 먼저. 키가 0개인 지금이 ad hoc 문자열 배열 없이 시작할 유일한 타이밍.
3. 파일럿은 `useBoard.ts` 하나. 캐시 2종 + 수동 무효화 + mutation 훅 4개가 한 파일에 있어 이득/리스크 비가 가장 좋다.
4. `useActivities`는 owner/friends/public 다중 소스 병합이라 `useQueries` 재설계가 필요. 비용이 커서 파일럿 이후로.

### H4. 데이터 접근 경계가 사실상 없다

Firestore/Functions 호출 지점의 7%만 `src/services`에 있다. `getDocs` 사용의 42%가 라우트 컴포넌트 안에 있어 쿼리 형태가 JSX 파일에 박혀 있고, Firestore 인덱스 요구사항과 rules 변경 영향을 정적으로 추적할 수 없다.

밀도 상위: `AthletePage.tsx` 14건, `CoursePage.tsx` 12건, `ActivityPage.tsx` 10건, `EventDetailPage.tsx` 8건, `settings/PaneAccount.tsx` 8건. 전역 레이아웃 셸 `components/Layout.tsx`도 Firestore를 직접 읽는다.

`httpsCallable` 51건 중 pages 33, components 7, services 1. 같은 callable이 여러 UI 파일에 중복되고 응답은 전부 무검증 캐스트.

| callable | 중복 호출 위치 |
|---|---|
| `createGoal` | ClimbGoalSetupPage, GoalSetupPage, SwimGoalSetupWizard, RunGoalSetupWizard (4곳) |
| `stravaGetActivityStreams` | CreateCoursePage, CreateSegmentPage, GroupRidePage |
| `updateMyCourse` / `deleteMyCourse` | CoursePage, CourseEditPage |
| `rerollPlan`, `sendCourseToApp` | 각 2곳 |

**조치**
1. `src/services/callables/` 신설 + callable 이름 상수화.
2. 4중복인 `createGoal`부터 `goalClient.ts` + zod 스키마로 통합.
3. `scripts/contracts/social-callables.json` 매니페스트(현재 8개)를 전체 callable로 확장. 검증기가 이미 CI에 배선되어 있다.
4. Firestore는 `Layout.tsx`와 `settings/Pane*.tsx`를 첫 타깃으로 repository 추출. 컴포넌트 계층 39건 중 20건이 여기에 몰려 있다. `hooks/useFirestore.ts`의 `useDocument`/`useCollection`이 이미 있으므로 새 추상화 대신 이것을 확산.
5. 완료 후 `no-restricted-imports`로 `components/**`의 `firebase/*` import를 warn → error 램프.

### H5. 서버 응답 검증이 코치·트레이닝 도메인 9개 파일에만 있다

zod를 import하는 비테스트 파일은 9개이고 전부 코치·트레이닝 contract. `.data() as T` 무검증 캐스트 33건, 전체 `as X` 단언 518건. 가장 위험한 지점:

```ts
// src/contexts/AuthContext.tsx:137
setProfile(snap.data() as UserProfile);
```

이 profile은 `useAuth()`를 쓰는 94개 파일로 흘러간다. 검증 이디엄도 zod(`coachV2Contract.ts`)와 수제 `parseX(input: unknown)`(`coachClient.ts`, 45건)로 같은 도메인 안에서 갈려 있다.

**조치**
1. `AuthContext.tsx:137`부터. `UserProfile` zod 스키마 + `safeParse`, 실패 시 `logClientError` 후 부분 프로필 fallback.
2. CONTRIBUTOR_ARCHITECTURE.md에 "경계는 zod, 수제 parseX 신규 금지" 추가. `coachClient.ts`는 테스트가 있으므로 zod로 이관.
3. 나머지 `.data() as` 32건은 H4 repository 추출과 함께. 대량 문서(streams)는 `z.custom` + 최소 필드로 제한.

### H6. 훅이 컴포넌트에서 타입을 가져와 자기 계약을 정의한다

도메인 모델의 정본이 차트 컴포넌트의 props다.

- `hooks/useActivityAnalysisModel.ts:7,37` — `type AnalysisTabProps = ComponentProps<typeof AnalysisTab>`를 반환 타입으로 사용
- `hooks/useFitnessModel.ts:38` — `MobileFitnessData`를 `components/mobile/MobileFitnessPage`에서 import
- `hooks/useActivities.ts:25` — `WeeklyStat`을 `components/WeeklyChart`에서 import
- `features/activity/detail/activityDetailDerived.ts:1` — 순수 파생 모듈이 `components/ElevationChart`의 `OverlayDataset` 참조
- `services/activityNarrativeApi.ts:7` — 전송 계층이 `hooks/useActivityNarrative`의 타입을 되가져옴

1,430 LOC의 `AnalysisTab.tsx` props를 리팩터링하면 훅의 공개 계약이 깨지고 페이지가 연쇄로 깨진다.

**조치**: 전부 `import type`이라 런타임 변화 0. 타입을 `features/activity/detail/analysisViewModel.ts`, `features/fitness/fitnessViewModel.ts` 등으로 이동하고 컴포넌트가 그 타입을 import하도록 뒤집는다. 이후 `no-restricted-imports`로 `hooks → components`를 바로 error로 고정. 현재 위반 3건.

### H7. `src/features`가 문서화된 아키텍처 밖에 존재하고 도메인마다 의미가 다르다

AGENTS.md와 CONTRIBUTOR_ARCHITECTURE.md 어디에도 `src/features`가 등장하지 않는다. 123파일 19.5k LOC 레이어가 기준 없이 존재하니 도메인마다 규칙이 다르다.

| 도메인 | 실태 |
|---|---|
| activity | pages, features(파생·훅·컴포넌트 혼재), components, hooks, services, utils, shared 7개 레이어에 분산. 어느 것도 정본이 아님 |
| fitness | 컴포넌트가 `features/fitness/components`, `components/fitness`, `components/` 루트 세 위치. 훅이 두 위치. services에 0개 |
| event | pages 9,805 LOC 대 features 788 LOC (12.4 : 1). services 0개 |

17개 feature 중 barrel(`index.ts`)을 가진 것은 `courseEngine` 하나. features 내부를 가리키는 상대경로 178건 중 75건이 3단계 이상 깊이.

**조치**
1. 레이어 표에 `features`, `contexts`, `embedded` 행 추가, 판정 기준 한 문장 고정. 권장: "한 도메인에서만 쓰는 것(뷰 포함)은 `features/<domain>`, 2개 이상 도메인이 쓰는 것만 `components`."
2. 신규 feature에 barrel 의무화.
3. 전면 이관은 하지 않는다. event 하나만 파일럿으로 `EventRegisterPage.tsx`부터 분해(M10).

### H8. 품질 예산이 최댓값 파일 1개만 검사하고, 다른 예산은 포화 상태다

```js
// scripts/check-quality-budget.mjs:40
const largest = [...lineCounts].sort((a, b) => b.lines - a.lines)[0];
if (largest.lines > BUDGETS.maxFileLines) { ... }
```

검사 대상이 최댓값 하나. 1,000줄 초과 페이지 11개가 무제한으로 자라도 게이트가 침묵한다. 상한은 2026-08에 1,600 → 2,000으로 완화되었고 그 주석 자체가 "분할이 정답"이라고 인정한다.

| 예산 | 현재 | 상한 |
|---|---:|---:|
| console 문 | 9 | 10 |
| alert() 호출 | 39 | 40 |
| 최대 파일 줄 수 | 1,627 | 2,000 |

**조치**: 상한을 되돌리지 말고 **baseline ratchet**으로 바꾼다. 현재 초과 파일을 `quality-budget-baseline.json`에 고정하고, 목록에 없는 파일이 1,000줄을 넘거나 목록의 파일이 현재 줄 수를 초과하면 실패. `alert()` 39건은 `useDialog()`로 이관 후 예산을 20으로 인하.

---

## Medium

### M1. 임베드 부트스트랩은 모듈 1회 판정, 라우팅은 렌더마다 재판정

`main.tsx:144-156`은 임베드 여부를 1회 확정해 `initEmbeddedFirebase()` 또는 `initFirebase()` 중 하나만 호출한다. `AppRoot.tsx:13`과 `App.tsx:352`는 매 렌더 `useLocation()`으로 재판정한다. SPA 내비게이션으로 경계를 넘으면 provider 트리와 Firebase 초기화가 어긋나고, `AppRoot.embed.test.tsx:38-52`가 이 전이를 정상으로 고정하고 있다.

**조치**: 임베드는 SPA 전이 대상이 아님을 확정. `AppRoot`/`App`이 `main.tsx`의 판정값을 prop으로 받고 경계를 넘는 내비게이션은 full page load로 강제.

### M2. vendor catch-all 청크가 924KB이고 경고 한계선이 사실상 꺼져 있다

| 청크 | raw KB | gzip KB |
|---|---:|---:|
| vendor-mapbox | 1,697 | 468 |
| vendor (미분류) | 925 | 285 |
| vendor-firebase | 787 | 183 |
| index (entry) | 575 | 189 |
| vendor-sentry | 458 | 151 |

mapbox, chart.js, firebase 분리는 잘 되어 있다. `vite.config.ts:34`의 catch-all `return "vendor"`에 react-dom, router, i18next, jszip, dompurify, lucide가 한 덩어리로 들어간다. `chunkSizeWarningLimit: 1800`은 최대 청크보다 높아 경고가 구조적으로 나올 수 없다.

**조치**: `vendor-export`(jszip, dompurify), `vendor-i18n` 분기 추가. 경고 한계를 1,000으로. `check-quality-budget.mjs`에 entry/vendor gzip 상한(현재값 +10%) 추가.

### M3. 임베드 표면이 앱 전체 entry를 그대로 지불한다

임베드 전용 청크는 합쳐서 20KB 미만이지만 같은 `index.html`로 진입하므로 약 2.3MB raw(gzip 656KB)를 렌더 전에 지불한다. `App.tsx`가 `Layout`과 `services/firebase`를 정적 import하기 때문.

**조치**: 정공법은 별도 Vite entry(`embed.html`). 저비용 1단계로 `App.tsx`의 `Layout` import를 lazy로 바꾸면 TopNav·MobileTabBar·navHubs 서브트리가 entry에서 빠지고 H1의 배럴 문제도 완화.

### M4. ToastContext value 미메모이제이션으로 소비처 42개 전면 리렌더

```tsx
// src/contexts/ToastContext.tsx:47
<ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
```

다른 5개 context는 전부 `useMemo`가 있고 ToastContext만 누락.

**조치**: `{showToast, dismissToast}`만 안정화해 소비처에 제공하고 `toasts`는 Provider 내부 viewport 컴포넌트에서만 소비.

### M5. locale이 4곳에 살고 effect가 자기 출력을 deps로 가진다

`LocaleContext.tsx:70-88`에서 같은 locale이 URL, i18next, React state, Firestore 4곳에 존재하고, `units`를 set하는 effect의 deps에 `units`가 들어 있다.

**조치**: React state 제거, URL의 lang 세그먼트를 단일 소스로. context는 `units`만 보유. Firestore → URL 동기화는 로그인 직후 1회 리다이렉트로.

### M6. 도메인 수학이 `src/`에 남아 있고 CTL/ATL 공식이 3중 재구현되어 있다

TSS/NP/IF/VI(`utils/powerMetrics.ts`)와 EF, decoupling, TRIMP, CP 추정(`utils/advancedMetrics.ts`, 618 LOC)이 `src`에 있다. `utils` 72개 중 68개가 순수 모듈이라 이동 비용은 거의 0.

`features/fitness/activityImpact.ts:130-140, 242-253`이 `shared/training/fitness.ts`의 `calculateFitness` 정본을 쓰지 않고 상수만 가져와 점화식을 재유도했다. 상수 튜닝 시 조용히 어긋난다.

`src/shared/deviceSettings/schema.ts`(723 LOC, zod)는 유일한 `src/shared` 거주자이고 `@shared` alias를 우회하는 유일한 상대경로 import 대상. 타입은 `shared/types/deviceSettings.ts`에, 검증은 웹 전용에 갈려 있다.

**조치**
1. `activityImpact.ts`의 EMA를 정본 재사용으로 교체. 기존 테스트 13케이스가 회귀 방어.
2. `src/shared/deviceSettings` → `shared/deviceSettings`, `src/shared` 디렉터리 제거.
3. `powerMetrics.ts` → `shared/training/`.

### M7. 에러·로딩 상태가 페이지별 ad hoc

- ErrorBoundary는 앱 루트 1개(`App.tsx:334`)와 지도 2개뿐. 라우트 단위 경계가 없다.
- 로딩·에러 state 명명이 6종(`loading`, `loadError`, `pending`, `error`, `errorMsg`, `busy`). 판별 가능한 상태 머신은 10건.
- 빈 `catch {}` 145건. `showToast` 263건 + `alert()` 39건. 공용 Loading/Empty/Error 컴포넌트 없음.

**조치**: `App.tsx` 라우트 렌더 지점에 라우트별 ErrorBoundary 1줄 추가(기존 `ErrorBoundary.tsx`가 fallback prop과 Sentry 연동 보유). 표준 `AsyncState` 컴포넌트를 신규 페이지에만 강제. `catch {}`에 `logClientError` 없는 경우를 ESLint로 점진 차단.

### M8. i18n 키가 타입 세이프하지 않고 하드코딩 한국어가 315곳

`i18next.d.ts`/`CustomTypeOptions` 선언 없음. `check-i18n-keys.mjs`는 ko → en 단방향만 검사. 하드코딩 한국어는 28개 파일 315곳인데 `CreatorHubPage.tsx` 하나가 195곳(62%).

**조치**: `src/i18n/i18next.d.ts`에 리소스 기반 `CustomTypeOptions` 선언. 패리티 스크립트에 역방향 루프. `CreatorHubPage.tsx`만 `creator` 네임스페이스로 추출하면 315 → 120. 이후 JSX 텍스트 노드 Hangul 신규 차단.

### M9. 최다 트래픽 3개 라우트가 텔레메트리에서 누락

`App.tsx`는 57곳 전부 `lazyTimed`인데 `components/Layout.tsx:16-18`은 구형 `lazyWithRetry`로 DashboardPage, ExplorePage, CoursesPage를 로드한다. 홈, explore, courses의 `route_load`/`chunk_load` 이벤트가 발사되지 않는다.

**조치**: 3줄을 `lazyTimed("DashboardPage", ...)` 형태로 교체.

### M10. God file: 파일 하나가 transport + 도메인 + 뷰 상태 + 프레젠테이션을 소유

`src/pages` 61개 중 11개가 1,000 LOC 초과.

- **`ActivityPage.tsx` (1,499)** — useState 12, useEffect 7. Firestore 구독 3종(L175-247), 뮤테이션(L248-362), EXIF 추출 + Storage 업로드 사진 서브시스템(L364-445), memo 밖 파생 계산 150줄, 6개 탭 본문 인라인. 첫 걸음은 자기완결적인 사진 서브시스템 추출.
- **`activityDetailDerived.ts` (1,582)** — React·Firestore 0건으로 레이어링은 정확하나 legacy 호환, 시간축 정렬, 스트림 선택, 차트 셰이핑 4개 도메인이 한 파일. 순수 함수 + 테스트 45케이스라 4분할 위험 최저.
- **`EventRegisterPage.tsx` (1,262)** — 도메인 타입, 재사용 UI, Firestore 3회 순차 읽기, callable, 4단계 폼 상태머신, 법적 약관 문구가 default export 하나에. `features/event/register/`가 28줄 파일 하나로 이미 존재하므로 feature 슬라이스 파일럿에 최적.

**조치**: H8 ratchet이 선 다음에. `activityDetailDerived.ts` 4분할 → `ActivityPage` 사진 서브시스템·훅 4개 추출 → `EventRegisterPage`를 `features/event/register/`로 분해.

### M11. ESLint가 아키텍처 경계를 강제하지 않고 `shared/`는 lint 대상이 아니다

error 레벨 아키텍처 룰은 `no-firebase-singleton-in-embed` 하나. `eslint-plugin-import`도 `dependency-cruiser`도 없다. `package.json`의 lint는 `eslint src`라 5k LOC 크로스 프로젝트 계층에 룰이 0개.

**조치**: `eslint src shared`로 확장. `no-restricted-imports`로 `hooks → components`, `utils → services|features`, `components → firebase/*` 3개 룰을 warn으로 추가(현재 위반 각 3/5/19건). 첫 번째는 바로 error 가능.

### M12. Firebase DI는 절반만 실재

`services/firebase` 직접 import 87건 대 `useFirebaseServices()` 소비 약 26파일. `FirebaseServicesContext.tsx:64`는 Provider 없으면 싱글턴 폴백이라 일반 웹에서 DI가 관측되지 않는다. 신규 훅도 두 방식으로 갈린다(`useStrava`는 context, `useExport`는 싱글턴).

**조치**: 목표를 명시. "임베드 안전만"이면 현 상태 문서화, "테스트 대체도"면 `useFirebaseServices()`를 신규 훅의 유일한 경로로 규정.

---

## Low

### L1. `WorkoutType` 로컬 사본의 값 드리프트

`shared/types/activity-metrics.ts:19`는 `recovery | endurance | tempo | threshold | interval | race | mixed`인데 `pages/activity/ActivityEditPage.tsx:17`의 로컬 사본은 `threshold`, `mixed`가 없고 `commute`, `""`가 추가되어 있다. `threshold` 활동을 편집하면 값이 빈 문자열로 떨어질 수 있다. `@shared/types` barrel은 `./types/goal` 한 줄만 재수출한다.

**조치**: 로컬 타입 삭제 후 정본 import. `shared/types.ts`에 나머지 모듈 재수출 추가.

### L2. 순환 의존 5건, 전부 타입 전용

madge 5건은 모두 `import type`이라 런타임 순환 0건. 패턴은 하위 모듈이 상위 모듈의 도메인 타입을 되가져오는 것(H6과 같은 병).

**조치**: `ActivityNarrative` 타입을 서비스로 옮기고 훅이 re-export.

### L3. `useMobile` 판정이 CSS 브레이크포인트와 불일치

이중 컴포넌트 트리는 없다. `hooks/useMobile.ts:7`의 `(max-width: 767px), (pointer: coarse)`는 뷰포트 OR 포인터라 터치스크린 노트북이 1440px에서도 `isMobile`이 된다.

**조치**: 뷰포트 단독으로 통일, 포인터 정밀도는 `useCoarsePointer`로 분리.

### L4. `redesign/`과 `common/`은 명명 부채

폐기 `rd*` 클래스 청산은 끝났다. `redesign/`은 실질적으로 디자인 시스템의 레이아웃 계층이고 `theme/components/`는 프리미티브 11개. `components/common/`은 파일 2개뿐.

**조치**: `redesign` → `layout` rename, `common/` 제거. CONTRIBUTOR_ARCHITECTURE.md 표에 theme/layout 2행 추가.

### L5. `shared/` 테스트의 `src/` 역참조와 테스트 공백

`shared/training/pdcRiderGate.test.ts:2-3`이 `src/features/coach/__fixtures__`와 `src/services/pdcContract`를 import. `shared/training/` 22개 중 5개 무테스트(`cohortPercentile`, `ftpHistory`, `planMetrics`, `staleness`, `vo2max`).

**조치**: 테스트를 `src/__tests__/`로 이동하거나 fixture와 파서를 `shared/`로.

### L6. utils 수평 참조, 세션 캐시 무효화, 이름 충돌

- `utils/mapbox.ts`, `segmentTiles.ts`가 `services/runtimeConfig` 참조 → `runtimeConfig`는 `src/config/`로. `runnerLevel.ts`, `workoutPace.ts`의 `errorLogger` 참조는 순수성을 깬다.
- `usePersonalHeatmap.ts`, `useExplorationGrid.ts`의 모듈 전역 `sessionCache`는 uid 비교만 하므로 로그아웃 후 재로그인 시 stale 데이터 노출.
- `PowerCurveChart.tsx`가 `components/`(chart.js)와 `features/fitness/components/`(자체 렌더) 두 구현. 의도적 분기라면 이름을 갈라야 한다.

---

## 잘 되어 있는 것

### G1. `shared/`의 순수성과 alias 정합성
36파일 중 React/Firebase를 import하는 비테스트 파일 0건. 23개 모듈에 테스트. `@shared` alias는 tsconfig, vite resolve, vitest 3곳에서 일치하며 실사용 290건 중 우회 1건. 앱(KMP)과 웹이 훈련 계산을 공유하는 제품에서 훈련 도메인의 정본이 프레임워크 없는 계층에 있다는 것은 큰 자산이다.

### G2. `no-firebase-singleton-in-embed` 룰의 설계
버그 → 근본 원인 → 자동 계산 폐포 기반 정적 게이트라는 사이클. 룰 주석이 왜 리뷰와 단위 테스트로는 못 잡는지를 실패 사례와 함께 설명하고, 여러 줄 import에서 `eslint-disable-next-line`이 첫 줄만 덮는 함정까지 알고 import 선언 전체를 report한다. H1은 이 설계의 구현 결함이지 설계 결함이 아니다.

### G3. contract → client → guard 3층 (코치·트레이닝)
`trainingDecisionContract.ts` → `trainingDecisionClient.ts` → `todayTrainingDecisionGuard.ts`. client는 `getIdToken()` 전, App Check 토큰 후, fetch 응답 후 총 3회 `requireExpectedUser`를 재확인해 await 중 계정 전환 취약점을 막고, AbortController + 15초 타임아웃 + caller signal 전파까지 정확하다.

### G4. 라우트 코드 분할 100%와 린트 규율
eager import된 page 컴포넌트 0개. `lazyTimed`는 청크 로드 계측, 청크 에러 자동 복구, post-paint `route_ready` 보고를 한 래퍼에 통합. 7개 커스텀 design-system 룰을 돌리면서 `--max-warnings 0` 실측 통과, `eslint-disable`은 전체 3건.

### G5. 위험 기반으로 배분된 테스트 밀도

| 계층 | src | test | 비율 |
|---|---:|---:|---:|
| features | 123 | 112 | 0.91 |
| utils | 73 | 61 | 0.84 |
| pages | 61 | 49 | 0.80 |
| services | 39 | 31 | 0.79 |
| hooks | 60 | 40 | 0.67 |
| components | 150 | 72 | 0.48 |

테스트 케이스 2,822개 + e2e 52케이스 × 3뷰포트. `embeddedSurfaceBoundary.test.ts`, `siteShell.contract.test.ts`처럼 아키텍처 계약을 테스트로 고정하는 계층이 존재한다. 다만 임베드 경계 테스트는 소스 문자열 1단계 매칭이라 transitive 의존을 보지 못한다.

---

## 권고 실행 순서

1~5번은 합쳐서 하루 이내. 6번 이후는 그 게이트가 선 다음에.

| # | 작업 | 대상 | 비용 |
|---|---|---|---|
| 1 | 임베드 스코프 복구: 정규식 수정, 훅 3개 DI 전환, 배럴 import 해제, `--check`를 `quality:budget`에 배선 | H1 | ~20 LOC + 훅 3개 |
| 2 | `ci.yml` 트리거에 `dev` 추가 | H2 | 1줄 |
| 3 | 훅 → 컴포넌트 타입 3개 이동, `hooks → components` error 고정, `eslint src shared`, 나머지 방향 룰 warn | H6, M11 | 3파일 + 설정 |
| 4 | 품질 예산 ratchet, `alert()` 정리 후 예산 인하, gzip 상한 추가 | H8, M2 | 스크립트 ~30줄 |
| 5 | ToastContext 메모, 라우트별 ErrorBoundary, `AuthContext` zod, `activityImpact` EMA 정본 재사용, `Layout.tsx` lazy 교체, `WorkoutType` 사본 제거 | M4, M7, H5, M6, M9, L1 | 소규모 6건 |
| 6 | react-query ADR → 채택 시 `queryKeys.ts` + `useBoard.ts` 파일럿 | H3 | 결정 + 파일럿 |
| 7 | 문서 갱신: 레이어 표, 판정 기준, "경계는 zod", `redesign` → `layout` | H7, L4 | 문서 |
| 8 | `createGoal` 통합, callable 매니페스트 확장, `Layout.tsx`/`Pane*.tsx` repository화 | H4 | 중간 |
| 9 | `activityDetailDerived` 4분할 → `ActivityPage` 추출 → `EventRegisterPage` 파일럿 | M10, H7 | 큼, 4번 이후 |

## 트레이드오프

| 선택지 | 장점 | 단점 | 판단 |
|---|---|---|---|
| 게이트 우선 (1~5번) | 유입 차단 즉시, 진행 중 PR 무영향 | 기존 부채는 남고 체감 개선이 늦음 | 권장 |
| God file 분해 우선 | 가장 아픈 파일이 바로 좋아짐 | 게이트 없이는 재축적. `ActivityPage`는 회귀 위험 실재 | `activityDetailDerived`만 병행 가능 |
| features 전면 이관 | 구조 일관 | 123파일 + deep import 178건. `dev` 통합 브랜치에서 지속 충돌 | 권장하지 않음 |
| 임베드 별도 Vite entry | M1·M3 근본 해소 | rewrite, 라우트 재구성, 앱팀 URL 계약 조율 | 1~2번 후 별도 설계 PR |
| TS compiler API로 폐포 재작성 | alias·재export까지 정확 | devDependency 추가, 복잡도 3배 | 정규식 수정이 재발을 못 막을 때까지 보류 |

## 참조

- `scripts/embed-reachable-files.mjs:38-41` 큰따옴표 전용 정규식 (H1)
- `src/components/redesign/index.ts` 작은따옴표 재export 배럴
- `src/hooks/useActivities.ts:20`, `src/hooks/useCourses.ts:3` 무방비 싱글턴 위반
- `src/services/firebase.ts:89` live binding, 초기화 전 `undefined`
- `src/main.tsx:144-156`, `src/AppRoot.tsx:13`, `src/App.tsx:352` 임베드 판정 불일치 (M1)
- `.github/workflows/ci.yml:9-10` `branches: [main]` (H2)
- `src/hooks/useActivityAnalysisModel.ts:7,37,65`, `useFitnessModel.ts:38`, `useActivities.ts:25` 타입 역전 (H6)
- `src/contexts/AuthContext.tsx:137` 무검증 profile 캐스트 (H5)
- `src/contexts/ToastContext.tsx:47` 인라인 value (M4)
- `src/contexts/LocaleContext.tsx:70-88` 자기참조 effect (M5)
- `src/features/fitness/activityImpact.ts:130-140, 242-253` EMA 재유도 (M6)
- `scripts/check-quality-budget.mjs:7-13, 40` 최댓값 검사와 예산 완화 이력 (H8)
- `vite.config.ts:22, 28-34` chunk 경고 한계와 catch-all (M2)
- `eslint.config.js:55-92, 325-378, 435-446` 임베드 룰, 램프 정책, 스코프 적용부
- `package.json:21` `"lint": "eslint src"` (M11)
- `src/pages/ActivityPage.tsx:175-445`, `src/pages/event/EventRegisterPage.tsx:27-353`, `src/features/activity/detail/activityDetailDerived.ts` (M10)
- `shared/training/pdcRiderGate.test.ts:2-3` src 역참조 (L5)
- `src/pages/activity/ActivityEditPage.tsx:17` vs `shared/types/activity-metrics.ts:19` (L1)
- `docs/CONTRIBUTOR_ARCHITECTURE.md:5-22` 레이어 표와 Firestore 배치 규칙
