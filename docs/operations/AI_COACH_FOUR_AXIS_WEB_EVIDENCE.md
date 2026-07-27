# AI Coach 4축 웹 dispatch 증거

이 workflow는 일반 `push`나 움직이는 `dev` head를 완료 증거로 인정하지 않는다. 오직
`workflow_dispatch`의 immutable `correlation_id`, `evidence_request`(exact JSON 또는 base64url JSON),
`request_sha256`를 받고 `run-name: four-axis-<correlation_id>`로 실행한다. request의 consumer SHA는
반드시 실행 중인 `github.sha`와 같아야 하며, 30분 이내 expiry와 repository를 확인한다. orchestrator는
`miranae/orider-g1-web/.github/workflows/ai-coach-promotion-gate.yml` exact path의 run/attempt만 GitHub
API에서 다시 관측하여 허용한다.
artifact의 `dispatch.expiresAt`은 parse 가능 여부만 보지 않고 decoded immutable request의 원문 값과 exact
equality여야 한다.

canonical request는 `ai-coach-four-axis-web-stage-baseline-dispatch-v2`이고 예시는
`scripts/fixtures/ai-coach-four-axis-stage-baseline-dispatch-request-v2.json`이다. production actual을 직접
호출하지 않는다. production-before exact image를 zero-traffic `tagged-stage-baseline`으로 띄운 baseline과
`tagged-stage-candidate`를 비교한다. 두 target 모두 HTTPS 기본 443, protected host suffix, exact
`---orider-ai-api-stage-ldfyfyx5da-du.a.run.app` suffix와 hostname label 경계, canonical origin(`/`),
tag/revision/image/stage run/target fingerprint에 결속되며 baseline은 production audit digest도 포함한다.
URL 원문은 최종 artifact나 로그에 기록하지 않고 fingerprint만 기록한다.

Backend용 complete representative v2 artifact는
`scripts/fixtures/ai-coach-four-axis-dispatch-artifact.json`이며 파일 SHA-256은
`09281847cb9bf5010de901ab7cf0690599592a23721fac5c658974eecd1bec5e`로 고정한다.
이 validator와 fixture는 backward provenance 확인용으로 보존한다. canonical v3 artifact와 schema는 각각
`scripts/fixtures/ai-coach-four-axis-stage-baseline-evidence-v3.json`,
`scripts/fixtures/ai-coach-four-axis-stage-baseline-evidence-v3.schema.json`이며 v3 fixture SHA-256은
`555394ad001f4ee90e99e6cc0b278c91faf76cc316d7467ef695ff687f7609aa`이다. request fixture SHA-256은
`8e8762aa4571871089124042647ac74bc4f924415ddc0cd9d3f2c182c05ad780`이며 backend의 recursive key-sort
canonical bytes 그대로 저장되어 artifact `dispatch.requestSha256`과 파일 digest가 같다.

## 관측 gate

동일한 canonical fixture/request로 baseline과 candidate에서 `/v1/coach/status`를 각각 한 번 warmup한 뒤 측정
10-turn을 실제 제품 HTTP API로 실행한다. status warmup latency는 비교에서 제외한다. 별도 합성 observation
endpoint나 instrumentation sidecar를 사용하지 않는다. Progress fixture는 backend가 target별로 미리 만들고
teardown하며, Web runner는 attestation response v3의 target별 locator만 소비한다.
두 warmup receipt는 baseline→candidate 순서이며 exact key
`environment/path/httpStatus/providerCalls/quotaConsumed/userDataWrites/receiptDigest`, status path
`/v1/coach/status`, HTTP 200, 계수 0/0/0을 강제한다.

- Track 0은 `/v1/coach/respond`를 직접 호출한다.
- PMC와 Rider는 각각 `/v1/coach/insights/pmc`, `/v1/coach/insights/rider`에서 snapshot을 읽고 그 snapshot에
  결속한 `/v1/coach/respond`를 호출한다.
