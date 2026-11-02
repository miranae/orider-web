# 제품 원칙 (Product invariants)

PR 하나로 깨지기 쉬운 제품 결정을 모은 문서입니다. 머지 게이트(`scripts/merge-pr.sh`)는 이 문서의 **base 브랜치 판**을 AI 리뷰 입력에 넣고, 원칙을 어기는 변경을 BLOCK 하게 합니다. 기계로 확인할 수 있는 원칙은 `npm run check:product-invariants` 가 함께 검사합니다.

This file lists product decisions that a single PR can silently break. The merge gate feeds the base-branch copy of this file to the AI reviewer and blocks violations; rules marked **[검사]** are also enforced by `npm run check:product-invariants`.

**원칙을 바꾸려면** 이 문서와 `scripts/check-product-invariants.mjs`(허용 목록 포함)를 고치는 PR 을 올립니다. 이 파일들을 바꾼 PR 은 저장소 관리자의 GitHub 승인(APPROVED)이 있어야 머지됩니다. 기능 PR 안에서 원칙을 슬쩍 바꾸지 마세요.

---

## 개인정보·권한 (Privacy & authority)

### P1. 공개 범위는 `visibility` 하나 **[검사]**
활동 공개 범위는 `visibility` 하나로만 정합니다. 심박·파워만 따로 숨기는 지표 숨김(`hideHr`·`hidePower`)은 2026-10-13 폐지했습니다. 새 코드에서 이 필드를 읽거나 쓰지 않습니다.
*Visibility is the only privacy control; per-metric hiding (`hideHr`/`hidePower`) was removed.*

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
*Use change signals as triggers, then re-read through the normal query; don't push full state or poll.*

### P12. 부작용이 있는 새 코드는 실패를 남긴다
외부 호출·Firebase IO·캐시 갱신처럼 부작용이 있는 새 코드는 실패를 `logClientError` 등으로 기록합니다. 빈 `catch {}` 로 삼키지 않습니다.
*New side-effecting code must log failures (e.g. `logClientError`); no silent catches.*
