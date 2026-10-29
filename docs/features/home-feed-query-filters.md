# 홈 피드 종목·기간 필터를 Firestore 쿼리로 이동 — 설계 v5 (2026-10-29)

상태: **설계안, 구현 전**. 구현 지시 전까지 코드 변경 없음. v1 → v2 는 1차 검토(BLOCKER 1·MAJOR 3·MINOR 7), v2 → v3 는 2차 검토(MAJOR 4·MINOR 3) 반영. **v4 는 친구 수 확장 대응(서버 `discipline` 필드, 대안 A)을 §9 로 추가** — §2~§8 의 `type in` 설계(대안 B)는 A 로 가면 §9.6 의 차이만큼 바뀐다. **v5 는 백필 없이 신규 문서에만 `discipline` 을 적용하는 전환 시각 2층 구조(§10)를 추가하고 이를 권고안으로 바꿈.**

## 1. 문제

홈 피드(`src/hooks/useActivities.ts` + `src/components/mobile/MobileFeedPage.tsx`)는
범위(나/친구/구독/전체)만 Firestore 쿼리에 넣고, **종목(사이클/러닝)과 기간(7일/30일/90일/올해)은
10건 페이지를 받은 뒤 브라우저에서 거른다**(`MobileFeedPage.tsx` 382~396행).

결과:
- 첫 10건이 전부 걸러지면 "조건에 맞는 활동이 없어요" + "더 보기" 가 뜨고, 눌러야 활동이 나타난다.
- 기간 필터는 최신순 페이지를 뒤로 넘겨도 더 오래된 활동만 오므로 "더 보기" 가 사실상 무의미하다.
- `hasMore` 가 "서버에 더 있다" 이지 "조건에 맞는 것이 더 있다" 가 아니어서 빈 페이지를 반복할 수 있다.
- 데스크톱 폭(1024px 이상)은 URL `sport` 가 없으면 종목 기본값이 **사이클**이라(`DashboardPage.tsx` 245행)
  이 현상이 데스크톱에서 더 자주 보인다.

검색 경로(`useActivitySearch`, 914행 `getDateFrom`)는 이미 `startTime >= dateFrom` 을 쿼리에 넣고 있다.
같은 결함 패턴이 `TrainingExecutionPanel.tsx` 57~60행("나" 10건 뒤 종목 클라이언트 필터)에도 있다(§8 후속).

## 2. 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 기간 | 모든 소스 쿼리에 `startTime >= cutoff` 추가 | 정렬키가 `startTime` 이라 기존 색인으로 범위 조건이 그대로 동작. 검색 경로와 같은 방식 |
| 종목 | 모든 소스 쿼리에 `type in <종목별 저장 표기 목록>` 추가 | 데이터 변경 없이 색인만으로 해결. §4 대안 비교 |
| 종목 저장 표기 목록 | **운영 62k건 전수 집계(§3.2)** 로 확정. 소문자 `ride`(876건) 포함 | Firestore 는 대소문자 구분. 공개 API 가 지금도 `type: "ride"` 를 기록 |
| 친구 ID 청크 크기 | `min(5, floor(30 / (visibility 분기 × type 분기)))` | Firestore 쿼리당 분기 상한 30. 상한 5 는 rules `isFriend` exists 2회 × 5 = 10 한도 |
| 소스 수 상한 | 소스가 **12개를 넘으면 그 범위는 종목 조건을 빼고 클라이언트 필터로 내려가고 경고 로그** | 친구 수 운영 분포(§3.5)에서는 도달하지 않음. 안전장치 |
| 색인 없음 폴백 | 소스 쿼리가 `failed-precondition` 이면 **`type` 조건만 빼고** `startTime >=` 는 유지한 쿼리로 재시도, 종목은 hook 의 소스 버퍼 단계에서 거르되 소스·페이지당 getDocs 3회 상한 | 색인 배포 순서가 어긋나도 피드가 살아 있어야 함. 상한 없이 거르면 희귀 종목에서 컬렉션 전체를 훑음(§3.7) |
| 건수 쿼리(`getCountFromServer`) | **필터 없이** 유지(`buildSourceQueries(uid, null)` 로 분리 호출, 필터는 의존성에서 제외), `totalCount: number \| null`(null = 미확정·실패) 계약으로 빈 상태 판정(§3.6)에 사용 | 소비처가 없던 값에 쓸모를 줌. 필터를 걸면 비용이 늘고 판정 근거가 무너짐 |
| 클라이언트 필터 | 종목·기간 필터는 **검색 결과 병합 경로에만 유지**, 피드 경로에서는 제거 | 검색 결과는 종목을 쿼리에 안 넣음. 정본 단일화 |
| 빈 상태 문구·CTA | 데이터로 판정: 필터 결과 0 이고 `!hasMore` 일 때 필터 없는 건수가 **확정 0** 이면 "아직 활동이 없어요" + 앱 설치 CTA, 그 외(1 이상·미확정)는 "조건에 맞는 활동이 없어요" + CTA 숨김 | "필터 기본값 여부" 판정은 데스크톱(기본 사이클)에서 신규 사용자 문구가 회귀하고, 러닝 필터 0건인 라이더에게 앱 설치 CTA 가 뜬다 |
| 데스크톱 기본 종목 | 현행(사이클) 유지 | 이번 범위 밖. §8 |

