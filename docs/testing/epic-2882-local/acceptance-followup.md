# Acceptance follow-up after the first local handoff

Latest local verification: [route readiness, session boundaries and real GPX period/diary processing](route-readiness-and-session-checkpoint.md). Earlier [feed restoration, period load/log, metrics ownership and local review](local-review-checkpoint.md) records map privacy, accessibility, route inventory and beta-plan evidence. Test results remain tied to their source checkpoint; later source changes require their own evidence.

2026-10-26. The preceding handoff proved a working local slice, not every requirement in epic miranae/orider-g1-app#2882. This audit re-read the current epic through authenticated GitHub CLI (the connector returned 404), compared source and existing evidence, and continued local implementation. Remote writes, pushes, merges and deployment remain prohibited by the user's latest instruction. Web and server remain the priority. Earlier limited Android/iOS compatibility work is recorded separately. App work is currently lower priority; native/device parity and release readiness remain outside the completed web/server evidence.

## Additional completed local behavior

- **R1 photographs:** owner uploads now use bounded, idempotent server writes without Firebase bearer download tokens. Direct Storage access is denied. Public, feed, owner, profile, map and creator photo consumers use a photo reference and authorized byte reads; no native Storage URL fallback. Server checks current activity/photo access before and after pinned-generation byte reads. Imported activities can retain genuinely owner-uploaded photos through the same contract.
- **R1 browser lifetime:** only photos near the viewport load bytes; leaving the viewport, account/app changes, backgrounding and unmount revoke Blob URLs. Visible images check authorization every 30 seconds without downloading bytes again. Failed checks remove the image. The cadence is not a strict 30-second global guarantee: network/handler timeout contributes to worst-case removal delay. The synthetic browser observation was 30,003 ms. Missing individual photos remain an individual error with retry, while permission denial invalidates the public detail.
- **R2 same-time ordering:** home, search and local search merging now share startTime DESC / UTF-8 document ID DESC ordering, matching Firestore’s implicit document-name order. Snapshot cursors and buffered source frontiers remain unchanged. Equal-time cross-source pagination regression covers own/public/friend rows and 40 search results.
- **R2 year filter:** feed and server search use the same January 1 KST boundary, including when the browser is in another timezone. UTC-run focused regression: 148 tests passed.
- **R3 safety actions:** public detail now provides activity reporting, hiding and blocking with confirmation, cancellation, retry and account-bound responses. Successful hide/block removes detail and drafts. Home/search wait for and filter against persisted own hidden/blocked state, including restoration when the setting is removed. Actual browser checks passed nine cases with real callable 200 responses and snapshot-based restoration. All test moderation/following changes were restored.
- **R6 comparison continuity:** valid period, W/Wkg and duration inputs survive original-activity navigation and return in the same browser session. Scope includes Firebase app/project, owner and account creation. Aggregate results, health values and activity IDs are not persisted; users explicitly query again. Validation rejects invalid/future ranges and stale hydration cannot replace new input.
- **R7 club journey:** anonymous shared-club visitors now stay on public preview/login; the shared layout no longer forces anonymous onboarding. Invite retries read back existing active/pending state without another use/count/history write. Actual local router invitation → sign-in → club → joint ride → activity → first reaction passed; anonymous preview → sign-in → same club also passed. Fixed-dimension share_open/club_join outcomes are measured. See [club invite evidence](club-invite-journey.md) for source, emulator readback and OAuth/device limitations.
- Photo consumer follow-ups cover profile reference deduplication, owner projection/upload deduplication, photo deletion controls and removal of stale map popups. Existing provider-photo behavior remains distinct.

- **R2 representative photos:** owner select/clear/current indicator, revision conflicts and deleted-photo fallback are implemented locally. Actual browser and background-trigger/concurrent-write evidence is in [cover and power verification](cover-and-power-verification.md).
- **R4 public power:** canonical average/normalized power now carries estimated/measured/unknown provenance; zero remains distinct from missing. The same [verification record](cover-and-power-verification.md) explains conservative classification and actual mobile browser evidence.

- **R3 notification follow-up:** activity/comment notifications now recheck current visibility, block and deletion before serving content; exact comment destinations, read receipts and login return are connected. Hidden/background/account changes clear content; periodic checks have documented timing limits. See [notification verification](notification-followup.md).
- **R7 club invitation:** anonymous public preview, login return, idempotent active/pending membership recovery and first reaction are verified locally. See [club journey](club-invite-journey.md).

