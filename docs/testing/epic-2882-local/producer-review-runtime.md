# 실제 원본 생산자 → 기간/일지 검토 계정

2026-10-26 로컬 전용. BE DCO `4978193c`의 full gate 932 files / 15,648 tests PASS 이후 immutable snapshot source `16c5719b813deca8d18c07e2398938dc71273837c7cefda0540e02f03345d9cd`, artifact `3af663ebcd6bbff2d37aa19ab1e0c54fb16da02816e1e6b8782576cd983a9bac`를 기존 5029/5039 wrapper에 활성화했습니다. 새 callable export는 없습니다. 종전 wrapper와 activation 기록은 rollback artifact로 보존했습니다. Firestore/Auth/Storage 서비스를 재시작하거나 원격 배포하지 않았습니다.

`full-stack/r6-fresh-canonical-load-results.json`의 실제 생산자 계정 `r6-producer-1792959370538`에 같은 UID의 Auth emulator 계정을 만들었습니다. 외부 full-app 하네스의 `demoAccount=producer` 고정 alias만 추가했으며 기존 owner/viewer 계정이나 검토 fixture는 바꾸지 않았습니다. 합성 자격 증명은 로컬 하네스에서만 사용하고 문서/결과에 출력하지 않습니다. 원본/metrics/daily/PMC 계산 결과를 수동으로 덮어쓰지 않았습니다.

이 계정은 실제 CSV 객체 → 업로드 예약/실제 finalize → processActivityMetricsRun → 일별 집계/PMC 경로로 생성됐습니다. 브라우저에서 조회한 계정은 동일 UID입니다. 실제 화면 진입 중 기존 ensure/revalidate callable이 실행된 사실도 HTTP 결과에 남겼습니다.

## 검토 방법

- 기간 화면: http://localhost:5174/ko/coach/analysis?sport=bike&detail=analysis-periods&demoAccount=producer
- `날짜 직접 선택` → 기간 1의 시작/종료를 모두 `2026-10-24` → `기간 분석 불러오기`.
- 같은 날짜의 거리/시간과 `훈련 부하 13`을 확인합니다. `선택한 날의 훈련일지 보기`에서 10월 24일 활동과 월간 부하 13을 확인하고 돌아오면 직접 선택 범위가 유지됩니다.
- 원본 활동: http://localhost:5174/ko/activity/r6-producer-1792959370538-ride?demoAccount=producer

최초 새 브라우저의 기본 28일 합계 `—`는 WEB 회귀였습니다. 서버에는 1,500일 `loadSnapshot`과 확정 0일·조회 coverage가 있었지만, WEB이 최초 활동부터 존재하는 PMC 표시 행을 합계에도 사용했습니다. 따라서 앞선 9bede6e0의 “서버 미확정 날짜” 설명은 잘못된 진단이며 정정합니다. `canonical-load/coverage-readback.json`이 서버 근거이고 `r6-producer-browser/first-default-window-results.json`은 수정 전 회귀 화면 증거입니다. 수정은 부하 합계를 검증된 loadSnapshot에서, CTL/ATL/TSB 시작·종료값은 실제 PMC 행에서 각각 읽습니다. 없는 PMC 시작값을 0으로 만들지 않습니다.

## 실제 검증

`826cbbbd`와 `62c60994` 수정 뒤 `r6-producer-browser/results.json`의 5개 검사 PASS: 기본 28일 합계 13, 펼친 추세의 첫 활동 이전 CTL/ATL/TSB 미확정과 “계산 없음” 표시, 실제 기간 HTTP 읽기, KST 2026-10-24 일지 부하 13, 단일일 13 및 기간 복귀. 관련 함수 응답 전부 200, page errors 0, 390px 수평 넘침 없음. `default-trend-fixed.png`에서 “일부 날짜에 저장된 PMC 계산이 없습니다.”와 빈 PMC 값이 실제 보이고 “추정 계산”으로 잘못 표시되지 않는 것을 확인했습니다. `default-period-fixed.png`는 기본 합계, `period.png`는 단일일 날짜·부하 13, `diary.png`는 같은 일지입니다.

직전 시도는 기본 합계와 일지까지 통과했으나 세 번째 기간 요청에서 2회/10초 burst 제한으로 429가 발생했습니다. 이를 `after-fix-rate-limit-attempt.json`에 보존했습니다. 최종 재검증은 세 번째 요청 전 11초 간격을 두었고 세 기간 요청 모두 200이었습니다. 제한이나 제품 guard는 변경하지 않았습니다.

`r6-producer-browser/activity-results.json`: 해당 원본 활동 제목과 소유자 제어 표시, 공개 상세 읽기/계정 준비/알림 모두 HTTP 200, page errors 0. `owner-activity.png` 보존.

외부 artifact 기준 경로: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/`. `activation.json`은 실제 검증 결과 경로와 verificationPending=false로 갱신했습니다. 앞선 120+1 성능 측정은 이전 artifact `91bc5869dcfd`에 대한 결과이며 이번 서버 수정의 성능 결과로 바꾸지 않았습니다. 앱/운영/실사용자 베타 완료를 주장하지 않습니다.
