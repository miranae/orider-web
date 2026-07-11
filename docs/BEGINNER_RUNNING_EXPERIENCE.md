# 러닝 첫 데이터 경험 설계 (Approachable Running Experience)

> 상태: 설계 v2.6 (2026-07-11) — R1~R3 완료 + R4 부분 완료(기록 공유·누적 마일스톤). 러닝 챌린지는 설계 게이트만. v2에 대한 2차 적대적 검토(제품 ACCEPT-W/R · 기술 ACCEPT-W/R · 시안 REVISE)와 건설적 기회 리뷰 반영.
> 승인 후 영문 병행 문서(`-en.md`) 작성.
> 선행 문서: 러닝 승격 개선안 (1단계 기본값·카피 중립화, 2단계 분석 동등화).

## 0. 개정 이력

### v2.5 → v2.6 (R4 부분 완료 + 챌린지 설계 게이트)

R4 중 어뷰징과 무관한 두 항목을 구현하고, 러닝 챌린지는 리뷰 요구(어뷰징·모더레이션 선행)에 따라 설계 게이트(§3.8)만 남겼다.

| 항목 | 상태 | 저장소·브랜치 |
|---|---|---|
| 기록 카드 공유 (§3.4a) | ✅ 구현 — navigator.share(카카오톡 포함) + 클립보드 폴백, 기존 CoursePage 관례 | orider-web `feat/running-r1-interpretation` (a17b711) |
| 누적 거리 마일스톤 (§3.4b) | ✅ 구현 — 100/500/1000km. 멱등 lifetime 카운터(activityId 원장, 재계산 차액 반영) | orider-g1-web `feat/run-cumulative-milestones` (9b71c1b) + 프론트 그리드 확장 |
| 4주 연속 주2회 마일스톤 | 후속 — 주간 집계 인프라 필요(누적 카운터와 별개 축) | 미착수 |
| 러닝 챌린지 (도전 피드) | **설계 게이트만** (§3.8) — 어뷰징·모더레이션 선행 미충족 시 구현 금지 | 미착수 |

**멱등 카운터 교훈**: `activity_metrics` 는 재계산 시 통째로 교체(merge 아님)되므로 플래그를 거기 둘 수 없다. `run_distance_ledger/{activityId}` 원장에 이전 기여를 두고 차액만 반영하는 방식이 재트리거·backfill 에도 정확하다. 누적·연속 등 lifetime 성격 지표는 모두 이 패턴을 재사용할 것.

### v2.4 → v2.5 (R3 백엔드 완결 + 마일스톤 풀스택)

R3 의 백엔드 3개와 마일스톤 프론트를 구현해 R3 를 완결했다.

| 항목 | 구현 | 저장소·브랜치 |
|---|---|---|
| 러닝 임계 페이스 제안 (§3.3) | threshold-suggest/apply 확장 — velocity 20분 best ÷ 0.95, 종목 게이트, accept 시 users.thresholdPace 적용 | orider-g1-web `feat/running-threshold-pace` |
| 하프·풀 거리 기록 (§3.4a) | activity-metrics 에 distanceRecordsFromStreams(two-pointer 보간), RunDistanceKey half/full, VERSION 11→12 backfill | orider-g1-web `feat/run-distance-records` |
| 서버 판정 마일스톤 (§3.4b) | 거리 완주(첫 5/10km·하프·풀) 서버 판정 + 소급 백필(celebrated), rules(celebrated 필드만 클라 갱신) + 테스트 | orider-g1-web `feat/run-milestones` (거리 기록 위에 스택) |
| 마일스톤 프론트 (§3.4b) | useMilestones 구독, MilestonesGrid(달성/잠금), MilestoneCelebration(신규 달성만, 소급은 조용), RunRecordsBoard 5거리 확장 | orider-web `feat/running-r1-interpretation` |

**스코프 조정**: 마일스톤은 **거리 완주만**(누적 100/500/1000km·4주 연속은 lifetime 카운터 인프라가 필요해 후속). R2 에서 first-sync 를 localStorage 로 처리한 판단이 "milestones 경로가 rules 에 없다"는 조사로 옳았음이 확인됐고, 이번에 그 rules·경로·판정을 신규 구축했다.

**백엔드 shared 타입 동기화**: 프론트 orider-web 과 백엔드 orider-g1-web 은 shared 를 **별개 클론**으로 갖는다. RunDistanceKey half/full 확장·RUN_DISTANCE_M(km→m) 을 양쪽에 반영. milestone.ts 는 백엔드에서 만들어 프론트로 복사(타입만, 판정은 functions 미러).

### v2.3 → v2.4 (R3 백엔드 조사 + 프론트 선구현)

R3 착수 전 비공개 저장소(orider-g1-web)를 조사해 계약을 확정했다. **문서가 신설하려던 것이 이미 존재했다** — 이게 가장 큰 교정이다.