## Earlier authoritative local evidence

Web product SHA `1fe01913` plus tests/mocks through `c8473585`; server `c03e505d`.

- Actual Storage: `full-stack/photo-storage-results.json`, 10/10 cases. Includes token bypass before explicit synthetic revocation, rejection afterward, private/block/delete checks, metadata-only access checks and eleven simultaneous uploads yielding ten registered photos.
- Actual browser: `full-app/secure-photo-browser-results.json`. Owner upload 200, owner/public image bytes 200, one photo (no duplicate), private-transition access check 403 and displayed photo removed in 30,003 ms; no page errors. Original visibility restored. Fixture photo remains on `ui-route-native-2` for review.
- Repaired synthetic gallery: `full-app/secure-gallery-results.json` returned seven photo references; scrolling requested all `p0`–`p6` through the real byte API with 200 responses and no page errors. Offscreen Blob images were released. A direct anonymous Storage media request for the new `p0.png` object returned 403.
- Actual safety browser: `r3-safety/photo-free/results.json`, nine checks; dedicated photo-free fixture avoids conflating missing historical synthetic objects with safety mutation results. Earlier failure artifacts are retained, including the fixed photo-not-found/activity-revocation bug and a harness condition that mistakenly waited for the blocked author's card.
- Server build/lint/compat, 86 targeted tests and Storage rules test passed. Web focused evidence includes 21 period-state tests, 108 photo-consumer tests, 101 safety tests, 21 profile-photo tests, 18 dedup/map tests and 9 missing/denied/offscreen-photo tests. These groups overlap; do not sum them into a unique total.
- The earlier 120-attempt latency result belongs to source `3933cd42`; it is not a measurement of the subsequent safety/photo changes.

Paths above are relative to `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882`.

## Combined follow-up gates

- Node 22 web full regression: **891 files / 9,467 tests passed**, followed by all contract suites. The initial full run exposed two older partial Firebase service mocks (16 failures); those mocks now satisfy the required auth/app contract, and the full rerun passed. Product authentication checks were not weakened.
- Current product build, full lint and quality budgets passed. Later changes after that build are tests and documentation only.
- The seven historical synthetic `ui-native-ride` photos had HTTPS fixture URLs but no actual Storage objects. They were replaced using the real bounded upload writer in the isolated demo project; the previous synthetic document snapshot and exact changed IDs are retained in `full-stack/demo-photo-before-byte-migration.json` and `demo-photo-byte-migration.json`. No production documents or tokens were touched.

## Subscription session continuation

Local web `12bb2011` binds subscription summaries, relationship/profile hydration, subscription writes and unblock writes to the exact originating Firebase SDK user, not only its UID. A same-UID sign-in during AppCheck readiness now prevents dispatch; a replacement during an in-flight response prevents accepting stale data or emitting the feed refresh event. The profile subscription control also discards old-session pending state and starts a fresh summary read. Requests already dispatched cannot be undone by this client fence; server authorization still applies.

Two focused suites / 25 tests, changed-file ESLint and TypeScript passed. Tests include same-UID and different-UID replacement, no dispatch after readiness, no stale refresh event, relation hydration and normal subscribe/unsubscribe. This is deterministic race coverage, not a new real-browser subscription journey. Log: `/tmp/orider-r3-session-test.log`.

## Still not satisfied

| Requirement | Evidence gap / next work |
|---|---|
| R3 notification release compatibility | New raw notification rules require the existing Android/KMP consumer to migrate to the access-checked API, including correct read-receipt behavior, before release. The current UI offers mark-all-read, not deletion; the local migration preserves inbox rows and is awaiting platform gates. Local web completion does not authorize deploying these rules alone. |
| R1 historical photo revocation | Production bearer token revocation and old projection migration have not run. Local tests cannot prove old production URLs are revoked. A bounded inventory/explicit rollout is required when authorized. |
| R5 native physical-ride completeness | Exact-T whole-owner census, settled duplicate groups and recorded-gate elapsed best are now implemented and verified locally (see checkpoint below). This does not prove that a physical ride was completely captured. The [coverage audit](native-route-coverage-audit.md) still applies: local FINISHED/checkpoint/failure state is not uploaded, and finalized bytes do not prove whole-ride completeness. A recorder sequence/terminal-flush witness remains necessary for that stronger claim; unknown coverage is not promoted to complete. |
| R0/R8 paid comparison and release-wide QA | Real paid-Strava paired comparison, production latency/cost and physical-device evidence are absent. Local emulator measurements are not substitutes. Overlapping profile photo reads now share requests; sequential reads can still repeat. See the bounded [photo read evidence](photo-read-coalescing.md), which is not production cost evidence. |
| R9 beta/release decision | [Executable beta plan](beta-execution-plan.md) now defines the proposed 24-person cohorts, 14-day tasks, full denominators and stop/resume decision records. Real-rider recruitment, two-week observation, staged release, store versions and product-owner launch decision remain unperformed. No external contact is authorized by this local work. |

