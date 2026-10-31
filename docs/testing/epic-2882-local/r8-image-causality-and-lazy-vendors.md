# R8: 로고 요청 재현과 첫 피드의 Markdown/ZIP 분리

로컬 제품 `6dab8a50`은 이전 분석 목록 실패를 요청 상태 실패와 구분한다. 저장된 선택은 유지하고 목록 버튼으로만 재시도하며 자동 재분석하지 않는다. `d4d07acb`는 기존 manualChunks에 Markdown parser/AST 계열과 JSZip을 각각 기존 Markdown/새 export 청크로 배치한다. 지도·디자인·데이터 계산·분석 snapshot은 변경하지 않는다. 운영 AppCheck 경고의 원인은 이 수정으로 확인하거나 해결했다고 주장하지 않는다.

## 로고: 이전 표본과 분리한 동일 seed 반복

A=`88fac4a3`, B=`1852352d`의 보존된 production artifact를 같은 독립 합성 runtime/seed에서 각각 desktop/mobile/slow 30회씩 교차 조건으로 실행했다. variant 순서는 B→A 고정이며 무작위 paired 실험은 아니다. checkout SHA와 실제 served artifact SHA는 `artifact-binding.json`으로 구분한다.

| desktop 조건 30회 | A | B |
|---|---:|---:|
| 로고 요청 |195|286|
| 로고 encoded bytes |572627|843743|
| 중복이 발생한 표본 |4/30|22/30|
| DOM 추가/제거 |180/0|180/0|
| 요청 initiator other/script |180/15|180/106|

B의 중복 빈도 증가는 재현됐다. 추가 요청 stack은 React vendor의 이미지 `src` 설정 경계이며 DOM 재마운트는 관측되지 않았다. React19.2.4는 초기 img 속성 설정 뒤 commitHostMount에서도 src를 설정한다. cache-disabled/Playwright routing 환경의 같은 URL 재요청과 일치하지만 개별 browser 내부 원인을 확정한 것은 아니다. 기존 첫 A/B의 +95건/+277123B와 이번 +91건/+271116B를 합산하지 않는다.

별도 B desktop 정상-cache 진단6회는 route interception 없이 fresh context를 사용했다. 문서의 exact-loopback CSP를 먼저 적용하고 외부 `connect-src` 차단 probe가 실패 반환되는 것을 확인했다. 모두 로고6요청/6노드추가/0제거로 총36요청, 중복 전송0이었다. 이 6회에서 사용자에게 실제 추가 전송되는 비용은 재현되지 않았으며 모든 환경에서 없다는 증명은 아니다. 로고 코드에 추측성 수정은 하지 않았다. desktop TodayStrip는 기존 위치/내용을 유지한다.

두 반복 90회 모두 readiness90/90, 관측 HTTP/page/request 오류0. 각각 Firestore Listen90은 첫 카드 후2초 관측 종료 시 검열되며 전체 수명 무오류라는 뜻은 아니다. 활동20개 hash/updateTime은 각 실행 전후 불변이다.

## 초기 의존성 지도와 최소 제품 변경

실제 제품 vite.config를 loadConfigFromFile로 읽고 동일 build/manualChunks/publicDir를 사용하는 외부 production bootstrap에 Rollup generateBundle 관측만 추가했다. 기존 initial vendor 안에 lazy 게시물에서만 사용하는 Markdown parser/AST와 lazy 설정의 JSZip이 포함됐다. 이를 분리하면 initial vendor gzip은 286614→214280B가 된다. index의 정적 import는 vendor와 Firebase 두 개이며 새 Markdown/export 및 mapbox는 포함하지 않는다.

`@vis.gl/react-mapbox`까지 mapbox 청크로 옮긴 초안은 initial index에서 mapbox 약468KB를 가져오는 역효과를 artifact에서 발견해 즉시 폐기했다. 해당 초안의 실제 성능 측정은 없고 최종 map 설정은 기존 그대로다. 최종 제품 diff는 history 오류 구분과 Markdown/ZIP 분리, 관련 회귀뿐이다.

## C: 같은 느린망 정의 30회

C는 `d4d07acb`의 제품 내용으로 빌드한 artifact다. 측정 중 checkout HEAD는 기존 내용의 history 커밋으로 cfbdce23→6dab8a50가 되었지만 served bundle은 고정됐고 빌드/HMR/제품 내용 변경은 없었다. artifact 파일 SHA를 `C-final/summary.json`에 보존한다. C는 독립 runtime를 다시 기동해 새 합성 seed 시각을 사용했으므로 B와 byte-identical paired dataset은 아니다.

