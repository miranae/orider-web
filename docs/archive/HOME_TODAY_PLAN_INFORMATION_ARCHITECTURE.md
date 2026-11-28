# 홈 `오늘의 계획`과 피트니스 정보구조 개선안

> 상태: 2차 개정 완료 — `origin/main` AI 코치 공용화 반영, 제품·기술 독립 리뷰 승인<br>
> 작성일: 2026-08-15<br>
> 2차 개정 기준: `orider-web` `origin/main@31de866`, `orider-g1-web` `origin/main@c870f97e`<br>
> 적용 화면: 홈, 운동 계획, 피트니스, AI 코치
> 핵심 결정: 홈의 장문형 `오늘의 워크아웃`을 제거한다. 새 추천·수락 엔진을 중복 구현하지 않고, AI 코치에 이미 있는 결정론적 Prescription·weekly check-in·proposal/confirm/audit/rollback을 공용 `Training Decision Core`로 재구성한다. 홈의 compact `오늘의 계획`은 이 코어의 오늘 projection만 소비하며 제한 실험 뒤 가치가 확인될 때만 유지한다.

## 1. 배경과 문제

현재 홈의 `오늘의 워크아웃`은 다음 역할을 한 카드 안에서 동시에 수행한다.

- 오늘 세션 선택
- 피로·부하 상태 판정
- 주간 목표 진행률 설명
- 목표일까지의 장기 전망
- 날씨·영양·내일 운동 안내
- AI 장문 분석과 재분석

이 구조는 홈을 활동 현황과 기록을 빠르게 확인하는 화면이 아니라, 또 하나의 코칭 화면으로 만든다. 모바일에서는 이 카드가 활동 피드보다 먼저 노출되어 홈의 기본 과업을 밀어낸다.

더 큰 문제는 카드가 피트니스와 별도의 판단 엔진처럼 동작한다는 점이다. 실제 사례에서는 같은 시점에 다음 내용이 함께 표시됐다.

- 피트니스: `컨디션이 안정적이에요. 오늘은 계획대로 진행하세요.`
- 홈: `회복 사이클 Z1`, `TSB -6.2`, `최근 7일 330 TSS`
- 홈 AI 설명: `깊은 피로`, `최근 7일 440 TSS`, `부하비 1.37`

이 현상은 단순한 어조 차이가 아니다.

1. 피트니스와 홈이 서로 다른 피로 임계값을 사용한다.
2. 현재 구조화 수치와 과거 AI 캐시 문장이 함께 노출될 수 있다.
3. `최근 7일`과 `이번 주`가 같은 값처럼 사용된다.
4. 계획 단계와 AI가 재해석한 단계가 `베이스`와 `빌드`로 갈릴 수 있다.
5. 계획 세션이 존재하면 부하·회복 조정이 계획보다 강한 세션을 만들지 않는다는 계약이 없다.

사용자는 어느 화면을 믿어야 하는지 판단할 수 없다. 한 번의 명시적 모순은 여러 번의 좋은 추천보다 신뢰에 더 큰 손상을 준다.

### 1.1 2차 개정의 `origin/main` 기준

2차 개정은 2026-08-15에 fetch한 다음 원격 정본을 기준으로 한다.

| 저장소 | `origin/main` | 확인된 범위 |
|---|---|---|
| `orider-web` | `31de866` | 홈은 `TodaysWorkoutCard` 직후 PMC·Rider Insight를 포함한 `CoachQuestionLauncher`를 렌더한다. `CoachPrescription`과 Progress Planner read·proposal·confirm·rollback 클라이언트도 포함돼 있으나 홈 IA와 아직 연결되지 않았다. |
| `orider-g1-web` | `c870f97e` | 결정론적 7일 Prescription, weekly check-in, proposal/confirm/audit/rollback, 실내 세션 생성, 처방 대비 강도대·세트 이행 대조 포함 |

이 표는 코드 포함 여부를 뜻하며 운영 활성화를 뜻하지 않는다. AI API 배포 revision·traffic·feature flag는 별도 검증 대상이다. 현재 capability는 Prescription/read가 결합되고 check-in이 proposal enablement와 결합되며 confirm만 별도다. rollback discovery flag는 없다. 모두 기본 fail-closed이므로 홈이 기능의 존재를 가정하면 안 된다.

## 2. 제품 판단

### 2.1 결론

홈에 현재 형태의 장문형 `오늘의 워크아웃`은 필요하지 않다.

다만 활성 계획 사용자가 홈에 들어오자마자 “오늘 무엇을 할까?”에 답을 얻는 가치는 유지해야 한다. 따라서 기능을 완전히 삭제하지 않고 다음처럼 역할을 줄인다.

- 홈: 예정 세션, 조정 권고, 수락 후 유효 세션을 상태에 맞게 보여주는 compact launcher 후보
- 운동 계획: 처방과 조정 내역의 정본
- 피트니스: 장기 추세와 오늘 상태의 근거
- 공용 Training Decision Core: 부하 facts, check-in, 결정론적 처방, 계획 변경 proposal과 감사
- 생성형 AI 코치: 확정된 decision을 요청 시 설명하고 후속 질문을 처리하는 보조 계층

홈에서 현재 카드의 약 70~80%를 제거하는 것이 목표다. 다만 compact 카드의 존치는 확정된 사용자 가치가 아니라 검증할 제품 가설이다. 활성 계획 사용자에게도 홈의 최근 활동 접근을 방해하거나 계획 실행을 높이지 못하면 완전 삭제한다.

### 2.2 대안 평가

| 대안 | 장점 | 치명적인 문제 | 결정 |
|---|---|---|---|
| 현재 대형 카드 유지 | 오늘 행동의 발견성이 높다 | 홈 과밀, 피트니스·계획과 중복, stale AI가 홈 전체 신뢰를 훼손한다 | 기각 |
| 전체 카드를 피트니스로 이동 | 홈을 단순화한다 | 장기 분석과 실행 처방을 다시 한 화면에 섞고, 오늘 행동을 숨긴다 | 기각 |
| 홈에서 완전 삭제 | 오류 면적과 유지 비용이 가장 작다 | 활성 계획 사용자의 즉시 행동과 재방문 동기를 잃는다 | 조건부 기각 |
| 홈은 compact 계획·권고, 상세는 계획으로 이동 | 행동 발견성을 유지하면서 역할과 책임을 분리한다 | 상세 확인에 한 번 더 이동해야 한다 | 조건부 채택·4주 실험 |

완전 삭제는 ORider가 활동 기록 제품으로 방향을 바꾸거나 compact 실험의 kill criterion을 충족할 때 실행한다.

## 3. 화면별 책임

```text
홈
 ├─ 오늘의 계획: 예정 세션, 조정 권고 또는 수락한 유효 세션, 이유 최대 2개
 ├─ 최근 7일 핵심 현황
 └─ 최근 활동 피드

운동 계획
 ├─ 예정 세션, 조정 권고와 수락 후 유효 세션
 ├─ 부하·회복 조정 권고와 사용자가 이해할 수 있는 변경 이유
 ├─ 세트·강도·시간·주간 일정
 └─ 완료 결과와 다음 계획 반영

피트니스
 ├─ 장기 체력 추세
 ├─ 오늘 상태와 판정 근거
 ├─ 종목별·통합 부하와 데이터 범위
 └─ 목표일까지의 예측

공용 Training Decision Core
 ├─ LoadAssessment·FactSet·scheduled plan snapshot
 ├─ weekly check-in·deterministic PrescriptionDTO
 └─ proposal·confirm·audit·rollback

생성형 AI 코치
 ├─ 활동·수행능력·부하·회복·목표·이행의 심층 분석과 후속 대화
 ├─ 현재 prescription/decision에 고정된 설명과 계획 변경 협상
 └─ 근거 없는 수치 생성과 proposal/confirm 밖의 계획 변경 금지
```

### 3.1 홈: 실행

홈은 사용자가 3초 안에 다음을 알아야 한다.

1. 오늘 운동이 있는가?
2. 있다면 무엇을 얼마나 하는가?
3. 원래 계획에서 바뀌었는가?

홈은 “왜”를 최대 두 개의 짧은 reason으로만 보여준다. 자세한 계산, 장기 전망, 영양, 날씨, 다음 날 가이드는 홈에서 제거한다.

### 3.2 운동 계획: 처방

운동 계획은 사용자가 만들거나 수락한 세션의 정본이다. 서버의 부하·회복 판단은 계획을 몰래 덮어쓰는 정본이 아니라 조정 권고를 만든다.

- `scheduledSession`: 사용자가 만들거나 계획 생성기가 저장한 원래 계획
- `recommendedAdjustment`: 부하·회복 상태를 근거로 한 시스템 권고
- `acceptedSession`: P1에서 사용자가 조정 권고를 수락한 결과. 직접 수정은 P2 범위
- `effectiveSession`: `acceptedSession ?? scheduledSession`
- `계획 유지 / 부하 낮춤 권고 / 회복 권장 / 휴식 권장` 상태
- 주간 계획 단계
- 달력 주 누적과 주간 목표
- 오늘 완료 결과와 이후 일정에 미친 영향

### 3.3 피트니스: 진단

피트니스는 두 질문을 명시적으로 분리한다.

- 장기: 내 체력이 올라가고 있는가?
- 단기: 오늘 계획을 소화할 상태인가?

장기 훈련 부하 증가와 당일 회복 권고는 동시에 참일 수 있다. CTL 상승만으로 수행능력이나 “체력 향상”을 단정하지 않는다. 수행능력 향상은 eFTP·CP·동일 조건 성과처럼 별도의 성능 근거가 있을 때만 표시한다. 피트니스는 이를 한 문장으로 연결하되 별도의 워크아웃을 재계산하지 않는다.

### 3.4 AI 코치: 코어와 생성형 계층 분리

`AI 코치`라는 제품명 아래의 모든 기능을 LLM으로 취급하지 않는다.

결정론적 코치 코어는 공용 훈련 도메인으로 승격한다.

- `LoadAssessment`, `FactSet`, `PrescriptionDTO`, weekly check-in을 오늘 판단의 구조화 입력·출력으로 재사용한다.
- provider call과 자연어 quota 없이 같은 canonical 입력에 같은 결과를 만든다.
- proposal/confirm의 revision·hash·nonce 검증, immutable audit와 rollback을 계획 변경 정본으로 재사용한다.
- Home·Fitness·Plan은 코치 대화 응답이 아니라 이 구조화 코어의 projection을 읽는다.

