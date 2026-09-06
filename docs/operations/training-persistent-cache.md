# 훈련 화면 영속 캐시와 인계 준비

2026-09-06 사용자 승인에 따라 기존 세션 메모리 캐시에 렌더용 DTO 스냅샷 저장을 추가한다. 토큰·Firebase Auth 영속성을 추가하는 변경은 아니다.

- 메모리 Map을 우선 조회하고 기존 hook의 원본 구독/조회가 항상 재검증한다. 데이터가 없거나 만료·손상되면 기존 로딩/재시도를 사용한다.
- 네이티브는 document-start에서 `window.__ORIDER_TRAINING_CACHE_SCOPE__`를 주입한다. UUID 또는 SHA-256 hex64 형식이며 원시 UID·토큰이 아니다. 주입되지 않은 기존 앱/일반 브라우저는 메모리만 사용한다.
- `localStorage["orider.trainingSurfaceCache.v2"]`에 schema/uid/scope/키/만료시각/DTO를 저장한다. 최대 12항목, UTF-8 512KiB, TTL 10분이다. 렌더 DTO의 최소 형상과 중첩 JSON·자격증명 키를 검사한다.
- 디스크 복원은 Firebase가 확인한 비익명 UID에서만 허용한다. 임베드는 해당 UID와 host 기대 UID가 일치하고 `host.sessionAccepted`를 받은 뒤 소유자를 준비한다. 초기 Auth null은 로그아웃으로 해석하지 않는다.
- 계정 변경, 거부, 명시적 `host.logout`은 메모리와 `orider.trainingSurfaceCache.` 저장소 prefix 전체를 즉시 비운다. 같은 UID라도 네이티브 scope가 바뀌면 이전 스냅샷은 복원하지 않는다. 네이티브는 로그아웃/계정 전환에서 scope를 폐기·교체하고 renderer가 중단된 경우에도 이전 저장소가 재사용되지 않게 한다.
- quota/차단 예외는 디스크 저장을 포기하고 메모리/원본 조회를 유지한다. 캐시가 없는 첫 사용이나 재로그인 시 콘텐츠를 인증 전에 노출하지 않는다.

인계 코드 교환만 별도 named FirebaseApp의 Functions SDK를 사용한다. 이 앱에는 Auth/App Check를 초기화하지 않는다. 256비트 일회용 코드를 `https://auth.orider.co.kr/webHandoffRedeem`으로 전달하고 기존 Auth에 custom token으로 로그인한다. 원래 App Check 준비는 병렬로 진행하며, 보호 API와 네이티브 create의 App Check 강제는 유지한다.

`debugLog`에는 app_check/redeem/sign_in/total 단계, 제한된 elapsedMs, outcome만 기록한다. UID·코드·토큰·응답 본문은 기록하지 않는다. 네트워크 전송이나 서버 폴백은 추가하지 않는다.