## 3. 쿼리 설계

### 3.1 필터 입력

`useActivities(scope, friendIds, options)` 의 `options` 에 추가:

```ts
feedFilters?: {
  sport: "all" | "bike" | "run" | "swim";   // DashboardSportFilter
  datePreset: "all" | "7d" | "30d" | "90d" | "year";
}
```

- `cutoff` 는 `datePreset` 이 바뀔 때 한 번 계산(`useMemo`, 검색의 `getDateFrom` 재사용). 렌더마다 `Date.now()` 를 읽으면 요청 키가 흔들려 커서가 초기화된다. 오래 열린 탭에서 "7일" 이 7일+경과시간이 되는 것은 허용(검색 병합 경로와 경계 부근 미세 차이 있음).
- `feedRequestKey` 와 `fetchPage` 의 **모듈 전역** `activityPageRequests` 키에 `sport`·`cutoff` 를 넣는다. 빠지면 `useGlobalSearch`("all" 범위, 필터 없음)와 대시보드의 필터 요청이 같은 응답을 공유한다. 필터 변경 = 새 요청 키 = 첫 페이지부터 재조회.

### 3.2 종목 저장 표기 목록 — 운영 전수 집계 (2026-10-29, 61,993건)

| 저장값 | 건수 | 종목 |
|---|---|---|
| Ride | 37,062 | bike |
| VirtualRide | 10,867 | bike |
| Run | 5,494 | run |
| Walk | 4,201 | run |
| **ride (소문자)** | **876** | bike |
| Swim | 746 | swim |
| HighIntensityIntervalTraining | 581 | — |
| Hike | 453 | run |
| MountainBikeRide | 332 | bike |
| Workout / WeightTraining | 331 / 291 | — |
| EBikeRide | 94 | bike |
| VirtualRun | 58 | run |
| TrailRun | 24 | run |
| EMountainBikeRide | 21 | bike |
| GravelRide | 15 | bike |
| (필드 없음) | 42 | — |
| 기타 23종 | 각 117건 이하 | — |

소문자 `ride` 의 출처: 공개 API `orider-g1-web/functions/src/api/services/activityService.ts:23` 이 `type: "ride"` 고정(`POST /api/v1/activities`), 과거 `backfill-activity-type.ts` 도 `"ride"` 로 채움. `cycling`·`running`·`e-bike ride`·`velolift`·`swimming`·`Handcycle`·`Velomobile`·`OpenWaterSwim`·`PoolSwim` 은 **0건**.

`shared/sport/discipline.ts` 에 추가:

```ts
/**
 * Firestore `type` 에 실제 저장되는 표기. 피드 쿼리 `in` 전용.
 * 목록에 없는 표기는 종목 필터에서 빠진다(계약). 운영 전수 집계로 유지한다 — 문서 docs/features/home-feed-query-filters.md §3.2.
 */
export const STORED_TYPES_BY_DISCIPLINE: Readonly<Record<SportDiscipline, readonly string[]>> = {
  bike: ["Ride", "ride", "VirtualRide", "MountainBikeRide", "EBikeRide", "EMountainBikeRide", "GravelRide"],  // 7
  run:  ["Run", "Walk", "Hike", "VirtualRun", "TrailRun"],                                                   // 5
  swim: ["Swim"],                                                                                            // 1
};
```

- 테스트: 각 항목의 `toLowerCase()` 가 `SPORT_TYPE_DISCIPLINE` 에 있고 같은 종목인지(표 역방향 불일치 방지). 반대 방향(정본 표의 모든 키가 목록에 있는지)은 **의도적으로 검사하지 않는다** — 운영에 없는 표기는 넣지 않는다.
- 쓰기 경로와 어휘: Strava 가져오기(`sport_type` PascalCase 그대로), 앱 직접 생성·Wear(Strava 표기), 헬스 가져오기(Strava 표기), **공개 API(`"ride"` 소문자)**. 공개 API 를 `"Ride"` 로 고치는 것은 별도 작업(§8) — 고쳐도 기존 876건은 남으므로 목록의 `ride` 는 유지한다.
- 신규 표기가 생기면 목록에 추가해야 보인다. 운영 점검 항목으로 "목록 밖 `type` 건수" 를 분기마다 집계한다(§6 로깅).

### 3.3 소스별 쿼리와 분기 수

소스당 분기 수 = (`userId in` 개수) × (`visibility in` 개수) × (`or` 가지 수) × (`type in` 개수). 상한 30.