| 문서의 전제 (§3.4a) | 백엔드 사실 (조사 확인) | v2.4 결정 |
|---|---|---|
| `activity_metrics.runMetrics.distanceRecords` 필드를 **신설** + `users/{uid}/records/run` 집계 문서 **신설** | 이미 `users/{uid}/records/power` 단일 문서의 **`run` 필드**(RunPrTable)에 서버가 쓰고 있다. 트리거 `onActivityMetricsRecords`(activity_metrics write 트리거), version 2. 키 `"1km"|"5km"|"10km"`, value=연속 N km 소요초(낮을수록 우수), top-5 | **신설하지 않는다.** 기존 `records/power`.run 을 read-only 구독. `distanceRecords` 명칭 폐기 |
| bestEfforts vs distanceRecords 명칭 충돌을 피하려 개명 | 서버는 splits 에서 **연속 N km best**(rolling window)를 뽑는다 — whole-activity 아님. 이미 "best effort" 성격 | 명칭 논쟁 불필요. 기존 스키마 용어 그대로 |
| 문자열 enum + 풀마라톤(42.195) 포함 | HM/M 은 splits 가 분수 km 라 정밀 추출 불가 — **미지원**(streams 레벨 후속) | 1/5/10km 만. 풀·하프는 R3 범위 밖으로 명시 |
| shared 타입에 버전 정책 명시 | shared 타입이 **v1/bike-only 로 뒤처져 있었다**(서버는 v2, run 완비) | `shared/types/personal-records.ts` 를 v2 로 동기화(RUN_DISTANCES·RUN_DISTANCE_KM 상수 포함) |
| §3.4b 마일스톤 서버 판정 + `celebrated` 필드 write | `users/{uid}/milestones` 경로는 **rules 에 아예 없다**(기본 거부). 서버에 milestone/achievement/celebration 개념 자체가 없다 | R2 에서 localStorage 만 쓴 판단이 옳았음을 확인. 서버 판정 마일스톤은 **백엔드 신규 설계가 선행**돼야 하는 별도 과제 |
| §3.3 임계 페이스 제안을 `ThresholdSuggestionBanner` 로 승격 | `threshold_suggestions` 는 **자전거 FTP/LTHR/maxHR 만** emit. 러닝 thresholdPace 제안은 없다(`fitness/current.thresholds.run` 은 프로필 값 미러일 뿐) | 러닝 임계 페이스 제안은 **백엔드 신규 작업**. R3 프론트에서는 미구현, R1 의 "설정 유도" 배너로 대체 유지 |

**R3 프론트 구현 (완료)**: 서버가 이미 쓰는 `records/power`.run 을 read-only 로 소비.
- `RunRecordBanner`(활동 상세): 이 활동이 현행 최고인 거리만 배너. `records.run[dist][0].activityId === activityId` 로 판정 — 서버 확정 기록에만 의존, 클라이언트 근사 없음(설계 원칙 준수).
- `RunRecordsBoard`(피트니스 러닝 탭): 1/5/10km 표. 미달성 거리도 자리를 남긴다. 임계 페이스 곡선을 접이식 디테일 레이어로 받을 수 있으나, FitnessPage 는 이미 하단에 `CriticalPaceCurve` 가 있어 **여기선 표만** 둔다(중복 방지).

**R3 백엔드 잔여 (미착수, orider-g1-web 필요)**: 하프·풀 거리 기록(streams 레벨 추출), 서버 판정 마일스톤(경로·rules·개념 신규), 러닝 임계 페이스 제안 emit, 기록 카드 공유(R4).

### v2.2 → v2.3 (R2 구현 중 코드가 반증한 사항)

| 문서의 전제 | 코드 사실 | v2.3 결정 |
|---|---|---|
| §3.4c `useWeeklyStats`(useActivities.ts:248) 를 run-only + 평균 페이스 + Asia/Seoul 로 **확장** | 그 훅은 12주 차트가 쓰는 공용 집계다. 주 경계를 KST 로 바꾸면 기존 차트의 주 구분이 통째로 이동한다 — 리캡 하나 붙이자고 감수할 변경이 아니다 | 기존 훅은 **건드리지 않았다**. 같은 인덱스를 쓰는 `useRunHistory(weeks)` 를 신설하고, 주 경계는 순수 함수 `seoulWeek.ts` 로 분리. `useWeeklyStats` 의 브라우저 로컬 tz 는 별도 이슈로 남긴다 |
| §3.4c 리캡·§3.1 레벨 추정이 각각 데이터를 가져온다 | 대시보드 한 화면에서 같은 문서를 두 번 읽게 된다 | 8주 창 **쿼리 1회**로 둘 다 커버 (레벨=8주, 리캡=3주). 러닝 탭이 아니면 아예 쿼리하지 않는다(`enabled`) |
| §3.7 통합 부하는 `TriFitnessView` 의 계산을 재사용 | 그 계산은 활동+스트림+프로필을 모두 끌어와 클라이언트에서 CTL 을 재계산한다 — 대시보드에서 너무 비싸다 | 서버가 이미 산출한 **`users/{uid}/fitness/current`(UserFitness)** 를 구독한다. 프론트에서 아무도 읽지 않던 문서였다. 없으면 카드를 렌더하지 않는다(0 으로 채우지 않음) |
| §3.4b 초기 축하를 `users/{uid}/milestones` 에 best-effort 기록 | 그 서브컬렉션의 rules 는 비공개 저장소에 있고 아직 없다 — 없는 rules 에 write 하면 권한 오류만 쌓인다 | R2 는 **localStorage 만** 쓴다. 서버 판정 마일스톤은 R3 |
| (문서에 없음) | 배포 시점에 이미 수백 번 달린 사용자에게 "첫 러닝을 축하합니다"가 뜨면 축하가 공허해진다 | `decideFirstSync`: 첫 러닝이 14일 이내면 축하, 아니면 **모달 없이 조용히 달성 처리**. 소급 축하 폭탄 방지 |
| §3.1 레벨 추정의 관측 기간 | 가장 오래된 러닝으로 창을 자르면 주 1회 러너가 항상 "빈도 높음"으로 나온다 | 계정 생성일을 알면 그것이 기준. "오래된 계정이 최근에만 달렸다"는 사실 자체가 데이터다 |
| §3.1 레벨을 "해설 노출 빈도·목표 프리셋"에 쓴다 | 그 배선은 R1 의 해설 레이어를 크게 건드려야 한다 | R2 에서는 **`regular` + 임계 페이스 미설정 → 설정 유도 배너** 하나로만 소비한다. 쓰이지 않는 추정값을 남겨두지 않기 위해 |

**R2 에서 발견한 결함 (수정 완료)**
- `ds-btn` 을 variant 클래스 없이 쓰면 거의 투명한 기본 스타일이 적용된다 → `buttonClass({variant})` 헬퍼 사용.
- 한국어 카피가 좁은 폭(360px)에서 어절 중간에 끊긴다 → 제목·본문에 `word-break: keep-all`.
- `crossLoad.headline` 이 `{{sport}}이(가)` 형태로 조사를 분기하려 했다 → 부사격("~에서 나오고 있어요")으로 재작성해 조사 문제 자체를 제거.
- **`theme/components/components.css` 는 `main.tsx` 에서만 import 된다.** 시각 검증 하니스가 이를 빠뜨리면 `ds-btn`·`ds-card` 없이 렌더되어 잘못된 결론을 낸다(R1 검증도 같은 한계였다).

