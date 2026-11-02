# R8 제품 청크/공개 자산 재사용 로컬 측정

제품 WEB `88fac4a3118f811467e3277ef24c447c46fa557a`, 실행 checkout `87bce93f93b05f6225a47c3626157b086f99b48e`(문서 후속), 시작/종료 동일. 제품 코드 변경 없음. 실행 UTC 2026-10-28T15:04:42.000Z–2026-10-28T15:11:27.405Z (KST 2026-10-29). 기존 87b 문서의 이전 측정은 별도 근거로 유지한다.

## 최종 결과

| 조건 | 첫 카드 ready/시도 | p50 / p95 (navigation→ready ms) | CDP 요청/응답 | 관측 HTTP 오류 | loadingFailed | 종료 시 미완료 | page error |
|---|---:|---:|---:|---:|---:|---:|---:|
| Desktop 1280×900 cold | 30/30 | 250.2 / 286.0 | 2588/2588 | 0 | 0 | 30 | 0 |
| Mobile 390×844 cold | 30/30 | 225.6 / 246.2 | 2220/2220 | 0 | 0 | 30 | 0 |
| Mobile slow cold | 30/30 | 6670.7 / 6689.4 | 2220/2220 | 0 | 0 | 30 | 0 |

CDP 합계7028 요청에는 HTTP/1.1 6938개와 data URL90개가 포함된다. HTTP 응답 관측6938개에서 ≥400은0, 전송실패0, pageerror0. terminal finished6938개(HTTP6848+data90), right-censored pending90개는 모두 Firestore Listen/channel이다. **응답을 받았어도 장기연결 완료를 뜻하지 않으므로 전 요청 완료/향후 무오류를 주장하지 않는다.** 서버 `error_logs`도 warmup 포함0건. 별도 실패 재시도로 표본을 교체하지 않았다.

## 제품 설정 재사용과 남은 차이

- `loadConfigFromFile`로 현재 제품 `vite.config.ts`를 읽어 build 옵션과 `rollupOptions.output.manualChunks` 함수를 직접 사용했다. vendor Firebase/Mapbox/charts/markdown 등의 기존 분할을 새로 구현하지 않았다. 제품 config SHA/함수 binding은 `build-binding-final.json`에 보존했다.
- 제품 `public/`를 그대로 빌드에 포함했다. community logo6개 HTTP200/image-webp/원본 SHA 동일 사전검증. 정적 서버는 정확 MIME, 없는 확장자 asset은404, 문서 route만 SPA fallback이다. 제품 스타일/Tailwind 실제 src scan을 사용한다.
- **배포 artifact와 완전히 동일하지 않다.** 외부 AppRoot/AuthProvider demo bootstrap을 사용하며 정상 src/main analytics 초기화는 생략했다. Vite의 외부 HTML entry/outDir/환경 설정만 별도다. 전용 loopback **HTTP/1.1 gzip**이며 HTTP2/CDN/TLS/실기기 재현은 하지 않았다. 관측 protocol도 http/1.1이다.
- cold는 매번 새 context+CDP HTTP cacheDisabled, Auth IndexedDB 로그인 상태 복원이다. 한 Chromium145 process와 backend emulator는 warm. 서버 cold start/로그인시간/CPU 제한을 포함하지 않는다.
- slow는 CDP latency150ms/download200000B/s/upload93750B/s. 조건3개를 interleave하여 각각30회, 동시 페이지0, readiness30초 제한+후속2초 관측. actual article+enabled reaction+feed_first_content success를 기다린다. navigation부터의 시간을 사용해 JS 로딩을 숨기지 않는다.
- 독립 demo20개 텍스트 공개 활동, 사진/streams/metrics/AI없음. 실제 첫 카드 표시 범위이며 미디어 전체·상세/owner분석·실기기 운영 SLO는 별도다. 이전120/25/90표본과 직접 개선율 비교하지 않는다.

## waterfall과 제품 수정 판단

slow30개 중앙값: JS51개 전송943986B, 마지막 JS 완료6417.8ms, 첫 discovery 완료6646.6ms, 그후 ready25.1ms. feed journey 자체218.1ms. 따라서 이 HTTP1 cold 조건에서는 JS전송/후속module 의존성이 주대기이며 서버 계산/카드 렌더가6초를 소비한 근거는 없다.

제품 manualChunks와 publicDir를 재사용해도 slow6.69초이므로 이 로컬 조건의 지연은 사실이다. 다만 HTTP1 및 외부 bootstrap과 정상 운영 entry/HTTP2 차이가 남아, 특정 제품 코드를 병목이라고 확정하거나 임의 지연로딩/계산 변경을 하지 않았다. 다음 검증 후보는 정상 entry와 HTTP2 배포 등가 artifact에서 첫 피드 critical script 필요성을 확인하는 것이다. 새로운 제품 수정 및 전체 gate 재실행은 이번 범위에 없다.

## 중간 측정의 실패 보존

`without-public-assets/`의 중간90표본은 manualChunks는 같았으나 external root의 publicDir 누락으로 logo URL에 HTML200이 반환됐다. DashboardPage.communityLogoLoad가 기록 API를 호출했고 logClientError429가166건 발생했다. 서버 저장 error_logs20개가 모두 해당 source였다. 제품 원인으로 오분류하지 않는다. 해당90표본/요청/PNG/log를 덮어쓰지 않고 별도 보존했다.

그보다 앞선 `../r8-web-88fac4a3-fixed/`는 region 불일치 요청실패240/censored90 및 selector 준비실패4+2를 포함한 별도 측정이다. 최종 성공값으로 앞선 실패를 삭제하지 않는다.

## 서버/안전 경계 및 정리

BE compiled `ccb53376`, source `aba05ac7a03229b5e0d10995ea91c71d431d8440e3c309c0edbcc15451bcd1c7`, artifact `ba4789dfe8db038967e6d91daf5827c5ebbeab83f65dd97f86cf1a469d458ce8`. Wrapper는 explicit callable11개, trigger/scheduler0; 원래 handler.run/Auth/ACL 유지. 외부 wrapper/defaultFunctions region만 asia-northeast3 정합. exact demo/loopback 아래 AppCheck attestation 생략은 로컬 한정이며 운영 보안검증이 아니다.

20 활동 payload hash/updateTime 전후 동일. 사용자공유 서비스·원본·분석스냅샷 변경0, 재분석/백필0, remote push/deploy0. 로그는 query/header/body/token을 저장하지 않는다. own static PID65185/hub64965 정상종료, 5419/4539/9349/8439/5079/4639 listen0. APP에 슬롯 반환했다. 별도 BE/APP heavy와 측정은 직렬로 조율했다.

근거: [90표본](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-production-chunks/results.json), [build binding](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-production-chunks/build-binding-final.json), [공개자산 검증](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-production-chunks/public-assets-preflight.json), [waterfall](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-production-chunks/waterfall-final.json), [오류로그 집계](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-production-chunks/error-source-summary.json), [포트정리](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-production-chunks/cleanup-ports-final.json), [데스크톱](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-production-chunks/ui/desktop-cold.png), [모바일](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-production-chunks/ui/mobile-cold.png), [collector](/Users/kyoungnam/Documents/Codex/2026-10-28/r8-web-production-chunks/measure.cjs).
