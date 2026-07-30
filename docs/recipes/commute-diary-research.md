# 자전거 출퇴근 일기 참고자료

자출일지 레시피를 설계하기 전에 통근 기록 서비스, 운동 기록 서비스, 교통·안전 기관,
웰빙 연구 자료를 함께 검토했다. 아래 내용은 제품 문구와 입력 항목을 정하는 근거이며,
의학적 진단이나 사고 예방 효과를 보장하기 위한 자료가 아니다.

## 조사에서 확인한 공통 패턴

### 1. 거리와 이동 시간이 비슷한 주행은 비교 기준이 될 수 있다

- 영국 교통부의 이동 일지는 날짜, 출발·도착 시각, 출발지·목적지, 이동 목적과 수단을
  기본 단위로 기록한다. 왕복 이동도 서로 다른 여정으로 다룬다.
- Strava의 Matched Activities도 활동 간 변화를 비교하는 사례이지만, 이 레시피는 정확한 경로
  좌표를 요청하지 않는다.
- 따라서 현재 결과는 거리와 이동 시간이 비슷한 자출을 비교 기준으로 삼는다. 직접 만드는
  확장판에서는 라이더가 입력한 코스 별칭을 쓸 수 있지만 경로를 자동 판별한다고 가정하지 않는다.

### 2. 숫자와 체감은 함께 남겨야 한다

- 운동 기록 서비스는 거리, 이동 시간, 경과 시간, 속도, 상승고도, 심박, 파워,
  케이던스 같은 수치를 제공한다. 이동 시간과 경과 시간을 나누면 신호 대기나 정차도
  해석하기 쉽다.
- CDC 활동 일지와 WHO 신체활동 감시는 빈도, 시간, 강도와 자유 메모를 함께 다룬다.
- 자출 기록은 자동 수집 지표 옆에 에너지, 기분, 스트레스, 피로, 통증, 집중도처럼
  당사자가 직접 느낀 상태를 짧게 남겨야 다음 기록과 비교할 수 있다.

### 3. 날씨·교통·안전은 회고에 필요한 맥락이다

- 통근 자전거 이용 연구에서는 기온, 비, 눈, 바람이 이용 여부와 관련된 맥락으로 다뤄졌다.
- 자전거 노출 일지 연구는 날짜·시간·목적·날씨·자전거 종류와 함께 충돌, 아차 사고,
  기억에 남는 경험을 기록했다.
- NHTSA, League of American Bicyclists, PBIC의 안전 자료는 헬멧, 타이어, 브레이크,
  체인, 라이트 확인과 도로 위험 요소 인지를 강조한다.
- 그래서 출발 전에는 간단한 자전거 상태와 예상 위험을, 도착 후에는 위험했던 위치를
  공개 좌표가 아닌 개인 메모로 남기도록 한다.

### 4. 기록은 짧고, 회고는 주기적으로 한다

- Love to Ride, RideAmigos, CommuteStar 같은 통근 기록 서비스는 이동을 빠르게 기록하고
  일수·거리·연속 기록·절감 추정치를 즉시 보여준다.
- Strava Training Log와 Goals는 일·주·월 단위의 진행 상황을 나눠 보여준다.
- 직접 만드는 확장판의 자출일지는 출발 전 약 1분, 도착 후 약 2분에 작성할 수 있어야 하며, 주간 회고에서
  반복되는 피로 시간대, 불편한 교차로, 날씨와 장비 문제를 묶어 보는 편이 적합하다.
- 연속 기록은 동기 부여에 쓸 수 있지만, 휴식이나 대중교통 이용을 실패로 표현하지 않는다.

### 5. 통근 경로는 기본적으로 비공개다

- 집과 직장이 드러날 수 있으므로 출발·도착 지점, 정확한 지도, 원본 좌표는 일기 기본값에서
  비공개로 둔다.
- 공유본은 이동 일수, 총 거리, 총 이동 시간처럼 주간 집계 항목만 사용한다. 자유 문구는
  기본 제외하고 장소·요일·시각·반복 일정이 집이나 직장을 드러내는 단서가 아닌지 확인한다.
- 탄소·비용 절감은 이동수단 대체 여부와 계산 가정에 따라 달라지므로 항상 `추정`으로 표시한다.

