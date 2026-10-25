# Epic 2882 local integration

2026-10-26. The user's local-only instruction supersedes the earlier remote delivery workflow. Do not push, merge, deploy, or update remote issues from this checkout.

## Integrated behavior

- Native public activity details, owner memo revision checks, paginated comments, full photo gallery and immediate access-revocation cleanup.
- Native observed routes explicitly retain incomplete/unknown coverage and remain excluded from competitive ranking.
- KST custom dates, complete 28-day comparison and year-to-date controls for training/power analysis.
- Club invitation recovery preserves the original invite through sign-in and retry. Public club crawler previews use public visibility, active/directory flags and deletion checks.

## Local runtime

Web source: `/Users/kyoungnam/work/moon/_worktrees/orider-epic-2882-local-integration-20261026`.
Server source: `/Users/kyoungnam/work/moon/_worktrees/orider-g1-web-epic-2882-local-integration`.
Demo and transport artifacts: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882`.

The browser demo uses actual source components and Firebase SDK calls against synthetic data in `demo-orider-epic-2882-full`. The final dedicated stack runs HTTP Functions on port 5039 in asia-northeast3, background aggregation/native feed projection on port 5029, Firestore on port 8398, Auth on port 9309 and Storage on port 9409. Both Functions processes share only the synthetic demo project; HTTP-only 5039 does not register duplicate background triggers. Earlier narrow-transport artifacts remain for traceability. No real athlete data is required. The final `full-app` harness mounts the actual AppRoot, AuthProvider and BrowserRouter and uses the real Firebase SDK. The earlier component-only demo remains for traceability. This verifies local application routing, not deployment or production authentication infrastructure.

The training-only local switch requires a development bundle, loopback page, explicit emulator configuration, a demo project, an exact loopback customDomain and matching Firebase app identity. If Functions has an emulatorOrigin override, its effective origin/project/region URL must match the configured local demo endpoint exactly; a matching customDomain alone never authorizes a different actual destination. No stage-derived options or running analysis are enabled by this local switch.

## Evidence boundaries

Actual HTTP smoke checks exercise callable middleware and Firestore with emulator tokens. They do not prove production App Check signature verification. Browser screenshots use synthetic assets. Local latency is not production performance evidence. Historical PMC migration, real-account rollout, beta recruitment and mobile delivery are outside these local checks.

Before any future remote release, inspect the combined diffs and follow repository deployment/review gates. There is deliberately no automatic remote delivery step in this local handoff.

## Earlier integration validation (before the following additions)

- Web: 877 Vitest files / 9,376 tests passed; contract suites passed. Node 22 development build, lint and quality budgets passed.
- Backend integration: 555 targeted tests passed / 14 opt-in emulator cases skipped in that run; build/lint/index-policy passed. A separate linked-source Firestore regression ran both cases successfully.
- Actual callable HTTP smoke: 9/9 passed on the dedicated stack, including automatic kudos/comment count aggregation; period endpoints confirmed 124.8 km versus 50 km and 5-minute measured power 280 W versus 260 W using synthetic data.
- Actual browser Firebase SDK: public detail, kudos, comments/pagination, gallery, memo and both period endpoints returned 200 without page errors. Mobile and desktop screenshots are in the external demo artifact directory.
- Current full application preview: http://localhost:5174/ko/ . The external `full-app/README.md` documents startup and the dedicated synthetic browser. Earlier component previews remain at port 5222. Port 5224 is not the final preview because the existing REST CORS policy accepts localhost:5174.

The original activity date label now states KST to match the displayed date; the diagnostic snapshot timestamp continues to state UTC. The two period panels disclose their distinct candidate populations. See the server's `docs/analysis/period-linked-source-populations.md` for the linked-copy regression contract.

Dedicated stack startup and evidence: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/full-stack/README.md`. Existing shared emulator services were not restarted or reconfigured.

Final follow-up fixes: confirmed reactions no longer revert to pre-write counts while background aggregation catches up (bounded permission-checked readback); access revocation invalidates pending readbacks. Memo/comment controls restore keyboard focus. The final 9,376-test run and development build include these fixes.


## Additional local verification — 2026-10-26

- A synthetic native activity went through Storage upload reservation/finalization and the real activity metrics writer. Seven sensor axes with 601 samples produced canonical version 41: 6 km, 600 seconds, 10 m ascent and 221.879 W normalized power. The recorded summary intentionally had 12 m ascent. Automatic Cloud Tasks delivery was not exercised; the real writer was invoked directly after upload finalization.
- Actual mobile feed, public detail and owner analysis now agree on canonical 10 m ascent. The mobile card previously used recorded summary 12 m; `withActivityPresentation` now supplies the same presentation contract as the desktop card. The full-app journey used actual callable/REST endpoints, with successful responses and no page errors.
- Raw analysis displays elevation, speed, heart rate, measured power, cadence, zones and the power curve from the synthetic 601 samples. Owner streams succeeded; foreign access was denied. See `full-stack/raw-native-readback-results.json` and `full-app/raw-journey-results.json` in the external artifacts.
- Fixed-dimension journey measurements cover public detail, period analysis and social mutations, including cancellation/error outcomes. They exclude IDs, GPS, health values and user text. Their component timing boundary is distinct from navigation-to-render measurements. See `journey-measurement.md`.
- The local training switch validates the effective Firebase SDK destination, including emulator origin, demo project and region. An unrelated emulator or remote endpoint cannot be enabled by a matching custom-domain string.
- Native route backfill inventory is a bounded, local-only, read-only plan: explicit synthetic owner/activity IDs, no raw-object download or scheduled work, documented cost/failure limits. See server `docs/analysis/native-route-backfill-plan.md`.

