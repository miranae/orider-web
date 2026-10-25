# 실제 원본 생산자 → 기간/일지 검토 계정

2026-10-26 로컬 전용. BE DCO `4978193c`의 full gate 932 files / 15,648 tests PASS 이후 immutable snapshot source `16c5719b813deca8d18c07e2398938dc71273837c7cefda0540e02f03345d9cd`, artifact `3af663ebcd6bbff2d37aa19ab1e0c54fb16da02816e1e6b8782576cd983a9bac`를 기존 5029/5039 wrapper에 활성화했습니다. 새 callable export는 없습니다. 종전 wrapper와 activation 기록은 rollback artifact로 보존했습니다. Firestore/Auth/Storage 서비스를 재시작하거나 원격 배포하지 않았습니다.

`full-stack/r6-fresh-canonical-load-results.json`의 실제 생산자 계정 `r6-producer-1792959370538`에 같은 UID의 Auth emulator 계정을 만들었습니다. 외부 full-app 하네스의 `demoAccount=producer` 고정 alias만 추가했으며 기존 owner/viewer 계정이나 검토 fixture는 바꾸지 않았습니다. 합성 자격 증명은 로컬 하네스에서만 사용하고 문서/결과에 출력하지 않습니다. 원본/metrics/daily/PMC 계산 결과를 수동으로 덮어쓰지 않았습니다.

이 계정은 실제 CSV 객체 → 업로드 예약/실제 finalize → processActivityMetricsRun → 일별 집계/PMC 경로로 생성됐습니다. 브라우저에서 조회한 계정은 동일 UID입니다. 실제 화면 진입 중 기존 ensure/revalidate callable이 실행된 사실도 HTTP 결과에 남겼습니다.

## 검토 방법

- 기간 화면: http://localhost:5174/ko/coach/analysis?sport=bike&detail=analysis-periods&demoAccount=producer
- `날짜 직접 선택` → 기간 1의 시작/종료를 모두 `2026-10-24` → `기간 분석 불러오기`.
- 같은 날짜의 거리/시간과 `훈련 부하 13`을 확인합니다. `선택한 날의 훈련일지 보기`에서 10월 24일 활동과 월간 부하 13을 확인하고 돌아오면 직접 선택 범위가 유지됩니다.
- 원본 활동: http://localhost:5174/ko/activity/r6-producer-1792959370538-ride?demoAccount=producer

새 브라우저의 기본 28일 범위는 아직 확인되지 않은 날이 포함되어 합계를 `—`로 표시합니다. 단일일 결과를 28일 전체 이력 검증으로 확대하지 않습니다. 이 최초 기대 불일치도 `r6-producer-browser/first-default-window-results.json`으로 보존했습니다.

## 실제 검증

`r6-producer-browser/results.json`: 기간 HTTP 읽기, KST 2026-10-24 일지의 부하 13, 원본 계산 결과를 소비한 기간 복귀 3개 검사 PASS. 관련 함수 응답 전부 200, page errors 0, 390px 수평 넘침 없음. `period.png`에서 단일일 날짜·부하 13이 실제 표시되는 것을 시각 확인했습니다. `diary.png`는 같은 일지입니다.

`r6-producer-browser/activity-results.json`: 해당 원본 활동 제목과 소유자 제어 표시, 공개 상세 읽기/계정 준비/알림 모두 HTTP 200, page errors 0. `owner-activity.png` 보존.

외부 artifact 기준 경로: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/`. `activation.json`은 실제 검증 결과 경로와 verificationPending=false로 갱신했습니다. 앞선 120+1 성능 측정은 이전 artifact `91bc5869dcfd`에 대한 결과이며 이번 서버 수정의 성능 결과로 바꾸지 않았습니다. 앱/운영/실사용자 베타 완료를 주장하지 않습니다.
