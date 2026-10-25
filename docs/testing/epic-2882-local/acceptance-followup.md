# Acceptance follow-up after the first local handoff

Latest local verification: [route readiness, session boundaries and real GPX period/diary processing](route-readiness-and-session-checkpoint.md). Earlier [feed restoration, period load/log, metrics ownership and local review](local-review-checkpoint.md) records map privacy, accessibility, route inventory and beta-plan evidence. Test results remain tied to their source checkpoint; later source changes require their own evidence.

2026-10-26. The preceding handoff proved a working local slice, not every requirement in epic miranae/orider-g1-app#2882. This audit re-read the current epic through authenticated GitHub CLI (the connector returned 404), compared source and existing evidence, and continued local implementation. Remote writes, pushes, merges and deployment remain prohibited by the user's latest instruction. Web and server remain the priority. Limited Android/iOS compatibility work is now in progress locally for the access-checked notification and public-feed contracts; it is not yet verified or release-ready.

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

The goal and full epic remain open. No remote issue state is changed by this report. Current local APP follow-up is deferred again behind web/server: Android's combined local run passed 96 tests, but hosted iOS XCTest is not green. A minimal Firebase bootstrap isolation follow-up compiles and still reaches an additional LTHR observer dependency. Neither that compile nor the web/server gates establishes native release compatibility.

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

## Large-history follow-up in progress — 2026-10-26

The final audit found additional web/server work, so the local epic is not marked complete:

- **R5 interaction scale:** the former 20-request action would require roughly 38 actions for 1,001 independent records. Web `6a0e554f` now performs at most 2,000 sequential requests per explicit action with one in flight, session/expiry checks before dispatch, and no error retry loop. A tab-local checkpoint stores only opaque run ID/version/expiry; restoring it requires an explicit status check and explicit continuation. Same-UID SDK replacement invalidates it. Four focused suites / 33 tests, TypeScript and scoped lint passed; full regression for this revision is pending.
- **R5 actual server scale:** the immutable `d3f9cc5effbf` server completed 1,001 separately identified, actually parsed synthetic GPX observations in 51.328 seconds: 754 progress calls and two status calls. It found the sole fastest record on the final page, excluded a post-T insertion, resumed from a serialized checkpoint and emitted no provisional best. Every source was verified, all 1,001 groups were eligible, and exact owned fixtures were cleaned up. This single local direct-server sample bypasses callable quota/AppCheck and does not prove UI or production latency. Full evidence: external `r5-scale-1001/README.md`, `run.cjs`, `result.json`. Actual panel/SDK verification is underway in another isolated project.
- **R6 period scale:** the existing quick training/power scans retain their 200/1,000 limits. The new explicit resumable owner-period path completes 1,001 stored records without claiming continuously current history. Only completed runs expose totals, and missing dense curves or stored weights remain partial. Actual SDK evidence and source boundaries are in [bike-period-snapshot-ui.md](bike-period-snapshot-ui.md).
- **R7 Local Legend scale:** the existing 500-effort getter is preserved. A resumable preparation and bounded final current-snapshot validation path is being implemented. It must recheck all relevant current permissions/source witnesses before emitting a leader; old census pages cannot establish current access. No broad client rule migration or weakened privacy contract is being deployed.

The active review runtime remains immutable while these source changes are validated. There have been no remote pushes, merges, deployments or issue updates.

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
