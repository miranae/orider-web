# 러닝 웹 경험 비교 기준 / Running web experience benchmark

2026-09-29. 홈 카드와 저장 활동 상세를 대상으로 한다. 비교 대상의 공식 공개 자료와 오라이더 앱·웹의 기존 설계를 함께 사용한다. 실제 경쟁 앱을 같은 계정·활동으로 실행한 사용성 비교 결과는 아니다.

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

구현 화면과 에뮬레이터 재현 방법은 [스크린샷 기록](screenshots/running-parity.md)에 둔다. 운영 배포와 기존 활동 재계산은 별도 전달 단계다.

Implementation screenshots and emulator reproduction are recorded separately; production deployment and existing-activity recomputation remain separate delivery steps.