### v2.1 → v2.2 (R1 구현 중 코드가 반증한 사항)

R1(§3.2·§3.3·§3.5)을 실제로 구현하면서 문서의 전제 몇 가지가 코드와 달랐다. 아래는 **구현이 이긴 항목**들이다.

| 문서의 전제 | 코드 사실 | v2.2 결정 |
|---|---|---|
| §3.2 `metricGlossary.json` 을 `public/locales/{ko,en}/` 에 배치 | `public/locales` 는 vite 플러그인 `copy-locales` 가 `src/i18n/resources` 에서 **생성**한다(빌드마다 `rmSync` 후 복사). 거기에 두면 지워진다 | 원본은 **`src/i18n/resources/{ko,en}/metricGlossary.json`**. `NAMESPACES`·정적 import 에 등록하지 않으면 lazy 로드된다(HTTP 200 확인) |
| §3.5 훈련 상태 라벨을 신규 도입 (회복 필요/회복 중/유지/순항/과부하 주의) | `features/fitness/fitnessPageUtils.ts` 의 `tsbStatusLabel` 이 **이미 5단계 TSB 밴드**(>25 / >5 / >-10 / >-30 / 그 외)를 쓰고 있다 | 새 유틸이 **기존 경계를 그대로 공유**한다. 어긋나면 같은 화면에서 TSB -20 이 "피로 누적"이자 "순항"으로 표시된다. 라벨은 **과부하 주의 · 회복 필요 · 순항 · 회복 완료 · 과회복** (TSB 오름차순 단조). "유지"는 폐기 — 비단조 순서라 스펙트럼 바의 축과 모순 |
| §3.3 워크아웃 목적 문구를 신규 집필 | `training.json` 에 `today.purpose`/`today.benefit` 가 이미 있으나 **어디서도 렌더되지 않고** 톤이 전문가용("미토콘드리아 밀도↑") | 기존 키는 두고 일상어 `today.purposePlain.{category}` 를 추가해 카드에 노출 |
| §3.3-4 임계 페이스 미설정 시 `computeBestPace` 로 추정해 "(추정)" 라벨과 함께 노출 | 추정하려면 최근 활동 **스트림**을 끌어와야 한다 — 대시보드 카드에서 비싸고, 사용자가 나중에 임계값을 확정하면 숫자가 조용히 바뀐다 | **대시보드에서는 추정하지 않는다.** 목적 문장만 보여주고 임계 페이스 설정 경로를 안내. `resolveThresholdPace`(추정 지원)는 유틸에 남겨 스트림이 이미 있는 화면에서만 쓴다 |
| (문서에 없음) | `RunDetailCards.tsx:89` 스플릿 존이 절대 매직넘버(250/270/295 sec/km) — 느린 러너의 모든 구간이 Z2 로 찍힌다 | `paceToZone(pace, thresholdPace)` 로 교체. 임계값이 없으면 존 열을 `-` 로 둔다(잘못된 존보다 없는 편이 낫다) |

**부수적으로 발견한 기존 결함 (이번 범위에서 고치지 않음, 별도 처리 필요)**
- `src/i18n/resources/{ko,en}/training.json` 에 **중복 최상위 키** `plan`, `log` 가 있다. JSON 파서가 뒤엣것만 남기므로 앞의 `"plan": "계획"` 은 죽은 값이다.
- `TodaysWorkoutPresentation.tsx` 가 **정의되지 않은 토큰** `var(--r-3xl)`, `var(--space-1-5)` 를 쓴다(index.css 에 없음 → 무시됨).

### v2 → v2.1 (2차 검토 + 기회 리뷰 반영)

| 출처 | 지적/제안 | v2.1 결정 |
|---|---|---|
| 적대(제품) 치명 | aha moment(§3.0, R2)가 발화 장치 first-sync(§3.4b, R3)보다 먼저 출시되는 순서 모순 | **초기 축하(first-sync·첫 주)를 클라이언트 발화로 분리해 R2로 이동** — 조작 인센티브 없음. 서버 판정은 조작 가능한 누적·기록만 (§3.4b) |
| 적대(제품) 중대 | 러너 레벨 추정의 콜드스타트 — 8주 미만 이력이면 regular를 novice로 오판 | 데이터 부족 시 **중립 기본(casual)** + 선택적 1문항 하이브리드 (§3.1) |
| 적대(제품) 중대 | "샘플 카드가 전환시킨다"는 무측정 가설 | aha를 실험으로 강등: 품질 지표 정의 + 샘플 카드 A/B + **연결 직후 본인 러닝 즉시 미리보기** 대안 병기 (§3.0, §6) |
| 적대(기술) 중대 | §3.4c weeklyTSS 재사용 주장 오류 — `FitnessBreakdown`엔 횟수·거리·페이스 없음 | **`useWeeklyStats`(useActivities.ts:248) 확장**으로 교정: run-only + 평균 페이스 + Asia/Seoul 주경계 (§3.4c) |
| 적대(기술) 경미 | celebrated 클라 write의 rules 스코프·교차기기 모달 레이스 | 필드 스코프 제한 + 레이스 처리 명시, `Layout.tsx:165` read-receipt 선례 인용 (§3.4b) |
| 적대(기술) 경미 | `Activity.gear`가 Strava 러닝에 실제로 붙는지 미검증 | 캐비엇 명시 — 최신 활동 gear 스냅샷 의존, 백엔드 확인 항목 (§3.6) |
| 기회 리뷰 | **크로스 종목 통합 부하가 차별점인데 설계에 0회 등장** — `TriFitnessView` 자산 완성돼 있음 | §3.7 통합 부하 기여 카드 신설 (R2) |
| 기회 리뷰 | `ThresholdSuggestionBanner` 패턴이 §3.3의 "(추정)→확정" 문제를 이미 푸는 자산 | §3.3에 러닝 임계 페이스 제안 연결 — "정직 라벨 → 원탭 확정" 루프 |
| 기회 리뷰 | `RunPrTable`(personal-records.ts:35-37)이 이미 존재 | §3.4a에 기존 스키마 확인을 선행 조건으로 추가 |
| 기회 리뷰 | `CriticalPaceCurve` 미사용 — 기록 보드에 이중 레이어 부재 | §3.4a 기록 보드의 디테일 레이어로 채택 |
| 기회 리뷰 | 해석 문장을 부하-회복까지 확장 가능 (IF 재사용) | §3.2 1차 해석에 회복 관점 문장 추가 |
| 기회 리뷰 | 축하가 개인 화면에서 끝남 — 공유 훅 부재 | §3.4a 기록 카드 공유(크리에이터 허브 파이프라인 + 카카오톡)를 R4로 추가 |
| 기회 리뷰 | 워크아웃 추천이 정적 설명처럼 보임 | §3.3 근거 칩(`recommendToday`의 tone·contextTags 노출) 추가 |