The goal and full epic remain open. No remote issue state is changed by this report. APP remains lower priority than web/server. The latest sparse-feed Android/shared run passed 57 tests and production compilation. iOS APP `a447e7c0` passed compilation and the final SwiftData suite: 43 tests, zero failures/skips, after the two formerly failing cases passed individually. The earlier 179-test checkpoint and other expanded-suite partial passes remain separate, overlapping evidence; this is not a fresh final-source all-app gate. Actual native WebView handshakes and physical-device acceptance remain outstanding. Exact snapshots are in the app hosted-Firebase-isolation handoff and external `app-local/swiftdata-final-source.json`.

## Earlier combined local checkpoint

Web `1a014fe6`, server `8c04d91f`: 893 web files / 9,480 tests and all contract suites passed. Web full lint, quality budget and development build passed. Server build, full lint and compatibility checks passed. See [cover/power evidence](cover-and-power-verification.md) for actual browser, concurrency and background-trigger checks. These supersede earlier full-regression counts for this source; earlier performance measurements remain scoped to their original SHA.

## Notification / club / photo-read checkpoint

2026-10-26, web product `e4a7c59f`, server `0ad26ef1`:

- Web **896 files / 9,509 tests passed**, followed by all contract suites. Full lint, quality budget and development build passed.
- Functions **925 files / 15,574 tests passed**, with **52 files / 531 opt-in tests skipped**. Build, full lint and compatibility checks passed. Separate emulator/rules/browser evidence remains necessary; skipped cases are not counted as passed.
- The first complete Functions run exposed seven regressions: authentication had moved after local runtime inspection, and four older test contracts/fixtures had not followed the native matcher/current-public-record changes. Authentication ordering was fixed; reviewed deletion-read fingerprints and source-aware fixtures were updated without weakening the guards. The full rerun passed.
- The first complete web run exposed two friend-acceptance tests still mocking the removed raw notification listener. They now exercise the new inbox contract and retain sender-path validation; the full rerun passed.
- Notification browser: 5/5 checks, no page errors, fixture mutations restored. Club browser: invitation/login/join/ride/reaction and anonymous preview/login return passed; server readback proved one invite use and one kudos aggregate.
- Logs: `/tmp/orider-2882-notification-{web,functions}-all-final.log`, plus corresponding `*-build-final.log`, `*-lint-final.log` and web `*-quality-final.log`. Synthetic evidence is linked from the feature documents.

Subsequent static-map failure presentation fix `116422c0`: failed static images now show a shared error state and retry action, rather than a broken image. The same URL is retried without changing signed URLs; source changes reset the error. Two focused suites / 29 tests, focused lint, final development build and quality budget passed. The polyline and photo paths were not changed. Actual full-app browser kept the real public-detail HTTP 200 and intercepted only the known synthetic `https://localhost:5223/ride.svg` image: first transport failure, then retry success; two image requests, no page errors. Artifacts: `map-retry/results.json`, `failed.png`, `recovered.png` in the external demo evidence root. The initial failed screenshot remains in notification evidence.

## Recorded-route full-history local checkpoint — 2026-10-26

Server product source `c65c6b9e2b2d`, immutable active artifact `d3f9cc5effbf`, local worktree through `ccb5018b`. Node22 build/lint/compat and 937 files / 15,735 tests passed; 56 files / 550 opt-in tests were skipped in the default run. The latest actual exact-T emulator suite separately passed 7/7. Do not sum overlapping suites.

