# 기간·구간 계산의 이전 결과 표시

새 입력/metadata 조회/재계산 실패 때문에 이미 완료한 값을 숨기지 않습니다. 값에 붙는 시간·기간·원천은 그 결과의 당시 값입니다. 사용자 명시 실행만 새 계산을 시작합니다. 이번 WEB 작업은 데이터 재계산이나 백필을 수행하지 않았습니다.

- Stage arbitrary duration: 마지막 성공값과 현재 요청 상태를 분리합니다. 입력 변경·네트워크 실패·source precondition 실패에서도 이전 값/요청초/구간을 유지합니다. 같은 화면에서 새 성공 뒤에도 이전 계산을 선택할 수 있습니다. 이 계산결과 목록은 현재 화면 수명에 한정되며 서버의 interval snapshot 보존과 구분합니다.
- Bike period: 완료한 run은 `retention:saved_result`인 경우 작업 checkpoint 만료시각 이후에도 조회합니다. 현재 winner revision 변화는 당시 결과를 바꾸지 않고 안내합니다. 새 run 진행/실패 동안 이전 완료값을 표시하고, 성공 후 이전 run/최근 run 선택을 제공합니다.
- 재방문은 명시적인 `getBikeAnalysisPeriodHistory` 목록 요청을 사용합니다. 빈 페이지에도 cursor가 있으면 다음 페이지를 조회할 수 있습니다. 선택은 기존 status(runId) 읽기이며 새 계산이나 serving overwrite가 아닙니다. 선택된 과거 run의 존 페이지와 포커스 검증은 그 runId/cursor를 사용합니다.
- 계정/SDK User/services/기간 변경, 명시적 권한 거절은 이전 값과 이력도 폐기합니다. 완료값 보존이 접근권한을 우회하지 않습니다. 다른 기간의 결과를 새 기간 label 아래 표시하지 않습니다.
- 권한 응답과 source freshness를 구분합니다. `failed-precondition`에서 권한 fencing 가능성을 배제할 수 없는 bike 오류는 보수적으로 폐기합니다. 서버가 승인한 historical complete와 단순 계산 중 checkpoint는 분리합니다.
- 소폭 client clock 지연으로 서버의 authoritative asOf를 거절하지 않습니다. 날짜 범위와 숫자 유효성은 검증합니다.

검증: hook/service/panel focused 회귀, TypeScript 및 scoped ESLint. 실제 새 runtime의 이력 endpoint/UI 연결은 통합 검증에서 별도 확인해야 하며 이 문서가 실제 서버 실행 증거를 대체하지 않습니다.