### v1 → v2 (1차 적대 검토 반영)

| 검토 지적 | v2 결정 |
|---|---|
| "순수 입문자"는 웹에서 성립 불가 (기록 수단 없음, 빈 대시보드 이탈) | 타깃을 **"졸업생 러너"**로 확정. 데이터 없는 상태 설계 §3.0 신설 |
| 러너 레벨 자기신고 온보딩 — 마찰 대비 보상 얇음 | 온보딩 단계 철회, Strava 이력 자동 추정으로 대체 |
| 임시 클라이언트 PR — 산출 불가 + 추후 값 변경으로 신뢰 붕괴 | 삭제. 거리별 기록은 백엔드 확정 산출만 |
| 클라 마일스톤 판정 — 서버 경계 원칙 위반, 공개 소스 조작 무방비 | 판정 백엔드 재분류, 프론트 read-only |
| 신발 트래킹 — 이미 존재 | 신규 구현 삭제, 노출 확대만 |
| 북극성 KPI 귀속 불가 | orider가 통제하는 지표로 교체 + 전문가 이탈 가드레일 |
| i18n 신규 ns 경로 불일치 (런타임 404) | `public/locales/{ko,en}/` 배치로 교정 |
| "존 정의 재사용" 사실 아님 | `workoutPace.ts` 신규 설계 명시 |
| bestEfforts 계약 부실 | `distanceRecords` 개명, 문자열 enum + 풀마라톤, 버전 정책 |
| 소급 축하 폭탄 | 백필 정책 명문화 |
| 스트릭 기각이 한 문장 선언 | A/B 검증 대상으로 재분류 |

## 1. 타깃과 설계 원칙

**타깃 페르소나 — "졸업생 러너"**: 나이키 런 클럽·스트라바·가민 등에서 이미 달리고 있고(주 1회 이상, 데이터 보유), 기록 앱의 축하는 익숙하지만 **"내 러닝이 무슨 의미인지"** 해석해 주는 곳이 없는 사용자. orider-web은 기록 도구가 아니라 **해석·훈련 허브**이므로, 이 페르소나가 유일하게 웹에서 성립하는 타깃이다.

순수 입문자(첫 5km 이전, 데이터 없음)는 이번 범위의 타깃이 **아니다**. 유입은 막지 않되, §3.0의 1차 목적은 입문자 획득이 아니라 **연결~첫 동기화 사이의 졸업생 유지**다.

### 원칙: 이중 레이어 (Progressive Disclosure)

1. **위에는 쉬운 말** — 모든 화면의 첫 시선은 일상어 문장.
2. **아래에는 디테일** — 펼치면 기존 고급 지표(GAP 곡선, 스플릿, rTSS, 임계 페이스 곡선)가 그대로. 별도 "쉬운 모드" 토글 없음. *비용 인정: 지표마다 "쉬운 한 줄 + 상세" 콘텐츠 이중화 비용을 감수한다.*
3. **모든 숫자에 해설 접점** — 지표 옆 ⓘ 하나로 "정의 + 내 수치의 개인화 해석"을 즉답.
4. **축하는 자동, 훈계는 없음** — 축하 이벤트는 **저데이터로도 발화 가능한 초기 이벤트**(첫 동기화, 첫 주 완료)를 우선 설계하고, 이는 클라이언트 발화로 R2에 먼저 나간다 (§3.4b).

### 경쟁 포지션 재확인

나이키 런 클럽의 강점(기록·동기부여·오디오 코칭)을 재구축하지 않는다. 흡수하는 것은 **톤과 축하의 문법**. 자원의 중심은 "졸업생이 첫 데이터를 붙인 순간, 가민 커넥트·런나보다 나은 한국어 해석"이며, 그 위에 **어느 경쟁사도 못 주는 크로스 종목 통합 부하 해석(§3.7)**을 얹는 것이 이 플랫폼 고유의 무기다.

## 2. 벤치마크 흡수 매트릭스

| 출처 | 가져올 것 | 반영 |
|---|---|---|
| 나이키 런 클럽 | 친근한 코치 톤, 축하의 문법 | 카피 톤 (§7), 초기 축하 (§3.4b) |
| 런나 | 워크아웃 목적 한 줄 + 개인화 목표 페이스 | 워크아웃 카드 (§3.3) |
| 가민 커넥트 | 훈련 상태 일상어 라벨 / 레이스 예상 기록 | §3.5 / 2단계 ⑦과 통합 |
| 스트라바 | 거리별 최고 기록 + 주간 리캡 / 신발 | §3.4a·§3.4c / §3.6 노출 확대만 |
| (orider 고유) | 크로스 종목 통합 부하 | §3.7 — 벤치마크 없음, 자체 자산 |

## 3. 기능 설계

### 3.0 데이터 없는 상태 (First-Sync Journey)

**1차 가치: 연결~첫 동기화 사이의 졸업생 유지.** (졸업생은 연결 즉시 데이터가 흐르므로 완전 empty 상태를 오래 보는 건 범위 밖 페르소나다 — 화면의 무게중심은 샘플 카드가 아니라 "동기화 진행·도착" 경로에 둔다.)

