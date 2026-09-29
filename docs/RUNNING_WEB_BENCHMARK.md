# 러닝 웹 경험 비교 기준 / Running web experience benchmark

2026-09-30. 홈 카드와 저장 활동 상세, 예정 러닝 계획 연결을 대상으로 한다. 비교 대상의 공식 공개 자료와 오라이더 앱·웹의 기존 설계를 함께 사용한다. 실제 경쟁 앱을 같은 계정·활동으로 실행한 사용성 비교 결과는 아니다.

This comparison covers the feed and post-run reading flow. Competitor capabilities come from current official descriptions; this is not a head-to-head usability study or a claim that the whole product is already superior.

## 비교에서 가져올 기준 / Criteria

| 기준 / Criterion | 공개 근거 / Source | 웹에서 충족할 행동 / Required web outcome |
|---|---|---|
| 페이스·거리·시간을 한눈에 / Read the run at a glance | [Nike Run Club](https://www.nike.com/nrc-app): pace, distance, heart rate and splits | 홈의 주 지표는 거리·페이스·시간. 고도·파워는 보조 정보 / Feed emphasizes distance, pace and time |
| 기록을 이해하고 성취를 확인 / Understand and celebrate | [Nike Run Club](https://www.nike.com/nrc-app): achievements and personal records | 기록·해석을 차트보다 먼저. 기록 갱신은 서버 확정 자료가 있을 때만 / Interpretation before charts; verified records only |
| 다음 운동으로 이어짐 / Continue the journey | [RunDay 공식 앱 소개](https://play.google.com/store/apps/details?hl=ko&id=com.hanbit.rundayfree): guided training, beginner and personalized plans | 내 활동에서 기존 훈련 계획·회복 화면으로 이동. 활동 저장을 회차 완료로 부르지 않음 / Owner-only links; saving is not program completion |
| 데이터의 의미와 근거 / Explain evidence | [기존 웹 설계](BEGINNER_RUNNING_EXPERIENCE.md): 쉬운 말 → 펼치는 디테일 | 먼저 짧은 러닝 요약, 다음 구간 비교, 마지막 상세 지표 / Recap, split comparison, then technical detail |
| 앱과 웹의 흐름 일치 / App-to-web continuity | 앱 `docs/architecture/running-intro-ux.md` | 실제 거리·시간과 다음 행동을 앞에 두고 출처·선택 정보는 뒤에 둠 / Actual results and next action first |

## 오라이더가 더 잘 전달할 영역 / Intended added value

서버의 GAP와 스플릿을 원시 스트림 다운로드 없이 읽고, 구간을 선택해 페이스·경사 보정·심박을 함께 확인한다. 수치를 많이 늘리는 대신 “어느 구간을 어떻게 달렸는가”를 확인하는 조작 수를 줄인다. 훈련 강도·회복·성과의 개인화 판정은 기존 서버 계약이 제공한 경우에만 사용한다.

The intended advantage is clearer evidence: server GAP and km splits remain usable without raw streams; selecting a split connects pace, grade adjustment and observed heart rate. Personal coaching, recovery and achievements require existing authoritative data.

## 검증 조건 / Acceptance criteria

- 390px 모바일과 1440px 데스크톱에서 페이스를 km/h와 혼동하지 않는다 / Pace is primary at both viewports.
- 분석 첫 블록은 근거 요약이며, 상세 표를 열기 전에 스플릿을 비교할 수 있다 / Recap and visual splits precede the raw table.
- 구간 선택은 마우스·터치·키보드로 가능하고 선택 상태를 보조 기술에 전달한다 / Accessible selection and state.
- 마일 설정은 페이스 값·단위를 함께 바꾸며 스플릿 거리 기준 1km는 명시한다 / Correct pace units; km split boundaries stay explicit.
- 같은 페이스·결측·부분 스플릿·21km 활동에서 값이나 코칭을 만들어내지 않는다 / Flat, sparse, partial and long-run cases preserve missing data.
- 남의 활동에 내 기록·내 평균·내 다음 훈련을 붙이지 않는다 / No viewer-history or training context on another person's run.
- 지난 러닝 비교는 활동 시작 전의 이력만 사용한다 / Historical comparisons exclude later activity.
- 개인 심박 존은 서버 체류 시간만 사용하며 랩 개수·고정 심박 경계로 추정하지 않는다 / HR zones use canonical time aggregates only.
- 내 활동에서 확인 가능한 예정 러닝의 날짜·유형·시간·저장된 구성을 확인하고, 해당 날짜의 읽기 전용 미리보기로 이동한다. 유형 설명은 개인별 코칭 판정으로 표현하지 않는다. 오늘 처방의 종류를 확인할 수 없으면 이후 저장 계획을 보여주며, 오늘 운동이 없다고 단정하지 않는다 / The owner can read an available scheduled run and open that exact day's read-only preview; workout definitions are not personalized coaching. An unverifiable today prescription can yield a later stored plan without implying that today has no workout.
- 활동 상세는 계획을 읽기만 한다. 조정된 처방과 일치하지 않는 오늘 훈련, 완료·건너뛴 회차, 다른 종목, 불완전한 조회를 다음 러닝으로 확정하지 않는다 / Activity detail only reads plans; conflicting today prescriptions, completed/skipped sessions, other sports and incomplete reads do not become confirmed next runs.

구현 화면과 에뮬레이터 재현 방법은 [스크린샷 기록](screenshots/running-parity.md)에 둔다. 운영 배포와 기존 활동 재계산은 별도 전달 단계다.

Implementation screenshots and emulator reproduction are recorded separately; production deployment and existing-activity recomputation remain separate delivery steps.

## 후속 개선과 실사용 비교 / Follow-up and usability comparison

후속 범위는 모바일 첫 화면의 읽기 부담, 선택 구간과 지도·고도의 연결, 비교 대상 러닝의 유형과 표본 근거를 개선한다. 지도 연결은 기존 거리 스트림이 유효한 활동에만 적용하며, 스트림이 없는 공개 활동의 서버 스플릿 탐색은 유지한다. 트레일·가상 러닝·일반 러닝의 과거 비교는 같은 유형끼리 활동 시작 전 4주를 사용한다.

The follow-up reduces mobile reading density, connects selected splits to existing route/elevation data, and identifies the type and sample basis of historical comparisons. Valid distance streams are required for route linkage. Historical comparisons use the same run subtype and the four weeks preceding the activity.

실제 비교는 같은 러너의 같은 활동을 각 제품에 준비한 뒤 아래 과제를 같은 기기에서 수행한다. 서비스별로 제공하지 않는 데이터는 따로 기록하며 임의로 만들어 채우지 않는다. 과제 순서는 번갈아 배정하고 안내 없이 수행한 성공 여부, 소요 시간, 도움 요청, 잘못 읽은 값을 기록한다. 아래는 실행할 평가 절차이며 측정 결과가 아니다.

Use the same runner's activity on the same device, alternate product order, and record unaided completion, time, help requests and misread values. Document unsupported data separately. This is a study protocol, not measured evidence.

| 상황 / Scenario | 과제 / Task | 정확한 완료 조건 / Correct completion |
|---|---|---|
| 21km 러닝 / Long run | 평균 페이스와 느린 구간 찾기 / Find average pace and a slow split | 단위를 포함해 값을 읽고 해당 구간을 선택 / Read units and select the matching split |
| 경사가 있는 러닝 / Hilly run | 선택 구간의 위치와 고도 찾기 / Locate a split and its elevation | 해당 거리 범위를 확인하며 경사가 속도 저하의 유일한 원인이라고 단정하지 않음 / Locate the range without claiming a single cause |
| 심박 센서 없는 러닝 / Run without HR | 분석에서 알 수 있는 것과 없는 것 구분 / Identify available evidence | 관측 페이스는 읽고 심박 기반 판단은 알 수 없다고 답함 / Read observed pace and recognize missing HR evidence |
| 본인 활동 / Owner activity | 과거 비교 기준과 다음 훈련 찾기 / Find comparison basis and next training | 유형·표본 근거와 계획된 러닝의 날짜·시간·구성을 확인하고 같은 회차의 미리보기로 이동 / Identify subtype/sample basis and planned date/duration/steps, then open the matching session preview |

실계정 배포 확인과 위 비교를 완료하기 전에는 경쟁 앱보다 우수하다는 결론을 내리지 않는다. 기존 활동 재계산, 공개/소유자 권한, 마일 단위, 센서·스트림 결측 상태를 배포 후 별도로 확인한다.

Production checks and this study remain required before claiming competitive superiority; verify recalculation, ownership, miles and missing sensor/stream states separately.
