# Strava 분석 경험 감사 및 ORider 수용 기준

조사일: 2026-10-10. 러닝·사이클링 분석만 범위. 목표·챌린지·코칭 처방·소셜 순위 확장은 제외한다. 활동 통계 배치 변경도 보류한다.

로컬 문서부터 확인: 문서 허브의 `competitive/strava/paid-analysis.md`, `competitive/strava/evidence.md`. 해당 문서는 2026-10-09 고정 main 기준의 감사이므로 최근 stage 기능의 현황 판정에는 사용할 수 없다. 아래 Strava 동작은 공식 지원 문서로 재확인한 내용이고, ORider 수용 기준은 제안이다. 실제 Strava 유료 계정 화면·지역별 rollout·스크린샷은 검사하지 않았다. 기능의 존재와 현재 ORider의 결핍을 동일시하지 않는다. ORider 기존 자산/노출/실행은 별도 구현 감사와 결합한다.

## ORider 현황과 증거 경계

아래는 2026-10-10 읽기 전용 계약 감사(`85c9591` 기준)의 결과를 반영한다. 백엔드 main 소스는 생산자 계약의 근거이며 실제 배포 또는 사용자 데이터 완전성의 증거가 아니다. 감사 원본은 세션 조사 산출물 `analysis-next-contract-audit-20261010.md`다.

| 항목 | 확인한 자산 / 상태 | 확인한 경계와 다음 단계 |
|---|---|---|
| 최근 stage 변화 | 상세 차트 공유 표면, 수동 이전 활동 비교, 활동 통계 및 비교 곡선 시각화가 stage 검증 범위에 들어갔다. 비교 시각화 기준 커밋은 `85c9591`. | 후속 R2 디자인의 stage 배포 완료가 작업 담당자에게서 전달되었다. 배포 아티팩트와 최종 화면 검증 증거는 해당 검증 기록으로 확인한다. 운영 반영이나 앱 실기기 검증으로 확장해 표현하지 않는다. |
| 러닝 스플릿/GAP | canonical `activity_metrics.splits`, `RunAnalysisPanel`, `RunSplitProfile`, `useRunSplitLocation` 자산 존재. | 이미 구현된 연결을 재사용·확장한다. 이번 감사는 source 존재 확인이며 모든 입력에서 stage/폰 동작 성공을 증명하지 않는다. |
| 임의 선택 구간 통계 | 현재 상세 차트 범위 강조와 활동 페이지 hover→지도 자산 존재. | owner 범위 분석 API/응답 계약은 감사 대상 경로에서 발견하지 못했다. 선택 범위의 평균·NP·존 시간을 renderer series로 새 계산하지 않는다. canonical backend 계약이 필요하다. |
| 랩 분석 | `analysisSummary` 및 `AnalysisLapTable`의 시간·거리·속도·파워·FTP%·HR·cadence 행 존재. | 랩 start/end offset 또는 원본 index 계약은 부족하다. duration 누적으로 지도 정렬을 추정하지 않는다. 표 개선과 지도 연결의 완료 경계를 분리한다. |
| 라이딩 최고 노력 구간 | canonical `peakEfforts` 생산자가 60/120/300초 구간과 센서 요약·offset·distance/indexAxis를 쓴다. overview는 단일 `peakMoment` 강조가 있다. | 다음 구현 후보: canonical 타입/검증 미러와 1/2/5분 구간 inspector. 실측 파워만 허용. route axis는 거리로 샘플 차트에 연결; sensor/unknown axis는 지도 버튼 비활성. live 필드 존재와 UI 검증은 추가 필요하다. |
| 개인 최고 기준 곡선 | owner PDC의 `mmpAll`은 최근 90일 기준이며 activity/date/startTime/source·실측 출처·coverage 자산이 존재한다. | 다음 구현 후보: lazy owner-only 개인 기준 비교. 현재 활동과 과거 활동 이후의 기록이 포함될 수 있어 ‘활동 전 최고’라 부르지 않는다. 임의 기간/평생 최고로 확대하지 않는다. |
| 개인 기록 및 역사 맥락 | 서버 records, 러닝 records 표면, overview의 evaluated record achievements·powerFingerprint·표본/완전성 자산 존재. | 상위 5개만으로 그 밖의 순위 또는 현재 활동을 제외한 이전 최고를 추정하지 않는다. 이미 평가된 서버 맥락을 노출한다. |
| 동일 세그먼트 이력 | segment effort 자료, SegmentPage 개인 이력, 서버 중복 처리·이전 최고·추세 helper 자산 존재. | canonical 구조화 이력 응답이 필요하다. 정확한 attempt count/trend를 약속하려고 frontend 중복 알고리즘을 새로 만들지 않는다. |
| 동일 전체 코스 비교 | 코스 catalog 추천/coach 매칭 자산 존재. | 이것은 반복 활동끼리의 정렬 계약이 아니다. geometry·방향·매칭 근거·좌표 정렬 계약과 검증이 필요하다. |

