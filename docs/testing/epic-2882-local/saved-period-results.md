# 기간·구간 계산의 이전 결과 표시

새 입력/metadata 조회/재계산 실패 때문에 이미 완료한 값을 숨기지 않습니다. 값에 붙는 시간·기간·원천은 그 결과의 당시 값입니다. 사용자 명시 실행만 새 계산을 시작합니다. 이번 WEB 작업은 데이터 재계산이나 백필을 수행하지 않았습니다.

- Stage arbitrary duration: 마지막 성공값과 현재 요청 상태를 분리합니다. 입력 변경·네트워크 실패·source precondition 실패에서도 이전 값/요청초/구간을 유지합니다. 같은 화면에서 새 성공 뒤에도 이전 계산을 선택할 수 있습니다. 이 계산결과 목록은 현재 화면 수명에 한정되며 서버의 interval snapshot 보존과 구분합니다.
- Bike period: 완료한 run은 `retention:saved_result`인 경우 작업 checkpoint 만료시각 이후에도 조회합니다. 현재 winner revision 변화는 당시 결과를 바꾸지 않고 안내합니다. 새 run 진행/실패 동안 이전 완료값을 표시하고, 성공 후 이전 run/최근 run 선택을 제공합니다.
- 재방문은 명시적인 `getBikeAnalysisPeriodHistory` 목록 요청을 사용합니다. 빈 페이지에도 cursor가 있으면 다음 페이지를 조회할 수 있습니다. 선택은 기존 status(runId) 읽기이며 새 계산이나 serving overwrite가 아닙니다. 선택된 과거 run의 존 페이지와 포커스 검증은 그 runId/cursor를 사용합니다.
- 계정/SDK User/services/기간 변경, 명시적 권한 거절은 이전 값과 이력도 폐기합니다. 완료값 보존이 접근권한을 우회하지 않습니다. 다른 기간의 결과를 새 기간 label 아래 표시하지 않습니다.
- 권한 응답과 source freshness를 구분합니다. `failed-precondition`에서 권한 fencing 가능성을 배제할 수 없는 bike 오류는 보수적으로 폐기합니다. 서버가 승인한 historical complete와 단순 계산 중 checkpoint는 분리합니다.
- 소폭 client clock 지연으로 서버의 authoritative asOf를 거절하지 않습니다. 날짜 범위와 숫자 유효성은 검증합니다.

검증: hook/service/panel focused 회귀, TypeScript 및 scoped ESLint. 실제 새 runtime의 이력 endpoint/UI 연결은 통합 검증에서 별도 확인해야 하며 이 문서가 실제 서버 실행 증거를 대체하지 않습니다.

## 일반 기간의 저장 이력 진입 (2026-10-26)

훈련 강도/파워 기간이 잘리지 않아도 접힌 저장 이력 진입점을 제공합니다. 기존 `기간 분석 불러오기`는 그대로 유지하며, 이력 전용 UI는 자동 계산 또는 중복 집계 시작을 제공하지 않습니다. 잘린 기간의 명시적 전체 집계 시작/재시작도 유지합니다. 집계 응답 전체를 period 요청으로 보내던 경계는 fromInclusive/toExclusive 두 값으로 정규화했습니다. 서버의 엄격한 요청 검증은 유지합니다.

실제 main demo의 기존 reanalysis 합성 계정에서 UI와 동일한 KST 2026-09-28~10-25 기간으로 2개 집계 run만 명시 생성했습니다. HTTP 17건 통과, 두 run 모두 1개 대표 활동/600m/2분을 보존하고 원본 metricsRevision 전후 동일합니다. 활동 재분석/백필은 하지 않았습니다. 실제 제품 분석 화면에서 일반 기간 이력 목록 2건과 이전/최신 선택, 새로고침 후 목록 재조회 및 이전 결과 표시를 확인했습니다. 일시적인 Chrome 관측 timeout 1회는 후속 정상 관측으로 해소됐습니다.

외부 근거: `saved-analysis-reanalysis/period-preservation/actual-two-runs.json`, `ui-after-reload.txt`, `ui-after-reload.png`. 검토 URL: `http://localhost:5174/ko/coach/analysis?demoAccount=reanalysis` → 기간·구간 비교와 분포 → 기간별 훈련 강도 → 기간 분석 불러오기 → 기간 1 저장 이력.

이번 추가 변경은 3 suites/25 tests, tsc, scoped lint 통과입니다. 전체 10003 tests 등 통합 통과는 이전 a93eb7a2 경계이며 이 추가 변경의 전체 재실행을 뜻하지 않습니다. 두 run은 같은 원본을 사용해 수치는 같으며 asOf/runId만 다릅니다. 대량 1001건 성능은 기존 별도 근거이고 이번 소수 활동 QA에서 다시 주장하지 않습니다.
