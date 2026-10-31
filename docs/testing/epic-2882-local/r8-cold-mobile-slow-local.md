# R8 고정 조건 로컬 피드 측정 — 2026-10-28

제품 WEB `88fac4a3118f811467e3277ef24c447c46fa557a`, 실행 checkout `5086030b4db2818eb84a7bf5b2bea78eaea804e3`(후속 문서만), 시작/종료 동일. BE compiled source `ccb53376`, source digest `aba05ac7a03229b5e0d10995ea91c71d431d8440e3c309c0edbcc15451bcd1c7`, artifact `ba4789dfe8db038967e6d91daf5827c5ebbeab83f65dd97f86cf1a469d458ce8`.

## 측정 결과

| 조건 | 실제 첫 카드 ready / 시도 | navigation→ready p50 / p95 | 요청 / 응답 관측 | HTTP ≥400 / 응답 | loadingFailed / 요청 | 관측 종료 시 pending | page error |
|---|---:|---:|---:|---:|---:|---:|---:|
| Desktop 1280×900 cold | 30/30 | 270.1 / 276.1ms | 3129 / 2889 | 0/2889 | 240/3129 | 30 | 0 |
| Mobile 390×844 cold | 30/30 | 226.3 / 245.1ms | 2340 / 2340 | 0/2340 | 0/2340 | 30 | 0 |
| Mobile slow cold | 30/30 | 6191.8 / 6214.3ms | 2340 / 2340 | 0/2340 | 0/2340 | 30 | 0 |

90/90은 첫 카드 준비 성공이며, 전체 페이지/요청 무오류 완료가 아니다. HTTP 오류 0은 **관측된 응답의 수치**다. 총 7809 requests 중 7479 finished, 240 failed, 90 right-censored pending이며 응답은 7569개였다. pending 90개는 모두 Firestore Listen/channel 장기 연결이다. 관측 종료 이후 결과를 성공/실패로 추정하지 않는다. 데스크톱 30/30 시도에 요청실패가 있었으므로 오류 없는 전체여정이라고 주장하지 않는다.

## 고정 조건과 readiness

- Chromium 145.0.7632.6, headless 한 프로세스에서 3조건을 interleave하여 순차 30회씩 측정. 실행 UTC 14:11:27–14:17:59. 앱 heavy 작업은 측정 종료까지 대기했다.
- cold = 매번 새 context + CDP cacheDisabled. Firebase Auth IndexedDB를 실제 SDK 로그인 상태로 복원한다. 브라우저 프로세스/서버/emulator는 warm이며, 로그아웃 로그인·서버 cold start·CPU 제한·실기기 증거가 아니다.
- slow = CDP latency 150ms, download 200000B/s, upload 93750B/s. 이것은 1.6Mbps/750kbps 모의 전송 조건이며 실제 통신망이 아니다.
- 실제 product AppRoot/AuthProvider/MobileFeedPage의 첫 `article[data-scroll-anchor]`가 보이고 좋아요 버튼이 enabled이며 `feed_first_content` success가 기록되는 시점. navigation 시작 기준을 표에 사용한다. SDK/feed hook 시작 이후 journey duration만으로 cold load를 축소하지 않는다.
- 준비 제한30초, 준비 후 추가2초 관측. CDP request/response/loadingFinished/loadingFailed를 시작부터 수집하고 종료 시 미완료를 pending으로 보존. context close 이후 취소를 창 안 실패와 섞지 않는다. query/header/body/token은 수집하지 않았다.
- 독립 demo project, 20개 합성 공개 활동. 사진·지도 원본·streams·metrics·AI 없음. 텍스트 카드의 제한된 하한 표본이며 미디어 피드나 owner analysis/전체 상세 준비 성능은 이번 범위가 아니다.
- 외부 bootstrap은 최적화 Vite6 번들+실제품 스타일이며 일반 src/main.tsx 전체 부트스트랩/analytics와 동일하지 않다. HTTP/1 정적 gzip 서버다. 제품 vite.config.ts의 manualChunks를 이 외부 build가 재사용하지 않았다. 운영 artifact/HTTP2/CDN과 직접 비교하거나 기존120회/25회 대비 개선율을 계산하면 안 된다.

## 실패 요청과 실행 환경 경계