생성형 AI 코치는 설명자에 그치지 않고 깊은 분석 작업공간이자 협상 인터페이스다.

- 장기 활동, 수행능력, 부하·회복, 목표 격차, 처방 이행과 주관 신호를 함께 분석하고 사용자가 원인을 탐색하도록 돕는다.
- Rider Insight, PMC Insight, 월간 회복, 목표 격차, 세션·block adherence를 연결해 피트니스의 고정 화면보다 깊은 비교와 후속 질문을 제공한다.
- 분석은 새 가설과 해석을 만들 수 있지만 사용한 기간·종목·source·coverage·confidence를 함께 밝히며, 관찰과 권고를 구분한다.
- 구조화된 조정 권고와 사용자가 적용한 유효 세션을 대화만으로 바꿀 수 없다. 계획 변경은 반드시 proposal/confirm을 거친다.
- 현재 prescription/decision의 evidence에 없는 숫자를 현재 사실처럼 인용하거나, pinned 판단을 조용히 재분류할 수 없다. 다른 기간·데이터로 새 분석을 했다면 별도 분석임을 표시한다.
- `contextFilters.progressPlanner = { prescriptionId, sourceRequestId }`의 owner·revision 검증을 통과한 질문만 현재 판단의 설명으로 취급한다.
- stale·historical 답변은 mutation UI를 제공하지 않고 읽기 전용으로 렌더한다.
- P1의 Prescription·check-in·proposal은 현재 `ai-coach-policy-v4` 동의 계약을 그대로 따른다. 비동의·철회 사용자는 예정 계획만 볼 수 있고 AI 코치 기반 조정은 숨긴다.
- 생성형 답변 quota·장애는 동의 아래 이미 생성된 유효 계획과 예정 계획을 숨기지 않는다.

## 4. 홈 `오늘의 계획` 설계

### 4.1 명칭

실제 `운동 시작 → 수행 → 완료 비교` 흐름을 제공하기 전까지는 `오늘의 워크아웃`보다 `오늘의 계획`을 사용한다.

CTA도 기능에 맞게 정직하게 표현한다.

- 실행 기능이 있으면: `운동 시작`
- 계획 상세만 있으면: `세션 보기`
- 변경 proposal이 있으면: `변경 검토`
- prescription이 추가 신호를 요구하면: `몸 상태 확인`
- 설명이 필요하면: 현재 decision에 고정된 `코치에게 이유 묻기`

### 4.2 정보 밀도

모바일은 기본 글자 크기에서 3~4행의 정보 예산을 목표로 한다. 고정 높이를 강제하지 않으며, 글자 확대·한국어/영어 길이 차이·스크린리더에서 자연스럽게 reflow되어야 한다.

```text
● 오늘 · 회복 권장
회복 사이클 Z1 · 45–60분                         ›
원래 Z2 60분 · 최근 부하가 높아 가볍게 바꾸는 편이 좋아요
```

홈에서 허용하는 정보는 다음으로 제한한다. 수락 전에는 `scheduledSession`과 `recommendedAdjustment`를 구분하고, 수락 뒤에만 `effectiveSession`을 오늘 계획으로 표시한다.

- 상태 동사 1개
- 상태에 맞는 예정·권고·유효 세션명, 존, 시간
- 원래 계획에서 바뀌었으면 이전 계획 1개
- reason 최대 2개
- 상태에 맞는 주 CTA 1개와 선택적 `이유 묻기` 텍스트 액션 1개

홈에서 제거하는 정보:

- AI 장문 분석과 `다시분석`
- CTL·ATL·TSB 상세 해설
- 날씨와 영양 처방
- 내일 운동과 장기 전망
- 베이스·빌드 단계 설명
- 주간 부하 계산식
- 워밍업·본 운동·쿨다운 상세

### 4.3 상태별 노출

| 상황 | 홈 처리 |
|---|---|
| 활성 계획 + 오늘 세션 | compact 카드 표시 |
| 계획 유지 | `오늘 · 계획 유지` |
| 강도 또는 시간 감량 권고 | `오늘 · 부하 낮춤 권장` |
| 다른 세션으로 교체 권고 | `오늘 · 회복 권장` |
| `PrescriptionDTO.status=needs_checkin` | 처방을 만들지 않고 `몸 상태 확인` CTA 표시 |
| 명시적 통증·질병 check-in | `safety_blocked` projection에 따라 `오늘은 운동을 쉬세요` |
| proposal pending | `변경 검토 중`과 Plan 상세 이동 |
| proposal applied | receipt 이후 plan에서 읽은 유효 세션을 `조정 적용됨`으로 표시 |
| proposal reverted | 현재 plan의 복구된 유효 세션 표시 |
| 오늘 운동 완료 | 완료 요약으로 교체 |
| 새 활동 반영 중 | 자동 조정 상태를 숨기고 예정된 계획만 `업데이트 전 계획`으로 표시 |
| 활성 계획 없음 | 임의 워크아웃을 처방하지 않음 |
| 현재 Prescription·projection 없음 | 자동 조정 카드는 숨기고 예정된 계획만 `부하 조정 미반영`으로 표시 |

활성 계획이 없는 사용자에게는 KPI 아래의 작은 계획 생성 진입점만 제공한다.

```text
맞춤 계획이 필요하신가요?  [계획 만들기]
```

PMC 부하만으로 세부 파워, 심박, 케이던스, 영양까지 포함한 워크아웃을 단정하지 않는다.

`origin/main` 홈은 `TodaysWorkoutCard` 바로 뒤에 `CoachQuestionLauncher(showPmcInsight)`를 두고 Rider Insight와 PMC Insight 두 장을 추가 렌더한다. 오늘 카드를 compact하게 만들어도 이 구조를 유지하면 홈 상단 과밀은 남는다.

- Rider Insight와 PMC Insight의 기본 노출은 피트니스의 능력 프로필·오늘 상태 영역으로 이동한다.
- 홈의 일반 `AI 코치에게 질문` 진입은 전역 내비게이션에 맡기고, 오늘 카드에는 decision context가 있는 `이유 묻기`만 둔다.
- `이유 묻기`는 새 추천을 생성하지 않고 현재 `prescriptionId + sourceRequestId`에 고정된 질문을 연다.

### 4.4 현재 사례 카피

다음은 정보 위계 예시이며 Z1·시간을 확정하는 정책 사양이 아니다. 실제 문구는 6.3의 공용 Coach rules 승격 이후 그 결과를 그대로 렌더한다.

```text
오늘 · 회복 권장
회복 사이클 Z1 · 45–60분
원래 Z2 60분 · 최근 7일 부하가 높아 가볍게 바꾸는 편이 좋아요
[변경 검토]  코치에게 이유 묻기
```

`TSB -6.2`를 홈의 첫 reason으로 그대로 보여줄 필요는 없다. 제품 기본 카피는 일상어를 우선하고, 접근 가능한 상세 설명에서 `폼 -6.2 (TSB)`를 제공한다.

### 4.5 완료 후

```text
오늘 운동 완료
회복 사이클 52분 · 34 TSS 반영됨
방금 운동을 반영하고 있어요
```

모든 유효 세션이 완료된 경우에만 전체 완료 카드로 교체한다. 일부 완료이면 다음 행동을 유지한다.

```text
1개 완료 · 다음 세션
저녁 회복 사이클 Z1 · 30분 · 외 1개
방금 운동을 반영하고 있어요
```

모든 활동 반영이 끝나면 반영 중 문구를 제거한다.

## 5. 피트니스 상단 설계

피트니스는 장기 추세와 오늘 상태를 시각적으로 분리한다. 아래 회복 예시는 공용 Coach rules 후보가 Form -6.2를 회복으로 판정하고 승격된 경우의 시안이며, P0 카피가 아니다.

```text
장기 훈련 부하는 증가 중
최근 90일 CTL +8.4 · 목표일 CTL 39–43 예상(현재 계획을 따른 가정)

오늘은 회복을 권장해요
사이클 기준 · 폼 -6.2 · 최근 7일 부하 높음
예정된 Z2 60분 대신 회복 사이클 Z1 45–60분을 권장해요. 수락 후에는 `오늘 계획: 회복 사이클 Z1`으로 표시합니다.

[판정 근거 보기] [오늘 세션 보기]
```

피트니스의 오늘 상태와 홈의 오늘 계획은 같은 projection을 사용한다. 피트니스는 조정 권고와 유효 세션을 mirror할 뿐 별도로 계산하지 않는다.

다음 문구는 사용하지 않는다.

- `계획대로 진행하세요`처럼 어떤 계획인지 알 수 없는 표현
- `컨디션 안정`과 `깊은 피로`처럼 동시에 참일 수 없는 표현
- 실제 계획 단계와 다른 AI 추론 단계

### 5.1 시각 방향

시각적 역할도 화면 책임과 일치시킨다.

| 화면 | 첫 시선 | 두 번째 시선 | 피해야 할 인상 |
|---|---|---|---|
| 홈 | 오늘 예정·권고·유효 세션 중 현재 상태 | 최근 7일 요약과 최근 활동 | AI 리포트가 홈을 점유하는 인상 |
| 피트니스 | 장기 훈련 부하 추세 | 오늘 부하·회복 권고와 근거 | CTL 상승이 곧 체력 향상이라는 인상 |
| 운동 계획 | 예정 세션 | 조정 권고 → 사용자 선택 → 유효 세션 | 시스템이 계획을 몰래 덮어쓴 인상 |

홈은 한 번의 스캔 뒤 최근 활동이 바로 이어지도록 한다. 카드 높이를 고정하지는 않지만 320px 기본 글자 크기에서 권고 카드는 약 180–200px 정보 예산을 목표로 하고, 최근 활동 제목은 홈 콘텐츠 시작 후 약 360px 안에 등장시킨다.

```text
[상태 동사] 오늘 · 회복 권장
[핵심 행동] 회복 사이클 Z1 · 45분
[변경 근거] 예정 Z2 60분 · 최근 7일 부하 높음
[선택] 변경 검토 | 이유 묻기
```

시각 상태는 색만으로 구분하지 않는다.

