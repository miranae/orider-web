# AI Coach 4축 웹 dispatch 증거

이 workflow는 일반 `push`나 움직이는 `dev` head를 완료 증거로 인정하지 않는다. 오직
`workflow_dispatch`의 immutable `correlation_id`, `evidence_request`(exact JSON 또는 base64url JSON),
`request_sha256`를 받고 `run-name: four-axis-<correlation_id>`로 실행한다. request의 consumer SHA는
반드시 실행 중인 `github.sha`와 같아야 하며, 30분 이내 expiry와 repository를 확인한다. orchestrator는
`miranae/orider-g1-web/.github/workflows/ai-coach-promotion-gate.yml` exact path의 run/attempt만 GitHub
API에서 다시 관측하여 허용한다.
artifact의 `dispatch.expiresAt`은 parse 가능 여부만 보지 않고 decoded immutable request의 원문 값과 exact
equality여야 한다.

request contract 예시는 `scripts/fixtures/ai-coach-four-axis-dispatch-request.json`이다. production과
candidate URL은 protected Environment에 설정된 두 exact origin과 일치해야 한다. HTTPS 기본 443만 쓰며
username/password/query/hash를 금지하고 pathname은
`/__evidence/ai-coach-four-axis/observe` exact 값만 허용한다. candidate는 tagged-stage host/tag,
stage revision, image digest, stage run ID와 target fingerprint에도 결속된다. URL 원문은 최종 artifact나
로그에 기록하지 않고 fingerprint만 기록한다.

Backend용 complete representative v2 artifact는
`scripts/fixtures/ai-coach-four-axis-dispatch-artifact.json`이며 파일 SHA-256은
`09281847cb9bf5010de901ab7cf0690599592a23721fac5c658974eecd1bec5e`로 고정한다.

## 관측 gate

동일한 synthetic fixture/request로 production warm-up 1회와 측정 10-turn, tagged-stage warm-up 1회와
측정 10-turn을 실제 HTTP로 실행한다. warm-up latency는 비교에서 제외한다. 각 measured response는
instrumentation sidecar가 반환한 `ai-coach-four-axis-http-receipt-v1` receipt여야 한다. runner가 임의의
성공 boolean이나 기본 0을 만들지 않는다.

workflow job timeout은 30분, 각 fetch timeout은 `AbortSignal` 30초다. redirect는 거부한다. response는
JSON Content-Type이어야 하고 Content-Length 선검사와 streaming 누적 검사 모두 200,000 byte cap을 적용한다.

- 실제 HTTP status와 runner가 측정한 latency로 5xx=0 및 candidate p95 <= production p95 120%를 판정한다.
- receipt의 provider call, quota charge, user-domain write 계수는 turn별 기대값과 같아야 한다.
- PMC, Rider, Progress, Ride의 card receipt와 Coach composer/provider response receipt는 서로 다른 객체다.
  양쪽의 normalized 핵심 수치·날짜·상태를 나타내는 source revision, projection, evidence, shared-facts
  digest가 모두 같아야 한다. card 계수는 receipt에서 관측된 0이어야 한다.
- 기존 78개 React `vitest-jsdom` 검증은 실제 component render/contract의 assertion receipt로 병합한다.
  성공 상수를 쓰지 않고 exact assertion title과 test file SHA256에서 receipt digest를 만든다.
- production bundle과 router에는 evidence route를 추가하지 않는다. `mode=evidence`에서만 뜨는 전용 Vite
  harness가 canonical fixture로 실제 `CoachPmcInsightCard`, `CoachRiderInsightCard`, `CoachPrescription`,
  `CourseRidePlanSection` root를 렌더한다. Chromium은 320 CSS px viewport, device scale factor 2와 CSS
  `zoom: 2`에서 각 실제 root의 clientWidth/scrollWidth, accessible labelled root와 interactive name,
  lifecycle live-region 관측, Tab/Enter activation을 측정한다. actual DOM, ARIA snapshot, screenshot digest를
  measurement receipt와 artifact에 결속한다. synthetic HTML이나 overflow 숨김으로 통과시키지 않는다.
  키보드 증빙은 직접 `focus()`를 호출하지 않는다. surface별 body에서 Tab을 눌러 start sentinel에 도달한
  뒤 실제 DOM의 sequential focus order를 따라 첫 질문 control까지 이동한다. expected/observed focus-order,
  최종 active control, 질문 ordinal, skip 수와 `tabindex=-1` 수를 receipt에 넣고 그 상태에서 Enter를 실행한다.

이 증거는 스크린 리더 제품을 실제로 조작했다는 증거가 아니다. 지원 범위는 DOM role/name/live-region 및
keyboard semantic assertions와 실제 Chromium reflow/overflow 측정이다. #659 완료 조건도 이 범위로
해석하며 screen-reader 실사용 성공을 주장하지 않는다.

privacy scan은 최종 JSON만 확인하지 않는다. rendered DOM, capture한 network URL/body, Vitest 로그,
provider projection sidecar를 메모리에서 각각 검사하고 채널별 match count와 총 scanned byte만 artifact에
남긴다. raw URL, token, authorization, 질문 원문, UID, course/activity ID, polyline과 좌표는 artifact와
로그에 남길 수 없다.

## 보호 경계와 실행 blocker

job은 protected Environment `ai-coach-four-axis-evidence`에서만 실행한다. 다음 값은 repository에 없으며
상수나 fixture로 대체하면 안 된다.

- `AI_COACH_EVIDENCE_PRODUCTION_ORIGIN`: production exact HTTPS origin
- `AI_COACH_EVIDENCE_CANDIDATE_ORIGIN`: tagged-stage exact HTTPS origin
- `AI_COACH_EVIDENCE_AUTHORIZATION`: synthetic evidence endpoint 인증
- `AI_COACH_EVIDENCE_TEST_IDENTITY`: 격리된 테스트 identity
- `AI_COACH_ORCHESTRATOR_READ_TOKEN`: orchestrator repository Actions read token
- orchestrator가 만든 아직 만료되지 않은 immutable request와 실제 tagged revision/image URL

이 값이나 HTTP receipt endpoint가 없으면 실제 10+10 run 및 canonical artifact 생성은 fail-closed다.
GitHub Actions billing 또는 spending-limit로 job이 시작되지 않은 경우도 로컬/정적 결과로 대체하지 않는다.

## #1668 consumer와 schema 전환

현재 #1668 작업 브랜치의 `validateWebProducerEvidence`는 과거
`ai-coach-four-axis-web-evidence-v1`의 단순 `commitSha/liveComparison/accessibility` shape를 읽는다.
본 producer는 `ai-coach-four-axis-web-dispatch-evidence-v2`이며 correlation/request digest, workflow
run/attempt, consumer/orchestrator identity, target fingerprints, HTTP receipts와 browser/static sidecar를
요구한다. 따라서 기존 backend validator와 직접 호환되지 않는다. #1668 consumer는 위 contract fixture를
기준으로 v2 exact keys를 검증하고, GitHub API의 repository/workflow/run/head SHA/artifact ID/archive digest와
request/orchestrator/stage provenance를 다시 결속한 뒤에만 완료 증거로 받아야 한다. 단순 push/dev artifact는
승격 근거가 아니다.
