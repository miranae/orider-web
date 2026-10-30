# 저장 분석 보존과 명시 재분석 (로컬 구현)

- 새 계산 버전만으로 저장된 결과를 지우지 않는다. RunEfforts의 이전 curve/거리 기록은 표시하며 현재 원본에 붙이는 구간 선택은 별도로 제한한다.
- pending 중 표시 복원은 서버가 이전 확정본을 보존하며 기록한 `savedInputCoverage: complete | partial_terminal`에만 적용한다. 신규 불완전 문서와 V3 pending/invalid는 확정 결과로 승격하지 않는다.
- 소유자는 분석 탭에서 상태를 확인하고 명시적으로 새 분석을 요청한다. 요청은 현재 metrics revision CAS 및 requestId로 바인딩한다. 전송 실패 후 재시도는 같은 ID를 쓰고, 완료 확인 후 새 요청은 새 ID를 쓴다. 조회나 이력 선택 자체는 재계산하지 않는다.
- 이전 분석을 선택하면 실제 분석 모델의 metrics/저장 analysisSummary가 변경된다. 현재 활동 summary의 평균·시간을 섞지 않으며 현재 raw streams/overview를 읽어 과거 차트를 재생성하지 않는다. 저장된 요약·존·curve·lap만 당시 payload대로 표시한다. 과거 payload에 없는 raw 시계열을 복원했다고 주장하지 않는다.
- 당시 FTP/contextSnapshot 및 계산 버전은 변경하지 않는다. 원본에 묶인 peak/lap/split 선택은 과거 선택 중 비활성화한다. 현재 분석으로 돌아가면 기존 listener 결과를 사용한다. serving/원본/공개범위는 이력 선택으로 변경하지 않는다.
- 정확한 Firebase User 객체 및 서비스 인스턴스가 바뀌면 진행 중 응답을 버린다. 준비(AppCheck 포함)와 전송의 전체 제한은 10초이고, 준비 제한 후 뒤늦은 쓰기를 시작하지 않는다.

## 검증 범위

Node 22 집중 6 suites / 122 tests 통과: 서비스 세션교체·제한시간·revision·V3 final, 명시 요청/실패 멱등 재시도/완료 후 새 요청, 이력 선택 UI와 실제 AnalysisTab 저장값 렌더, 현재 summary 미혼합 및 원본 미조회, 기존 metrics/상세 표시 회귀. 기존 페이지 공통 chart registry는 두 suite에서 동일 fixture로 추출했다.

서버 신규 callable의 실제 HTTP 및 브라우저 완결 검증은 새 서버 snapshot 연결 후 별도 수행해야 한다. 이 구현 과정에서 실제 활동 재계산·백필·원본 수정은 수행하지 않았다. 기존 기간 history의 source-specific schema 하한은 임의 해제하지 않았다.