- Actual file-import UI created four distinct synthetic GPX activities. V2 preserves 0.5-second observations separately from unchanged canonical rounded-second streams; private original-byte receipt, payload digest and pinned generation remain validated. All four normal-due-time metrics and index jobs completed; source streams were unchanged. Job enqueue was automatic; processor execution was guarded and manual, not proof of Cloud Tasks/scheduler delivery.
- The owner API enumerates activity documents at one exact Firestore readTime across bounded pages, settles all explicit alias unions, then reduces recorded start/end-gate elapsed intervals. No best is emitted before completion. TTL is 50 minutes, continuation has explicit limits, and arbitrary-size completion is not guaranteed. Schema-1 checkpoints are rejected after schema-2 classification changes.
- Verified gap-free reverse/partial/nonmatching observations are excluded from the target route. Missing sources, gaps, ambiguous duplicate identity or uncertain alternate crossings remain unresolved; they do not silently qualify a best. A reproduced two-lap case with a gap in the second lap now fails closed instead of choosing the first valid lap. Unknown physical capture stays unknown.
- Actual latest V2 SDK/API and 390px UI: one click, five sequential HTTP200 calls, four source-verified activities, two eligible groups, two excluded groups, zero unavailable groups, 600-second recorded best. Exact source-detail/return navigation passed. Fresh UI result is verified within its named snapshot, not an unqualified lifetime or physical-ride PB.
- Actual older V1 fixture retains one unsupported subsecond source: same 600-second observed best plus one excluded and one unavailable group. Intentional status transport failure on focus hides the best; real status retry restores it. Completed results are not persisted through source navigation. Group/inventory discovery and year-control restoration also passed without retaining prior rows.
- The local review entry is `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/REVIEW.md`. Evidence is under `route-import-v2/final-schema2-*`, `final-source-return.json`, `source-axis-proof.json`, and `route-import/history-final-*`, `inventory-return-final.json`. Older failure and runtime evidence is retained.

Web functional product `9727dfa7`: all 921 files / 9,705 tests passed, along with TypeScript, contracts, development build, lint and quality budgets. Completion-label follow-up `4389cea9` separately passed the panel suite (6 tests), TypeScript and changed-file lint; the whole suite was not unnecessarily repeated for this copy-only follow-up. Actual final 390px browser screenshot and original-activity return are retained in `route-import-v2/final-review-history.png`, `final-review-ui-results.json` and `final-review-source-return.json`. Production build was not established: the local configuration lacks the required production AI API base. No substitute provider URL or remote deployment was used.

## Earlier large-history follow-up and final evidence links — 2026-10-26

This earlier audit identified the scale gaps below. Their local implementation and verification are now recorded here; remaining paid-comparison, real-beta and native/device acceptance boundaries are unchanged.

- **R5 interaction scale:** the former 20-request action would require roughly 38 actions for 1,001 independent records. Web `6a0e554f` now performs at most 2,000 sequential requests per explicit action with one in flight, session/expiry checks before dispatch, and no error retry loop. A tab-local checkpoint stores only opaque run ID/version/expiry; restoring it requires an explicit status check and explicit continuation. Same-UID SDK replacement invalidates it. Four focused suites / 33 tests, TypeScript and scoped lint passed at that checkpoint. The later integrated full regression and actual SDK results are recorded below.
- **R5 actual server scale:** the immutable `d3f9cc5effbf` server completed 1,001 separately identified, actually parsed synthetic GPX observations in 51.328 seconds: 754 progress calls and two status calls. It found the sole fastest record on the final page, excluded a post-T insertion, resumed from a serialized checkpoint and emitted no provisional best. Every source was verified, all 1,001 groups were eligible, and exact owned fixtures were cleaned up. This single local direct-server sample bypasses callable quota/AppCheck and does not prove UI or production latency. Full evidence: external `r5-scale-1001/README.md`, `run.cjs`, `result.json`. The subsequent actual panel/SDK verification in another isolated project is recorded below and in [route-history-large-ui.md](route-history-large-ui.md).
- **R6 period scale:** the existing quick training/power scans retain their 200/1,000 limits. The new explicit resumable owner-period path completes 1,001 stored records without claiming continuously current history. Only completed runs expose totals, and missing dense curves or stored weights remain partial. Actual SDK evidence and source boundaries are in [bike-period-snapshot-ui.md](bike-period-snapshot-ui.md).
- **R7 Local Legend scale:** the existing 500-effort getter is preserved. A resumable preparation and bounded final current-snapshot validation path is now implemented and verified on 1,001 synthetic efforts. It rechecks relevant current permissions/source witnesses before emitting a leader; old census pages do not establish current access. Final actual evidence is linked below. No broad client rule migration or weakened privacy contract was deployed.