| 범위 | 소스 | 종목 없음 | 사이클(7) | 러닝(5) | 수영(1) |
|---|---|---|---|---|---|
| 나 | `deletedAt==null, userId==uid` | 1 | 7 | 5 | 1 |
| 전체(로그인) | `and(deletedAt==null, or(userId==uid, visibility==everyone), type in, startTime>=)` | 2 | 14 | 10 | 2 |
| 전체 친구공개 소스 | `userId in N, visibility==friends` | N | 7N | 5N | N |
| 친구 | `userId in N, visibility in [everyone, friends]` | 2N | 14N | 10N | 2N |
| 구독 | `userId in N, visibility==everyone` | N | 7N | 5N | N |

청크 크기 `N = min(5, floor(30 / (visibility 분기 × type 분기)))`:

| | 종목 없음 | 사이클 | 러닝 | 수영 |
|---|---|---|---|---|
| 친구 범위(visibility 2) | 5 | 2 | 3 | 5 |
| 그 외(visibility 1) | 5 | 4 | 5 | 5 |

`chunkFriendIds(ids, chunkSize = 5)` — 기본값 5 는 유지(검색 경로 981행도 같은 함수를 씀). 테스트에서 네 종목 × 전 범위 × 친구 30명 조합의 분기 수가 30 이하임을 검사한다.

### 3.4 복합(`or`) 소스에 조건 넣는 방법

`makeSourceQuery`(142~150행)는 복합 소스일 때 `query(col, composite, ...trailing)` 이고 trailing 은 비필터 제약만 받는다. 따라서 "전체(로그인)" 소스는 `type in`·`startTime >=` 를 **`and(...)` 안에** 넣는다. `filters` 배열 소스는 배열에 추가한다. 두 경로 모두 `orderBy("startTime","desc")` 앞이다.

### 3.5 친구 수 운영 분포 (2026-10-29)

`friends/{uid}/users` 소유자 8명, 최대 3명, 중앙값 1명. 친구 범위·사이클 필터(N=2)에서 최악 소스 수는 3개(본인 1 + 친구 청크 2). 첫 화면 getDocs 는 3회 + 3회. 소스 12개 상한(친구 22명 이상)은 현재 도달 불가. 상한을 넘는 계정은 §3.7 폴백으로 내려간다.

### 3.6 빈 상태 판정

`useActivities` 의 `totalCount` 계약을 `number | null` 로 바꾼다. null = 미확정(지연 4.5초 미도착·실패·`enabled=false`·구독 범위). 범위가 바뀌면 null 로 초기화하고, 실패 시 null 유지. 건수는 `buildSourceQueries(uid, null)`(필터 없음, 청크 5) 로 만들고 effect 의존성에서 `feedFilters` 를 빼서 **필터를 바꿔도 재요청하지 않는다**(테스트: 필터 변경 시 count 요청 0회).

`MobileFeedPage.tsx` 445~450행 재구성:

| 조건 | 문구 | CTA(앱 설치·기록 가져오기) |
|---|---|---|
| 필터 결과 0, `!hasMore`, `totalCount === 0` | 아직 활동이 없어요 | 표시 |
| 필터 결과 0, `!hasMore`, `totalCount >= 1` 또는 `null` | 조건에 맞는 활동이 없어요 | 숨김 |
| 필터 결과 0, `hasMore` true (trivial·admit 클라이언트 필터로 생김) | 조건에 맞는 활동이 없어요 + "더 보기" 유지(현행) | 숨김 |
| 구독 범위, `hasMore` true | 기존 `morePossible` 문구 유지 | 숨김 |

"전체" 범위의 건수는 플랫폼 전체 공개 활동 수라 사실상 0이 되지 않는다. 따라서 "아직 활동이 없어요" + CTA 는 "나"·"친구" 범위에서만 나온다. 의도한 동작이다 — 전체 범위에서 활동이 0건인 신규 사용자는 남의 활동을 보고 있으므로 설치 유도는 투데이 스트립 등 다른 자리가 맡는다.

측정 오류 활동(`isTrivialActivity`, 거리 100m·60초 미만)과 구독 범위 `admitSubscriptionActivities` 는 여전히 클라이언트에서 거른다. "첫 페이지가 비지 않음" 성공 기준은 이 둘을 제외한 조건이다. 짧은 Walk 가 많은 러닝 필터에서 드물게 빈 페이지가 날 수 있다.

### 3.7 폴백(색인 없음·소스 상한 초과) 동작

두 경우 모두 그 소스만 **`type` 조건을 빼고** `startTime >= cutoff` 는 유지한 쿼리로 바꾼다(기존 색인으로 동작). 같은 페이지의 다른 소스는 서버 필터를 그대로 쓰며, 소스 단위 커서라 혼합해도 정렬은 깨지지 않는다 — 이 혼합을 허용한다.

