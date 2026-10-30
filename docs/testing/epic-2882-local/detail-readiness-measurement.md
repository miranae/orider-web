# 통합 상세 준비 계측

일반 웹 ActivityDetailRoute는 인증 준비 후 최초 활동 API 요청 직전에 `activity_detail_ready`를 시작한다. 최초 요청 실패/접근 거절, 재시도, 계정·SDK 세션 교체, 숨김/언마운트 취소를 같은 일회성 reporter로 기록한다. 계정/활동 식별자는 측정 payload에 포함하지 않는다.

응답 도착만으로 성공하지 않는다. 소유자 또는 허용된 방문자의 실제 ActivityPage 기본 본문이 commit되고 두 animation-frame을 지난 시점에 성공한다. 로딩/권한 오류/처리 중/원본 없음은 성공과 구분한다. 분석·지연 미디어·AI 완료는 이 이벤트의 정의가 아니며, 소유자 분석의 기존 `analysis_ready`와 홈 `feed_first_content`는 별도로 유지한다. 인증 이전 대기시간은 이 duration에 포함하지 않는다.

일반 웹에서는 라우트 측정 종료 함수를 하위 public session에 전달해 성공 이벤트 중복을 막는다. 독립 embedded 호출의 기존 계측과 bridge onReady 계약은 변경하지 않았다. 30초 재검증은 새 최초 진입 이벤트가 아니다.

검증: Node22 focused 4 suites / 144 tests PASS, TypeScript 및 scoped ESLint PASS. 최초 응답과 본문 준비 구분, 최초 거절→재시도, 동일 UID의 SDK 교체/늦은 응답, 취소와 성공 중복 방지, 실제 ActivityPage 본문 준비 회귀를 포함한다. 전체/120회 성능 측정은 이 변경 후 재실행하지 않았다.