Each verification runtime is an immutable local checkpoint; later scoped activations are recorded separately. The follow-up work made no remote pushes, merges, deployments or issue updates.

## Large-history web gates — 2026-10-26

Web functional source `655fe654` (including R5 `6a0e554f` and R7 `7c42d45a`):
**927 files / 9,751 tests passed** in 281.35 seconds, and all contract suites passed.
R6 presentation-only block-text correction `5335e039` separately passed four focused
panel tests; the default full suite was already running when that small change was
made, so its coverage is not silently attributed to the earlier full-suite snapshot.
Final source through `5335e039` passed development build, zero-warning lint and quality
budgets. Production configuration/build and remote deployment were not performed.
Logs: `/tmp/orider-large-history-final-web-{full,contracts,build,lint,quality}.log`.

Actual R5 UI: one explicit start, 754 SDK callable HTTP200s, 1,001 records, unique
100-second winner, 62.657 seconds. Reload after 35 responses recovered the same run
through explicit status and continuation. The initial real 429 is retained and the
scoped burst correction is recorded in [route-history-large-ui.md](route-history-large-ui.md).
The synthetic Auth UID was initially created in the shared local Auth namespace;
its exact UID was subsequently deleted and readback documented. Other demo users
were preserved; Firestore and Storage remained in their dedicated namespace.

Actual R7 UI: existing 500-effort partial result → 1,001-effort complete snapshot,
current block recheck excludes the blocked owner's records, no page errors, all
normal POST requests HTTP200. The 390px viewport has no horizontal overflow. The
quick partial read is collapsed separately from the full-range result to avoid
contradictory winner messages. [Legend verification](legend-progress-followup.md)
records its independent Auth/Functions/Vite runtime and exact cleanup manifest.

R6 actual 1,001-record UI initially exposed a backend dense-power fold omission
when only later pages had a dense channel. That failed result remains preserved.
BE `498572b9`, immutable `a0913c1a20f6` / source `a14a7b402052`, now supplies the
channel with all preceding missing counters. A fresh run on the same fixture passed:
258 SDK callable HTTP200s, one in flight, 36.488 seconds, 1,001 km, independent W and
W/kg source winners, 85 selectable durations, 999 missing dense curves and weights,
and 25 FTP contexts paged as 20 + 5. There were no page/request errors or 390px
horizontal overflow. The prior WEB full-suite and later display-only checks remain
separate above; no new full-suite count is inferred from this browser run.

[Period snapshot UI evidence](bike-period-snapshot-ui.md) records the actual SDK
harness at <http://127.0.0.1:5264/>, synthetic canonical-input limitation, separate
Auth namespace and reversible cleanup. The 1,001-record fixture remains available
for user review. Main-runtime activation/smoke evidence is recorded by the root
checkpoint; this isolated panel proof does not stand in for whole-router or
production verification. The epic stays open and all work remains local.

## R7 subscription and current-permission follow-up — 2026-10-26

The subsequent audit found a real integration gap: segment following rankings read
legacy `following` relationships instead of profile `subscriptions`. BE `fb1a85c0`
fixed the source and actual subscribe/unsubscribe, block and private transitions were
verified. WEB `6f7e3f6f` binds requests to the exact SDK session and rechecks current
access on visibility/focus and every 30 seconds. BE `9d6d8203` gives this endpoint a
240/hour budget while retaining its existing 10/minute local burst. The limit tests
cover 120 polls plus 120 interactive requests and rejection beyond both bounds.

WEB: 927 files / 9,761 tests, contracts, TypeScript, development build, lint and
quality budgets passed. BE: 942 files / 15,754 tests, build, lint and compatibility
passed; 58 files / 564 opt-in tests were skipped. These are replacement checkpoint
counts, not additions to earlier overlapping suites.

External `leaderboard-lifecycle/` retains actual SDK checks, including 30-second
refresh, follow/unfollow and transport failure result removal. Visibility events
were injected in a headless browser, not an OS-background test. AbortSignal does
not guarantee cancellation of the underlying HTTP request. Final source
`8257f010fa83` / artifact `d3dc8d993397` is now active on local main 5029/5039 with
verified R5 start/advance/status smoke and R6/R7 unauthenticated 401 responses.
Data services, original fixtures and remote environments were not changed.