- 예정: 중립 surface + `오늘 예정`
- 수락 전 권고: 주의색 tint + `회복 권장` + `미수락`; 현재 유효 세션에는 `현재 계획`
- 수락 후: 브랜드 강조색 + `오늘 계획 · 조정됨`
- 완료: 완료 아이콘 + 실제 수행 시간·TSS
- 데이터 불충분: 중립 surface + `부하 조정 미반영`; 경고색으로 오류처럼 과장하지 않음

피트니스에서는 장기 추세 카드와 오늘 상태 카드를 같은 높이의 경쟁 KPI처럼 만들지 않는다. 장기 추세를 주 콘텐츠로 두고 오늘 상태는 채도를 낮춘 연결 strip 또는 aside로 배치한다. 현재 CTL, 90일 변화와 미래 예측을 분리하고, 예측은 오늘 기준선 뒤의 점선과 범위 band 및 가정 문구로 표현한다.

운동 계획 상세는 `예정된 세션 → 조정 권고 → 유효 세션`을 서로 다른 카드로 보여준다. 수락 전 유효 세션은 원래 계획이고, 수락 뒤에만 권고 세션이 유효 세션으로 강조된다.

접근성·반응형 기준:

- 320px 폭에서 가로 스크롤 없이 한 열로 reflow
- CTA 최소 터치 높이 44px 목표, 두 CTA가 좁으면 세로 적층
- 200% 글자 확대에서 내용 잘림 없이 카드가 늘어남
- 상태 아이콘은 장식용이며 상태 동사를 텍스트로 제공
- 주의색·브랜드색 텍스트와 배경은 WCAG AA 대비를 확인
- 스크린리더 순서는 상태 → 행동 → 변경 이유 → 선택 → 상세 이동
- 모션 없이도 상태 전환을 이해할 수 있고, 애니메이션을 쓰면 `prefers-reduced-motion` 준수
- 구현 시 새 색·반경을 만들지 않고 ORider의 `--accent`, `--accent-soft-*`, `--color-warning`, `--bg-*`, `--line-*`, `--r-sm/md/lg/xl` 토큰을 사용
- 클릭 가능한 chevron·`자세히`·`전체 보기`는 실제 button/link semantics를 제공하고 상태 preview control은 `aria-pressed`, 동적 카드는 `aria-live=polite`를 제공

### 5.2 AI 코치 분석과 피트니스의 연결

`origin/main`의 Coach PMC·Rider Insight 대형 카드는 홈에서 제거하되, AI 코치의 분석 기능 자체를 피트니스로 축소·이관하지 않는다. 피트니스는 정형화된 요약과 분석 진입점을 제공하고, AI 코치는 여러 source를 엮는 심층 분석과 후속 대화를 담당한다.

- PMC Insight 요약: 피트니스 오늘 상태 strip의 source freshness, Form·CTL·ATL과 7일 변화에 사용
- Rider Insight 요약: 피트니스 수행 능력 프로필의 종목·지속시간별 W/kg, percentile과 confidence에 사용. origin/main 기준 Rider Insight가 지원하지 않는 종목은 억지로 일반화하지 않고 unavailable로 처리한다.
- 월간 회복·목표 격차 코칭 report: 피트니스의 장기 진단 상세 또는 질문 shortcut으로 사용
- 처방 이행 대조: “계획을 얼마나 잘 지켰는가”를 단일 점수로 만들지 않고 계획/실제 시간·TSS·강도대·coverage 사실로 표시
- AI 코치: 위 요약들의 관계, 변화 원인, 비교 기간, 목표 영향과 다음 질문을 탐색하는 전체 분석 문서를 유지

PMC·Rider snapshot은 피트니스 전체 시계열과 목표일 예측의 정본을 대체하지 않는다. 해당 카드가 가진 snapshot ID와 source 상태만 재사용하고 장기 차트는 피트니스 정본을 유지한다.

피트니스의 `코치에게 묻기`는 선택 종목, 기간, 현재 `projectionId`, `factsId`와 기존 `prescriptionId + sourceRequestId` context filter를 고정한다. 질문 예시는 다음과 같다.

```text
장기 훈련 부하는 늘었는데 왜 오늘은 회복을 권장하나요?
최근 세션에서 계획보다 강했던 구간이 있었나요?
목표까지 남은 기간에 현재 주간 부하는 어떤 의미인가요?
```

## 6. 공용 Training Decision Core와 오늘 projection

홈과 피트니스의 문구를 맞추는 것만으로는 부족하다. 그러나 별도 추천 엔진을 추가하는 것도 답이 아니다. `origin/main`의 결정론적 AI 코치 코어를 공용 훈련 도메인으로 끌어내고, 홈·계획·피트니스가 소비할 작은 오늘 projection만 추가한다.

| 오늘 계획 개념 | `origin/main` 재사용 정본 |
|---|---|
| 오늘 화면 identity | `PrescriptionDTO.prescriptionId`를 포함한 `projectionId` |
| facts fingerprint | `factsId` |
| input generation | `snapshotRevision` |
| plan version | `planRevision` |
| policy version | `rulesVersion` |
| 권고 세션 | 오늘 날짜의 `PrescriptionDay` |
| 신호 부족 | `status=needs_checkin`, `requiredSignals`, signed check-in token |
| 명시적 health stop | `status=safety_blocked` |
| 계획 변경안 | `CoachChangeProposalDTO.changes[]` |
| 적용·되돌리기 | `CoachChangeReceipt`와 proposal recovery status |
| 근거 | prescription·proposal의 evidence ID와 source revision |

새 `TrainingDecisionSnapshot` 계산·저장 계층은 만들지 않는다. 기존 plan, Prescription, check-in, proposal, receipt를 join한 다음 read model만 추가한다.

```ts
interface PlanDayRef {
  weekId: string;
  dayIndex: number;
  localDate: string;
}

interface TodayTrainingDecisionProjection {
  schemaVersion: 1;
  projectionId: string;
  asOfDate: string;
  asOfInstant: number;
  timezone: string; // IANA timezone
  computedAt: number;
  scheduledProjectionValidUntil: number;
  recommendationValidUntil: number | null;
  proposalExpiresAt: number | null;
  targetDiscipline: "bike" | "run" | "swim";
  mode: "scheduled-only" | "current-recommendation" | "applied-plan";
  sourceState: "current" | "source-stale" | "partial";
  unavailableReason: string | null;

  sourceRefs: {
    factsId: string | null;
    prescriptionId: string | null;
    snapshotRevision: string | null;
    planRevision: string | null;
    rulesVersion: string | null;
    proposalId: string | null;
    receiptAuditId: string | null;
  };

  capabilities: {
    consent: "granted" | "required" | "revoked";
    prescriptionRead: "available" | "disabled" | "unavailable";
    checkIn: "available" | "disabled" | "consent-required" | "unavailable";
    proposal: "available" | "disabled" | "consent-required" | "unavailable";
    confirm: "available" | "disabled" | "consent-required" | "unavailable";
    rollback: "available" | "disabled" | "unavailable";
    explain: "available" | "disabled" | "consent-required" | "quota-exhausted" | "unavailable";
  };

  plan: {
    goalId: string;
    phase: "base" | "build" | "peak" | "taper" | "unknown";
    scheduledSessions: Array<SessionSummary & {
      dayRef: PlanDayRef;
      sessionRevision: string;
      status: "scheduled" | "completed" | "partial" | "skipped" | "postponed";
      matchedActivityId: string | null;
      matchConfidence: "exact" | "probable" | "manual" | "none";
    }>;
  } | null;

  loadAdjustment: null | {
    prescriptionStatus: "ready" | "needs_checkin" | "insufficient_data" | "safety_blocked";
    classification: "normal" | "productive_load" | "high_load" | "recovery_review_recommended" | "insufficient_data";
    reasonCodes: string[];
    recommendations: Array<{
      recommendationKey: string; // `${prescriptionId}:${localDate}`
      dayRef: PlanDayRef;
      action: "rest" | "recovery" | "follow_plan" | "modified_workout" | "reassess";
      recommendedSession: SessionSummary | null;
    }>;
  };

  healthGate: {
    state: "clear" | "stop" | "unknown";
    reasonCodes: string[];
    sourceFreshness: "current" | "missing" | "stale";
  };

  load: {
    rolling7dTss: number | null;
    rolling7dStart: number | null;
    rolling7dEndExclusive: number | null;
    calendarWeekActualTssAsOf: number | null;
    calendarWeekActualAsOfInstant: number | null;
    calendarWeekPlannedTss: number | null;
    calendarWeekStart: number | null;
    calendarWeekEndExclusive: number | null;
    targetWeekTss: [number, number] | null;
    weeklyLoadComparison: "below" | "on-target" | "above" | "unavailable";
    unavailableReason: string | null;
  };

  effectiveSessions: Array<SessionSummary & {
    dayRef: PlanDayRef;
    sessionRevision: string;
    source: "scheduled" | "proposal-applied";
  }>;

  coachCore: {
    weeklyCheckInId: string | null;
    weeklyCheckInRevision: number | null;
    requiredSignals: Array<"subjective_fatigue" | "soreness" | "pain_or_illness">;
    proposalStatus: "pending" | "applied" | "expired" | "superseded" | "consent_revoked" | "reverted" | null;
    sourceRequestId: string | null;
  };

  sources: {
    loadScopesUsed: Array<"bike" | "run" | "swim">;
    observedScopes: Array<"all" | "bike" | "run" | "swim">;
    coverage: "complete" | "partial" | "missing";
    lastActivityIngestAt: number | null;
  };
}
```

`SessionSummary`는 세션 종류, 종목, 존, 권장 시간 범위와 상세 계획을 찾을 수 있는 식별자만 포함한다. 홈은 상세 interval을 직접 소유하지 않는다. origin/main plan에는 stable session ID가 없으므로 P1은 proposal과 같은 `{weekId, dayIndex, localDate}`를 `dayRef`로 사용하고, `sessionRevision`은 target plan revision + 해당 PlanDay의 planned baseline hash로 만든다. plan reroll·day 이동·planned 값 변경 시 revision이 바뀌며 기존 projection과 proposal을 stale 처리한다. 하루에 여러 세션이 있으면 홈은 아직 완료되지 않은 다음 세션 하나를 대표로 보여주고 `외 N개`를 표시한다. 완료·부분 완료·다른 종목 수행은 `dayRef + sessionRevision`, 활동 매칭 상태와 신뢰도로 구분한다.