1. **온보딩 직후 대기 화면** (대시보드 러닝 탭 empty state):
   - 상단: "달리던 앱을 연결하면, 여기서 러닝을 해석해 드려요" + Strava 연결 CTA
   - 중단: **샘플 해석 카드** — 정적 가상 러닝 1건의 이중 레이어 미리보기. 점선 테두리 + "미리보기" 라벨로 실데이터와 구분.
   - 하단: 매뉴얼 멀티스포츠 챕터 링크 (순수 입문자용 우회로)
2. **연결 후 첫 동기화 대기**: 동기화 진행 표시 + "첫 러닝이 도착하면 알려드릴게요"
3. **첫 러닝 도착** → `first-sync` 축하(§3.4b, **R2 클라이언트 발화**) + 활동 상세로 유도.

**aha moment는 가설이다 (검증 설계)**: "기록이 해석으로 바뀌는 순간"이 전환을 만든다는 것은 이 설계의 중심 베팅이지 사실이 아니다.
- 품질 지표: 첫 해석 화면 도달 세션의 **상세 카드 펼침률 / MetricExplainer 개방률** (§6) — 조회만으로는 성공으로 치지 않는다.
- 샘플 카드는 유무 A/B로 전환 기여를 분리 측정.
- 더 강한 대안 검토: 연결 직후 Strava에서 막 인입된 **본인의 지난 러닝 1건을 즉시 해석해 미리보기** — 남의 가상 데이터보다 강한 전환 장치일 가설. 구현 시 A/B 아암으로 추가.

신규: `src/components/dashboard/RunEmptyState.tsx`, 샘플 데이터 정적 JSON.

### 3.1 러너 레벨: 이력 기반 자동 추정 + 콜드스타트 폴백

- `estimateRunnerLevel(activities): 'novice' | 'casual' | 'regular'` — 최근 8주 러닝 빈도·최장 거리 기반 순수 함수. `src/utils/runnerLevel.ts` (신규, 테스트 + 결과 로깅). 세션 파생, 저장 안 함.
- **콜드스타트 폴백 (v2.1)**: 보유 이력이 8주 미만(Strava 백필 깊이 미확인 포함)이면 `novice`가 아니라 **중립 `casual`** — 방금 연결한 regular에게 novice용 툴팁 과노출을 막는다. "데이터 부족 = 초보"라는 매핑 금지.
- 콜드스타트 창의 보조 신호(선택): 목표 마법사 진입 시점에 **선택적 1문항**("러닝 경험이 어느 정도인가요?")을 물을 수 있게 남겨둔다 — 온보딩 필수 단계가 아니라 마법사 내부의 스킵 가능한 질문. 추정 데이터가 8주 쌓이면 추정이 우선.
- 용도: `novice` → 해설 자동 노출 빈도 상향·`completion` 프리셋 우선 / `regular` → 임계 페이스 설정 유도.

### 3.2 지표 해설 레이어 (MetricExplainer)

**신규 공용 컴포넌트** `src/components/common/MetricExplainer.tsx`:

- 지표 라벨 옆 ⓘ → 바텀시트/팝오버 3단 구조:
  1. **한 줄 정의** (일상어): "GAP은 오르막·내리막을 평지 기준으로 환산한 페이스예요."
  2. **내 수치 해석** (개인화): "이번 러닝의 GAP 5'40"은 실제 페이스보다 12초 빨라요 — 오르막이 많았다는 뜻이에요." — `src/utils/metricInterpretation.ts` (신규 순수 함수, 임계값은 `users/{uid}/training_profile/current` 구독 재사용). 임계값 없으면 해석 단락 생략.
  3. **더 알아보기** → 매뉴얼 챕터 링크.
- **부하-회복 해석 확장 (v2.1)**: rTSS 해설에 `estimateTSS.ts:31`의 IF(임계/실제 페이스 비)를 재사용해 회복 관점 한 문장 추가 — "오늘 강도(IF 0.92)면 내일은 가볍게 달리는 게 좋아요". 경쟁사(가민: 숫자만, 런나: GAP 해석 없음) 대비 핵심 차별 문장.
- i18n: **`src/i18n/resources/{ko,en}/metricGlossary.json`** (lazy ns — `NAMESPACES`·정적 import 에 등록하지 않는다). `public/locales` 는 `copy-locales` 플러그인이 생성하는 산출물이므로 직접 두지 말 것. 원천은 `src/i18n/glossary.md`.
- 1차 적용: 페이스, GAP, 케이던스, rTSS, 임계 페이스, CTL/ATL/TSB, 크리티컬 페이스, 폼 지표.
- 접근성: **탭 타깃은 스탯 셀 전체(≥44px)** — ⓘ는 시각 어포던스일 뿐 단독 히트 영역이 아님. 포커스 트랩 + `aria-labelledby` + `prefers-reduced-motion` 존중. 라이트 테마 소형 accent 텍스트는 `accentDark` 사용 (AA 4.5:1 준수).

### 3.3 워크아웃 카드 친절화

1. **워크아웃 목적 한 줄** — `WorkoutKind`별 "왜 하는가". i18n `training.json` `workoutPurpose.{kind}`.
2. **근거 칩** — `makeFactChips` 가 이미 TSB·7일 TSS·마지막 운동일 칩을 렌더하고 있다(구현 확인). 추가 노출(`recommendToday` 의 tone·contextTags)은 R2 로 이월 — R1 은 목적·페이스에 집중.
3. **개인화 목표 페이스 범위 — 신규 설계**: 기존 코드에 임계 페이스 → 존별 페이스 공식 없음. 신규 `src/utils/workoutPace.ts`:
   ```
   존별 페이스 = thresholdPace × 계수 (Daniels/Friel 계열, 예:
     Z1 회복 ≥1.28, Z2 이지 1.15~1.28, Z3 템포 1.05~1.14, Z4 역치 0.99~1.04, Z5 인터벌 0.90~0.98)
   ```
   계수 확정 시 `estimateTSS.ts`의 IF 정의와 정합 검증(검토 완료: 방향 정확). `RunDetailCards.tsx:89` 매직넘버도 이 유틸로 교체.