The report → administrator eligibility decision → rematch/reinstate procedure was
subsequently completed locally; see the checkpoint below. Native followings and exact notification destinations
are implemented locally but iOS hosted runtime gates remain in progress. No remote
issue or PR updates were posted; the local draft is external `LOCAL-ISSUE-UPDATES.md`.


## R7 ranking reports and administrator queue — local final checkpoint

WEB product5af9dab8 and BEb9cf4c6c add explicit ranking reports, a bounded pending
queue for existing administrators, audited exclusion, actual source rematching
and separate current-source restoration. Reports alone never exclude records;
rematching never silently restores them. Pending queue pages retain continuation
when current deletion/merge guards filter all candidates. Existing direct document
access remains denied. See [report acceptance](segment-ranking-report.md).

Actual SDK lifecycle:11 requests (10 successful and one intended premature-restore
rejection), then4 successful final-queue requests; no page errors or390px overflow.
The server producer processes synthetic101-point GPS with the actual matcher.
This is component/SDK/emulator evidence, not physical recording or production.
WEB928 files/9,767 tests, contracts/typecheck/dev build/lint/quality passed.
BE's prior full run plus corrected caller-inventory rerun covers942 passing
files/15,754 tests; follow-up pending-queue build/lint/compat and23 related tests
passed. These are distinct checkpoints, not a fresh final-source full-suite run.

Current main local runtime is source34909b6605a9/artifactb1186ceebdda. R5 actual
start/advance/status reached complete and all8 unauthenticated endpoint probes
on5029/5039 returned401. activation.json is verificationPending:false. No remote
push, merge, issue update or dev deployment occurred. Native runtime/physical-device
and external beta/paid-comparison requirements remain separately uncompleted.


### Profile calendar KST follow-up (2026-10-26, local only)

Profile year/month/Monday-week aggregation, selected-period labels and the recent
28-day calendar now use the existing Asia/Seoul calendar helpers, consistent with
the period-analysis calendar. Korean/English UI explicitly identifies KST.
31 distinct focused tests passed independently under UTC, America/Los_Angeles and
Asia/Seoul (not 93 unique tests), including UTC year-end, KST midnight and Monday
boundaries. Node22 typecheck and changed-file ESLint passed. No full-suite rerun
was needed for this profile-only date/display change; owner R6 logic is unchanged.

Actual Chrome local app profile (`/ko/athlete/ui-owner?demoAccount=viewer`) at
390×844 showed both KST notices and the current 28-day calendar. Read-only DOM
measurement found viewport/document width 390px and both notice widths 358px;
no horizontal overflow. Existing synthetic accounts and records were unchanged.
The external harness omits the normal copy-locales Vite plugin, so its ignored
public/locales athlete bundles were synchronized from source before verification.
This is local synthetic UI evidence, not a production/browser-timezone matrix;
the three-timezone matrix above is automated regression evidence.

Remaining public-profile limitation: chart inventory still stops after ten
20-item pages (up to 50 candidates scanned per request). If enumeration is not
complete, charts/recent summary are withheld with an explicit limit message.
Profiles beyond this budget therefore do not yet have complete chart exploration.
The existing public discovery contract already accepts fromInclusive/toExclusive
and opaque cursors, but pages are current-authorized seek reads, not one fixed
historical snapshot. A subsequent bounded, explicit period/continuation UI must
retain incomplete-state/permission checks rather than claim exact whole-history
totals. Candidate files are AthletePage, athleteMonthlyActivities, the profile
chart/recent-summary components and their tests; a coherent complete public
snapshot would additionally require a new server contract. No owner-private API
reuse, automatic unbounded query or budget increase was introduced here.


### Public profile explicit period continuation (2026-10-26)

The preceding 200-record profile limitation now has a separate bounded period
explorer. KST date inputs (at most one year) are URL state; original-activity
navigation and browser return preserve dates and fetch fresh results, not cached
activities/cursors. Each explicit action reads one public discovery page (20
results, at most 50 candidate examinations plus lookahead). Empty intermediate
pages remain incomplete. Only reaching this query's last page permits the period
chart/recent-28-day summary; this is current-authorized seek enumeration, not a
fixed snapshot or all-time completeness. Months outside the queried range are
not presented as zero-activity months.

Global public statistics retain their 200-result/ten-page budget, now with one
initial page and explicit continuation rather than ten automatic calls. Complete
21–200-record totals remain supported; partial global results never become full
totals. Sport/source filters explicitly identify partial collected inputs. The
owner profile and private R6 analysis contracts are unchanged.