## 레시피에 반영할 기록 구조

### 출발 전 약 1분

- 출근/퇴근, 자전거, 사용자가 입력한 코스 별칭
- 수면·회복, 에너지, 기분, 스트레스(간단한 5점 척도)
- 통증이나 불편감(선택 입력)
- 날씨, 예상되는 도로 위험
- 헬멧·타이어·브레이크·체인·라이트 빠른 확인

### 도착 후 약 2분

- 자동 기록: 날짜, 출발·도착 시각, 거리, 이동/경과/정차 시간, 속도, 상승고도
- 선택 지표: 심박, 파워, 케이던스
- 체감 안전도(`1 매우 불안`부터 `5 매우 안전`까지)
- 실제 피로·호흡·통증·집중도와 도착 후 기분
- 교통 체감, 우회, 아차 사고나 장비 문제
- 오늘 잘한 한 가지, 다음 이동에서 바꿀 한 가지, 기억하고 싶은 한 장면

### 주간 회고

- 자출 일수와 총 거리, 출근/퇴근 비율
- 거리와 이동 시간이 비슷한 주행의 이동 시간과 라이더가 기록한 상태 변화
- 낮은 안전 점수나 높은 피로가 반복된 시간대·날씨·구간
- 정비가 필요한 항목과 가장 편안했던 조건
- 다음 주에 유지할 점과 바꿀 점

## 제품 문구 원칙

- “사고를 예방한다”, “건강 상태를 진단한다”라고 표현하지 않는다.
- 수치가 몸의 느낌보다 더 정확하다고 단정하지 않는다.
- 쉬는 날을 끊긴 연속 기록이 아니라 회복 선택으로 다룬다.
- 위치와 건강 메모는 개인 기록이며 공유 전에 반드시 제거·요약한다.
- 거리와 이동 시간이 비슷한 주행의 비교는 함께 나타나는 경향을 살피는 도구이지 원인을 증명하는 분석이 아니다.

## 참고 사이트

- UK Department for Transport, [National Travel Survey 2020 Technical Report](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/1019471/nts-2020-technical-report.pdf)
- UK Department for Transport, [Walking and cycling statistics: technical notes and definitions](https://www.gov.uk/government/statistics/walking-and-cycling-statistics-england-2022/walking-and-cycling-statistics-england-technical-notes-and-definitions)
- Strava, [Ride Activity Pages](https://support.strava.com/en-us/articles/15401886-ride-activity-pages)
- Strava, [Moving Time, Speed, and Pace Calculations](https://support.strava.com/en-us/articles/15401804-moving-time-speed-and-pace-calculations)
- Strava, [Matched Activities](https://support.strava.com/en-us/articles/15401955-matched-activities)
- Strava, [Edit Map Visibility](https://support.strava.com/en-us/articles/15402012-edit-map-visibility)
- Love to Ride, [App FAQ](https://www.lovetoride.net/world/pages/app_FAQ?locale=en-US&save_locale=true)
- RideAmigos, [Log your Trips](https://help.rideamigos.com/hc/en-us/articles/33454119031191-Log-your-Trips)
- Commute.org, [CommuteStar](https://commute.org/commutestar/)
- NHTSA, [Bicycle Safety](https://www.nhtsa.gov/road-safety/bicycle-safety)
- League of American Bicyclists, [ABC Quick Check](https://bikeleague.org/videos/basic-bike-check/)
- Pedestrian and Bicycle Information Center, [Bikeability Checklist](https://www.pedbikeinfo.org/cms/downloads/bikeability_checklist.pdf)
- CDC, [Physical Activity Diary](https://www.cdc.gov/healthyweight/pdf/physical_activity_diary_cdc.pdf)
- WHO, [Physical activity surveillance](https://www.who.int/teams/noncommunicable-diseases/surveillance/systems-tools/physical-activity-surveillance)
- Götschi et al., [A prospective observational study of bicycling crashes, near misses, and other incidents](https://pmc.ncbi.nlm.nih.gov/articles/PMC9348609/)
- Böcker et al., [Weather and cycling](https://pubmed.ncbi.nlm.nih.gov/22155159/)
