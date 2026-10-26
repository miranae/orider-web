# 구간 기록 신고 UI

구간 순위 행에서 명시적으로 폼을 열고 사유를 선택한 뒤 제출한다. 신고는 즉시 순위 제외를 의미하지 않으며 pending/actioned/restored 서버 상태를 표시한다. 실패나 전송 중 취소는 서버 접수 취소를 보장하지 않는다. 같은 신고의 서버 중복 방지 계약에 따라 재시도할 수 있다고 안내한다.

기존 segmentLeaderboard invoke의 정확한 SDK 사용자/서비스 동일성 검사, AppCheck 준비를 포함한 10초 제한 및 AbortSignal을 재사용했다. 계정 교체, 취소, unmount 뒤 응답은 폐기한다. 기존 순위 목록은 백그라운드 전환/30초 재검증 시 행을 제거하므로 신고 폼도 함께 폐기된다. 제출 중 사유 변경 및 중복 제출은 차단하고 취소는 유지한다.

DS README 및 실제 React catalogue를 독립 로컬 Vite에서 확인했다. 기존 Button/Select/Stack/Text만 사용하며 새 CSS는 없다. 폼 열기 시 사유에, 취소/성공 시 원래 버튼에 포커스를 돌려준다.

Node22 focused 3 suites/22 tests 통과, tsc 및 scoped ESLint 통과. 마지막 응답 reportId 타입 검증 보강 후 service 8 tests 재실행 통과. 실제 callable/브라우저 통합은 root의 격리 ranking-moderation harness에서 별도 수행한다. 이 문서는 실제 신고 접수/운영 배포 완료 증거가 아니다.