The first page fixes a 30-second authorization deadline. Further pages, loading,
and 429 retries cannot extend it. Expiry or content-change invalidation removes
collected rows and asks for a fresh query; narrow the date range if the volume
cannot fit the budget. Hidden/account/same-UID SDK session changes discard rows
and late responses; focus/return starts a fresh query. Cursor expiry/permission
errors require restart. AppCheck plus transport has a 15-second deadline and an
abort fence before dispatch; this does not claim cancellation of an already-sent
Firebase HTTP request. No automatic retries or unlimited scanning are used.

Node22 focused validation: five suites, 47 distinct tests passed, including an
explicit eleven-page/201-record period traversal, 21-record global continuation,
ten-page global cap, empty pages, 429, expired cursors, stale in-flight results,
SDK replacement, readiness timeout/abort, URL period navigation and clipped chart
ranges. Typecheck and scoped ESLint passed. These are focused gates, not a fresh
full WEB suite. The 201-record test uses deterministic mocked transport; it does
not establish arbitrarily large live completion under the quota/deadline.

Actual existing synthetic local app (`ui-owner`, viewer account), Chrome390×844:
October1–26 returned six collected records, rendered the limited-range chart,
opened `ui-native-ride`, then browser-back restored both dates and fetched the
period again. DOM viewport/document widths were both390px. No existing fixture
or account was changed. This is actual app/SDK local read-only evidence, distinct
from the deterministic large-page regression. No remote writes or deployment.


## Actual public-profile 201-record verification

WEB product `4e5329b6` was verified through the main local app and actual Firebase SDK.
The isolated fixture consists of one new synthetic profile and 201 minimal recorded-source
metadata documents; it does not prove raw recording/metrics production. Existing review
accounts and records were unchanged. A Los Angeles-timezone Chrome viewport of 390×844
requested the KST period October 1–26, 2026. Eleven explicit period pages returned
20, 40, …, 200, 201 cumulative records. The completed chart showed 201 km and 201
original-activity links. Thirteen total discovery responses (including independent initial
profile reads) returned HTTP200, with zero page errors and no horizontal overflow.
The fixed authorization deadline subsequently removed the cumulative links and chart,
showing the explicit stale/requery notice. It did not automatically restart enumeration.

Evidence: external `profile-period-201/results.json`, `completed.png`, `expired.png`,
`verify.mjs`, and exact fixture/cleanup manifest. Review URL:
<http://localhost:5174/ko/athlete/profile-period-201-local-20261026?demoAccount=viewer&profileFrom=2026-10-01&profileTo=2026-10-26>.
The 201-record fixture remains for review; `seed.cjs cleanup` checks its marker and deletes
only its 203 enumerated documents. No real account, external service, or deployment was changed.
Node22 development build and repository quality budgets passed after the final profile changes. Logs: `/tmp/orider-profile-period-build.log` and `/tmp/orider-profile-period-quality.log`. Earlier whole-web test
counts belong to their earlier checkpoint; this update uses the documented focused suites.

## AI generation-time evidence and private history boundary

BE `176e29e9` and WEB `4346bad9`/`ed053efd` add generation-time comparison evidence
without additional historical queries or model calls. Existing context reads provide
activity-relative windows, selected/scanned counts, query bounds, missing-data state,
and snapshot revisions. Display references are bounded and the full source-reference
set is digested. Legacy caches retain unknown evidence instead of being reconstructed
from today's records. KST display does not convert activity-relative windows into
calendar-period aggregates.

The narrative generation and cache endpoints are now owner-only, including older prose
that can contain private historical training comparisons. Entry and return checks retain
current ownership/deletion/account/merge/incarnation fences. Raw activity previews remain
owner-only; public DTO projections exclude them. The web card also gates cached previews,
and its request/cache scopes include the exact SDK session identity. Late token/AppCheck
completion and responses from replaced sessions cannot repopulate the current card.

The main local runtime is source `1c3e6b349f5c`, artifact `d7120dbc485f`. Actual compiled
context collection against local synthetic Firestore records produced two evidence blocks
from four past activities. Those blocks were attached to explicitly synthetic cached prose:
this proves collection/transport/presentation, not an actual model generation or conclusion.
Actual SDK owner retrieval succeeded; other and anonymous accounts were denied. Unauthenticated
HTTP returned401, real signOut removed the previous explanation, original-source navigation
worked, and390px rendering had no horizontal overflow or page errors. Legacy evidence
remained explicitly unknown. See external `narrative-grounding/README.md`, `results.json`,
`collector-results.json`, `boundaries-results.json`, and desktop/mobile captures.