`구현 소스 확인`, `로컬 테스트`, `stage UI 확인`, `앱 실기기 확인`, `운영 배포`는 별개 증거다. 위 표는 독립 구현 감사에 근거한 현재 작업 순서를 설명한다. 아래 수용 기준 25개가 모두 완료되었다는 뜻은 아니다.

## A. 활동을 구간까지 설명하는 경험

| ID | 사용자 질문 / 공식 문서의 상호작용 | 입력·과금·제약 | ORider 수용 테스트 제안 |
|---|---|---|---|
| A01 | 어느 시점에 달라졌나? 라이딩 차트 커서가 시간·거리·순간값을 갱신한다. [RIDE] | 기록된 스트림. 일반 차트 자체의 상세 과금은 문서에 일괄 명시되지 않음. | 실제 GPS+HR+power 기록에서 한 커서가 모든 차트와 지도 위치를 동일 시점으로 갱신. 결측 센서는 —, 정지·장애 갭 연결 금지. 터치·키보드에도 접근 가능. |
| A02 | 언덕 구간만 보면 얼마인가? 차트 드래그 선택으로 지도·평균/최대·거리·시간·고도차·경사를 함께 갱신. 선택 이동·축소·확대·해제. [RIDE] | 좌표·고도·센서; 임의 범위 집계 산식은 공개되지 않음. | 5–10분 범위 선택 후 전역 평균이 아닌 범위 값 확인. 확대/리셋/여러 번 선택과 갭 경계 검증. 선택범위·유효샘플·정지시간을 명시. |
| A03 | 거리 기준과 시간 기준에서 차이가 있나? 라이딩 분석 거리/시간축 전환. [RIDE] | 거리와 시간 정렬 필요. | km↔시간 전환 후 같은 선택 구간·커서가 유지. 멈춤/비균일 GPS에서도 인덱스로 잘못 연결되지 않음. 사용자 단위계 유지. |
| A04 | 어느 km 또는 랩이 문제였나? 러닝 split/lap 선택이 지도·고도 강조/확대와 연결. [RUN] | 기본 split과 기기 lap을 구분. lap은 기록 기기 필요. | 1km split과 원본 lap을 바꾸어도 의미·시간기준 표시. 행 선택→정확한 구간·차트·지도. split 평균과 랩 평균이 다른 fixture 포함. |
| A05 | 인터벌마다 제대로 달렸나? 모바일 Workout Analysis에서 랩별 페이스·거리·경과시간 및 기록된 센서 확인. [PACE] | 보통 최소 2개 랩, 라이딩은 power 필요. 랩 없는 러닝은 km/mile 분석. 구독 범위 [SUB]. | 워밍업/빠른랩/회복랩/마무리를 섞은 실제 활동으로 랩별 pace·HR·power·시간·거리 비교. 랩 없는→자동split로 명확히 대체, elapsed/moving 혼동 금지. 목표 비교는 기록된 목표가 있을 때만. |
| A06 | 느려진 게 언덕 때문인가? 실제 pace와 GAP를 활동·split·일부 언덕 segment에서 읽음. [GAP] | 구독, 러닝 경사 보정 모델. 노면/기술 난도 미반영. | 실제 pace와 GAP를 나란히 보고 구간 근거로 이동. 고도 부족→GAP 미산출 사유. 보정값을 실측으로 표현하지 않음. 평지·급경사·고도결측 fixture. |