종목 거르기는 `fetchPageRequest` 의 소스 버퍼 단계(377~402행 루프의 `.filter(summary != null)` 옆)에서 `disciplineOfType` 으로 한다. 루프는 유효 문서 `pageSize` 개가 모일 때까지 계속 읽으므로, 폴백 소스에는 **소스·페이지당 getDocs 3회 상한**을 둔다. 상한에 닿으면 버퍼에 있는 만큼만 돌려주고 `exhausted=false` 로 두어 `hasMore` 를 유지한다("전체 + 수영"처럼 62k 중 746건인 조합이 컬렉션을 훑는 것을 막는다). 폴백 상태는 `FeedSourceCursor` 에 `fallback: "index-missing" | "source-cap"` 으로 기록해 다음 페이지에서 실패 쿼리를 다시 보내지 않는다. 로그: `useActivities.filterIndexMissing`(오류), `useActivities.sourceCapExceeded`(경고).

## 4. 종목 필터 대안 비교

| 대안 | 내용 | 판정 |
|---|---|---|
| **B. `type in [...]`(채택)** | 데이터 무변경, 색인 3개 추가, 청크 축소 | 당장 가능. 운영 친구 수에서 쿼리 수 증가 없음 |
| A. 서버가 `discipline` 필드 기록 | 소스당 분기 1, 쿼리 가장 단순 | 운영 활동 61,993건 백필 필요. `activities/{id}` 에 `onDocumentWritten` 트리거 7개(기본요약·홈요약·그룹라이드·히트맵·경로색인·Wear 업로드 등) → 백필 1건당 함수 7회 ≈ 43만 회. 재시도 폭주·결제 하드캡 위험, 베타 백필 생략 원칙과 충돌. **보류** |
| C. 클라이언트 필터 유지 + 빈 페이지면 자동 다음 페이지 | 코드 최소 | 기간 필터는 영원히 못 찾고 읽기만 늘림. 기각 |

## 5. 색인 (`orider-g1-web/firestore/firestore.indexes.json`)

| 용도 | 필드 |
|---|---|
| 나 / 전체-본인 가지 | `deletedAt ASC, userId ASC, type ASC, startTime DESC` |
| 전체-공개 가지 / 구독 | `deletedAt ASC, visibility ASC, type ASC, startTime DESC` |
| 친구 / 전체-친구공개 | `userId ASC, deletedAt ASC, visibility ASC, type ASC, startTime DESC` |

- `in` 은 등호와 같은 색인. 기간(`startTime >=`)은 정렬키 범위라 추가 색인 없음. `type` 은 fieldOverrides 로 제외돼 있지 않음.
- 보안 rules 변경 없음 — `list` 규칙은 `deletedAt`·`visibility`·`userId` 조건만 요구하고 추가 `where` 와 무관. 청크가 작아지면 `isFriend` exists 호출은 오히려 준다.

## 6. 배포 순서·폴백·롤백

1. **g1-web 색인 PR(base `dev`)** 작성. 머지와 별개로 운영에 색인을 **먼저 생성**한다:
   `firebase deploy --project miranae-orider-g1 --only firestore:indexes`(선례 `scripts/deploy-ai-api.sh:315`). **색인 PR 워크트리에서 실행**한다 — 실행 위치의 `firestore.indexes.json` 이 그대로 올라가므로 primary 나 dev 트리에서 돌리면 아무 색인도 안 생긴다. 비대화형이라도 `--force` 를 쓰지 않는다 — 운영에만 있는 색인을 지우겠느냐는 질문이 나오면 거부하고 차이를 먼저 본다. `scripts/firestore-index-rollout.mjs` 는 플래그 없이 실행하면 **차이 출력과 검사만** 하며(`--apply-target` 도 events·viewers 전용) activities 색인을 만들지 않는다.
2. `node scripts/firestore-index-rollout.mjs --project miranae-orider-g1 --wait-all-ready` 로 3건 **READY** 대기(62k 건 기준 수 분 ~ 수십 분). 또는 `gcloud firestore indexes composite list` 로 확인.
3. **순서 제약**: 색인 PR 이 main 으로 승격되어 g1-web 태그가 나가기 **전에** 1~2 가 끝나 있어야 한다. `deploy.yml` 173~177행의 `--require-all-ready` 는 생성이 아니라 검사라, 저장소에 색인이 있는데 운영에 없으면 g1-web 의 다른 릴리스까지 막힌다.
4. **로컬 실기 검증**: 로컬 vite + 본인 계정 위임 로그인, 데스크톱·모바일 × 종목 × 기간 × 범위. 운영 색인 READY 가 전제.
5. **orider-web PR** `dev` 머지. dev 머지는 다음 승격 예약이므로 1~4 가 끝나기 전에는 머지하지 않는다.
6. 폴백: §3.7. 색인이 빠져도 피드는 종목만 클라이언트 거르기(읽기 상한 있음)로 유지된다.
7. 롤백: 웹은 `hotfix/*` 단건으로 `useActivities` 변경을 되돌린다(dev 전체 승격 금지). 색인은 그대로 둬도 무해.

## 7. 변경 파일과 테스트

orider-g1-web (선행 PR): `firestore/firestore.indexes.json` 색인 3개.

