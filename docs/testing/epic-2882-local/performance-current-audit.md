# R0/R8 최신 로컬 성능 근거 감사

## 기존 증거와 재측정 이유

에픽은 조건별 30회 이상, cold/warm 정의, 계측 시작/종료, 전체 시도와 실패 분모, 성공 지연과 오류율 동시 보고를 요구합니다. 피드는 첫 유효 카드 사용 가능 p95 2초, 이미 처리된 활동의 주요 분석 표시 p95 3초가 제안 목표입니다. 로컬 결과가 운영 기준 통과를 대신하지 않습니다.

기존 `local-flow-benchmark-results.json`에는 3933cd42 소스에서 피드/분석 각각 새 context 30회와 동일 context reload 30회가 있습니다. 이후 `local-flow-benchmark-latest-results.json` 역시 120회 렌더 성공이지만 알림 HTTP 429가 40건이므로 페이지/API 전체 무오류 결과가 아닙니다. 3초 간격을 둔 `local-flow-benchmark-paced-results.json`은 20회, 조건별 5회라 최소 표본 기준을 충족하지 못합니다. 이 자료들은 공개 discovery/최신 지도 보호 전의 이력으로 보존합니다.

현재 측정은 기존 하네스를 외부 artifact `performance-current/run.mjs`로 복사하여 정의를 명시하고 전체 120회 예정 시도를 유지합니다. 오류가 발생해도 성공만 골라 다시 채우거나 두 실패 후 전체 측정을 중단하지 않습니다. 결과의 오류/취소/HTTP 실패를 숨기지 않습니다.

## 재현 조건과 준비 완료의 의미

- 실제 AppRoot/AuthProvider/Firebase SDK, 로컬 Chrome headless 390×844, unthrottled loopback.
- cold는 새 격리 browser context입니다. 브라우저 프로세스, Vite 모듈 서버와 backend emulator는 warm이며 서버 cold start가 아닙니다.
- warm은 바로 앞 cold와 같은 context의 URL reload입니다. 외부 데모 하네스는 reload마다 합성 이메일 계정으로 다시 로그인하므로 실제 운영의 이미 로그인한 SPA 이동과 다릅니다.
- 피드: 진입 직전부터 실제 첫 카드, 활동 링크, 지표 셀, 활성 반응 버튼이 보일 때까지. 지도/사진 전체 완료를 뜻하지 않습니다.
- 분석: 이미 저장된 `ui-raw-native-ride` 원본/streams/metrics를 읽어 존 타임라인 제목 및 결측이 아닌 실제 구간이 보일 때까지. 신규 분석 생성이나 모든 차트 준비를 뜻하지 않습니다.
- 각 시도 20초 제한, 시도 사이 3초 간격, readiness 뒤 500ms의 요청 관측 창. 동시 페이지 측정은 하지 않습니다.
- 전체 시도별 SHA, 시작 시각, 결과, 주 문서 요청 수, 함수 요청 횟수, 브라우저 resource transfer 통계와 HTTP 실패를 기록합니다. 소스의 다른 작업이 겹치면 SHA를 나누어 보고하며 reload 혼입은 주 문서 요청 수로 표시합니다.
- 활동/스트림/metrics 존재와 시작·종료 SHA256만 저장하고 GPS/건강 수치를 로그에 넣지 않습니다. 합성 fixture를 수정하지 않습니다.
- 비용 자료는 브라우저 요청 수와 관측 가능한 전송량입니다. CORS Timing-Allow-Origin 및 캐시 조건에 따라 transferSize 0이 가능하므로 청구 바이트/Firestore 문서 읽기 수/실제 비용으로 환산하지 않습니다. N+1/대량 활동 비용 전체 검증의 대체가 아닙니다.

실행: Node22로 외부 `performance-current/run.mjs` 실행. artifact 기준 경로는 `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/`입니다. 실제 runtime은 immutable source `fa358f202dee`, artifact `91bc5869dcfd`; 이번 측정에서 활성화/서비스 재시작/규칙 배포/원격 쓰기는 없습니다.

## 이번 실제 결과

2026-10-26 KST, Chrome 156.0.8078.48 / arm64 macOS. 원래 120회는 모두 실행했고 readiness 성공 120/120, 20초 timeout 0, page error 0입니다. 단 하나의 fresh feed 시도는 readiness 직후 500ms 관측 창 안에 주 문서 요청이 두 번 발생했습니다. 이를 성능 실패와 구분한 HMR 측정 간섭으로 보존하여 navigation-clean은 119/120입니다. 최종 소스가 고정된 뒤 fresh feed 한 회를 467ms, 주 문서 요청 1회, HTTP 오류 없이 보충했습니다. 원래 시도를 삭제하지 않았습니다.

| 조건 | 원래 시도 / 준비 성공 | 원래 navigation-clean | 원래 API 오류 영향 시도 | 원래 p95 | 깨끗한 관측 수(보충 포함) / p95 |
|---|---:|---:|---:|---:|---:|
| 피드 새 context | 30 / 30 | 29 | 1 | 504ms | 30 / 504ms |
| 피드 동일 context reload | 30 / 30 | 30 | 1 | 319ms | 30 / 319ms |
| 기존 분석 새 context | 30 / 30 | 30 | 0 | 1295ms | 30 / 1295ms |
| 기존 분석 동일 context reload | 30 / 30 | 30 | 0 | 981ms | 30 / 981ms |