4. **추정 → 확정 승격 루프 (v2.1)**: 임계 페이스 미설정 시:
   - 추정 앵커는 GAP 평균 대신 **`CriticalPaceCurve.computeBestPace`의 20~30분 최고 페이스**(≈임계 속도) 우선 검토 — 더 원리적이고 기존 자산 재사용. 표기는 "(추정)" 라벨 유지.
   - **기존 `ThresholdSuggestionBanner` 패턴 재사용**: 자전거 FTP/LTHR 제안(`shared/types/threshold.ts` + `acceptThresholdSuggestion`)과 동일하게, 백엔드가 러닝 `thresholdPace` 제안을 emit하면 사용자 원탭 수락으로 추정이 확정 페이스로 승격. "정직 라벨"이 "성장 서사"로 닫히는 루프. (프론트 S / 서버 제안 로직은 백엔드 과제)
5. **완료 후 연결** — 활동 상세 "오늘의 워크아웃과 비교" 카드, 축하 우선 톤.

### 3.4 축하 시스템

**a) 거리별 최고 기록 (distanceRecords) — 백엔드 확정 산출**
- **선행 확인 (v2.1)**: `shared/types/personal-records.ts:35-37`에 `RunPrTable`(1/5/10km 최고 시간)이 **이미 타입으로 존재** — 전량 신규 설계 전에 이 스키마의 서버 산출 여부·하프/풀 확장 가능성을 백엔드와 먼저 확인. 절반은 이미 있을 수 있다.
- 계약: `activity_metrics.runMetrics.distanceRecords` — `{ distance: '1k'|'5k'|'10k'|'half'|'full'; timeSec; isNewRecord; prevBestSec? }[]` + `users/{uid}/records/run` 집계. `ACTIVITY_METRICS_VERSION` +1 및 backfill. 명칭은 파워 `bestEfforts`와 충돌 회피.
- 프론트: 기록 갱신 배너(서버 `isNewRecord: true`에만) + 마이페이지 기록 보드.
- **기록 보드의 디테일 레이어 (v2.1)**: 표 아래 접이식 **`CriticalPaceCurve`**(기존 컴포넌트, `computeBestPace`) + 거리별 PR을 곡선 위 점으로 표기 — 이중 레이어 원칙을 records에도 적용. 프론트 자산 재사용이라 R3 화면 작업에 포함.
- **공유 훅 (v2.1, R4)**: 배너에 "기록 카드 공유" — 크리에이터 허브의 shareCard·이미지 파이프라인(`RideStoryPhotoPicker`) 재사용 + 카카오톡 공유 SDK. aha를 획득 루프로 전환. 러닝 카피 분기 필요.

**b) 마일스톤 — 이원화: 초기 이벤트는 클라, 누적·기록은 서버 (v2.1 재분류)**
- **초기 이벤트 (R2, 클라이언트 발화)**: `first-sync`(첫 동기화 러닝 도착), 첫 주 완료. 판정 근거가 "서버 데이터의 존재" 자체라 조작 인센티브·가치가 없음 → 서버 경계 원칙(개인화·생성 로직) 위반이 아니며, aha moment(§3.0.3)와 같은 릴리스에 나간다. 발화 기록은 localStorage + `users/{uid}/milestones`에 best-effort 기록.
- **누적·기록 마일스톤 (R3, 서버 판정)**: 첫 5km/10km/하프, 누적 100/500/1000km, 4주 연속 주 2회 — 활동 write 트리거 Cloud Function이 판정해 `users/{uid}/milestones/{id}` 기록, 프론트 read-only. 근거: `ChallengeFeed.tsx:1-6` 경계 원칙 + 공개 소스 조작 방지.
- **소급 백필**: 기존 사용자의 과거 달성분은 서버가 `celebrated: false`로 조용히 기록 — 모달 없이 기록 보드 표기만. 풀스크린 축하는 배포 후 신규 달성에만. 소급분은 "지금까지의 여정" 1회 카드.
- **celebrated 플래그 (v2.1 명세화)**: 클라 write는 `celebrated` **필드 한정** — rules에서 필드 스코프 제한(전체 문서 write 금지, orider-g1-web 과제). 선례: `Layout.tsx:165` 알림 read-receipt(`read`/`dismissedAt`만 클라 갱신). 교차 기기 동시 열람 레이스(둘 다 `celebrated:false` 읽고 모달 이중 발화)는 감수 가능한 수준이나, 모달 표시 직전 재조회(read-then-show)로 창을 줄인다.
- 축하 모달 접근성: 포커스 트랩, `prefers-reduced-motion` 시 컨페티류 정지.
- 스트릭: 일 단위 스트릭은 A/B 백로그 (휴식일 프리즈 등 완화 장치 포함 검토). 1차는 주 단위 일관성.

**c) 주간 리캡 카드 (v2.1 데이터 소스 교정)**
- 월요일 대시보드 상단: 지난주 러닝 횟수·거리·평균 페이스 + 한 줄 해석.
- 데이터 소스: ~~`UserFitness.breakdown.run.weeklyTSS`~~ (부하 수치뿐 — 횟수·거리·페이스 없음, 검증 결과 부적합). **기존 `useWeeklyStats`(`src/hooks/useActivities.ts:248`)를 확장**: (a) run-only 필터, (b) 평균 페이스 산출, (c) 주 경계를 브라우저 로컬 `getDay()`에서 **`Asia/Seoul` 고정**으로 교정 (기존 훅의 로컬 tz는 이 카드 도입 시 함께 수정). 전체 활동 재집계 신설 금지 원칙은 유지 — 기존 훅 확장이지 신규 집계가 아니다.
- 비교 시각화는 "지난주 vs 그 전주" 2값 비교로 충분 — 일별 막대는 일별 재집계를 유발하므로 지양.

### 3.5 훈련 상태 일상어 라벨