## B. 개인 기준 강도와 파워

| ID | 사용자 질문 / 공식 동작 | 입력·과금·제약 | ORider 수용 테스트 제안 |
|---|---|---|---|
| B01 | 내 심박 기준에서 얼마나 강했나? 개인 MaxHR/직접 경계를 사용하는 HR 분포, 러닝/기타와 라이딩 설정 분리. [HR][ZONE] | 구독+심박. 자동 나이 추정 또는 직접 설정. | 분포에 bpm경계·초/분·비율·설정 출처 표시. 기존 MaxHR/LTHR 자산 재사용 여부 조사. 센서 없는 기록·간헐 결측·종목설정 분리 검증. |
| B02 | 내 러닝 강도 분포는? race/time-trial 기준 pace zones, GAP로 버킷화. [PZONE] | 구독. 과거 재계산은 문서 간 차이 있음(아래 참조). | 존 경계·근거 기록·기준날짜 표시. 단순 speed존을 pace존으로 이름만 바꾸지 않음. 미설정/부족·단위계·과거기준 변경 검증. |
| B03 | 파워가 내 FTP 대비 어느 강도였나? 7 FTP zones 및 25W 분포. [POWER][ZONE] | 실측 power 필요; 구독 고급 분석. 자동 FTP 추정 조건 존재. | 당시 FTP/수동·추정 출처, 존 시간/비율 표시. 가상 power를 실측 존/부하로 오인 금지. FTP없는 경우 임의 기본값 숨겨 넣지 말고 사유/설정 연결. |
| B04 | 평균 파워보다 부담은 컸나? Weighted Average Power·Training Load·Intensity와 용어 설명. [POWER] | 구독+실측 power+FTP 기준. Strava 내부 산식 전체 미공개. | 기존 NP/IF/TSS 등 자산 조사 후 실제 이름·산식/입력/단위로 설명. Strava 점수 동등성을 주장하지 않음. 파워급변/가상 power/FTP변경/부분센서 fixture. |
| B05 | 내 최고 5초·5분·20분은 어디서 나왔나? 활동 power curve에서 해당 최대 지속 노력 위치 확인. [RIDE] | 실측 power; 고급 power 기능 구독 [POWER]. | 곡선 지점 선택→활동 내 시작/끝·지도/차트 범위 강조. 회복·정지·센서 갭을 이어 최고구간을 만들지 않음. 5s/1m/5m/20m/전체 길이 수치 검증. |
| B06 | 이번 활동은 과거 최고 대비 어떤가? 활동 curve와 역사 최고, 기간 선택·W/Wkg·근거 활동 이동. [RIDE][CURVE] | 구독+파워미터; W/kg는 체중 필요. 기간곡선은 별도 Training도 지원. | 이번/이전 활동 단순 2건 비교를 넘어 최근 기간·올해·전체 기준선 지원. 각 곡선 점에 출처 활동/일시/지속구간 연결. 체중이 없으면 Wkg없음, 기준체중을 표시. |

## C. 공정한 비교와 개인 기록