`projectionId`는 `factsId`, `snapshotRevision`, `planRevision`, `rulesVersion`, proposal 상태와 receipt audit ID의 정규화된 tuple에서 멱등하게 만든다. projection은 원본 Prescription·proposal·receipt를 수정하지 않으며 별도 mutable pointer를 만들지 않는다. 문자열 revision은 순서 비교하지 않고 exact equality로만 검사한다.

projection adapter는 새 threshold·상태·추천 ID를 계산하지 않는다. `classification`은 `LoadAssessment.classification`, `action`은 해당 날짜의 `PrescriptionDay.action`, `recommendationKey`는 `prescriptionId + localDate`를 그대로 mapping한다. 사용자 카피의 `계획 유지/부하 낮춤/회복/휴식 권장`은 versioned Coach rules catalog에 등록된 순수 action mapping이며 adapter 안의 독립 판정이 아니다.

`healthGate`도 별도 판정기가 아니다. 현재 revision의 active weekly check-in에서 `painOrIllness=true`면 `stop/self_reported_pain_or_illness/current`, `false`면 `clear/[]/current`로 mapping한다. 값이 생략되면 `unknown/pain_or_illness_missing/current`, active check-in 자체가 없으면 `unknown/check_in_missing/missing`, pinned revision과 다르면 `unknown/check_in_stale/stale`다. 이 값은 사용자의 자기보고를 전달할 뿐 의료적 진단이 아니다. `weeklyLoadComparison`은 실제 달력 주 TSS와 target range가 모두 있을 때만 단순 비교하고 하나라도 없으면 `unavailable`이다.

현재 `origin/main`에는 날짜·goal 기준의 “오늘 Prescription” 독립 조회·갱신 endpoint가 없다. 최근 Coach 응답이 있는 사용자만 대상으로 projection을 만들면 실험군이 Coach 사용 이력에 편향된다. 따라서 P1a 선행 계약으로 owner-scoped `getCurrentTrainingPrescription` 또는 동등한 deterministic compute/read endpoint를 추가한다.

```text
auth uid + discipline + requestId
  → 서버가 owner인 active goal과 저장된 primaryGoalId 검증
  → profile IANA timezone으로 현재 localDate 파생
  → canonical FactSet·plan·check-in revision 생성/조회
  → 기존 Prescription engine 실행(providerCalls=0, quotaConsumed=0)
  → uid + goalId + localDate + factsId + planRevision + rulesVersion로 멱등 저장/조회
```

활성 goal이 하나면 서버가 선택하고, 둘 이상이면 owner가 저장한 active `primaryGoalId`만 허용한다. 클라이언트가 goalId를 힌트로 보내더라도 서버가 파생한 primary와 exact match하지 않으면 거부한다. compute endpoint는 서버가 파생한 오늘 localDate만 허용하며 과거·미래 날짜는 별도 read-only history/preview 계약으로 분리해 proposal source가 될 수 없게 한다. timezone 또는 primary goal이 없으면 예정-only projection으로 폴백한다.

P1의 이 endpoint와 check-in·proposal·confirm은 현재 `ai-coach-policy-v4` 동의를 요구한다. 예정 계획과 원시 피트니스 facts는 동의와 무관하게 표시한다. 향후 결정론적 코어를 일반 훈련 기능으로 분리하려면 별도 purpose·consent와 owner-scoped route를 먼저 설계해야 하며, P1에서 이를 암묵적으로 가정하지 않는다.

현행 capability discovery를 그대로 반영한다. Prescription read와 `progressPlanner.read`는 결합돼 있고, check-in 노출은 현재 proposal enablement와 결합된 `prescription.checkIn`을 따른다. `progressPlanner.proposal`과 `progressPlanner.confirm`만 별도 capability다. rollback은 독립 discovery flag가 없으므로 `proposal recoveryStatus=applied`와 rollback request 가능 여부에서 파생하며, 별도 flag가 필요하면 additive capability로 추가한다. consent 상태는 capability 응답과 별도로 합성한다.

projection join은 다음 freshness 절차를 지킨다.

1. immutable Prescription과 FactSet의 `factsId/snapshotRevision/planRevision/rulesVersion`을 pin한다.
2. mutable plan, check-in, proposal recovery와 현재 canonical load/facts revision을 하나의 read-only Firestore transaction에서 읽는다.
3. pinned tuple과 현재 tuple을 exact equality로 검사한다.
4. mismatch면 한 번 bounded retry하고, 다시 달라지면 `scheduled_only/source_stale`로 폴백한다.
5. projection cache는 source tuple 전체를 key로 사용하며 current pointer처럼 취급하지 않는다.

`recommendationValidUntil`은 Prescription 권고 시한, `proposalExpiresAt`은 confirm 가능 시한이다. 이미 적용된 plan은 Prescription 만료와 무관하게 새 plan revision 또는 rollback까지 유효하다. 예정-only projection은 다음 local-day boundary나 plan revision 변경 중 먼저 오는 시점까지만 유효하다. load가 unavailable이면 0으로 채우지 않고 nullable 값과 이유를 보낸다.

### 6.1 판단 순서

```text
원래 계획
   ↓
전 종목 부하 관찰(판정 입력 아님)
   ↓
목표 종목 부하·회복 조정
   ↓
계획 유지 / 감량 권고 / 대체 권고 / 휴식 권고
   ↓
사용자 수락 또는 원계획 유지
   ↓
유효 세션
   ↓
홈·계획·피트니스가 동일 projectionId 소비
```

AI는 이 흐름 뒤에만 위치한다.

### 6.2 전 종목과 목표 종목

- P1 v1은 검증된 정본이 있는 `targetDiscipline` 부하만 자동 조정 입력으로 사용한다.
- 전 종목 부하: 전신 부하·회복 조정의 보조 입력 후보이며 P1 화면에는 자동 적용하지 않는다.
- 목표 종목 부하: 세션 종류, 존, 목표 계획
- `targetDiscipline`, 실제 판정에 사용한 `loadScopesUsed[]`, 화면·로그에서 관찰만 한 `observedScopes[]`를 분리한다.
- 종목별 source coverage가 없는 값을 임의 합산하지 않는다.
- 통합 부하 산술과 종목 간 transfer coefficient가 검증되기 전에는 `all`은 `observedScopes`에만 허용하고, 통합값으로 목표 종목 세션을 자동 교체하지 않는다.
- 통합 source가 없거나 일부 종목이 누락되면 confidence를 낮추고 그 사실을 표시한다.

`통합`과 `사이클` 값이 다르면 오류처럼 숨기지 않고 scope를 표시한다.

```text
사이클 계획 · 전 종목 부하는 함께 표시
```

### 6.3 계획과 부하·회복 조정의 우선순위

계획 원본은 보존하고 부하·회복 조정은 권고로 분리한다. 사용자가 수락하기 전에는 계획 문서를 덮어쓰지 않는다. 명시적 통증·질병 check-in처럼 별도의 `healthGate=stop` 근거가 있을 때만 운동 중단을 최우선으로 표시한다.

```text
scheduledSession -> recommendedAdjustment -> user acceptance -> effectiveSession
```

부하 상태가 악화됐는데 권고 세션 강도가 올라가는 결과는 허용하지 않는다. AI 역시 `recommendedAdjustment`나 `effectiveSession`보다 강한 행동을 제안할 수 없다.

#### 정책 수렴이 선행 조건

`origin/main`에는 이미 서로 다른 세 정책이 있다.

| 정책 | 현재 의미 | 현재 사례 Form -6.2 |
|---|---|---|
| `load-rules-v1` | Form `-10` 이상을 `normal`로 분류 | normal |
| `coach-prescription-rules-v1` | Form `-20` 이하·high load에서 초기 휴식과 Z2 회복/감량 | 원계획 유지 가능 |
| 실내 workout focus | Form `-20/-8/5` 경계와 사용자 요청으로 focus 결정 | tempo 또는 요청 보정 가능 |
| 기존 홈 recommendation | TSB `< -5` 또는 비율 `> 1.2`에서 회복 Z1 | 회복 |

따라서 강화된 AI 코치를 그대로 연결하면 모순을 없애는 것이 아니라 네 번째 화면에 세 번째 판정을 추가한다. Home 전용 `load-adjustment` 엔진을 만들지 않고 위 정책을 하나의 공용 catalog와 versioned evaluator로 수렴한다.

수렴 정책은 다음 불변식을 가져야 한다.

- Home·Fitness·Prescription이 같은 classification, reason code와 today action을 읽는다.
- 실내 세션 생성기는 `effectiveSession`의 focus를 다시 판정하지 않고 interval·FTP%·예상 TSS로 구체화만 한다.
- 부하 상태가 악화될 때 권고의 zone·duration·예상 TSS가 올라가지 않는다.
- `needs_checkin`, `insufficient_data`, `safety_blocked`를 하나의 recovery 상태로 합치지 않는다.
- TSB와 `ATL / CTL`, 주간 TSS처럼 상관된 신호를 독립 증거 수로 부풀리지 않는다.
- CTL이 낮거나 source가 오래됐으면 비율을 단독 판정 근거로 쓰지 않는다.
- zone·duration·예상 TSS 중 비교 불가능한 항목이 있으면 자동 plan proposal을 만들지 않는다.

기존 `load-rules-v1`, `coach-prescription-rules-v1`, Home recommendation과 실내 focus의 결과를 같은 fixture에서 shadow 비교한다. 사전 등록한 표본·전문가 일치·false-positive·coverage 기준을 통과한 새 immutable rules version만 active로 승격한다. 이는 의료적 안전 기준이 아니라 ORider 훈련 부하 제품 정책이다.

### 6.4 기존 proposal-confirm 재사용

별도 `AcceptTrainingAdjustmentCommand`를 만들지 않는다. `origin/main`의 다음 계약을 그대로 정본으로 사용한다.

```text
PrescriptionDTO
  → CreateCoachProposalRequest(requestId, checkInRequestId, localDates)
  → CoachChangeProposalDTO(before/after, targetRevision, evidence, expiry)
  → ConfirmCoachProposalRequest(requestId, nonce)
  → CoachChangeReceipt(beforeRevision, afterRevision, auditId)
  → plan 재조회
  → TodayTrainingDecisionProjection.effectiveSessions
```