- Ride는 `/v1/coach/ride-plan/token` → `/v1/coach/ride-plan` → `/v1/coach/ride-plan/ai-context` 순서로
  context token과 input revision을 결속한 뒤 `/v1/coach/respond`를 호출한다.
- Progress는 attested locator의 `prescriptionId`, `sourceRequestId`로 `/v1/coach/change-proposals`를 GET 복구하고
  `proposalId` 및 `fixtureDigest` 결속을 확인한 뒤 측정 2턴만 호출한다. 숨은 `/respond`, check-in, proposal 생성은
  없으며 따라서 준비용 provider 호출, quota 소비, user-domain write도 없다. baseline과 candidate locator의 네
  필드는 모두 독립이어야 하며 하나라도 재사용하면 실패한다.

runner는 실제 status와 response digest로 bounded `productExecution`을 만들고, Firebase ID JWT의 `sub`와
request ID로 request key를 메모리에서 계산한다. UID나 token 원문은 저장하지 않는다. provider/turn ledger
계수와 user write 수는 응답 계약의 관측값 및 turn 기대값에 결속하고, backend consumer가 동일 request key의
실제 ledger와 user-domain write를 독립적으로 재검사한다.

workflow job timeout은 30분, 각 fetch timeout은 `AbortSignal` 30초다. redirect는 거부한다. product response는
JSON Content-Type이어야 하고 Content-Length 선검사와 streaming 누적 검사 모두 200,000 byte cap을 적용한다.
attestation 및 Identity Toolkit 응답은 같은 검사를 별도 64 KiB cap으로 적용하며, 선언된 Content-Length와
실제 수신 byte 수도 일치해야 한다.

- 실제 HTTP status와 runner가 측정한 latency로 5xx=0 및 candidate p95 <= baseline p95 120%를 판정한다.
- receipt의 provider call, quota charge, user-domain write 계수는 turn별 기대값과 같아야 한다.
- PMC, Rider, Progress, Ride의 card receipt와 Coach composer/provider response receipt는 서로 다른 객체다.
  runner는 실제 card payload와 Coach answer가 참조한 structured evidence/prescription evidence를 각각 독립
  파싱하고 normalized claim을 비교한다. 응답 evidence의 값 하나만 card와 달라도 실패하며, 양쪽의 source
  revision, projection, evidence, shared-facts digest가 모두 같아야 한다. card 계수는 receipt에서 관측된
  0이어야 한다.
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

job은 protected Environment `ai-coach-four-axis-evidence`에서만 실행한다. child dispatch를 시작한
`github.actor`는 `AI_COACH_EVIDENCE_DISPATCHER_ACTOR`의 GitHub App bot과 exact match한다. 이 값은 parent
orchestrator actor와 별개다. parent actor는 canonical request와 request digest에 포함되고,
`AI_COACH_EVIDENCE_ORCHESTRATOR_ACTORS_JSON` protected allowlist에 포함되며 관측한 parent run actor와 exact
match해야 한다.
`id-token: write` GitHub OIDC를 Google Workload Identity Federation으로 교환하며 service account key나
장기 bearer/test identity secret은 사용하지 않는다. 각 target origin을 exact audience로 삼아 Google ID
token을 메모리에서 발급하고, stage-only `/v1/evidence/four-axis/attestation`에 request digest와
stageRun/revision/image/provider phase와 parent orchestrator actor가 결속된 요청을 제출한다. Google OIDC는 이
attestation 한 번에만 사용한다. 응답의 exact v3 binding과 만료, target별 Progress locator
(`prescriptionId`, `sourceRequestId`, `proposalId`, `fixtureDigest`)를 검증한 뒤 `firebaseCustomToken`을
Identity Toolkit `signInWithCustomToken`으로 교환한다. 실제 product observation은 Firebase ID token을
`Authorization`, target별 `appCheckToken`을 `X-Firebase-AppCheck`, target별 evidence lease digest를
`x-orider-evidence-lease`로 전송하고, 검증된 correlation ID와 orchestrator actor도 각각
`x-orider-evidence-correlation`, `x-orider-evidence-orchestrator-actor`로 함께 결속한다.
baseline/candidate 자격 증명은 각각 발급·교환하여 서로 재사용하지 않는다.
모든 token은 문자·길이·개행 검증 후 GitHub mask 처리하며 token, refresh token, credential,
attestation body/response를 출력하거나 artifact에 저장하지 않는다. parent run은 수집 시점에 exact
`status=in_progress`, `conclusion=null`이어야 하며 완료된 과거 run을 재사용하지 않는다.