| ID | 사용자 질문 / 공식 동작 | 입력·과금·제약 | ORider 수용 테스트 제안 |
|---|---|---|---|
| C01 | 같은 코스에서 좋아졌나? 출발·도착·방향·거리로 Matched Activities 자동묶음. [MATCH] | 구독+경로, 소유자만. 허용오차 비공개; 유사경로 분리 가능. | 반복코스 후보를 자동 제안하되 이유/차이를 표시. 반대방향·단축코스·GPS불량을 무조건 동일시하지 않음. 사용자의 선택/제외 허용. |
| C02 | 같은 코스에서 올해 추세와 최고는? 연도별 목록·그래프·최고/현재 포인트·원 활동 이동. [MATCH] | 다른매칭없으면 표면없음. | 3회 이상 반복으로 현재·최고·시계열과 기준시간 확인. 타코스 평균속도 차이를 곧바로 성장이라고 표현하지 않음. 비교 가능한 조건/불가 사유. |
| C03 | 코스 전체 말고 같은 구간에서는? segment My Results 시간·속도/pace·HR·power·날짜 추세, PR와 현재 강조. [SEG] | 구독, 매칭된segment. | 기존 segment 자산 감사. 동일 segment의 반복 값·현재/개인 최고·원 활동 링크. 경과시간·멈춤·방향·센서 출처 확인. 공용 순위 확장은 필요 없음. |
| C04 | 어디서 시간 차이가 났나? segment effort 비교의 거리별 시간 차·지도pin·scrub/playback. [EFF] | 구독, 공식 Effort Comparison은 웹 전용. | 자신2회 기록만으로 기준선/거리 정렬·누적시간 차·지도 위치 비교. 초반/후반 차이를 구간 근거로 설명. 전체 경로 추정 정렬이면 불확실성 표시. |
| C05 | 이번 러닝의 1K/5K/10K가 개인 최고인가? 활동 내 14거리 best effort, elapsed 기준. [RBEST][BEST] | GPS, 활동성과와 구독 통합기록 구분. 전체 분석 모바일, 활동별값 웹도. | 구간이 0km부터가 아닌 rolling best인지 검증. 중간에 멈춘5K의 경과시간를 유지. 현재 값↔PR/직전 값↔정확한 원 구간을 연결. 해당거리 미완주→없음. |
| C06 | 라이딩의 거리·등반·파워 최고는? 거리/최장/등반/파워 분류와 활동 성과. [CBEST] | 파워는 센서, 나머지 GPS. 가상라이딩은파워 외 제외. | 실측/가상·실외/실내 분리. 기존 PR/PDC 재사용. 거리기록/등반기록/지속파워 기록을 하나의 평균값으로 합치지 않음. |
| C07 | 장기 기록은 진짜이고 잘못된 성과를 지울 수 있나? 통산/연간상위·추세·출처; 제외시 다음PR승계, 러닝시간수정은 원GPS불변. [BEST][RBEST][CBEST] | 구독 고급 기록. 라이딩은 러닝의timeedit와 동일시 금지. | 연도/전체 전환·2/3위·출처 이동. 오류 기록 제외/활동 삭제·수정후 파생기록 재계산. 정정 시간과 원본 시간 분리, 전역 canonical 원본 변조 금지. |

## D. 기간 분석과 해석 (단일활동 밖의 분석도 이번 감사 범위)

| ID | 사용자 질문 / 공식 동작 | 입력·과금·제약 | ORider 수용 테스트 제안 |
|---|---|---|---|
| D01 | 최근 기간에 어떤 지속능력이 좋아졌나? 두 임의기간 power curve 겹침·W/Wkg·estimatedFTP·점별근거 활동. [CURVE] | 구독+실측 power. 기간이 짧으면 최고 시도 부족 가능. | 현재 28일/직전 28일 외 기간 선택 자산 조사. 두기간 그래프·동일 지속시간·출처로 연결. 시도 없음과 낮은 능력 구별. |
| D02 | 이번 운동과 이번주의 부담이 평소 대비 어떤가? Relative Effort와 주간 누적·최근 3주 기준 범위. [RE] | 구독. HR 또는 체감강도, 종목가중 모델. | 기존 TRIMP/부하를 출처있는 고유척도로 제공. 심박 없음→없음/체감 별도, 강제로0 금지. 주간 부하→기여 활동→이번 운동이 차지하는 양. 휴식 주도 실패 표시 금지. |
| D03 | 어떤 운동이 체력·피로를 바꿨나? Fitness/Fatigue/Form 기간그래프·날짜 선택·기여 활동·7일변화. [FIT] | 구독; 파워 부하/Relative Effort 기반 모델, 10개 대응 라이딩 조건 보정 존재. 건강진단 아님. | 기존 CTL/ATL/TSB 감사. 날짜 선택→값·기여 활동·부하 출처. 삭제/수정/휴식/과거 부족에 그래프 일관. 숫자 증가를 건강/성장으로 단정하지 않음. |
| D04 | 운동 패턴은 어떻게 변했나? Training Log 주시각화·월/연 탐색·종목/거리/시간/고도/태그필터. [LOG] | 구독. 월누적비교는 [SUB]에서 확인. | 활동통계 현재 위치 유지. 종목·기간 변경→합계/활동수가 출처목록과 같음. 진행 중 기간 vs완료 기간 표시, 부분 조회 합계 확정 금지. 활동 목록→원 분석 연결. |
| D05 | 내 달리기 능력의 예상과 과거는? 5K/10K/하프/풀 예측과1/3/6개월 변화. [PRED] | 구독+모바일. 최근24주 20회 러닝, 평지 전제, 부족 시 캐시값 가능. | 기존 예측 자산/모델 존재 확인부터. 없으면 검증 없이 숫자 카드 추가 금지. 입력 충족·현재/과거·평지/불확실성·최근 갱신 표시. 실제 결과 검증을 별도 완료조건으로. |
| D06 | 숫자가 무엇을 의미하나? Athlete Intelligence의 활동요약/Say More/과거활동 맥락·지표별해석. [AI] | 구독·모바일·본인 전용. 지원 종목 제한, elevation/estimatedpower/RPE/cadence 요약 제외. | 기존 AI 분석 자산 재사용. 설명이 원시/산출 지표·범위·비교 활동으로 연결되고 숫자가 일치. 허위 인과 금지. AI 실패에도 기본 분석 유지. 생성 텍스트를 추가하는 것만으로 고급 분석 완료 금지. |