- TSB·CTL 램프율 → 5단계 (TSB 오름차순): `과부하 주의` / `회복 필요` / `순항` / `회복 완료` / `과회복` + 한 줄 조언. `src/utils/trainingStatusLabel.ts` (신규 순수 함수 + 테스트).
- **경계값은 기존 `fitnessPageUtils.tsbStatusLabel` 과 공유**한다 (>25 / >5 / >-10 / >-30). 한쪽만 바꾸면 두 라벨이 어긋나므로 회귀 테스트로 고정했다.
- CTL 램프율이 주당 +8 을 넘고 이미 피로하면(TSB ≤ -10) 과부하로 승격하고 다른 조언 문구를 쓴다.
- 시각화 명세 (시안 검토 반영): 스펙트럼 바는 **현재 위치 세그먼트만 accent**, 나머지는 중립 — 양끝을 warning으로 상시 칠하지 않는다("회복 필요"는 정상 상태이지 위험 경고가 아님). 현재 상태가 `과부하 주의`일 때만 해당 세그먼트를 warning으로.
- 노출: 대시보드 피트니스 요약, FitnessPage 상단. 라벨 탭 → TSB 해설 (§3.2).

### 3.6 신발: 기존 기능 노출 확대

- 신발 카드는 이미 구현·렌더링 중: `RunDetailCards.tsx:427` GearCard + 서버 비정규화 `Activity.gear`.
- 범위: (a) 마이페이지/설정 신발 요약 노출, (b) 교체 임박(잔여 15% 미만) 대시보드 배지.
- **캐비엇 (v2.1)**: `Activity.gear`는 백엔드가 채우는 optional 필드 — Strava 동기화 러닝에 실제로 붙는지(사용자가 Strava에서 신발을 지정한 경우 한정?), `totalDistanceKm`가 활동 시점 누적인지 공개 저장소에서 확인 불가. 대시보드 배지는 사용자별 gear 집계 문서가 없으므로 **최신 러닝 활동의 embedded gear 스냅샷 의존** — 미지정 활동에선 부재. 백엔드 확인 후 확정.

### 3.7 크로스 종목 통합 부하 카드 (v2.1 신설 — orider 고유 차별점)

문서가 차별점으로 선언한 통합 훈련 부하를 실제 화면에 노출한다. **자산은 완성돼 있다**: `TriFitnessView.tsx` 통합 CTL/ATL/TSB 합산(`:559-570`) + 종목별 기여 도넛 `ContribDonut`(`:265-315`).

- 대시보드(통합 탭) 상단 카드: 미니 기여 도넛 + 쉬운 말 한 줄 — "이번 주 러닝이 통합 체력에 +6 기여했어요 (러닝 42% · 사이클 51% · 수영 7%)".
- 러닝 탭에도 축약형 한 줄: "이 러닝은 통합 체력의 일부로 계산돼요" + 통합 탭 링크 — 자전거 병행 사용자(듀애슬론·크로스트레이닝)에게 orider만의 프레임 제시.
- 가민(기기 종속 단일 뷰)·런나(러닝 전용)·스트라바(부하 해석 없음) 모두 이 프레이밍이 없다.
- 비용 S~M: 계산·컴포넌트 재사용, 카피·배치만 신규. 로드맵 R2.

### 3.8 러닝 챌린지 — 설계 게이트 (R4, 구현 전 선행 조건)

러닝 챌린지(도전 피드의 러닝 카드: "이번 달 100km", "5km 서브20" 등)는 **공개·경쟁 요소**라
1차 적대 검토(F7)와 v2 로드맵이 명시한 **어뷰징·모더레이션 설계가 선행**돼야 구현할 수 있다.
이 절은 그 선행 조건을 못박는 게이트다 — 아래를 충족하기 전에는 구현하지 않는다.

**1) 진척은 서버 확정 기록에서만 집계 (클라 입력 금지)**
- 챌린지 진척은 반드시 서버가 판정한 `records/power`.run·`run_lifetime`·`milestones` 에서만 파생한다.
  클라이언트가 진척을 보고하거나 계산해 쓰는 경로를 두지 않는다(공개 오픈소스라 조작 노출).
- 수동 활동 입력(업로드)으로 기록을 위조할 수 있으므로, 경쟁 챌린지는 **소스 검증**(예: Strava
  인입 활동만 인정, 또는 서버측 이상치 필터)이 필요하다. 이 정책이 확정되기 전엔 경쟁 챌린지 금지.

**2) 리더보드는 서버 집계 스냅샷** (기존 `groups/{id}/rankings` 패턴 재사용)
- 클라가 전체 참가자를 읽어 정렬하지 않는다. 서버 cron/트리거가 순위 스냅샷을 만든다.

**3) 모더레이션 경로 선행**
- 사용자 생성 챌린지는 신고 경로·숨김·삭제가 있어야 공개 가능. 이것이 없으면 **공식(운영자
  생성) 챌린지만** 먼저 연다. 사용자 생성 챌린지는 모더레이션 인프라 완비 후.

**4) 초기 밀도 현실 인식** (이전 대화 결론)
- 세그먼트·리더보드의 가치는 코드가 아니라 사용자 밀도다. 빈 리더보드로 시작하므로 "동네 러닝
  크루 단위 시딩" 같은 커뮤니티 전략이 함께 가야 한다. 기능만 만들고 방치하지 않는다.

**결론**: 위 4개(특히 1·3)가 충족되기 전 러닝 챌린지 구현은 착수하지 않는다. R4 의 나머지(기록
공유·누적 마일스톤)는 개인 지표라 어뷰징과 무관해 먼저 구현했고, 챌린지는 이 게이트에 남긴다.

## 4. 데이터 모델 변경

| 위치 | 변경 | 담당 경계 |
|---|---|---|
| `activity_metrics.runMetrics.distanceRecords` | 신규 (문자열 enum, 풀 포함, 버전 +1) — **`RunPrTable` 기존 스키마와 관계 선확인** | **백엔드** |
| `users/{uid}/records/run` | 거리별 현행 기록 집계 | **백엔드** |
| `users/{uid}/milestones/{id}` | `{ achievedAt, celebrated }` — 서버 write / 클라 read + **`celebrated` 필드 한정 갱신**(rules 스코프) | **백엔드** (누적·기록 판정) / 초기 이벤트는 클라 발화 |
| `users/{uid}/threshold_suggestions/*` 러닝 확장 | `thresholdPace` 제안 emit (§3.3 승격 루프) | **백엔드** |
| 프론트 신규 | `runnerLevel.ts`, `workoutPace.ts`, `metricInterpretation.ts`, `trainingStatusLabel.ts`, `MetricExplainer.tsx`, `RunEmptyState.tsx`, `WeeklyRecapCard.tsx`(+ `useWeeklyStats` 확장), 통합 부하 카드(§3.7, `ContribDonut` 재사용) + `public/locales/{ko,en}/metricGlossary.json` | 프론트 |

