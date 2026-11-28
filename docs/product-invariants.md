# 제품 원칙 (Product invariants)

PR 하나로 깨지기 쉬운 제품 결정을 모은 문서입니다. 머지 게이트(`scripts/merge-pr.sh`)는 이 문서의 **base 브랜치 판**을 AI 리뷰 입력에 넣고, 원칙을 어기는 변경을 BLOCK 하게 합니다. 기계로 확인할 수 있는 원칙은 `npm run check:product-invariants` 가 함께 검사합니다.

This file lists product decisions that a single PR can silently break. The merge gate feeds the base-branch copy of this file to the AI reviewer and blocks violations; rules marked **[검사]** are also enforced by `npm run check:product-invariants`.

**원칙을 바꾸려면** 이 문서와 `scripts/check-product-invariants.mjs`(허용 목록 포함)를 고치는 PR 을 올립니다. 이 파일들을 바꾼 PR 은 저장소 관리자의 GitHub 승인(APPROVED)이 있어야 머지됩니다. 기능 PR 안에서 원칙을 슬쩍 바꾸지 마세요.

---

## 개인정보·권한 (Privacy & authority)

### P1. 활동 공개 범위가 분석 공개 범위도 정한다 **[검사]**
활동을 볼 수 있는 사람은 `visibility`로 정하며, 활동을 볼 수 있는 사람에게는 그 활동의 분석 전체를 함께 공개합니다 — 심박·파워·훈련 지표(TSS·IF)·케이던스·칼로리와 분석에 쓰인 개인 기준값(FTP·최대 심박 설정·LTHR), 이를 포함한 생성 문장·저장 분석 이력까지입니다. 항목별 공개 데이터 설정은 두지 않습니다 — 정책 수정으로 활동 공개 범위를 분석까지 확대했습니다(2026-11-23 사용자 결정, miranae/orider-web#1821·miranae/orider-g1-web#3967. 이전 결정 2026-11-13 miranae/orider-g1-app#3348 을 대체).

- 「분석 전체」에는 개인 기준값(FTP·최대 심박 설정·LTHR·역치 페이스)과 그것으로 계산한 값이 모두 포함됩니다 — FTP 대비 값(IF·존·파워 커브의 FTP 비율), 체중으로 나눈 값(W/kg, `contextSnapshot.weightKg`), 존 경계, 페달링·최고 노력·W'·부하까지입니다(2026-11-24 사용자 결정). 클라이언트는 받은 분석 필드를 소유자 여부로 다시 거르지 않습니다. 소유자 전용 동작(수정·공개 범위·사진·내보내기·삭제·업로드·재분석·FTP 결정·AI 분석 생성 등), 소유자가 자기 공유 이미지에 고르는 공유 카드 개인정보 선택, 센서 품질 억제는 그대로 둡니다.
- 분석이나 기준값을 숨기고 싶은 사용자는 활동 공개 범위를 좁힙니다(비공개·친구 공개).
- 서버는 비소유자 상세·스트림·피드·탐색·개요·분석 이력 응답을 활동 접근 권한으로만 거릅니다. 접근이 허용된 뷰어(공개 활동이면 비로그인 포함)에게는 분석 전체를 반환합니다. 소유자 본인 응답과 저장된 분석 원본·이력은 유지합니다. GPS 원좌표와 개인정보 처리 지도 경로선의 기존 경계는 유지합니다.
- 웹·iOS·Android는 같은 규칙을 따릅니다. 남은 항목별 공개 설정 화면은 제거 대상입니다.
- 폐지한 `hideHr`·`hidePower` 필드는 다시 읽거나 쓰지 않습니다.

*Visibility selects the audience, and anyone allowed to see an activity also sees its full analysis, including personal thresholds and every value derived from them — FTP-relative values, weight-derived values (W/kg, `contextSnapshot.weightKg`), zone boundaries, pedaling, peak efforts, W' and load (policy change 2026-11-23, extended 2026-11-24); there are no per-field public-data settings and clients do not re-filter analysis fields by ownership. Owner-only actions, the owner's share-card privacy choices, owner responses, saved originals and GPS/route privacy boundaries remain intact.*

전체 누적 요약은 별도 공개 계약입니다(2026-11-18 사용자 확정, miranae/orider-web#1725). 비로그인·타인·친구·본인에게 비공개 활동까지 포함한 전체 활동 수·누적 거리·누적 운동시간·누적 상승고도를 동일하게 제공합니다. 이 네 항목과 준비 상태·버전·항목별 결측 정보만 공개하며, 활동이 한 건뿐인 경우에도 같은 정책을 적용합니다. 활동 목록·개별 상세·시간·위치·경로·사진·메모·민감 지표의 기존 권한은 유지합니다. 계정 삭제·차단 제한을 우회하지 않습니다. 상세 공개 범위를 누적 요약의 집계 조건으로 사용하거나 활동 공개 설정을 바꾸도록 요구하지 않습니다.

*Whole-history cumulative count, distance, exercise duration and elevation are public for every viewer, including private activities and single-activity accounts. Only these totals and readiness/version/completeness metadata are public; individual activity access and account/block restrictions still apply.*


이슈 #1725의 기존 계정 일괄 백필·초기화·통계 원장 보정은 2026-11-18 사용자의 명시적 지시에 따라 제외합니다. 정본 집계가 아직 없거나 준비/복구 중이면 수치를0으로 만들지 않고 pending/failed 상태를 제공합니다. 이는 공개 범위에 따른 집계 차등이 아니며, 기존 계정의 미준비 상태 자체를 공개 정책 위반으로 간주해 백필을 요구하지 않습니다. 공개 조회에서 초기화를 시작하지 않습니다.

*For #1725, existing-account bulk backfill, initialization and ledger repair are explicitly excluded by the user. Missing/unready canonical aggregates may return pending/failed without numbers; this readiness state is not an audience-based privacy restriction. Public reads must not start initialization.*

### P2. 기본값: 프로필 공개, 활동 나만 보기
프로필은 설정하지 않았으면 공개입니다. 활동은 기본 「나만 보기」입니다. 기본값을 바꾸는 변경(초기값, 미설정 해석, 폴백)은 원칙 변경입니다.
*Profiles default to public; activities default to private ("only me").*

### P3. 권한은 서버와 Firestore rules 가 강제한다
웹 화면은 보안 경계가 아닙니다. 버튼을 숨기거나 화면에서 거르는 것으로 권한을 대신하지 않습니다. 권한이 필요한 동작은 서버(callable·rules)가 막아야 하고, 화면 처리는 표시만 맞춥니다.
*The frontend is not a security boundary; authorization lives in Cloud Functions and Firestore rules.*

### P4. 사용자 설정은 계정(uid)별로 저장한다 **[검사]**
사용자 취향·초안·캐시를 `localStorage` 에 둘 때는 키에 uid 를 넣습니다. 계정에 묶이지 않은 키는 계정 전환이나 위임 로그인 세션에서 다른 사람의 값이 섞입니다. 계정과 무관한 값(언어·테마 등)만 예외입니다.
*Browser storage keys for user preferences must be namespaced by uid.*

### P5. 위임 로그인 토큰은 `#impersonateToken=` 으로만 받는다 **[검사]**
관리자 위임 로그인 토큰은 URL fragment(`#` 뒤)로만 받습니다. 쿼리(`?impersonateToken=`)로 온 토큰은 거부합니다. 쿼리는 서버 로그·Referer 로 새기 때문입니다. 웹·서버·운영자 웹 3개 저장소가 함께 지키는 계약입니다.
*Impersonation tokens are accepted only from the URL fragment, never from the query string.*

## 수치·분석 (Metrics & analysis)

### P6. 지표는 서버 정본 하나만 쓴다
파생 지표(TSS·NP·존·체력 등)는 서버(metrics 또는 presentation)가 한 곳에서 계산합니다. 화면은 읽기만 합니다. 값이 없으면 화면에서 추정하거나 다시 계산하지 말고 비워 둡니다.
*Derived metrics are computed once on the server; the UI only reads them and leaves gaps empty.*

### P7. 분석 결과는 스냅샷이다
AI 분석 등 저장된 분석 결과는 데이터나 분석기 판이 바뀌어도 가리거나 지우지 않습니다. 「다시 분석할 수 있음」 안내만 붙입니다. 다시 분석해도 이전 결과의 이력은 남깁니다.
타인에게 반환하는 공개 응답은 P1의 활동 접근 권한 기준을 적용하며 저장된 원본·이력은 변경하지 않습니다.

*Stored analyses are snapshots: never hide or delete them when inputs change; offer re-analysis and keep history.*

### P8. 비공개 활동도 순위에는 반영한다
로컬 레전드 같은 순위는 비공개 활동도 집계에 넣고, 표시만 가립니다. 비공개로 바꿨다고 순위에서 빼지 않습니다.
*Private activities still count toward rankings; only their display is hidden.*

### P9. 러닝을 라이딩보다 낮은 등급으로 다루지 않는다
라이딩과 러닝은 같은 베타입니다. 러닝만 기능을 빼거나 뒤로 미루거나 낮은 품질로 두지 않습니다.
*Running is a first-class sport, equal to cycling.*

## 구조 (Architecture)

### P10. 활동 지도 썸네일은 브라우저가 캡처한다 **[검사]**
활동 지도 썸네일은 브라우저가 지도를 그려 캡처하고 서버가 정본으로 저장합니다. 지도 이미지 API(Static API)로 썸네일을 만드는 방식은 2026-05 폐기했고 다시 도입하지 않습니다. 정본 교체(다시 만들기)는 활동 주인만 합니다.
*Activity map thumbnails are captured in the browser; static map image APIs are not used.*

### P11. 변경은 신호로 알리고, 값은 기존 조회로 다시 받는다
다른 화면·사용자의 변경은 신호(시퀀스 번호 등)로 알리고, 값은 기존 조회로 다시 읽습니다. 모든 경우를 이벤트 내용으로 덮어쓰거나 주기적 폴링으로 대신하지 않습니다.

**예외 — Redis 실시간 경로:** Redis와 이를 쓰는 월드 서버(WebSocket·SSE) 경로에서는 신호와 데이터를 구분하지 않습니다. 이 경로로 받은 변경 값(위치·프레임·상태·알림 내용 등)은 다시 조회하지 않고 바로 반영해도 됩니다. 서버는 구독자마다 권한을 확인한 값만 보내고, 순번이 건너뛰거나 다시 연결하면 최신 snapshot으로 맞춥니다. 이 경로가 실패하면 기존 Firestore·API 경로로 자동 복귀합니다(짧은 순단 허용). 주기적 폴링 금지는 이 경로에도 그대로 적용합니다.

**서버 장애와 개별 연결 끊김의 구분:** 위의 자동 복귀는 서버 쪽 장애(Redis 발행 실패·차단기 열림·Redis 비활성, 그리고 월드 서버 접속 불가 — 핸드셰이크가 한 번도 성공하지 못한 채 연속 실패가 30초 넘게 이어지는 경우)일 때의 규칙이며, 이때 서버는 Firestore 신호 쓰기를 다시 시작합니다. Redis가 정상이면 서버는 같은 변경의 Firestore 신호 문서 쓰기를 생략할 수 있습니다. 연결된 뒤 끊긴 개별 클라이언트는 재연결로만 회복하고, 재연결에 성공하면 최신 snapshot을 받거나 기존 조회를 한 번 다시 해 놓친 변경을 채웁니다. 끊긴 동안(WebSocket이 계속 막힌 환경 포함) 그 클라이언트의 갱신 공백은 허용하며, 화면을 다시 열거나 새로고침하면 회복합니다. 이 공백을 메우려고 주기적 조회나 클라이언트별 Firestore 신호 쓰기를 추가하지 않습니다.
**모임 위치 전체 장애 예외(g1-web#4203).** 월드 정상·부분 단절·공통 상태 미확인 시 모임의 동료 좌표는 연결된 월드에서 받습니다. 서버가 공통 전체 장애 회차를 확인한 동안에 한해 활성 HUD와 관전 화면(웹 관전 포함, g1-web#4215)은 같은 폴러로 4초 이상 간격을 두고 최신 실제 측정만 조회합니다. 계정·모임·회차·수명·현재 자격을 확인하며 복구 즉시 폴링과 보간을 중단합니다. 구버전 앱은 회차와 원본 측정 시각을 보내지 않으므로 주행 기록과 체크포인트·명단은 유지하되 동료 프레임을 받거나 폴백 좌표를 갱신하지 않습니다. 신호 버전만으로는 새 회차나 위치의 측정 시각을 입증할 수 없습니다. Android·iOS 모두 이 계약을 지원하는 릴리스로 갱신해야 장애 좌표를 표시할 수 있습니다.
*Use change signals as triggers, then re-read through the normal query; don't push full state or poll. Exception: on Redis-backed realtime paths (the world server's WebSocket/SSE) signals and data are not distinguished — values received there may be applied directly, provided the server sends only per-subscriber authorized values and resyncs on sequence gaps or reconnects, with automatic fallback to the normal Firestore/API path. No polling in either case. Fallback applies to server-side failure (Redis publish failure, open breaker, Redis disabled, or the world server being unreachable — no successful handshake for over 30 seconds of consecutive attempts), where the server resumes Firestore signal writes; while Redis is healthy the server may skip Firestore signal-document writes. An individual client's disconnect is recovered only by reconnecting and re-reading once (snapshot or normal query) on success; the gap while disconnected (including persistently blocked WebSockets) is accepted and recovers on reopen/refresh — do not add polling or per-client Firestore signal writes to cover it.*

### P12. 부작용이 있는 새 코드는 실패를 남긴다
외부 호출·Firebase IO·캐시 갱신처럼 부작용이 있는 새 코드는 실패를 `logClientError` 등으로 기록합니다. 빈 `catch {}` 로 삼키지 않습니다.
*New side-effecting code must log failures (e.g. `logClientError`); no silent catches.*

### P13. 기본 검증과 복구로 배포를 안정적으로 유지한다

- 정상 배포에서는 대상 환경과 검증한 커밋·산출물을 확인하고, 게시 결과와 핵심 경로의 동작을 확인합니다. 기존 실패 로그와 이전 정상 버전 복구 수단을 사용합니다.
- 이미 검증한 산출물과 증거를 재사용합니다. 기본 흐름에 중복 빌드·검증, 파일별 추가·변경·삭제 재확인, 대기, 승인, 다음 배포 차단을 추가하려면 그 단계가 막는 장애를 제시해야 합니다. 플랫폼이 산출물 전체를 버전으로 게시하면 파일 목록은 게시 단위로 다룹니다.
- 배포 리뷰에서 수정이나 추가 검사를 머지 조건으로 삼으려면 지원되는 작업 흐름에서 재현되는 실패와 실제 영향을 제시합니다. 대상 환경이나 산출물 오류, 배포 불능, 서비스 장애, 데이터 손상, 권한 위반, 기존 복구 수단의 실패가 해당합니다. 기존 확인으로 잡히는 경우에는 같은 검증을 추가하지 않습니다.
- 운영자가 수용한 짧은 전환 순단이나, 현재 서비스를 계속 제공하면서 기존 후보로 다시 실행할 수 있는 실패는 그 자체로 머지를 차단하지 않습니다. 정상 개발·배포가 느려지는 변경은 기본 경로에 넣기 전에 효과와 비용을 따로 검토합니다.

*Keep the normal release path short. Verify the target, reviewed artifact and critical live behavior, and retain the existing recovery path. Reuse build and test evidence. Require a reproducible failure and concrete impact before adding a blocking release control. Accepted brief transition interruptions and recoverable failures that preserve the live release do not block a merge on their own.*

## 범위 (Scope)

### P14. 접근성은 일반 사용자 1만 명 전까지 범위 밖이다
스크린리더(VoiceOver·TalkBack) 레이블 같은 접근성 작업은 일반 사용자가 1만 명을 넘을 때까지 진행하지 않습니다(2026-11-22 결정). 접근성을 기능의 수용 조건·작업 범위·리뷰 BLOCKER 로 두지 않고, 발견한 갭은 보류 이슈(예: miranae/orider-g1-app#3824)에 모읍니다. 기준을 넘으면 앱·웹 전체 접근성 정비로 함께 다룹니다. 이미 있는 접근성 레이블은 지우지 않습니다.
*Accessibility work is out of scope until 10,000 general users: not an acceptance criterion, work item or review blocker. Keep existing labels.*