orider-web (후행 PR, base `dev`):
- `shared/sport/discipline.ts`: `STORED_TYPES_BY_DISCIPLINE` + 역방향 정합 테스트.
- `src/hooks/useActivities.ts`: `feedFilters` 옵션, `buildSourceQueries(uid, filters | null)` 분리, 복합·배열 소스 양쪽 제약, 동적 청크(`chunkFriendIds` 크기 인자), 소스 수 상한, 요청 키, §3.7 폴백(읽기 상한·커서 기록), `totalCount: number | null`.
- `src/pages/DashboardPage.tsx`: `useActivities` 에 `feedFilters` 전달(모바일은 저장 설정, 데스크톱은 탭 종목), `totalCount` 를 `MobileFeedPage` 로 전달.
- `src/components/mobile/MobileFeedPage.tsx`: 피드 경로 종목·기간 클라이언트 필터 제거(검색 병합 경로 유지), 빈 상태·CTA 를 §3.6 판정으로.
- 테스트(`useActivities.test.ts`): (a) 필터별 `where` 제약(복합 소스는 `and` 내부), (b) 분기 수 30 이하(4 종목 × 4 범위 × 친구 30명), (c) 필터 유무가 요청 키를 다르게 함(전역 Map 공유 방지), (d) 필터 변경 시 커서 초기화, (e) `failed-precondition` 폴백 + 소스·페이지당 getDocs 3회 상한 준수 + 커서에 폴백 기록, (f) 소스 12개 초과 시 종목 조건 제거 + 같은 상한, (g) 필터 변경 시 count 재요청 0회, (h) count 실패 시 `totalCount` null 유지. `MobileFeedPage.test.tsx`: §3.6 네 분기(건수 0 / 1 이상 / null / hasMore).
- 로깅: 페이지 조회 `debugLog` 에 `sport`·`cutoff`·소스 수·분기 수·getDocs 횟수. 폴백·상한 초과는 `logClientError`.
- 운영 점검: "목록 밖 `type` 건수" 집계 쿼리를 `docs/operations` 에 기록.

검증(실기): §6-3. 1회 조회당 getDocs 횟수를 로그로 센다. 운영 데이터는 읽기만.

## 8. 범위 밖·후속

- 공개 API `activityService.ts:23` 의 `type: "ride"` 를 `"Ride"` 로 통일(쓰기 경로만, 기존 876건은 목록으로 흡수).
- 데스크톱 기본 종목 사이클(`DashboardPage.tsx` 245행) 재검토.
- `TrainingExecutionPanel.tsx` 57~60행 같은 패턴 적용.
- 검색 경로에 종목 필터를 쿼리로.
- 정식 오픈 백필 시점에 대안 A(`discipline` 필드) 재검토.

## 9. 친구 수 확장 대응 — 서버 `discipline` 필드 (대안 A, v4 추가)

### 9.1 보류 사유 재검토 결과

v1~v3 는 "활동 문서 트리거 7개 × 62k 백필 = 43만 함수 호출" 을 이유로 A 를 보류했다. 트리거 전수 조사(2026-10-29, g1-web `functions/src`) 결과:

- `activities/{id}` update 를 받는 트리거는 **14개**(7개가 아님). 그러나 **전부 자기 입력 필드만 골라 비교하는 allowlist 방식**이라, 어느 트리거의 projection·digest 에도 `discipline` 이 없다. `discipline` 만 바뀐 쓰기는 14개 모두 활동 문서에 되쓰지 않고 다른 컬렉션에도 연쇄 쓰기가 없다.
- `activityRevision` 을 정하는 `activityExecutionProjection`(`activity-revision.ts:134-142`)에도 `discipline` 이 없어 리비전이 오르지 않고, 리비전에 반응하는 하위 트리거(defaultSummary·planLink·maintenance)도 돌지 않는다.
- 가드 없이 매번 I/O 하는 트리거는 2개뿐이고 둘 다 읽기만 한다: `onActivityGroupWeeklyAggregate`(트랜잭션 읽기 2건), `onVerifiedEventActivityWritten`(읽기 1건).
- 병목: `onActivityRouteIndexActivityWritten` 이 `maxInstances: 1, concurrency: 1, retry: true`. default codebase 전역 `maxInstances: 10`. → 백필은 속도 제한을 두고 흘려야 한다.
- 비트리거 부작용(추정): `doc.updateTime` 을 revision 으로 쓰는 코드(`stage-activity-power-snapshot.ts:34`, `power-curve-periods.ts:26`, `stage-native-power-v2-source.ts:134`, `home-stored-summary-trigger.ts:39`)가 백필 뒤 첫 조회에서 스냅샷을 stale 로 보고 재계산할 수 있다. 읽기 시점 지연 재계산이라 폭주는 아니지만 §9.5 검증 항목에 넣는다.

결론: **백필은 가능**하다. 비용은 호출 수가 아니라 속도 제한과 일일 결제 하드캡으로 관리한다.

### 9.2 필드 계약

