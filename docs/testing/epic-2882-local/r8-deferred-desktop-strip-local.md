# R8: 모바일에서 사용하지 않는 데스크톱 의존성 분리

제품 변경 `1852352d`, 지연된 안내 DOM을 기다리는 테스트 보정 `0db346ef`. 기존 `HomeTodayStrip`을 `lazyWithRetry`와 국소 Suspense/ErrorBoundary로 읽는다. 모바일은 기존 첫 피드를 유지하고 해당 모듈을 요청하지 않는다. 데스크톱은 기존 카드·링크를 유지하며 로딩 실패 시 피드를 제거하지 않고 안내/명시 재시도를 제공한다. route-ready 계측을 추가하지 않았다.

## 동일 로컬 하네스 A/B

A는 WEB `88fac4a3`, B는 `1852352d`. 제품 vite.config의 manualChunks/publicDir를 재사용하고, Chromium145/fresh context/cache disabled/복원된 합성 Auth/따뜻한 backend/HTTP1.1 gzip 조건을 유지했다. 조건별30회씩 desktop→mobile→slow 순서로90회. 서로 다른 실행의 합성 seed 시각은 달라 byte-identical paired dataset이나 무작위 교차실험은 아니다.

| 조건 | A ready | B ready | A navigation→첫 카드 p95 | B p95 |
|---|---:|---:|---:|---:|
| 1280×900 |30/30|30/30|286.0ms|267.1ms|
| 390×844 |30/30|30/30|246.2ms|229.3ms|
| 390×844, 지연150ms/down200000B/s/up93750B/s |30/30|30/30|6689.4ms|6368.0ms|

로컬 표본 차이이며 운영 개선율이나 통계적으로 안정된 속도 개선을 주장하지 않는다. HTTP2/CDN/TLS/운영 analytics·실기기는 재현하지 않았다. cold는 브라우저 context/cache이며 서버 cold나 새 로그인은 아니다.

주요 확인: 모바일 각 조건에서 coachClient 요청30→0, 중앙값 script51→45, encoded script943986→921366B. 데스크톱 coachClient30 유지, 별도 lazy JS/CSS가 추가되며 script51→52/943986→945629B. B는 데스크톱 TodayStrip30/30, 모바일0/30 표시 확인. A에는 이 표시 카운터가 없어 A=0으로 해석하면 안 된다. 실제 1280 PNG의 기존3열·컨디션/주간/목표 배치는 유지됐다.

B CDP6828건에는 data URL90이 포함된다. HTTP6738응답 중 관측 오류0/전송실패0/pageerror0, 완료6648·종료시 Listen pending90. 첫 카드 후2초 관측으로 잘린 장기연결90은 별도 분모이며 전체 수명 무오류를 뜻하지 않는다. 원본 활동20개 hash/updateTime은 각 실행 전후 불변이다.

## 데스크톱 비용 미확정

커뮤니티 로고 요청은 A200→B295, 전송588064→865187B(30회 총+95건/+277123B)였다. URL은 같고 모두200이며 API별 요청 수는 같았다. A에도 중복이 있어 패치 인과는 확정하지 않았다. 국소 Suspense 바깥 형제인 로고의 실제 재마운트 여부를 별도 DOM 관측했다: B desktop3회+CDP설정 일치3회 모두 이미지6요청/노드6추가/0제거로 중복 미재현. 이는 interleaved90과 다른 연속desktop 진단이므로 기존 증가를 부정하지 않는다.

React19.2.4의 commitHostMount에서 img.src를 재설정하는 구현과 cache-disabled 조건도 원인 후보지만 실제 중복 요청에 연결된 증거는 없다. 추측성 추가 제품 수정은 하지 않았다. 모바일 불필요 모듈 제거는 확인됐으나 데스크톱 총 비용 중립성은 미확정이며, 이 제한과 함께 후보를 판단해야 한다.

## 검증과 증거

- 초기 focused34/type/scopedlint PASS.
- 최초1852352d 전체:10173PASS/1FAIL. `stravaSettingsLinks`가 지연 모듈 완료 전 guidance를 동기 조회했다. 실패 원본 보존.
- 0db346ef에서 guidance만 waitFor하고 기존 내용/접근성/href assertion 유지. focused27PASS.
- 0db346ef 전체:957파일/10174테스트 PASS. contracts/lint budget/quality budget/build:dev 모두 exit0, Node22/workers2, 시작·종료 HEAD동일/clean.
- 원격 push/배포/백필/원본 재계산0. own 측정·진단 서비스 종료, 공유서비스 무변경.

외부 근거: `/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-deferred-home-ab/`의 `README.md`, `results.json`, `ab-analysis.json`, `desktop-image-observation.json`, `desktop-image-timing.json`, `image-dom-diagnostic/desktop-image-dom*.json`, `full-gate/results.json`(첫실패), `full-gate-0db346ef/results.json`(후속), `ui/desktop-cold.png`, `ui/mobile-cold.png`, `ui/mobile-slow-cold.png`. 기존 A는 형제 `r8-web-production-chunks`에 보존한다.