기존 confirm transaction은 owner, consent revision, active goal, nonce, expiry, goal·plan document hash를 다시 검사한다. 같은 request는 하나의 receipt로 replay되고 경쟁 요청은 한 번만 `pending → applied`가 된다. rollback은 현재 plan이 감사된 after hash와 같을 때만 before image를 복구한다.

그러나 origin/main confirm은 새 활동 import나 피트니스 갱신 뒤의 최신 `factsId/snapshotRevision`을 canonical load source와 다시 비교하지 않는다. Home에 연결하기 전에 proposal create와 confirm 양쪽에 다음 current-source fence를 additive로 추가해야 한다.

```text
Prescription factsId/snapshotRevision pin
  → transaction에서 현재 plan/check-in/load source revision 조회
  → source tuple exact equality 검사
  → mismatch면 proposal을 stale 처리하고 confirm 거부
  → 최신 Prescription과 before/after를 다시 생성
```

2차 개정에서 필요한 additive 보강은 다음뿐이다.

- proposal source와 오늘 `projectionId` 연결
- proposal create·confirm의 canonical `factsId/snapshotRevision` current-source fence
- 원래 `planned*`를 보존하고 adjusted/effective overlay와 분리
- `keep-scheduled` 선택을 남길 별도 decline audit event
- 홈에 적합한 proposal 유효시간과 recovery endpoint
- confirm·rollback 뒤 source revision이 바뀐 projection 폐기와 재생성

현재 proposal workout은 종류·시간·TSS 중심이며 zone·interval block을 완전한 계획 정본으로 저장하지 않는다. P1은 이 표현 범위 안에서만 변경을 확정하거나, 상세 실내 세션을 적용하기 전에 proposal·plan contract를 additive 확장해야 한다. UI가 저장되지 않는 zone·block을 적용된 계획처럼 보여주면 안 된다.

홈은 nonce를 가진 확정 동작을 한 번의 가벼운 버튼처럼 위장하지 않는다. 수락 전 CTA는 `변경 검토`이며 Plan 상세에서 before/after와 근거를 확인한 뒤 confirm한다. 적용 뒤 Home은 receipt가 아니라 재조회한 plan의 유효 세션을 표시한다.

### 6.5 부하비의 의미

현재 `ATL / CTL` 비율은 TSB와 독립된 관찰값이 아니다. `TSB = CTL - ATL`이므로 낮은 CTL에서 비율이 크게 흔들릴 수 있다.

- 사용자 화면에서 `ACWR`로 표현하지 않는다.
- 필요하면 `ATL/CTL 부하비` 또는 `단기·장기 부하비`로 설명한다.
- CTL이 낮거나 데이터가 부족하면 비율을 부하·회복 조정의 단독 근거로 사용하지 않는다.
- `부상 위험` 같은 의료적·확정적 표현 대신 `부하 증가 주의`로 표현한다.

## 7. 시간 창과 단계 용어

### 7.1 `최근 7일`과 `이번 주`

두 시간 창을 반드시 분리한다. wire에는 경계를 epoch milliseconds로 저장하고 화면용 local date를 별도 파생한다. 모든 경계는 projection의 IANA timezone에서 `[startInclusive, endExclusive)`로 계산한다.

- 최근 7일: 오늘 로컬 날짜를 포함한 정확히 7개 날짜, `rolling7dStart`부터 `rolling7dEndExclusive` 직전까지
- 이번 주 실제: 월요일 00:00부터 `asOf`까지 완료 활동 합계
- 이번 주 계획: 월요일 00:00부터 다음 월요일 00:00 직전까지 계획된 합계

주간 목표와 비교할 때는 `calendarWeekActualTssAsOf`만 사용하고, 계획 합계는 별도로 표시한다. 여행 중 timezone이 바뀌면 설정 변경 시각과 `timezoneRevision`을 저장하고 다음 local-day 경계부터 새 timezone을 적용한다. 이미 봉인된 활동 일자는 기록 당시 timezone을 유지한다. legacy 사용자에게 IANA timezone이 없으면 마지막 확인된 기기 timezone을 사용하고, 그것도 없으면 `Asia/Seoul` fallback과 `timezoneSource=legacy-fallback`을 기록한다. DST 전환일도 24시간이 아니라 local calendar date bucket으로 계산한다. 늦은 import는 활동의 기록 시각과 당시 timezone을 기준으로 해당 window에 귀속시키고 현재 source revision과 `projectionId`를 갱신한다.

잘못된 예:

```text
목표 205–222 · 최근 7일 330 · 남은 0
```

개선 예:

```text
최근 7일 330 TSS
이번 주 205 TSS / 권장 205–222 TSS
```

상한을 넘었다면 `남은 0` 대신 행동 방향을 표시한다.

```text
이번 주 330 TSS / 권장 205–222 TSS
권장 상한보다 108 TSS 높음 · 추가 부하 보류
```

### 7.2 단계 taxonomy

다음을 별도 필드로 유지한다.

- `planPhase`: base / build / peak / taper / unknown
- `loadClassification`: normal / productive_load / high_load / recovery_review_recommended / insufficient_data
- `prescriptionAction`: rest / recovery / follow_plan / modified_workout / reassess
- `healthGateState`: clear / stop / unknown
- `weeklyLoadComparison`: below / on-target / above / unavailable

`recovery`를 계획 단계처럼 사용하지 않는다. AI가 남은 주수만으로 plan phase를 다시 추론하지 않는다. 사용자에게 보이는 단계는 계획 정본의 `planPhase` 하나다.

## 8. AI 분석·설명과 freshness

홈은 AI narrative를 표시하거나 캐시하지 않는다. reason code를 제품 카피로 렌더하고, 사용자가 `코치에게 이유 묻기` 또는 더 넓은 분석 질문을 선택할 때 AI 코치의 분석 작업공간으로 이동한다. 이 제한은 홈의 정보 밀도에 관한 것이지 AI 코치의 분석 범위를 축소하는 결정이 아니다.

질문은 raw query string이 아니라 origin/main의 strict Progress Planner context filter에 고정한다. 별도 signed token은 P1 필수 계약으로 추가하지 않는다.

```ts
interface CoachDecisionContext {
  projectionId: string;
  factsId: string;
  prescriptionId: string;
  sourceRequestId: string;
  planRevision: string;
  rulesVersion: string;
  recommendationValidUntil: number;
}
```

표시·mutation 규칙:

1. `contextFilters.progressPlanner={prescriptionId, sourceRequestId}`가 owner 검증을 통과하고 context의 source tuple과 현재 projection이 일치할 때만 `현재 판단 설명`으로 표시한다.
2. 불일치·만료 시 답변을 `이전 설명`으로 표시하고 현재 계획을 바꾸는 proposal·confirm·rollback UI를 모두 비활성화한다.
3. 과거 Coach History의 Prescription block도 무조건 read-only이며 `최신 계획에서 보기`만 제공한다.
4. 설명 실패·quota 소진은 예정 계획과 Prescription을 바꾸지 않는다. 동의 철회는 Coach mutation을 중단하고 proposal을 `consent_revoked`로 만들 수 있지만 예정 계획과 이미 적용된 plan을 숨기지 않는다.
5. 코치는 pinned evidence 밖의 TSS·TSB·시간·zone을 새로 만들거나 effective session보다 강한 처방을 제시하지 않는다.
6. 같은 `projectionId + locale + promptVersion` 설명 요청은 dedupe할 수 있지만, 다른 projection의 본문을 현재 설명으로 재사용하지 않는다.
7. Home의 기존 `useTodaysNarrativePeek`와 최근 14일 stale fallback은 오늘 카드 경로에서 제거한다.

예시:

```text
이전 코치 설명 · 8월 14일 21:10 기준
이후 계획 또는 활동이 바뀌어 읽기 전용으로 표시합니다.
[최신 판단을 코치에게 묻기]
```

## 9. 실패 상태

| 실패 | 홈 | 피트니스·계획 |
|---|---|---|
| projection 로딩 중 | `오늘 예정`만 표시 | 계산 시각과 로딩 상태 표시 |
| Prescription 없음·만료 | 자동 조정은 숨기고 `오늘 예정`만 표시 | `부하 조정 미반영`과 마지막 계산 시각 표시 |
| source 일부 누락 | 자동 조정은 숨기고 예정 계획만 표시 | 사용 가능한 범위와 누락 source 표시 |
| Coach 동의 없음·철회 | 예정 계획 유지, Coach CTA 숨김 | capability별 `동의 필요` 표시 |
| Prescription/read flag off | 예정 계획 유지, 조정 상태 숨김 | 기능 준비 중으로 표시하되 데이터 부족으로 표현하지 않음 |
| check-in capability off | 기존 Prescription만 표시, `몸 상태 확인` 숨김 | 필요한 신호와 기능 비활성 상태 분리 표시 |
| proposal/confirm capability off | 권고는 읽을 수 있으면 표시하되 변경 CTA 숨김 | 계획 상세에서 현재 기능 상태 표시 |
| proposal 만료·stale revision | 예정 계획 유지, `변경안을 다시 확인하세요` | recovery 후 새 before/after 제시 |
| confirm 경쟁·실패 | 적용됐다고 낙관 표시하지 않고 계획 재조회 | receipt 또는 현재 plan을 재조회해 확정 |
| 생성형 설명 실패·quota 소진 | 영향 없음 | 구조화 reason 유지, 설명 CTA만 제한 |
| stale Coach 답변 | 노출 안 함 | History에서 read-only로만 표시 |
| 여러 활성 목표 + primary 미설정 | 오늘 카드를 노출하지 않고 `기준 목표를 선택하세요` 표시 | primary goal 설정을 완료하기 전 자동 조정 금지 |

조정 권고는 `recommendationValidUntil`, confirm은 `proposalExpiresAt`, 예정-only 화면은 `scheduledProjectionValidUntil`을 각각 따른다. 권고나 proposal이 만료돼도 이미 적용된 plan은 새 plan revision 또는 rollback까지 유지한다. 부하 판단 불완전이나 capability 비활성만으로 계획을 자동 변경하지 않으며, 새로 더 강한 처방도 만들지 않는다.