## 문서의 충돌과 미확인 경계

- Pace Zones 전용 문서 [PZONE]는 race/time-trial 변경이 신규업로드에만 적용되고 과거활동은 갱신하지 않는다고 설명한다. [ZONE]은 최초 설정 시 과거재계산, 이후 변경은 미래만 적용한다고 설명한다. 이 차이를 하나의 확정규칙으로 합치지 않는다. ORider는 당시 설정/현재 재해석을 명시적으로 분리하면 더 명료한 경험이 된다.
[CBEST] 상단은 연간 상위 5개, 분석 section은 통산 상위 10개와 annual best라고 설명한다. 정확한 연간 표시개수는 실제 계정 미검증. 숫자 복제보다 연간/전체/근거연결을 수용한다.
- Weighted Average Power를 NP, Training Load를TSS, Relative Effort를TRIMP와 동일 산식으로 명명하지 않는다. 공식 전체 산식·코스 매칭 허용오차·지역별 출시 상태는 미확인.
- 공식 문서에서 설명한 Strava UI에 존재하는 상호작용을 정리했지만 스크린샷 검수·유료 계정 실행 증거는 없다. 이 문서만으로 ORider가 부족하다고 코드 판정하거나 'Strava보다 우수'라 선언할 수 없다.
- 센서/기록 조건에 따라 결측은 정상 상태다. 확정불가·수집중·실패·없음·실측·추정·수동정정은 별도 상태로 다뤄야 한다.

## 우선 검증할 핵심 여정과 우위 조건

1. **활동→문제구간 발견→범위선택→지도/모든센서/범위요약→해제**. 평균 카드만으로 완료 불가. 러닝/사이클링 실제 기록·390px·웹데스크톱에서 수행.
2. **러닝 split/lap→pace/HR/GAP→같은 구간 근거**, 사이클링 **최대지속power점→실제구간→개인기간최고원 활동**. 새로운 계산 엔진보다 기존 산출과 UI 연결 우선.
3. **같은 코스/동일 세그먼트 후보→이전 노력→시간 차/센서 비교→시계열/PR→원 활동**. 다른 코스 두 건 단순 비교는 이 여정을 대체하지 않음.
4. **이번활동성과→거리/파워 PB→연간/전체→잘못된기록제외→갱신된PR 확인**. 조회뿐 아니라 변경 후 정합성 검증.
5. **활동 부하→주기간/존분포/체력추세→기여 활동**. 전역 단독 카드와 활동 근거 연결; 부분 이력·결측·추정 표시 검증.