The whole epic remains open. App work is deferred, and production deployment, real rider beta, automatic queue delivery, historical production backfill and production performance have not been completed by these local checks. Subsequent segment/shared-preview changes require their own tests and the final combined checks.


## Segment and sharing follow-up

- Native segment comparison supports KST periods, all/following/club scope, fastest-first bounded pages and per-rider deduplication. Latest actual HTTP/browser checks on port 5039 returned 3/1/1 riders for the separate filter fixture. Mobile criteria are expandable and the confirmed rider count is distinguished from the eligible member population.
- The actual native matcher now writes an activity fingerprint and semantic source-stream digest in the same fenced publication transaction. Public comparison, RideAhead and Local Legend reject unstamped or changed sources; owner history remains available. The local real-matcher fixture generated three efforts and verified rejection after a source revision change.
- Local Legend uses the existing thirteen-KST-week definition and minimum three completions, rechecking current ACL, deletion fences, source revision and name opt-out. A capped scan cannot award a leader. The real matcher fixture produced a three-completion selection; larger synthetic scans were separately measured on the emulator, not production.
- Direct reads of persisted segment documents/efforts/legend snapshots are denied. A bounded metadata API returns explicit permitted fields; authenticated creators retain pending/rejected proposals, while other viewers receive public approved/active metadata. Account switches discard stale owner responses.
- Activity SEO and OG use the same anonymous public-detail authorization. Canonical 6 km/10 m appeared in crawler metadata; after a separate synthetic activity became private, SEO became noindex and OG returned 404 with no-store. OG bytes were preseeded synthetic cache bytes, not an external map rendering test.

Latest broad web regression checkpoint: 883 files / 9,391 tests passed; development build passed. Later isolated changes must retain their own targeted evidence. Runtime auth-region and artifact-watch errors are preserved separately from corrected results; earlier business-call-only success observations are not evidence that every auxiliary request had succeeded.


## Final local handoff

Final product source: web `3933cd42`, server `16f07db7`. All changes after the local-only instruction remain local; no remote issue edits, pushes, merges or deployments were performed for this handoff.

- Web full regression: 884 files / 9,413 tests and contract suites passed. The final route-guidance copy change then passed 19 focused tests, locale key parity, lint and a fresh development build. Node 22 build, full lint and quality budget passed.
- Server current combined source: Node 22 build and full lint passed. Feature-specific regression and actual emulator/API evidence are documented above and in the external runbooks.
- Owner GPS preview is explicitly requested by the owner and rejects stale account/source results. Two actual native uploads produced indexed observed routes; the actual route comparison and two-member group API succeeded. Unknown coverage remains explicit and excluded from competitive ranking. Missing/nonfinite feed metrics render a dash while actual zero remains zero.
- Frozen-source browser measurement: 120/120 successful navigation-to-render attempts, 30 fresh contexts and 30 same-context reloads for each of feed and owner analysis. Each attempt made exactly one main-document request. No page errors or HTTP >=400 from local Functions were observed. Start/end source SHA both `3933cd42`.
- Local p95: feed 369 ms fresh / 280 ms reload; owner analysis 974 ms fresh / 903 ms reload. Chrome headless, 390x844, unthrottled loopback, warm synthetic emulators. These values do not establish production or backend cold-start performance.
- Measurement history is retained: the initial frame-event counter incorrectly counted same-document router updates; the final counter counts actual main-document navigation requests. Earlier watch-contaminated and auth-region results are separate from the final run.

Open http://localhost:5174/ko/ for the synthetic feed. Owner analysis: http://localhost:5174/ko/activity/ui-raw-native-ride?demoAccount=owner&tab=analysis . Recorded GPS preview: http://localhost:5174/ko/activity/ui-route-native-2?demoAccount=owner&tab=analysis (select “기록된 경로 보기”). External `full-app/README.md` contains the dedicated browser startup command; `local-flow-benchmark-results.json` contains all 120 attempts. Runtime remains running for local review.


## Subsequent acceptance audit

The first local handoff was not the full acceptance boundary. See [acceptance-followup.md](acceptance-followup.md) for subsequently discovered and fixed photo-access, safety-action, KST-filter and period-state gaps, the new 9,467-test combined checkpoint, actual Storage/browser evidence, and requirements still outstanding. The earlier latency result applies only to its recorded SHA.

## Representative photos, power provenance and consistent ordering

Latest local increment: [implementation and verification](cover-and-power-verification.md). Owner cover selection/clear/deletion fallback, conservative public power provenance and Firestore-compatible same-time feed/search ordering are implemented. Web 893 files / 9,480 tests plus contract suites, lint, quality budget and development build passed at product `1a014fe6`; server `8c04d91f` build/lint/compat passed. [Remaining acceptance](acceptance-followup.md) continues to distinguish deferred recorder/beta/release work from completed local behavior.

## Notification, club and media follow-up

The local web now reads notifications through current access checks and opens the exact comment, including login return, deletion/block handling and account/background cleanup. Club invitation retry is idempotent; anonymous visitors can reach the public preview and return after login. Overlapping native photo reads share only in-flight requests, and failed static maps provide an explicit retry.

Evidence: [notifications](notification-followup.md), [club journey](club-invite-journey.md), [photo reads](photo-read-coalescing.md), [latest combined checks and remaining acceptance](acceptance-followup.md).

Broad checkpoint: web 896 files / 9,509 tests plus contract suites; Functions 925 files / 15,574 tests with 531 opt-in tests skipped. Subsequent static-map presentation: 29 focused tests and final development build/quality budget passed. All changes remain local. Existing Android raw-notification consumers must migrate before the new notification rules can be released; no standalone rules deployment is authorized or performed.