primary goal은 다음 규칙으로 결정한다.

1. 활성 목표가 하나면 해당 목표를 사용한다.
2. 둘 이상이면 사용자가 저장한 `primaryGoalId`만 사용한다.
3. `primaryGoalId`가 없거나 비활성 목표를 가리키면 자동 선택하지 않고 설정을 요구한다.

## 10. 관측성

개인 식별 정보와 원문 narrative를 제외한 이벤트를 기록한다.

```text
training_decision_impression
  projectionId
  factsId
  prescriptionId
  snapshotRevision
  planRevision
  rulesVersion
  proposalId
  receiptAuditId
  targetDiscipline
  loadScopesUsed
  observedScopes
  loadClassification
  prescriptionAction
  healthGateState
  weeklyLoadComparison
  recommendationDisposition
  effectiveSessionSource: scheduled | proposal-applied
  reasonCodes
  planPhase
  projectionAgeBucket
  prescriptionReadCapability
  proposalCapability
  confirmCapability
  explainCapability
  surface: home | fitness | plan

training_decision_action
  projectionId
  action: open-plan | start | check-in | review-proposal | confirm | keep-scheduled | rollback | ask-coach
  outcome: success | unavailable | stale | rejected | failed
```

운영 지표:

- 화면 간 `projectionId`·source tuple 불일치율: 목표 0
- stale AI 현재 영역 노출률: 목표 0
- 정본과 클라이언트 fallback 판정 불일치율
- 부하·회복 조정 권고율, 수락률과 조정 후 세션 완료율
- projection 조합·조회 지연
- 홈 compact 카드의 `세션 보기` 또는 `운동 시작` 전환율
- 카드 노출군과 미노출군의 최근 활동 첫 도달시간
- 카드 숨김·무시율과 계획 조정 거부·수정률
- 계획 세션 시작·완료율과 다른 종목 수행률
- 모순·부정확 신고율
- “오늘 행동과 변경 여부를 이해했다” 5초 테스트 성공률과 신뢰 설문

장문 체류시간이나 AI 재분석 클릭률은 성공 지표로 사용하지 않는다.

compact 카드 존치는 4주 제한 실험으로 검증한다. 활성 계획 사용자만 대상으로 `compact 카드`와 `카드 없음 + 계획 바로가기`를 비교한다. 계획 세션 시작·완료율이 유의미하게 개선되지 않거나, 최근 활동 첫 도달시간·무시율·신뢰 지표가 악화되면 compact 카드도 제거한다.

## 11. 단계별 적용

### P0 — 홈 신뢰 회복

- 홈의 장문 AI 분석과 `다시분석` 제거
- 기존 다중 source 합성으로 만든 자동 조정 카드는 홈에서 제거
- 기존 카드 자리에는 작은 `오늘 계획 보기` 링크만 두고 예정-only compact 카드도 아직 전면 출시하지 않음
- `최근 7일`과 `이번 주` 라벨 및 집계 분리
- stale 또는 freshness 불명 AI 본문을 현재 결론에서 차단
- `남은 0`을 초과량 또는 추가 부하 보류 카피로 교체
- 피트니스의 독립 `계획대로` 결론을 제거하고, 공용 projection 전에는 장기 부하 추세와 원시 상태만 표시

P0는 자동 조정의 정확도를 개선하는 단계가 아니라 모순되는 주장을 제거하는 단계다. 동일 source tuple을 보장할 수 없으므로 `회복으로 조정됨` 같은 최종 실행안은 노출하지 않는다.
현재 `getTodaysWorkout`의 `duration`, `tss`, `workoutType`은 서버 조정 결과와 primary goal fallback이 섞일 수 있으므로 P0 예정 세션의 source로 사용하지 않는다.

### P1a — 공용 projection과 정책 shadow 검증

- 새 추천 엔진 대신 plan + `PrescriptionDTO` + weekly check-in + proposal recovery를 join하는 `TodayTrainingDecisionProjection` adapter 도입
- owner-scoped deterministic `getCurrentTrainingPrescription` compute/read 계약과 갱신·멱등·TTL·현재 선택 규칙 구현
- proposal create·confirm에 canonical load/facts current-source fence 추가
- 원래 계획, Prescription 권고, proposal pending/applied/reverted와 유효 세션을 source revision으로 연결
- origin/main의 결합 관계를 유지해 Prescription/read, check-in/proposal, confirm을 fail-closed로 연결하고 rollback은 recovery status에서 파생
- Home·Fitness·Plan이 같은 `projectionId`, `factsId`, `prescriptionId`, `planRevision`, `rulesVersion` tuple을 소비
- 생성형 질문에는 owner-verified Progress Planner context filter를 전달하고 Home의 stale narrative 경로 제거
- `targetDiscipline` 한 종목의 부하만 첫 자동 조정 후보로 사용하고 통합 scope는 관찰 전용으로 유지
- 기존 Home recommendation, `load-rules-v1`, Prescription rules, 실내 focus를 동일 fixture에서 shadow 비교
- 사용자 노출 전 최소 표본 기간·건수, disagreement review, 훈련 전문가 표본 판정과의 허용 오차, recovery false-positive 상한, coverage와 capability unavailable 비율을 사전 등록
- 기준 미통과 시 Prescription은 기존 Coach surface에서만 유지하고 Home에는 예정 계획만 표시

### P1b — capability 기반 제한 사용자 실험

- 사전 등록한 P1a 기준을 통과한 새 immutable Coach rules version만 active로 승격
- P1은 `ai-coach-policy-v4` 동의 사용자만 조정 실험 대상에 포함
- backend Prescription/read, check-in/proposal, confirm과 web runtime flag가 해당 행동에 필요한 상태일 때만 CTA 노출
- compact 카드의 수락 전 CTA는 `변경 검토`; Plan에서 기존 proposal before/after 확인 후 confirm
- `원래 계획 유지`는 decline audit를 남기고 plan을 변경하지 않음
- P1 MVP는 오늘 예정 세션이 정확히 1개인 활성 계획 사용자만 대상으로 제한
- 복수 세션이면 자동 조정을 숨기고 `오늘 N개 예정 · 계획에서 보기`만 표시
- capability 또는 동의가 꺼지면 실험 대상이어도 예정 계획으로 즉시 폴백
- 실험 A에서 `예정-only compact`와 `카드 없음 + 계획 바로가기`를 비교해 Home launcher 자체의 가치를 검증
- 실험 B에서 실험 A의 launcher 가치가 확인된 사용자 중 `조정 권고 compact`의 추가 실행·신뢰 효과를 비교

정책 승격 기록은 새 Home 전용 `load-adjustment` 정책이 아니라 공용 Coach rules catalog의 immutable version, 사전 등록 gate hash, evidence report, 제품 책임자와 훈련 전문가 승인, rollback target을 보존한다. 승격 전 shadow 결과는 Home에 노출하지 않는다.

### P2 — 실행 폐루프와 개인화

- `운동 시작 → 완료 → 계획 대비 → 피트니스 반영` 폐루프
- 수락한 실내 사이클 세션에 Prescription·proposal identity를 영속화하고 기존 구간·강도대 이행 대조에 연결
- 복수 세션의 개별 조정·수락, 부분 완료, 다른 종목 수행, 건너뜀·연기·수동 매칭 지원
- 충분한 센서·주관 데이터가 있을 때만 수면, HRV, 안정시심박, 통증·질병 check-in 반영
- 개인별 회복 반응을 이용한 임계값 보정
- 사용자가 권고를 수정·되돌리고 원계획과 고급 감사 이력을 확인하는 흐름

```ts
interface SessionExecutionLink {
  schemaVersion: 1;
  executionId: string;
  status: "reserved" | "started" | "linked" | "invalidated";
  scheduledSessionId: string; // P2에서 PlanDay에 추가하는 stable server ID
  legacyDayRef: PlanDayRef;
  scheduledSessionRevision: string;
  planRevision: string;
  projectionId: string;
  prescriptionId: string | null;
  prescriptionValidFrom: string | null;
  proposalId: string | null;
  proposalAfterRevision: CoachTargetRevision | null;
  receiptAuditId: string | null;
  activityId: string | null;
  activityRevision: string | null; // P2에서 활동 ingest/update에 추가하는 authoritative revision
  discipline: "bike" | "run" | "swim";
  startedAt: number | null;
  linkedAt: number | null;
  createdAt: number;
  updatedAt: number;
  idempotencyKey: string;
  matchMethod: "explicit-start" | "manual" | "legacy-time-window";
  matchConfidence: "exact" | "manual" | "probable";
}
```

P2 시작 전에 PlanDay에 stable `scheduledSessionId`를 additive로 추가하고, 기존 계획은 `legacyDayRef + planned baseline hash`로 backfill한다. proposal target에도 이 ID를 추가하되 기존 `weekId + dayIndex + localDate`를 호환 기간 동안 유지한다. 활동에는 수정·재수집마다 바뀌는 authoritative `activityRevision`을 먼저 도입한다. 이 두 revision 정본이 없으면 execution link와 자동 완료를 출시하지 않는다.

start 시점에 plan·Prescription·proposal tuple을 transaction으로 고정하고 activity 저장에 `executionId`를 전달하거나 서버 attach를 명시적으로 수행한다. `proposalAfterRevision`은 origin/main의 `CoachTargetRevision` 객체를 그대로 저장하고 Prescription 시점은 DTO의 `validFrom`을 인용한다. 한 activity는 한 execution에만 exact link될 수 있고 한 execution도 exact activity 하나만 가진다. manual 재연결·해제는 감사 기록을 남긴다.

자동 완료는 `explicit-start/exact` 또는 사용자가 확인한 `manual` 링크에만 허용한다. 시간창 추정은 `probable`로 표시하고 계획을 자동 완료하지 않는다. origin/main의 block adherence는 현재 활동 시작 전 24시간의 최신 Prescription artifact를 찾는 heuristic을 사용하므로, P2에서 explicit `SessionExecutionLink` lookup을 우선하는 adapter로 교체한다. 우선 실내 사이클·power coverage가 충분한 세션에만 사용하며, 비교 불가능한 센서 누락을 0점이나 실패로 환산하지 않는다.

## 12. 수용 기준

### 제품·카피