Visual inspection also exposed missing legacy sensor fields rendered as `undefined`.
WEB `6b851c51` and test-only `1f6e8b2f` omit unavailable sensor/wind values, preserve actual
zero power/speed, and use valid stored segment endpoints when the overall distance is absent.
Invalid segment bounds hide the timeline. The final actual mobile capture no longer displays
undefined values; it does not invent zero-valued missing measurements.

Gates: WEB five focused suites70 tests, plus final card suite19 tests (overlapping, not additive),
TypeScript, scoped lint, development build and quality budgets passed. BE30 suites703 tests,
build/lint/compat passed. R4 metric-definition evidence uses a separate overlapping8 suites338
checks at docs/analysis/activity-metric-definition-evidence.md. Historical whole-suite counts
are not attributed to this final source. Remote push/merge/deployment and external messages
were not performed.

## Source-bound local performance follow-up

External `performance-final-fresh-account/README.md` records120 actual browser attempts
at WEB `1f6e8b2f` and backend artifact `d7120dbc485f`:30 fresh-browser-context and30
same-context-reload attempts for each feed and existing sensor analysis. All120 reached
the defined ready condition; Functions HTTP errors and page errors were zero. Feed p95
was589/931ms, analysis978/892ms (fresh/reload). Source and fixture hashes were unchanged.
These are390×844 Chrome/unthrottled-loopback results on a warm synthetic emulator backend,
not production/physical-device performance or complete chart/new-AI-generation readiness.
Firestore ERR_ABORTED appeared on60 attempts and is preserved separately; it coincided
with reload/watch cancellation, so this is not a claim of zero failed network requests.
Small concurrent backend tests are documented in concurrent-work.json.

The preceding attempt on the shared review account was intentionally interrupted after20
ready successes because notification-read was already quota-limited at the first sample.
Its429 responses remain in `performance-final-local/progress.json`; no quota was reset.
The final run used a fresh synthetic account and a separately produced sensor activity.
Neither timing set is a direct before/after comparison or evidence for a later producer
artifact. Any subsequent activity-clock fix is validated separately with actual import,
recalculation, SDK/UI checks rather than retroactively changing this benchmark's version.

## Actual GPX stopped-interval clock correction

A later two-file source audit found a confirmed producer defect: point-only GPX summaries
stored elapsed time in ridingTimeMillis, and the native-moving fallback interpreted that
alias as an authoritative timer. Backend product `9c3fd6bf` now marks only point-derived
summaries with summary.ridingTimeBasis=elapsed. Explicit movingTimeMillis, supplied file
timers, native recording semantics and power eligibility remain unchanged. The semantic
input fingerprint observes clock-basis changes; ETL-derived movingTimeSec does not become
a new provider timer. Ambiguous historical records are not bulk-reclassified.

Main local source is now `ef6ad3f653a1`, artifact `a09b0b3feb93`. A new isolated synthetic
owner actually uploaded GPX through REST201, waited the normal due interval and ran its
real queued processor. Initial calculation and two subsequent calculations all returned
600seconds elapsed,500seconds moving,100seconds stopped,100W average power and500seconds
of power-zone occupancy. The original stream digest/updateTime and clock-basis metadata
were unchanged.39 focused regressions plus Node22 build/lint/compat passed. Backend evidence
is in docs/analysis/activity-metric-definition-evidence.md (`962af433`).

Actual390px Chrome/SDK showed moving0:08:20, stopped0:01:40, elapsed0:10:00 and average100W;
five observed Functions/REST responses returned200 with no page errors or overflow. External
`r42-clock-basis/browser-results.json` and `mobile-analysis.png` record the final view.
An earlier browser attempt began before processor readiness and timed out; that evidence
is retained separately. Existing narrative-owner/private-history checks passed again on
the new runtime, and the original generation-time evidence remained byte-for-byte equal.
The preceding120-attempt benchmark remains evidence for artifactd7120dbc485f only.

Review: <http://localhost:5174/ko/activity/Ydkib5o4A031FNYFXVTL?demoAccount=clockFinal&tab=analysis>.
All accounts, files and runtime changes are local synthetic fixtures. Existing performance
fixtures were preserved. There was no remote push, merge, deployment or issue update.