다음 protected variable/secret이 실제 환경에 있어야 한다.

- `AI_COACH_STAGE_COLLECTOR_WIF_PROVIDER`, `AI_COACH_EVIDENCE_SERVICE_ACCOUNT`
- `AI_COACH_EVIDENCE_DISPATCHER_ACTOR`, `AI_COACH_EVIDENCE_ORCHESTRATOR_ACTORS_JSON`,
  `AI_COACH_STAGE_HOST_SUFFIX`, `AI_COACH_STAGE_HOST_SUFFIX_SHA256`, `AI_COACH_STAGE_FIREBASE_WEB_API_KEY`
- `AI_COACH_GATE_APP_ID`, `AI_COACH_GATE_APP_PRIVATE_KEY`: orchestrator run read 전용 단기 GitHub App token 발급
- orchestrator가 만든 아직 만료되지 않은 immutable request, baseline/candidate stage leases와 tagged URLs

이 값이나 HTTP receipt endpoint가 없으면 실제 10+10 run 및 canonical artifact 생성은 fail-closed다.
GitHub Actions billing 또는 spending-limit로 job이 시작되지 않은 경우도 로컬/정적 결과로 대체하지 않는다.

## 별도 local operator 증거 경로

GitHub Actions 실행 경계는 그대로 유지한다. 로컬 실행은 workflow 환경 변수를 흉내 내거나 GitHub Actions API를
호출하지 않고, 별도 `scripts/run-ai-coach-four-axis-web-evidence-local.mjs`와
`scripts/verify-ai-coach-four-axis-web-evidence-local.mjs`만 사용한다. 따라서 로컬 artifact는 workflow 실행 성공을
주장하지 않으며 schema도 `ai-coach-four-axis-web-stage-baseline-local-evidence-v1`로 분리된다.

local context와 request JSON은 clean-tree 검사에 포함되지 않도록 저장소 밖의 같은 디렉터리에 둔다. context는 exact
key만 허용하며 다음 값에 결속된다.

- RFC 4122 v4 `contextId`, `issuedAt`, 30분 이내 `expiresAt`
- `miranae/orider-web`, exact 40자 `commitSha`, `git rev-parse HEAD^{tree}`의 `treeSha`
- 현재 OS 계정, Git 작성자, `gcloud auth list`의 활성 계정과 정확히 같은 `operator`
- stage attestation용 고정 collector `identity.serviceAccount`와 backend가 승인해 context에 넣은 단일
  `identity.orchestratorActor`; ID token은 collector 계정을 impersonate해 target origin audience로 발급
- 같은 디렉터리 request 파일명과 exact byte SHA-256
- canonical stage host suffix/digest와 baseline/candidate의 target fingerprint, tag, revision, image digest, stage run ID

context exact shape는 다음과 같다. target 값은 같은 디렉터리의 immutable request에서 그대로 복사해야 하며 runner가
독립 비교한다.