- 홈에는 장문 AI, 날씨, 영양, 장기 전망이 표시되지 않는다.
- 활성 계획이 없는 사용자에게 구체적인 맞춤 워크아웃을 단정하지 않는다.
- 홈의 상태 동사는 `계획 유지 / 부하 낮춤 권장 / 회복 권장 / 휴식 권장` 중 하나다.
- `계획대로`처럼 최종 행동이 불명확한 문구를 사용하지 않는다.
- 최근 7일 값과 달력 주간 값을 각각 정확한 라벨로 표시한다.
- 상한 초과를 `남은 0`으로 축하하지 않고 초과량과 행동을 표시한다.
- 5초 이해 테스트에서 사용자가 오늘 예정 세션, 조정 권고 여부, 다음 행동을 맞힌다.
- compact 카드가 최근 활동 접근시간을 악화시키지 않고, 계획 시작·완료율을 개선한다.
- 실험 kill criterion에 도달하면 compact 카드를 완전 삭제한다.
- 실험 시작 전에 표본수, 최소 검출 효과(MDE), 신뢰구간, 5초 이해 성공률 기준과 최근 활동 접근시간·신뢰 설문의 허용 악화폭을 문서화한다. 기준을 사후 변경하지 않는다.

### P0 계약

- Home·Mobile Fitness에서 기존 장문·stale narrative와 독립 `계획대로` 판정을 제거한다.
- 예정 계획 바로가기는 plan 원문만 인용하며 조정이 반영됐다고 주장하지 않는다.
- projection이나 Coach capability가 없어도 최근 활동·피트니스 장기 추세 접근은 유지된다.
- 예정-only compact의 존치 가설은 P1b 실험 A 전에는 전면 출시로 확정하지 않는다.

### P1/P2 판정 계약

- 같은 사용자·종목·시점의 홈, 피트니스, 계획이 같은 `projectionId`, `factsId`, `prescriptionId`, `planRevision`, `rulesVersion` tuple을 소비하고 진단 로그로 확인할 수 있다.
- 수락 전에는 홈과 피트니스의 조정 권고 종류·존·시간·reason code가 일치하고, 원래 예정 세션과 구분된다.
- 수락 후에는 홈·피트니스·계획의 `effectiveSession` 종류·존·시간과 applied receipt·plan revision이 일치한다.
- 부하 상태가 악화될 때 조정 권고의 zone·duration·예상 TSS가 올라가지 않는다.
- 계획이 고강도여도 disposition이 `replaced` 또는 `rest-recommended`이면 AI가 이를 뒤집지 않는다.
- 통합 신호와 목표 종목 신호가 다를 때 적용 scope, coverage, confidence와 조정 이유를 표시한다.
- 계획 원본, 조정 권고, 사용자 수락 결과와 유효 세션이 서로 덮어쓰이지 않는다.
- P1 단일 세션 대상은 완료 여부를 `dayRef + sessionRevision`으로 구분하고, 복수 세션 사용자에게 자동 조정 compact를 노출하지 않는다.
- P2에서는 하루 복수 세션과 완료·부분 완료·건너뜀·연기를 stable `scheduledSessionId` 단위로 구분한다.
- Coach 동의 철회나 capability 비활성은 `insufficient_data`로 분류하지 않으며 예정 계획을 숨기지 않는다.
- proposal 적용·rollback 후에는 receipt와 재조회한 plan이 같은 `effectiveSession`으로 projection된다.
- 생성형 설명은 pinned source tuple 밖의 수치·처방을 현재 판단으로 만들지 못한다.

### freshness

- 현재 `330 TSS`와 과거 AI의 `440 TSS`가 현재 영역에 함께 표시되지 않는다.
- stale 또는 freshness 불명 narrative는 홈에 표시되지 않는다.
- 늦은 활동 import, 활동 삭제·TSS 수정, 목표·프로필 변경 후 새 projection으로 함께 전환한다.

### 테스트

- readiness 경계값과 낮은 CTL 케이스를 테이블 테스트한다.
- IANA timezone, DST, 자정과 월요일 경계에서 rolling 7일과 calendar week를 검증한다.
- 다중 목표, 종목 전환, 전 종목·목표 종목 신호 충돌을 검증한다.
- legacy AI cache, 일일 생성 제한, AI 실패에서도 예정 계획과 현재 구조화 판정을 유지한다.
- 브라우저 E2E에서 같은 seeded source tuple로 홈·피트니스·계획의 카피가 모순되지 않음을 검증한다.
- projection 조합 중 활동 import·삭제·TSS 수정·goal reroll 경쟁을 검증한다.
- source revision이 바뀐 뒤 오래된 projection과 proposal이 현재로 노출·확정되지 않는지 검증한다.
- 기존 proposal-confirm 재시도·중복 전달·stale plan revision에서 receipt와 audit가 정확히 한 번만 생성되는지 검증한다.
- 동일 source tuple의 projectionId 멱등성과 revision 불일치 거부를 검증한다.
- zone·duration·예상 TSS의 단조성을 property-based test로 검증한다.
- summary 성공·timeseries 실패 같은 partial-write fixture를 검증한다.
- offline Firestore cache, 계정 전환, 인증 만료에서 이전 사용자의 결정을 노출하지 않는다.
- 신규 Functions/구버전 Hosting과 구버전 Functions/신규 Hosting 양방향 version skew를 검증한다.
- Android·iOS의 기존 `getTodaysWorkout` 역직렬화와 운동 실행이 additive 계약 도입 후에도 유지된다.
- shadow Coach rules가 active catalog version과 불일치할 때 Home에 노출되지 않고, 제품 책임자·훈련 전문가 승인과 rollback 이력이 보존되는지 검증한다.
- 결합된 Prescription/read, check-in/proposal, 별도 confirm, recovery-derived rollback, explain 상태와 동의 철회·quota 소진 matrix에서 예정 계획 fallback과 CTA 노출을 검증한다.
- historical Coach answer에서는 create/confirm/rollback mutation이 불가능한지 검증한다.
- 실내 사이클 explicit execution link는 block adherence로 이어지고, probable·센서 불충분 링크는 자동 완료나 점수화로 이어지지 않는지 검증한다.

## 13. Go / No-Go

다음 조건을 만족하지 못하면 홈의 `오늘의 계획` 노출은 No-Go다.

- 자동 조정 권고를 표시하려면 현재 Prescription과 계획의 동일한 source revision tuple을 보장한다.
- stale 숫자와 처방의 홈 노출률을 0으로 만든다.
- 계획 원본과 부하·회복 조정 권고를 분리하고 사용자 수락 없이 계획을 덮어쓰지 않는다.
- 활성 계획이 없는 사용자에게 임의 처방을 만들지 않는다.
- CTA 명칭과 실제 기능이 일치한다.
- primary goal과 source revision이 결정적이지 않으면 compact 자동 조정 카드를 숨긴다.
- Home 전용 판정 엔진을 만들지 않는다. 공용 Coach rules가 사전 등록한 표본·전문가 일치·false-positive·coverage 기준을 통과하고 active immutable version으로 승격되기 전에는 compact 조정 권고가 No-Go다.
- 현재 Prescription을 Coach 사용 이력과 무관하게 생성·조회하는 owner-scoped deterministic endpoint와 confirm current-source fence가 없으면 P1 조정 노출은 No-Go다.
- P1은 기존 AI Coach 동의가 있는 사용자만 조정 대상이다. 동의가 없거나 backend Prescription/read·check-in/proposal·confirm capability와 web runtime flag 중 필요한 하나라도 없으면 해당 CTA를 숨기고 예정 계획으로 폴백한다.
- 생성형 답변 quota·장애를 예정 계획과 이미 적용된 plan의 가용 조건으로 삼지 않는다.
- 4주 실험에서 계획 실행 가치가 확인되지 않거나 홈 핵심 과업이 악화되면 compact 카드도 제거한다.

`운동 시작` 또는 완료 비교를 제공할 계획이 없다면 계속 `오늘의 계획`으로 부른다. 실행 폐루프가 완성된 뒤 `오늘의 워크아웃` 명칭을 다시 검토한다.

## 14. 구현 경계

이 개선은 공개 웹 UI만의 변경으로 끝나지 않는다.

- `orider-web`: `DashboardPage`, `MobileFeedPage`, `MobileFitnessPage`의 기존 `TodaysWorkoutCard` 제거·교체, 홈 `CoachQuestionLauncher`의 대형 Insight 제거, `CoachPrescription`·`coachClient`의 headless proposal flow 재사용, Fitness mirror와 pinned Coach CTA
- `orider-g1-web/functions`: `coach/prescription`, `weekly-check-in`, `proposal`, `load-analysis`의 정책 수렴과 Today projection adapter
- `orider-g1-web/services/ai-api`: owner-verified Progress Planner context filter, 현재 설명 pinning, historical read-only 계약
- `orider-g1-app`: 기존 `getTodaysWorkout` DTO 호환, 신규 decision의 additive 소비, Android·iOS 운동 실행 회귀 검증
- Firestore: 새 독립 decision 정본이 아니라 기존 Prescription·proposal·receipt와 plan을 참조하는 projection cache 또는 callable 응답
- 계약 관리: 웹·Functions·앱에 복제된 타입을 schema/codegen 또는 교차 저장소 contract test로 검증

Functions와 Hosting은 별도 배포 표면이다. 계약은 다음 순서로 전환한다.

1. Today projection을 기존 callable 의미를 바꾸지 않는 additive 계약으로 Functions에 배포
2. schema validation, capability kill switch, TTL과 source revision 검사 준비
3. 서버가 구버전 필드와 신규 projection을 함께 제공
4. 웹·앱의 구버전/신규 버전 조합을 version-skew matrix로 검증
5. 클라이언트 dual-read와 공용 정책 shadow comparison 도입
6. mismatch 허용치를 넘으면 즉시 legacy 표시로 되돌리는 feature flag 설정
7. 화면을 신규 projection으로 점진 전환
8. Home legacy AI cache 경로를 제거하고 History를 read-only로 전환
9. 호환 기간과 rollback 조건을 충족한 뒤 구버전 클라이언트 계산 제거

최소 rollback 조건은 projection 불일치 급증, capability 오판, 앱 역직렬화 실패, stale 본문·mutation UI 노출, 조정 권고 강도 단조성 위반이다. `origin/main` 포함 여부는 배포 완료가 아니다. Functions, AI API/Cloud Run, Hosting의 revision·traffic·runtime flag를 각각 검증해야 사용자 노출 완료로 본다.