의존성: 목표 마법사 프리셋(§3.1)은 goalType 일반화 트랙(GOAL_TYPE_GENERALIZATION.md)과 접점 — 구현 전 현행 스키마 확인.

## 5. 로드맵 (v2.1)

| 순서 | 범위 | 의존성 |
|---|---|---|
| ~~R1~~ ✅ **구현 완료** | §3.2 지표 해설(부하-회복 문장 포함) + §3.5 훈련 상태 라벨 + §3.3 워크아웃 목적·목표 페이스 | 없음 — 프론트 단독. **개념 증명의 핵심: 활동 상세 해석 화면**. 산출물: `workoutPace.ts` · `trainingStatusLabel.ts` · `metricInterpretation.ts` · `MetricExplainer.tsx` · `TrainingStatusCard.tsx` · `RunInterpretationCard.tsx` · `WorkoutPurposeDetail.tsx` · `useRunBaselinePace.ts` · `metricGlossary.json`(ko/en). 88개 단위 테스트 + 브라우저 시각 검증(라이트/다크·360px) 통과 |
| ~~R2~~ ✅ **구현 완료** | §3.0 첫 동기화 여정 + §3.4b 초기 축하(first-sync, 클라 발화) + §3.1 레벨 추정(콜드스타트 폴백) + §3.4c 주간 리캡 + §3.7 통합 부하 카드 + §3.6 신발 노출 | 프론트 단독. aha moment 와 발화 장치가 같은 릴리스. 산출물: `seoulWeek.ts` · `runWeeklyRecap.ts` · `runnerLevel.ts` · `crossDisciplineContribution.ts` · `firstSync.ts` · `shoeStatus.ts` · `useRunHistory` · `useUserFitness` · `useFirstSyncCelebration` · `RunEmptyState` · `WeeklyRecapCard` · `CrossDisciplineLoadCard` · `FirstSyncCelebration` · `ThresholdPaceNudge` · `ShoeReplacementBadge`. 72개 테스트 신규 + 브라우저 시각 검증(라이트/다크 × 데스크톱/360px) |
| ~~R3~~ ✅ **완료(풀스택)** | 거리별 기록 보드·배너 = **프론트 완료**(기존 `records/power`.run 소비). 하프·풀 기록·서버 판정 마일스톤·러닝 임계 페이스 제안 = **백엔드 미착수**(orider-g1-web) | 산출물: `runRecords.ts` · `useRunRecords` · `RunRecordsBoard` · `RunRecordBanner` + shared 타입 v2 동기화. 27개 테스트 신규, 시각 검증 |
| R4 (부분 ✅) | 기록 카드 공유 ✅ · 누적 마일스톤 ✅ · **러닝 챌린지는 §3.8 설계 게이트** · 4주 연속·연속주 후속 | R3 완료. 챌린지는 어뷰징·모더레이션 선행 |

## 6. 측정 (귀속 가능 지표 + 품질 신호)

북극성 후보: **동기화된 러닝 도착 후 24시간 내 해당 활동 상세 조회율**.
- **품질 신호 병기 (v2.1)**: 조회 ≠ 해석 수령 — 푸시로 부풀 수 있으므로, 같은 세션 내 **상세 카드 펼침률 / `or_metric_explainer_open`**을 품질 신호로 반드시 병기해 조회의 진위를 검증.

보조 지표:
- `or_metric_explainer_open` (metric, sport) — 해설 수요
- `or_run_empty_state_cta` — 빈 상태 → Strava 연결 전환율. 샘플 카드는 **유무 A/B**로 기여 분리
- `or_workout_pace_shown` (hasThreshold) + 임계 페이스 제안 수락률 (§3.3 승격 루프)
- 신규 러닝 사용자 4주차 웹 재방문율
- §3.7 통합 부하 카드 노출 대비 통합 탭 진입률 (멀티스포츠 세그먼트)

가드레일: **기존(전문가) 코호트의 세션 빈도·이탈률** — 친절 레이어가 전문가를 밀어내지 않는지 상시 관찰.

## 7. 카피 톤 가이드

- 존댓말, 문장형. 명령·훈계 금지 ("~해야 합니다" → "~하면 좋아요").
- 숫자보다 변화를 먼저: "8초 빨라졌어요" > "5'42"/km". **페이스 개선 표기 주의: 페이스는 낮을수록 좋음 — 상승 화살표(▲)를 개선에 쓰지 말 것.** "8초 단축"/▼ 사용.
- 전문용어 첫 등장 시 일상어 병기: "훈련 부하(rTSS)", "체력(CTL)".
- 실패 프레임 금지: 플랜 미이행 시 "다시 시작하기 좋은 날이에요".
- 영문판: 해석 문장은 직역 불가 — en은 별도 집필. **R1 콘텐츠 저작 공수(8개 지표 × ko/en)는 별도 라인아이템으로 산정할 것** — "glossary.md 변환"으로 축소 추정 금지.

## 8. 범위 밖 (명시)

- 러닝 기록(recording) 기능 — orider-web은 해석 허브.
- 순수 입문자(데이터 0) 획득 캠페인 — 별도 트랙. §3.0은 획득 장치가 아니라 졸업생 유지 장치.
- 일 단위 스트릭 — A/B 백로그.
- 클라이언트 측 누적·기록 판정 (초기 이벤트 발화는 예외로 §3.4b에 정의).
- 수익화 경계 — 별도 문서. 본 설계 기능은 무료 전제로 설계하되 확정 아님.