`listMyRegisteredEvents` 30건 + `logClientError` 210건, 모두 `net::ERR_FAILED`, desktop 각8건. 이 두 경로는 bootstrap 기본 Functions `us-central1`로 요청했으나 isolated wrapper의 해당 export는 `asia-northeast3`에 등록됐다. 실제 피드 discovery는 명시 asia-northeast3로 정상 응답했다. 관측된 실패 전송의 region 불일치는 격리 환경 한계이며 운영 제품 장애로 일반화하지 않는다. logClientError의 원래 7개 오류 내용/원인까지 전부 같은 문제라고 단정하지 않는다. 측정 도중 이를 고치거나 실패 표본을 제거하지 않았다. 다음 full-home 환경 검증은 bootstrap/default region과 scoped export의 정합성을 먼저 맞춰야 한다.

wrapper는 명시 HTTP/callable export만 사용하며 worker/trigger/scheduler를 시작하지 않았다. 정확 demo/loopback guard 아래 AppCheck attestation만 로컬 wrapper에서 생략하고 실제 Auth/ACL handler를 사용했다. 운영 AppCheck/OAuth/권한설정 검증은 아니다. 외부 hostname 차단 관측은 0, 사용자 공유 runtime/fixture 변경은 없다.

## 느린 망 waterfall과 개선 판단

30개 slow 표본 중앙값: entry JS 완료3975.4ms, 마지막 script 완료5940.5ms, 첫 discovery 완료6166.4ms, discovery 완료→첫 카드27.4ms. 실제 feed journey duration 중앙값221.1ms. 첫 표본 entry gzip 전송702079B, navigation0.17초부터3.97초까지; lazy modules4.04–5.94초; discovery5.98–6.17초; ready6.19초다.

이 외부 artifact에서는 entry 전송량과 HTTP/1의 많은 후속 module 요청이 주된 대기 구간이다. 서버 계산/React render가 6초를 차지했다는 근거는 없다. 하지만 제품은 이미 Firebase/Mapbox/Charts 등 vendor manualChunks를 적용한다. 따라서 현재 증거만으로 제품 번들을 재설계하거나 성능 수정 커밋을 만들지 않았다. 후속 후보는 **동일 production chunk 설정과 HTTP2 환경을 재사용한 계측**에서 first-feed critical path를 다시 확인하는 것이다. 실제 병목으로 확인된 뒤에만 중복 없는 개선을 적용한다.

## 실패 준비·보존·정리

- 초기 collector1은 빈 overlay anchor의 visible 조건으로 잘못 대기했다. 4개 기록 `initial-failed-results.json` 보존.
- collector2는 실제 MobileFeedPage와 다른 CSS selector를 사용했다. 2개 기록 `second-selector-results.json` 보존.
- 두 준비 실패를 90개 유효 측정에 섞거나 삭제하지 않았다. `ui/diagnosis.json/png`에 실제 카드와 success measure가 있었음을 보존. 빌드 준비 실패 로그도 그대로 남겼다.
- 최종20 활동 document payload SHA256/updateTime 전후 동일 (`fixtureUnchanged:true`). 원본/분석 재계산·백필0. 관계/반응 쓰기0.
- 종료 후 own PID50065(static),49669(emulator hub)만 정리; 5419/4539/9349/8439/5079/4639 listen0 (`cleanup-ports.json`). 앱 슬롯 즉시 반환. 다른 서비스 종료/원격 변경0.

## 근거

- [전체90표본/요청분모](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-88fac4a3-fixed/results.json), [collector](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-88fac4a3-fixed/measure.cjs), [waterfall](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-88fac4a3-fixed/waterfall-analysis.json), [중앙값](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-88fac4a3-fixed/waterfall-medians.json), [artifact hashes](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-88fac4a3-fixed/artifact-hashes.json)
- [모바일 제품 화면](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-88fac4a3-fixed/ui/mobile-cold.png), [데스크톱 제품 화면](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-88fac4a3-fixed/ui/desktop-cold.png), [느린 망 화면](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-88fac4a3-fixed/ui/mobile-slow-cold.png)
- 제품 변경 없음. 기존 WEB88fac4a3 전체10172 PASS gate를 새 성능/운영 gate로 소급하지 않는다. 실기기·운영·대표 미디어·owner 분석 slow/cold는 남은 수용 범위다.
