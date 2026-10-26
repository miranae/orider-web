# 구간 기록 신고 UI

구간 순위 행에서 명시적으로 폼을 열고 사유를 선택한 뒤 제출한다. 신고는 즉시 순위 제외를 의미하지 않으며 pending/actioned/restored 서버 상태를 표시한다. 실패나 전송 중 취소는 서버 접수 취소를 보장하지 않는다. 같은 신고의 서버 중복 방지 계약에 따라 재시도할 수 있다고 안내한다.

기존 segmentLeaderboard invoke의 정확한 SDK 사용자/서비스 동일성 검사, AppCheck 준비를 포함한 10초 제한 및 AbortSignal을 재사용했다. 계정 교체, 취소, unmount 뒤 응답은 폐기한다. 기존 순위 목록은 백그라운드 전환/30초 재검증 시 행을 제거하므로 신고 폼도 함께 폐기된다. 제출 중 사유 변경 및 중복 제출은 차단하고 취소는 유지한다.

DS README 및 실제 React catalogue를 독립 로컬 Vite에서 확인했다. 기존 Button/Select/Stack/Text만 사용하며 새 CSS는 없다. 폼 열기 시 사유에, 취소/성공 시 원래 버튼에 포커스를 돌려준다.

Node22 focused 3 suites/22 tests 통과, tsc 및 scoped ESLint 통과. 마지막 응답 reportId 타입 검증 보강 후 service 8 tests 재실행 통과. 실제 callable/브라우저 통합은 root의 격리 ranking-moderation harness에서 별도 수행한다. 이 문서는 실제 신고 접수/운영 배포 완료 증거가 아니다.


## 실제 로컬 SDK 통합 — 2026-10-26

제품 웹12f1706c와 서버cad66cc0(sourcefe8d8d3c9491/artifact42f66efac719)를 독립 `demo-ranking-moderation`에 연결했다. UI5284/Auth9349/Functions5099와 Firestore8398/Storage9409 독립 namespace다. 합성 GPS101표본을 실제 matcher로 처리한 활동1건을 사용했다.

실제 웹 폼의 제출 전 취소는 신고 요청0건, 명시 제출 후 pending이며 순위는 유지, 재시도는 같은 reportId/duplicate:true였다. 관리자 제외 후 목록0건, 재처리 전 복원은 failed-precondition, 실제 GCS 원본 재매칭 matched:1 후에도 excluded, 별도 복원 후 목록1건을 확인했다. 관리자5회/분 제한을 지킨 뒤 복원했다. 전체 HTTP11건 중 의도적 조기 복원 거부1건을 제외한 성공 응답10건, 페이지 오류0, 390px 가로 넘침0. 서버 응답 mock은 없다.

외부 `ranking-moderation/results.json`과 report-form/pending/excluded/restored.png에 증거를 보존했다. 신고 폼390×844 캡처를 직접 확인했다. 실제 제품 구성요소+SDK harness 증거이며 전체 앱 라우팅·기기 입력·운영 배포를 뜻하지 않는다. 이 검증 당시 메인 로컬 실행본은 d3dc를 유지했다.

독립 리뷰 후 폼 버튼을 '닫기'로 명확히 하고, 이미 제출한 신고는 폼 닫기/목록 갱신 후에도 접수될 수 있으며 같은 신고 재제출로 확인할 수 있다는 설명을 추가했다. 실제 SDK 화면에서 설명·닫기와 신고 요청0건을 재확인했다(`close-copy-result.json`, `report-form-final.png`). 최종390px 화면을 직접 확인했다.

## 최종 로컬 게이트와 관리자 접수 발견 경로

WEB5af9dab8의 전체 Vitest는 Node22/2workers로928 files/9,767 tests PASS(297.17초). 계약·TypeScript·개발 빌드·lint/quality도 PASS다. 처음 npm test에 넘긴 maxWorkers 인자가 내부 Vitest에 전달되지 않아 해당 실행을 중단하고 원본 로그를 보존한 뒤 test:vitest에 직접 인자를 전달해 다시 완료했다.

관리자가 새 신고를 발견하는 경로가 없어 BEb9cf4c6c에 기존 관리자 callable의 읽기 전용 list를 추가했다. pending20건 페이지, createdAt+ID cursor, 관리자 현재 계정 경계, 소유자 삭제/병합/활동 삭제 필터를 적용한다. 서버 응답에 신고자 UID·원천·건강/위치 정보는 없다. 직접 문서 읽기 금지는 유지한다. 서버 최종source34909b6605a9/artifactb1186ceebdda에서 실제 SDK4건 HTTP200으로 기존 처리완료 신고 제외→새 신고 접수→관리자 목록 발견→공개 순위 유지까지 확인했다(`ranking-moderation/pending-results.json`). 관련 서버23 tests/build/lint/compat PASS다.

최종 서버를 메인 로컬5029/5039에 연결했다. 기존 경로 이력 실제 SDK start/advance/status complete와 R6/R7/신고/관리 API의 미인증401 총8개를 확인했고 activation.json을 검증 완료로 갱신했다. 데이터 서비스·원격 저장소·dev 배포는 변경하지 않았다. 외부 full-stack/runtime-snapshots/main-ranking-moderation-smoke-results.json과 ranking-moderation/web-gates.json에 증거를 보존한다.