- `activities/{id}.discipline: "bike" | "run" | "swim" | "other"`. `type` 에서 `disciplineOfType`(`analysis/sport-discipline.ts`, 소문자 정규화 후 정확 일치) 로 파생. 미지 값·부재는 `"other"`(쿼리 대상이 아니지만 "백필 완료" 표식으로 null 대신 값을 둔다).
- **서버 전용 필드.** rules `firestore.rules:234`(create)·`:306`(update) 금지 키 목록에 `discipline` 추가. 앱 `commitActivityRevision` 은 `exactKeys(ACTIVITY_CONTENT_KEYS)` 라 클라이언트가 보내면 이미 거부된다.
- 웹 `shared/types.ts` `Activity` 에 `discipline?: SportDiscipline | "other"` 추가. 표시 판정은 계속 `disciplineOfType(type)` 을 쓴다(필드는 쿼리 전용 — 두 판정이 어긋나면 §9.5 점검으로 잡는다).

### 9.3 신규 문서 쓰기 경로 (추가 이벤트 0)

`type` 을 쓰는 같은 쓰기에 `discipline` 을 함께 넣는다.

| 경로 | 위치 | 비고 |
|---|---|---|
| Strava 큐·마이그레이션·웹훅 | `strava/shared.ts:252` `convertStravaActivity` | 세 호출처 공유. 사용자가 Strava 에서 종목을 바꾸는 웹훅 merge 도 커버 |
| 공개 API 생성 | `api/services/activityService.ts:23` `buildActivityData` | 함께 `type` 을 `"Ride"` 로 통일(§8 후속을 흡수) |
| 파일 가져오기 GPX/FIT | `api/services/activityWriter.ts:157` | |
| 헬스 가져오기 | `api/services/healthIngestService.ts:424` | 재수집 merge 도 커버 |
| 앱·Wear(리비전 관리) | `activity-revision.ts:766-778` `activityProjection` + 롤백 projection(964행) | 서버 callable 이 파생 |
| 앱 직접 생성(레거시) | `activity.ts:302-343` `initializeActivityCreate` patch | rules 247행 때문에 이 patch 는 항상 일어나므로 추가 쓰기 0 |
| 레거시 update 로 `type` 만 바뀜 | `activity.ts:551` `onActivityUpdate` 에서 보정 | 보정 쓰기 1회 추가, 그 이벤트는 `discipline` 단독 변경이라 no-op |

`onActivityUpdate` 에 `isActivityDisciplineOnlyMutation` 가드(`isActivityRegionOnlyMutation` 과 같은 형태)를 추가해 의도를 명시한다. `mutateActivityServerMetadata` 의 `ACTIVITY_SERVER_METADATA_KEYS` 에 `discipline` 추가.

### 9.4 백필

`backfill-activity-revision.ts` 패턴을 따른다(dry-run 기본·`--apply`, keyset 커서 `--start-after`, 페이지 트랜잭션에서 `getAll` 재읽기·merge fence 확인·기존 값 덮어쓰지 않는 `tx.update`). 차이:

- 페이지 200건, 페이지 사이 sleep. 목표 속도 **분당 600건 이하**(route-index 단일 인스턴스 기준 여유) → 62k 건에 약 2시간. 그러나 §9.7 의 일일 하드캡 때문에 **하루 1만~1만 5천 건, 5일 분할**을 기본으로 한다.
- 이미 `discipline` 이 있는 문서는 건너뛴다(재실행 멱등).
- 진행 체크포인트 문서(`backfill-group-weekly.ts` 의 lease·cursor 방식)로 중단·재개.
- 순서: (1) 쓰기 경로 배포(§9.3) → 신규 문서부터 필드 생성 (2) 백필 dry-run 으로 분포 확인 (3) 하루 분량씩 적용, 각 일자 뒤 함수 호출 수·결제 확인 (4) 완료 확인: 백필 커서가 끝까지 갔고 `discipline` 없는 문서 0건(백필 스크립트가 "미기록" 카운터로 보고) (5) 색인 생성·READY (6) 웹 전환.

### 9.5 검증·점검

- 백필 전후 종목별 건수 비교: `discipline == bike` 건수 = `type in STORED_TYPES_BY_DISCIPLINE.bike` 건수(§3.2 전수 집계 37,062+10,867+876+332+94+21+15 = 49,267건 기준). 어긋나면 파생 함수 차이.
- 백필 첫 1,000건 뒤 함수 호출 수 모니터(14개 트리거 × 1,000 ≈ 1만 4천 회 기대, 그 이상이면 어떤 트리거가 되쓰기하는 것).
- 활동 문서 재쓰기 0건 확인(백필 뒤 `updateTime` 이 백필 시각보다 늦은 문서 수).
- 홈 요약·파워 스냅샷의 재계산 횟수(`updateTime` 부작용) 관찰.
- 주 1회 "`discipline` 없는 신규 문서 건수" 점검(쓰기 경로 누락 감지).

### 9.6 A 로 갈 때 §2~§8 에서 바뀌는 것