```json
{
  "schemaVersion": "ai-coach-four-axis-web-local-context-v1",
  "contextId": "<uuid-v4>",
  "repository": "miranae/orider-web",
  "commitSha": "<40-hex>",
  "treeSha": "<40-hex>",
  "operator": { "osAccount": "<id -un>", "gitAuthor": "Name <email@example.com>", "cloudAccount": "<active-google-account>" },
  "identity": { "serviceAccount": "ai-coach-stage-collector@orider-dev.iam.gserviceaccount.com", "orchestratorActor": "<backend-approved-actor>" },
  "issuedAt": "<ISO-8601>",
  "expiresAt": "<same-as-request>",
  "request": { "path": "request.json", "sha256": "<exact-request-bytes-64-hex>" },
  "stage": {
    "hostSuffix": "---orider-ai-api-stage-ldfyfyx5da-du.a.run.app",
    "hostSuffixSha256": "<64-hex>",
    "targets": { "baseline": { "targetFingerprint": "sha256:<64-hex>", "tag": "<tag>", "revision": "<revision>", "imageDigest": "sha256:<64-hex>", "stageRunId": "<stage-id>", "productionAuditDigest": "sha256:<64-hex>" }, "candidate": { "targetFingerprint": "sha256:<64-hex>", "tag": "<tag>", "revision": "<revision>", "imageDigest": "sha256:<64-hex>", "stageRunId": "<stage-id>" } }
  }
}
```

실행 시 context 파일 자체의 exact byte SHA-256도 별도 인자로 제공한다.

```bash
node scripts/run-ai-coach-four-axis-web-evidence-local.mjs \
  --local-context /secure/operator/context.json \
  --context-sha256 <context-file-sha256-hex>
```

runner는 실행 직전에 HEAD, tree SHA, untracked 파일을 포함한 empty porcelain status, 활성 Google operator 계정을
재검사한다. 같은 9개 정적 테스트, 실제 Chromium reflow/keyboard/accessibility 관측, baseline/candidate 10+10 제품
HTTP 호출 및 전체 privacy scan을 수행한다. attestation에서 target별 Firebase identity, App Check token 또는 evidence
lease digest가 하나라도 없거나 만료·target binding이 다르면 실패한다. 장기 키나 token은 파일, 로그, artifact에
기록하지 않는다.

semantic artifact의 top-level `evidenceLeaseDigests`는 exact `{baseline,candidate}`이며 두 값은 서로 다른
`sha256:<64-hex>`여야 한다. artifact, local-file envelope, envelope SHA-256 sidecar는 모두 exclusive create(`wx`)로
기록하여 기존 증거를 덮어쓰지 않는다.

backend 전달 envelope는 한 줄 canonical JSON이며 exact contract는 다음과 같다.

```json
{"executionMode":"local-file-v1","headSha":"<40-hex>","treeSha":"<40-hex>","statusClean":true,"evidence":{"path":"artifacts/<local-artifact>/<local-artifact>.json","bytes":12345,"sha256":"sha256:<64-hex>"}}
```

동일 디렉터리에 `<artifact>.local-file.json.sha256`이 생성된다. backend는 envelope 값을 신뢰하지 않고 evidence 파일의
exact bytes와 SHA-256을 독립 재계산한다. verifier도 context/request/repository/Google identity/stage targets를 다시
결속한 뒤 artifact byte 수·SHA-256과 envelope exact bytes digest를 검증한다.

```bash
node scripts/verify-ai-coach-four-axis-web-evidence-local.mjs \
  --local-context /secure/operator/context.json --context-sha256 <context-file-sha256-hex> \
  --artifact artifacts/<name>/<name>.json \
  --envelope artifacts/<name>/<name>.local-file.json \
  --envelope-sha256 <envelope-file-sha256-hex>
```

## #1668 consumer와 schema 전환

#1668 consumer의 `validateWebStageBaselineProducerEvidence`와 동일하게 v3는 `targets.baseline/candidate`,
`liveComparison.baseline/candidate`, baseline/candidate metrics exact keys를 사용한다. Web의 representative v3
fixture는 backend validator가 그대로 읽어 교차 검사할 수 있다. backend는 GitHub API의
repository/workflow/run/head SHA/artifact ID/archive digest와 request/orchestrator/stage lease provenance를 다시
결속한 뒤에만 완료 증거로 받아야 한다. v2 validator/fixture는 이전 producer provenance 재검증에만 남으며
production actual 비교나 단순 push/dev artifact는 승격 근거가 아니다.