- Chromium145, 390×844, fresh context, 복원된 합성 Auth, cache disabled, 따뜻한 backend.
- CDP latency150ms/down200000B/s/up93750B/s, CPU 제한 없음, HTTP/1.1 gzip. HTTP2/CDN/TLS/운영 analytics·실기기 미재현.
- cold는 브라우저 context/cache이며 서버 cold·새 로그인 성능이 아니다.
- 첫 실제 카드/활성 반응 버튼과 `feed_first_content` success: **30/30**, p50 **5966.0ms**, p95 **5980.8ms**.
- CDP 요청/응답 **2040/2040**, finished2010, HTTP오류0, requestfailed0, pageerror0, pending Listen30 검열. 새 Markdown/export/mapbox 요청 **0**.
- 반복 B slow p95 **6372.8ms**와 약392ms 차이지만 제한된 로컬 표본 차이다. 운영 개선율/통계적 안정성은 주장하지 않는다. **2초 목표는 미달**이다.
- 원본 활동20개 hash/updateTime 불변. 원본 재계산/백필0. 공유서비스 변경0. own runtime 종료.

### C waterfall과 남은 하한

navigation 기준 중앙값: JS 응답 종료 **5732.2ms** → 첫 discovery Fetch 시작 **5747.0ms** → Fetch **192.9ms** → 종료 뒤 표시 약 **23.8ms**, first-card ready **5966.3ms**. 중앙값을 별도 산출했으므로 정확 합계는 아니다. OPTIONS를 Fetch로 오인하지 않도록 실제 type=Fetch만 계산한다. JS 응답 완료가 JS 실행 전체 완료를 의미하지는 않는다.

초기 정적 3파일의 Node22 gzipSync(default, 실제 서버 동일) 본문은 index361398 + vendor214280 + Firebase183246 = **758924B**. 이 조건에서 이 세 파일만 전송해도 이론적 약 **3.79초**가 필요하다. 전체 관측 script encoded 중앙값은849248B(헤더 포함)이며 전송 하한 약4.25초다. HTML/CSS/fonts와 HTTP1 순차 dependency/지연은 별도다. discovery 약193ms와 마지막 render 약24ms를 줄이는 것만으로 2초에 도달하지 않는다.

후속 후보는 (1) 초기 index에 함께 들어가는 양 언어/여러 namespace 번역의 실제 필요 부분, (2) 첫 피드 Firebase/bootstrap의 필수 범위다. 번역 inline은 과거 요청 왕복 지연을 피한 기존 설계이고 Firebase의 re2js도 Firestore 의존성이므로 단순 제거하지 않았다. locale/오프라인/SDK identity/초기 읽기 경계를 보존하는 별도 근거가 필요하다. 이번에는 추가 엔진·프리로드·서버 정책 변경을 하지 않는다.

## 기능 검증 범위

동일 C built artifact의 실제 공통 경로에서:
- 첫 피드 lazy 청크 요청0.
- `/ko/community/board/r8-markdown-smoke`: 새 합성 게시물의 heading/GFM 표/취소선 렌더 PASS, Markdown 청크 요청 확인.
- `/ko/settings/data`: 실제 다운로드 버튼→브라우저 ZIP 다운로드→7 entries 및 profile/metadata 존재 PASS, export 청크 요청 확인. 합성 방문자 자신의 빈 활동 export이며 실제 GPX 내용은 기존 useExport unit의 ZIP roundtrip으로 별도 확인한다.
- built RouteMap import와 getBounds PASS. 외부 map tiles/GPU 렌더 실증은 아니며 기존 RouteMap 집중 회귀를 함께 유지한다.
- 위 smoke pageerror/HTTP오류0. PNG는 DOM 준비 직후 화면으로 transition 중간 프레임을 포함할 수 있으며 전체 디자인 수용을 대신하지 않는다.
- history 보존/재시도13 PASS, 최종 관련5 suites37 PASS(Markdown 실제 renderer, ZIP roundtrip, RouteMap, history 및 embedded saved UI).

최종 제품 d4d07acb에서 Node22.23.4/workers2 전체 gate PASS: Vitest 957 suites/10,176 tests(0 FAIL), contracts/lint budget/quality budget/build:dev 모두 exit0. build:dev의 TypeScript 검사도 통과했다. gate 시작·종료 HEAD 동일이며 실행 중 수정은 결과 문서3개뿐이다. 아래 docs DCO 뒤 clean 확인한다. 이전0db346ef full10174PASS와 최초1852352d timing1FAIL은 그대로 보존한다.

## 증거

`/Users/kyoungnam/Documents/Codex/2026-10-29/r8-image-causality/`:
`artifact-binding.json`, `A-results.json`, `B-results.json`, `comparison.json`, `normal-cache-image-dom.json`, `normal-cache-csp-proof.json`, `ui/chunk-modules-B.json`, `ui/chunk-modules-C-final.json`, `C-final/C-results.json`, `C-final/summary.json`, `C-final/initial-static-graph.json`, `C-final/feature-smoke-results.json`, `C-final/ui/C-markdown.png`, `C-final/ui/C-export.png`, `full-gate-C/results.json`.

독립 stack 첫 기동은 Java 경로 미지정으로 시작 전 실패했다. Java21 경로를 명시한 이후 정상 기동했으며 실패 로그를 보존한다. 제품/공유서비스 오류로 분류하지 않는다. 원격 push/PR/배포0.