| 항목 | B(`type in`) | A(`discipline ==`) |
|---|---|---|
| 쿼리 | `type in [7개]` | `discipline == "bike"` (등호 1개) |
| 분기 수 | 친구 범위 14N | 친구 범위 2N → 청크 **5 유지**, 동적 청크·소스 12개 상한 불필요 |
| 색인 | `type` 삽입 3개 | `discipline` 삽입 3개(`deletedAt,userId,discipline,startTime↓` / `deletedAt,visibility,discipline,startTime↓` / `userId,deletedAt,visibility,discipline,startTime↓`) |
| 저장 표기 목록 | 운영 전수 집계로 유지 | 불필요(파생은 서버 한 곳) |
| 신규 표기 누락 | 목록에 없으면 안 보임 | 서버 표에 없으면 `"other"` — 지금의 클라이언트 판정과 같은 누락 범위 |
| 색인 없음 폴백 | §3.7 | 같음(`discipline` 조건만 제거) |
| 친구 수 다음 한계 | 쿼리 분기 30 | rules `isFriend` exists 10회 → 청크 5 → 친구 50명에 소스 11개. 그 다음은 피드 fan-out 이 필요 |
| 웹 전환 시점 | 색인 READY 뒤 즉시 | 쓰기 경로 배포 + 백필 완료 + 색인 READY 뒤 |

### 9.7 비용 예측

전제: 활동 61,993건, update 트리거 14개, 가드 없는 읽기 트리거 2개(읽기 3건/활동), 함수는 Cloud Functions 2세대(asia-northeast3), 무료 구간은 다른 운영 트래픽이 이미 쓴다고 보고 **전액 과금 가정**.

| 항목 | 수량 | 단가(개략) | 금액 |
|---|---|---|---|
| 백필 문서 쓰기 | 62k | ₩0.25/건 | 약 ₩16,000 |
| 트리거 호출 | 62k × 14 ≈ 87만 회 | ₩0.56/천 회 | 약 ₩490 |
| 트리거 컴퓨트(no-op 평균 0.2초, 0.5GB) | 87만 × 0.2초 vCPU + 메모리 | ₩33/천 vCPU초, ₩3.4/천 GB초 | 약 ₩6,000 |
| 트리거 읽기 | 62k × 3 ≈ 19만 건 | ₩0.08/건 | 약 ₩1,500 |
| 백필 스크립트 읽기(재읽기 포함) | 62k × 2 | ₩0.08/건 | 약 ₩1,000 |
| **백필 합계** | | | **약 ₩25,000 (1회성)**, 환율·단가 오차 ±50% |
| 색인 저장 | 3개 × 62k 항목 | 수 MB | 월 ₩100 미만 |
| 신규 활동당 추가 비용 | 0 (같은 쓰기에 필드 추가) | | 0 |
| 운영 피드 읽기 | §"달라지는 비용" 과 동일 — 페이지당 10건, 청크 5 유지라 B 보다 쿼리 수 적음 | | |

일일 결제 하드캡(경보 ₩5,000 / 함수 일시정지 ₩10,000 / 결제 해제 ₩30,000)을 고려하면 **하루 ₩5,000 이하 = 하루 약 1만 2천 건**이 안전선이다. 따라서 5일 분할이 기본이고, 백필 일자에는 다른 대량 작업(세그먼트 사진 배치, 전체 재계산)을 피한다. 급하면 하드캡 경보 임계를 백필 기간만 임시 상향하고 2일에 끝낼 수 있다.

구현 규모(참고): g1-web 쓰기 경로 7곳 + rules 2줄 + `onActivityUpdate` 가드 + 백필 스크립트 + 색인 3개, orider-web 는 §7 에서 `type in`·동적 청크·저장 표기 목록이 빠져 더 작아진다.

### 9.8 권고 순서

B 를 먼저 내고 A 로 바꾸면 색인 3개·동적 청크·저장 표기 목록이 버려지는 작업이 된다. **A 로 바로 가는 것을 권고**한다. 기간은 g1-web 쓰기 경로 배포 1회 + 백필 5일 + 색인 + 웹 전환으로 약 2주이며, 그동안 홈 피드는 현행(빈 페이지 + 더 보기)을 유지한다. 그 2주를 못 기다리면 B 의 웹 변경만 먼저 내고(색인은 `type` 용) A 완료 후 교체한다 — 이 경우 색인 3개와 청크 로직이 일회용이다.

## 10. 백필 없이 신규 문서에만 적용 — 전환 시각 2층 구조 (v5, 권고)

사용자 결정(2026-10-29): 백필은 하지 않고 이후 문서에만 `discipline` 을 적용한다.

### 10.1 검토한 세 가지

| 방식 | 내용 | 판정 |
|---|---|---|
| `discipline ==` 만 쿼리 | 기존 62k건이 종목 필터에서 전부 사라짐(본인 과거 기록 포함) | 기각 |
| `or(discipline == X, type in [...])` 하이브리드 | 분기 수가 (1 + 7) 배로 늘어 친구 범위 청크가 1 이하 — B 보다 나쁨 | 기각 |
| **전환 시각 T 로 2층 분리(채택)** | `startTime >= T` 는 `discipline ==`, `startTime < T` 는 `type in`. 각 층을 별도 소스로 두고 기존 병합기로 합침 | 백필 0, 신규 층은 A 와 같은 비용, 구층은 B 와 같되 시간이 갈수록 덜 읽힘 |

