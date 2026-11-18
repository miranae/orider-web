# Bundled Functions transport

The same callable paths run in development and production. `bundled-development`
and `bundled-production` select reviewed gateway and AI origins while preserving
production Firebase Auth/data identity and feature flags. They do not enable the
isolated analysis-only QA features.

The ordinary and embedded Web clients keep Firebase SDK authentication, App Check,
serialization and timeouts. Auth and handoff use the selected gateway; handoff
redemption still uses its separate FirebaseApp without Auth/App Check. No failed
bundled request retries against a legacy named Function.

Prepare public configuration without publishing:

```sh
node scripts/prepare-bundled-client-config.mjs \
  --source /tmp/production-runtime.json \
  --environment development \
  --output /tmp/bundled-development-config
```

Repeat with `production` for the production overlay. The output is configuration,
not a standalone Hosting release: it does not contain the built assets. Keep the
same JS/CSS artifact, pair it with the generated runtime and Hosting configuration,
and retain the release attestation/artifact checks in the deployment pipeline.
The generated Hosting rewrites replace the former Function targets with the
default gateway and preserve original paths, including REST, Strava ingress and
SEO endpoints.

The existing runtime writer accepts `BUNDLED_RUNTIME_CONFIG_PATH` and
`BUNDLED_FUNCTIONS_ENVIRONMENT`. These must not be combined with the former
production-data/parity source variables. Normal deployment remains unchanged
until this explicit configuration is selected. Deploy the backend and verify
its source/topology/digests before activating either profile.


Development Hosting is deployed only by explicit `Deploy (Hosting → stage)`
dispatch. Merging `dev` does not deploy it. The source defaults to `main` to preserve production feature parity. Select an explicitly reviewed full SHA in `source_ref`, transport and the
validated bundled backend's full SHA. The job resolves the frontend ref to a full
SHA, checks the live gateway source/topology, prepares a matching runtime and
Hosting/CSP configuration, and seals the actual built `dist` artifact. Predeploy
rechecks its bytes and backend identity; the published entry/runtime are then
compared with that artifact. Only explicit `legacy` selection runs the former
regional Functions CORS checks. The verified client artifact and receipt are
retained for seven days. Authentication uses Firebase CLI Application Default
Credentials from the development WIF action, without a legacy Firebase token.

Production tag releases remain on `legacy` by default. After the production
backend is validated, explicitly set repository variable
`ORIDER_FUNCTIONS_TRANSPORT=production` for the reviewed release. The tag workflow
creates the production pair from that release's normal feature variables, never
from the development snapshot, and rechecks gateway source/topology before
Hosting deployment. The existing production tag, main-ancestry and environment
approval gates still apply. No variable or production deployment is changed by
this preparation. The production AI address remains the existing canonical
`orider-ai-api-h5zqzw3n4a-du.a.run.app` service.

This hotfix ports transport and deployment tooling onto production main only.
It does not import the unreleased DEV business/UI changes or its older parity profile.

Production opt-in also requires the independently reviewed repository pins
`ORIDER_BUNDLED_BACKEND_SOURCE_SHA` (40 hex) and `ORIDER_BUNDLED_TOPOLOGY_HASH`
(64 hex). The first health response must match both; later readbacks stay pinned.
The bundled predeploy checks all 41 canonical social callables on the selected
gateway for HTTP401/UNAUTHENTICATED, then checks backend identity again.
Development source must be an ancestor of reviewed `origin/main` or `origin/dev`
before any selected source script, install or cloud authentication runs.

Readiness also requires a randomized missing callable to return the router's
HTTP404/unknown-bundle-function response; blanket HTTP401 authentication alone
cannot establish route readiness. The development artifact must contain a
nonempty HTML entry and its referenced JS chunk before it can be sealed or published.

Before bundled development publication, the job snapshots the exact finalized
`orider-dev` live Hosting version. If publication or live entry/detail verification
fails, it restores that version only when the current release carries this run's
unique deployment marker, then checks the live pointer. A different observed release identity aborts the job's publication or recovery. A recovered release still leaves the job failed
for investigation. This recovery is fixed to development and does not publish
or roll back production.

Development live publication supports serialized CI writers only. Before enabling
it, audit all normal writer paths to use the same repository workflow concurrency
`deploy-hosting-stage` with cancellation disabled, then set repository variable
`ORIDER_STAGE_HOSTING_SERIALIZED_WRITES=true`. Missing/false rejects before cloud
authentication; the Hosting helpers also reject before requests. Publication
rechecks the snapshotted release name/version twice, and compensation rechecks
its own marker/name/version immediately before POST.

This variable is an operator assertion, not IAM enforcement. Firebase Hosting's
release API provides no compare-and-swap/ETag precondition; these reads are not
atomic with publication. Concurrent out-of-band Console/manual publication is
unsupported. Break-glass changes require stopping/awaiting the active workflow,
then inspecting the current live release before resuming CI. An unconstrained
owner publishing during the last read-to-write gap remains a platform limit.

Both release profiles verify handoff's malformed-code rejection and the AI API's
anonymous-auth rejection with browser Origin/preflight headers; these probes do
not exchange a handoff code or invoke a model. Development identity is re-read
after callable probes and again after the final public API probe. For the bundled profile, served root
and detail HTML must contain the actual executable entry script, not merely its
filename in a preload, comment or inert element. HTTP reads have bounded timeouts.
Executable entry URLs must be root-absolute and resolve to the development origin, including when the document contains a base element. Explicit historical `legacy` releases retain their earlier inline entry inspection without requiring new bundled tools absent from that source.
The compensating release step also runs on workflow cancellation when the runner
can execute cleanup; a forcibly terminated runner still requires live-state
inspection before the next manual/break-glass operation.