전체 readiness SLO는 피드 60/60이 2초 이내, 분석 60/60이 3초 이내입니다. 이는 API 전체 정상률이 아닙니다. **2/120 시도(1.67%)에서 HTTP 오류 3건**이 관측됐습니다: 알림 429 두 건, discovery 429 한 건. 따라서 HTTP 오류 없는 시도는 118/120(98.33%)이며 성공 지연만으로 무오류 완료를 주장하지 않습니다. 오류 시도를 재시도로 대체하거나 percentile에서 삭제하지 않았습니다. Firestore `net::ERR_ABORTED` 61건은 reload/navigation에 따른 실시간 연결 취소로 별도 기록했습니다.

현재 snapshot의 discovery와 알림 read 정책은 각각 identity별 600회/3600초입니다. 공통 `enforceRateLimit`이 추가로 프로세스 메모리에서 policy+identity별 기본 10회/10초 burst 제한을 적용합니다. 여기서 local은 에뮬레이터 전용이 아니라 프로세스 내 카운터라는 의미입니다. 3초 pace에도 HMR/다른 기존 소비자의 호출이 같은 identity bucket을 공유할 수 있습니다. bucket을 삭제하거나 제한을 약화하지 않았으며 429가 어느 계층에서 발생했는지 응답 본문으로 확정하지 않았습니다.

브라우저 관측 창 평균 함수 요청은 피드 5.03/5.00회, 분석 5.00/5.00회입니다. 피드는 대체로 discovery 2회, 현재지도 batch 1회, profile ensure 1회, 알림 1회였습니다. 분석은 public detail/overview/REST streams/profile ensure/알림 각각 1회였습니다. 별도 알림 오류 보고 요청 1회가 포함됐습니다. 이 표본에서 카드마다 미디어 전체를 기다리거나 200개 활동을 스크롤하지 않았으므로 대량 활동 비용/N+1 전체 해결을 주장하지 않습니다.

전체 Vite asset 포함 평균 요청 수는 피드 fresh 351.5/reload 351.7, 분석 fresh 560.9/reload 572.5입니다. 관측 가능한 resource transfer 합계 평균은 각각 약 11.96MB/65.6KB, 12.83MB/63.8KB였습니다. 개발 모듈·캐시·CORS timing 제약이 포함되므로 운영 번들 크기나 실제 청구 비용과 비교하지 않습니다.

소스 시작 `d2867e3c`, 종료 `676012a9`이며 샘플마다 SHA를 보존했습니다. 실행 중 변경은 R3 구독의 정확한 SDK session 검사, R6 기간 화면 KST 및 복귀 상태, 문서로 피드/단일 활동 분석 준비 컴포넌트를 직접 편집한 변경은 아니었습니다. HMR 간섭 1회를 별도로 보존했고 보충은 `676012a9` 시작/종료 동일입니다. 원본 activity/stream/metrics 시작·종료 hash가 모두 같았습니다. backend runtime은 `91bc5869dcfd`로 고정됐으며 뒤에 작성된 R6 PMC KST 서버 변경의 성능 근거로 사용하지 않습니다. 별도 UID producer 검증의 짧은 동시 부하는 `concurrent-work.json`에 기록했고 어떤 표본도 제외하지 않았습니다.

근거: `performance-current/results.json`(원래 120회 전체), `supplement-results.json`(보충 1회), `audit-summary.json`(분모/간섭/비용 집계), `concurrent-work.json`, `run.mjs`, `supplement.mjs`. 로컬 UI 준비 성능의 제한된 기준은 확인했지만 운영/대표 모바일 네트워크/실기기/신규 분석 생성시간/전면 비용 수용 조건은 여전히 별도입니다. 새 제품 코드는 변경하지 않았습니다.


## 2026-10-28 고정 cold/mobile/slow 후속 (WEB 88fac4a3, 로컬 #1344/R8 근거)

[독립 측정 상세](./r8-cold-mobile-slow-local.md): 조건별 30회, 첫 카드 90/90 ready. navigation→ready p95 desktop276.1ms/mobile245.1ms/mobile slow6214.3ms. 이 결과는 텍스트 합성 카드·외부 optimized bootstrap·HTTP/1·warm emulator 조건이며 기존120회와 직접 개선율 비교하지 않습니다.

데스크톱 각8건 ×30 = 요청실패240건(listMyRegisteredEvents30/logClientError210)을 모두 포함했습니다. scoped emulator export와 bootstrap 기본 region 불일치가 관측됐으며 운영 결함 단정은 하지 않습니다. HTTP 오류0은 관측된7569응답에 한정되고, Firestore Listen 장기연결90은 관측 종료시 pending으로 별도 보존했습니다. 전체 무오류 성공을 뜻하지 않습니다. slow의 약6.2초는 해당 외부 artifact JS 전송/후속모듈 대기가 대부분이며 제품 manualChunks/운영 HTTP2와 다른 조건이라 제품 성능 수정 근거로 사용하지 않았습니다. 원본20개 hash/updateTime 불변, 독립 runtime 종료, 앱 heavy 슬롯 반환. 실기기·운영·미디어 및 owner 분석 slow/cold 수용은 별도로 남습니다.