### 10.2 구조

- **T(전환 시각)** = `discipline` 쓰기 경로(§9.3)가 운영 배포된 시각 **+ 24시간**. 상수로 `shared/` 에 둔다(웹·서버 공용, 밀리초 epoch). 배포 뒤 24시간 안에 만들어진 문서는 `discipline` 이 있어도 구층(`type in`)으로 조회되므로 문제없고, T 이후 `startTime` 인 문서가 `discipline` 없이 존재하는 경우는 "쓰기 경로 누락" 뿐이다(§10.5 점검).
- 과거 활동을 T 이후에 가져오는 경우(Strava 과거 기록 가져오기, 파일 업로드)는 `startTime < T` 라 구층으로 조회된다. `discipline` 과 `type` 이 둘 다 있으므로 어느 층이든 맞는다.
- 범위별 소스는 지금 구조(§3.3)를 그대로 두고, 각 소스를 **신층 / 구층 둘로 복제**한다. 신층 = 기존 필터 + `discipline == X` + `startTime >= max(T, cutoff)`. 구층 = 기존 필터 + `type in [...]` + `startTime < T` (+ `startTime >= cutoff`). 종목이 "전체" 면 층을 나누지 않고 현행 소스 하나(기간 조건만 추가).
- **구층은 신층이 모두 소진된 뒤에만 읽는다.** 구층의 모든 문서는 신층의 어떤 문서보다 오래됐으므로, 병합기(`fetchPageRequest` 377~402행)에 "계층 순서" 규칙을 넣어 신층 소스에 `exhausted` 가 찍히기 전에는 구층 소스의 getDocs 를 보내지 않는다. 첫 페이지 비용이 신층(= A 와 같음)으로 끝나고, 구층은 사용자가 T 이전까지 스크롤했을 때만 든다.
- 기간 필터 `cutoff >= T` 이면 구층 소스를 아예 만들지 않는다(7일·30일·90일 필터는 전환 3개월 뒤부터 구층을 건드리지 않는다. "올해" 는 다음 해 1월 1일부터).
- 친구 청크: 신층은 5 고정, 구층만 §3.3 동적 청크. 구층은 집합이 고정돼 있어 친구 수가 늘어도 "과거 친구 활동을 더 보기" 에만 비용이 든다.

### 10.3 색인

신층 3개(§9.6 `discipline`)와 구층 3개(§5 `type`) **모두 필요** — 6개. 구층 색인은 정식 오픈 시 백필을 하면 제거한다.

### 10.4 비용

| 항목 | 2층 구조 |
|---|---|
| 백필 | **0** |
| 첫 페이지 쿼리 수 | 전환 직후 24시간: 구층만 있으므로 B 와 같음. 이후 신층 문서가 10건 넘게 쌓인 뒤부터 A 와 같음(현행과 동일) |
| 구층 쿼리 | 신층 소진 뒤에만. 기간 필터는 T + 90일 뒤부터 구층 미조회 |
| 색인 저장 | 6개 × 62k 항목, 월 ₩200 미만 |
| 신규 활동당 추가 비용 | 0 |
| 코드 | A 의 쓰기 경로 7곳 + rules + 가드는 동일. 웹은 소스 복제 + 계층 순서 규칙 + 동적 청크(구층만) + 저장 표기 목록(구층용). 백필 스크립트 없음 |

### 10.5 운영 점검·종료 조건

- 주 1회: `startTime >= T` 이고 `discipline` 없는 문서 건수(쓰기 경로 누락 감지). Firestore 는 "필드 없음" 을 못 거르므로 `startTime >= T` 범위를 `type` 만 select 해 세는 스크립트로 한다. 0건이어야 한다.
- 정식 오픈 백필(§9.4) 을 하는 날: 백필 완료 → T 를 0 으로 내리고 구층 소스·색인·저장 표기 목록을 제거. 2층 구조는 그 시점까지의 과도기 설계다.

### 10.6 권고 순서(v5)

1. g1-web: `discipline` 쓰기 경로 7곳 + rules 금지 키 + `onActivityUpdate` 가드 + 색인 6개(PR 워크트리에서 운영 생성·READY). 운영 배포 시각 기록 → T 확정.
2. orider-web: `useActivities` 2층 소스·계층 순서·기간 조건·구층 동적 청크·폴백(§3.7), `MobileFeedPage` 빈 상태(§3.6), 저장 표기 목록(§3.2). T 상수 공유. 색인 READY 뒤 dev 머지.
3. 실기 검증은 T 경계(T 직전·직후 활동이 순서대로 이어지는지, 종목 필터에서 구층 활동이 보이는지)를 반드시 포함.