## 15. 열린 질문

다음은 이 문서에서 확정한 결정이다.

- 여러 활성 목표에서는 사용자 지정 `primaryGoalId` 없이는 자동 선택하지 않는다.
- 부하·회복 조정은 자동 계획 변경이 아니라 사용자에게 제시하는 권고다.
- CTL/ATL/TSB만으로 의료적 안전이나 부상 위험을 단정하지 않는다.
- P0에서는 자동 조정 compact 카드를 출시하지 않고 모순되는 장문을 제거한다.
- P1의 revision-pinned projection과 공용 정책 승격 이후에만 compact 자동 조정을 실험한다.

구현 시작 전 다음 세부 결정을 확정해야 한다.

1. 홈 CTA가 실제 `운동 시작`까지 제공할지, `세션 보기`로 끝날지
2. 전 종목 부하의 합산 단위, transfer coefficient와 최소 데이터 coverage
3. 활성 계획이 없는 사용자에게 상태만 보여줄지, 홈에서는 완전히 숨길지
4. P1 이후 결정론적 부하 조정을 일반 훈련 기능으로 승격해 생성형 AI Coach와 purpose·consent를 분리할지
5. `planned*` 원본과 현재 adjusted overlay를 adapter에서 어떻게 보존하고 rollback할지
6. Home proposal의 expiry, recovery와 `원래 계획 유지` decline audit 보존 기간
7. Progress Planner context filter에 projection source tuple을 추가할 범위와 History read-only 전환 범위
8. projection TTL, 여행 중 timezone 변경과 늦은 sync의 세부 귀속 정책
9. 공용 Coach rules 임계값과 상한 정책의 제품 책임자·전문가 검토 방식
10. compact 카드 위치, 접기·숨기기 개인 설정과 4주 실험 표본 기준

## 16. 리뷰 체크리스트

- [ ] 홈의 핵심 과업 정의에 동의하는가?
- [ ] 장문형 워크아웃을 홈에서 제거하는 결정에 동의하는가?
- [ ] 활성 계획이 없는 사용자에게 임의 처방을 하지 않는가?
- [ ] 홈·계획·피트니스의 책임이 겹치지 않는가?
- [ ] 계획 원본, 조정 권고, 사용자 수락 결과가 분리되는가?
- [ ] 부하 상태가 악화될 때 조정 권고가 강해지지 않는가?
- [ ] 전 종목과 목표 종목 신호를 구분하는가?
- [ ] 최근 7일과 달력 주간의 기간이 명확한가?
- [ ] plan phase, readiness, load state가 분리됐는가?
- [ ] AI가 판정자가 아니라 설명자로 제한됐는가?
- [ ] stale 또는 freshness 불명 AI가 현재 결론을 오염시키지 않는가?
- [ ] P0가 서버 대규모 재구축 없이도 신뢰 문제를 우선 줄이는가?
- [ ] 수용 기준이 브라우저에서 관찰 가능한가?

## 17. 독립 리뷰 기록

17.1~17.5는 1차 문서에 대한 당시 기록이다. 2차 개정에서 독립 snapshot·pointer·수락 command를 제거했으므로 해당 기술 승인은 superseded되며 현재 승인 상태를 뜻하지 않는다.

### 17.1 1차 제품 리뷰

판정은 `수정 필요`였다. 방향은 승인했지만 다음 차단 항목을 지적했다.

- P0와 P1의 snapshot 출시 순서 모순
- 계획 정본과 서버 조정 결과의 소유권 중복
- 부하 지표를 의료적 안전 판정처럼 표현한 문제
- CTL 증가를 체력 향상으로 단정한 카피
- 복수 세션·부분 완료·다른 종목 수행 누락
- compact 카드 존치 가설과 kill criterion 부재
- 실패 상태의 선택적 처리와 제품 성공 기준 부족

반영 결과:

- P0는 장문과 모순 제거만 수행하고 자동 조정 compact 카드는 P1 atomic snapshot 뒤로 이동했다.
- `scheduled / recommended / accepted / effective` 소유권을 분리했다.
- `안전 판정`을 `부하·회복 조정`으로 낮추고 health gate를 별도 분리했다.
- CTL 카피를 `장기 훈련 부하 증가`로 수정했다.
- 세션 배열, 완료 상태, 활동 매칭과 사용자 수락 계약을 추가했다.
- 4주 제한 실험, 최근 활동 접근 guardrail과 완전 삭제 기준을 추가했다.
- snapshot 부재·partial·만료의 기본 동작을 하나로 확정했다.

### 17.2 1차 기술 리뷰

판정은 `수정 필요`였다. 다음 구현 차단 항목을 지적했다.

- 기존 비동기 source 합성으로는 P0 원자성을 보장할 수 없음
- source generation, partial write, TTL과 decision 멱등성 계약 부재
- 더 보수적인 권고의 계산 가능한 순서 부재
- 통합 scope와 목표 종목 scope의 의미 혼합
- rolling 7일·달력 주간의 wire 경계 부족
- 다중 목표의 비결정적 선택
- Android·iOS `getTodaysWorkout` 소비자와 version skew 누락
- AI cap 재사용, feature flag, rollback, 경쟁 상태 테스트 부족

반영 결과:

- P0 자동 조정을 제거하고 P1 additive snapshot 이후에만 활성화한다.
- generation barrier, watermarks, 상태, TTL, invalidation과 멱등 ID를 계약에 추가했다.
- load state별 zone·duration 상한과 단조성 검사를 추가했다.
- `targetDiscipline`과 `loadScopesUsed[]`, coverage, confidence를 분리했다.
- `[startInclusive, endExclusive)` 시간 경계와 timezone·late import 정책을 추가했다.
- `primaryGoalId`가 없으면 자동 선택하지 않도록 확정했다.
- 앱 호환, 양방향 version skew, feature flag, kill switch와 rollback 조건을 추가했다.
- AI 동일 결정 dedupe와 cap 도달 시 구조화 fallback을 추가했다.

### 17.3 최종 제품 리뷰

판정은 `승인`이다.

- compact 존치는 확정이 아니라 사전 기준을 가진 제한 실험으로 정리됐다.
- 예정·권고·수락·유효 세션의 소유권과 P1 최소 수락 흐름이 일치한다.
- P1a shadow 검증과 P1b 제한 실험을 분리하고, active immutable policy 승격 전 사용자 노출을 금지했다.
- 복수 세션은 P1 자동 조정 대상에서 제외하고 P2 확장 범위로 명확히 나눴다.

### 17.4 최종 기술 리뷰

판정은 `승인`이다.

- immutable decision과 mutable pointer, input vector hash, transaction/CAS publish 계약이 일치한다.
- 수락 command의 idempotency, authoritative precondition과 감사 이벤트가 정의됐다.
- epoch milliseconds 경계, IANA timezone revision, DST·여행·late import 재현 계약이 정리됐다.
- P1 판정 scope와 관찰 scope, policy promotion·rollback의 atomic invalidation이 분리됐다.

### 17.5 시각 리뷰

첫 판정은 `수정 필요`, 수정 후 최종 판정은 `승인`이다.

- 수락 전 권고가 이미 확정된 것처럼 강조되던 문제를 없애고 현재 유효 세션에 `현재 계획`을 표시했다.
- ORider의 청록 accent, 배경·선·8/12/16px 반경 토큰으로 시각 언어를 맞췄다.
- 320px 권고 카드를 약 188px로 줄이고 최근 활동이 초기 화면에서 이어지도록 했다.
- CTL 실적과 예측을 실선·오늘 기준선·점선·범위 band로 분리했다.
- `aria-pressed`, `aria-live`, focus 표시, 실제 button semantics와 44px 터치 높이를 반영했다.

1차 문서의 제품·기술·시각 blocker는 당시 해소됐다. 아래 17.6은 AI Coach origin/main 계약을 반영한 2차 개정의 별도 재리뷰 기록이다.

### 17.6 2차 개정 제품·기술 리뷰

2차 개정은 `orider-web origin/main@31de866`, `orider-g1-web origin/main@c870f97e`를 다시 대조했고 최종 판정은 제품·기술 모두 `승인`이다.

1차 재리뷰에서 다음 blocker가 발견됐다.

- 최근 Coach 대화를 거치지 않은 사용자를 위한 현재 Prescription 생성·조회 경로 부재
- 새 활동·피트니스 갱신 뒤 stale `factsId/snapshotRevision`으로 proposal confirm 가능
- 실제 consent·capability 결합과 문서 계약 불일치
- projection adapter 안에 새로운 load·health 상태 판정이 생길 위험
- stable session identity와 execution/adherence 연결 계약 부재
- AI 코치를 확정 처방의 설명자로만 축소한 역할 정의

반영 결과:

- owner·primary goal·profile timezone·현재 local date를 서버가 파생하는 deterministic current Prescription endpoint를 P1 선행조건으로 추가했다.
- proposal create·confirm에 canonical load/facts current-source fence를 추가하고 source mismatch 시 stale 거부하도록 했다.
- P1은 현재 `ai-coach-policy-v4` 동의 사용자만 대상으로 하며 Prescription/read, check-in/proposal, confirm과 recovery-derived rollback의 실제 capability 결합을 반영했다.
- `LoadAssessment.classification`, `PrescriptionDay.action`, weekly check-in `painOrIllness`를 exact mapping하고 adapter의 독립 threshold를 금지했다.
- P1은 `dayRef + sessionRevision`, P2는 additive stable `scheduledSessionId + activityRevision`을 사용하며 explicit execution link를 adherence 정본으로 삼았다.
- AI 코치를 활동·수행능력·부하·회복·목표·처방 이행을 연결하는 심층 분석 작업공간으로 복원하고, 계획 변경만 proposal/confirm 경계로 제한했다.
- P0는 장문 제거와 작은 계획 링크만 수행하며, 예정-only compact와 조정 compact의 가치를 P1b 실험 A/B로 분리했다.

2차 개정 기준 남은 제품·기술 blocker는 없다. 이는 문서 구현 Go를 뜻하며 코드 merge, Functions·AI API·Hosting 배포 또는 runtime 활성화를 뜻하지 않는다.