제안하는 '충분히 좋은 분석' 출구 조건: 기존 ORider 분석자산을 보존하면서 위 핵심 여정이 진입점부터 근거까지 실제 활동으로 연결되고, missing/virtual/pending/invalid 경계에서 오해가 없으며, 사용자의 원래 단위·디자인 시스템·앱embedded·웹모바일/데스크톱에서 같은의미를 유지. 독립 검증자가 수용 테스트·실제 UI 증거를 확인한 후 다음제품 영역으로 이동한다. Strava의 의료/인과 한계와 숨은 추정값을 그대로 모방하지 않는 것을 제품 우위 후보로 삼는다.

## 공식 출처

현재 문서는 대부분 최근1–수주 갱신, RUN은2026-09-09. 상대갱신시각을 정확한날짜로 변환하지 않았다.

[RIDE]: https://support.strava.com/en-us/articles/15401886-ride-activity-pages
[RUN]: https://support.strava.com/en-us/articles/15401883-run-activity-pages
[PACE]: https://support.strava.com/en-us/articles/15401806-pace-speed
[GAP]: https://support.strava.com/en-us/articles/15402117-what-is-grade-adjusted-pace-gap-on-strava
[HR]: https://support.strava.com/en-us/articles/15401923-how-do-i-customize-my-heart-rate-zones-on-strava
[ZONE]: https://support.strava.com/en-us/articles/15401569-training-zones-on-strava
[PZONE]: https://support.strava.com/en-us/articles/15402116-how-does-pace-zone-analysis-work-on-strava
[POWER]: https://support.strava.com/en-us/articles/15402161-power
[CURVE]: https://support.strava.com/en-us/articles/15402048-how-do-i-use-my-best-efforts-power-curve-on-strava
[MATCH]: https://support.strava.com/en-us/articles/15401955-how-do-i-view-my-matched-activities
[SEG]: https://support.strava.com/en-us/articles/15401900-how-do-i-view-my-segment-results-on-strava
[EFF]: https://support.strava.com/en-us/articles/15402094-how-do-i-use-effort-comparison-on-strava
[RBEST]: https://support.strava.com/en-us/articles/15401661-how-do-best-efforts-work-for-running-on-strava
[CBEST]: https://support.strava.com/en-us/articles/15401645-how-do-best-efforts-work-for-cycling-on-strava
[BEST]: https://support.strava.com/en-us/articles/15401646-what-are-best-efforts-on-strava
[RE]: https://support.strava.com/en-us/articles/15401794-relative-effort
[FIT]: https://support.strava.com/en-us/articles/15402032-how-fitness-freshness-is-calculated
[LOG]: https://support.strava.com/en-us/articles/15402077-training-log
[PRED]: https://support.strava.com/en-us/articles/15401591-performance-predictions
[AI]: https://support.strava.com/en-us/articles/15401629-athlete-intelligence-on-strava
[SUB]: https://support.strava.com/en-us/articles/15402044-what-features-are-included-in-a-strava-subscription

## 이 문서의 역할과 검증 기록

사용자 목표는 **다른 기능으로 전환하기 전에 분석을 충분히 좋게 만드는 것**이다. 이 문서는 그 목표의 완료 선언이 아니라 구현·독립 검증을 위한 기준선이다. 목표·챌린지는 제외하고 활동 통계의 현재 배치는 유지한다.

구현 순서의 첫 묶음은 canonical 최고 노력 구간 inspector와 최근 90일 개인 기준 곡선이다. 그 뒤 임의 구간 집계, 랩 정렬, 반복 구간/전체 코스의 backend 계약을 순서대로 다룬다. 기존 분석·개인 기록·피트니스 자산을 다시 만드는 대신 사용자 질문에서 근거까지 연결한다.

각 완료 보고에는 관련 수용 ID, 실제 입력 종류, 로컬 테스트 결과, stage 웹의 모바일/데스크톱 화면과 상호작용, 앱 embedded 실기기 확인 여부, 미완료 계약/상태를 기록한다. 독립 문서 검수와 구현 검증은 별도 담당자가 수행한다. 문서 작성이나 디자인 점수만으로 기능 전체 또는 Strava 대비 우위를 완료 처리하지 않는다.
